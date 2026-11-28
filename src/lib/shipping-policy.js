const {randomUUID}=require('node:crypto');
const {fail,integer}=require('./parcel-shipping');
const thresholds=Object.freeze({
 postalFreeThreshold:5000000,
 karajFreeThreshold:5000000,
 tehranFreeThreshold:7000000
});
const defaults=Object.freeze({
 postalEta:'۳ تا ۵ روز کاری پس از تحویل به پست برای سایر استان‌ها',
 postalLocalEta:'۱ تا ۳ روز کاری پس از تحویل به پست برای استان البرز',
 karajEta:'۱ تا ۲ روز کاری پس از تأیید هماهنگی',
 tehranEta:'۱ تا ۳ روز کاری پس از تأیید هماهنگی'
});
const etaKeys=Object.keys(defaults);
const amountKeys=Object.keys(thresholds);
const recipientPays='RECIPIENT_AT_DELIVERY';
const merchantPays='MERCHANT_PAYS';
async function read(db){
 const row=await db.shippingOperations.findUnique({where:{id:'customer-shipping-policy'}});
 // The old shared threshold and enable flags are intentionally ignored.
 const saved=row?.settings||{},value={revision:'free-shipping-v1:'+(saved.revision||'initial'),...defaults,...thresholds};
 for(const key of etaKeys)if(typeof saved[key]==='string'&&saved[key].trim().length>=3&&saved[key].length<=250)value[key]=saved[key];
 for(const key of amountKeys)if(Number.isInteger(saved[key])&&saved[key]>0&&saved[key]<=2147483647)value[key]=saved[key];
 return value;
}
function validate(b){
 if(!b||typeof b!=='object')throw fail(400,'تنظیمات زمان ارسال نامعتبر است');
 for(const key of ['threshold','postalFreeEnabled','karajFreeEnabled','postalFreeEvidence','postalFreeValidUntil']){
  if(Object.hasOwn(b,key))throw fail(409,'سیاست ارسال ثابت است؛ آستانه یا ارسال رایگان قابل تنظیم نیست');
 }
 const value={};
 for(const key of etaKeys){
  if(typeof b[key]!=='string'||b[key].trim().length<3||b[key].length>250)throw fail(400,'بازه تقریبی تحویل را وارد کنید');
  value[key]=b[key].trim();
 }
 for(const key of amountKeys)value[key]=integer(b[key],1);
 return value;
}
async function save(db,b){
 const value=validate(b);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(143755317)`;
  const current=await read(tx);
  if(current.revision!==b.expectedRevision)throw fail(409,'تنظیمات تغییر کرده؛ دوباره بارگذاری کنید');
  const settings={...value,revision:randomUUID()};
  await tx.shippingOperations.upsert({where:{id:'customer-shipping-policy'},create:{id:'customer-shipping-policy',settings},update:{settings}});
  return read(tx);
 });
}
const normal=s=>String(s||'').trim().replace(/[يى]/g,'ی').replace(/ك/g,'ک');
function calculate(policy,method,customer,goodsTotal){
 integer(goodsTotal,1);
 if(!['POST_PISHTAZ','POST_PISHTAZ_POSTPAID','COORDINATED_COURIER'].includes(method))throw fail(409,'روش ارسال غیرفعال است');
 const courier=method==='COORDINATED_COURIER';
 const karaj=normal(customer.province)==='البرز'&&normal(customer.city)==='کرج';
 const tehran=normal(customer.province)==='تهران'&&normal(customer.city)==='تهران';
 if(courier&&!karaj&&!tehran)throw fail(409,'ارسال فوری فقط برای شهر کرج و شهر تهران است');
 const key=courier?(karaj?'karajFreeThreshold':'tehranFreeThreshold'):'postalFreeThreshold';
 const freeShippingThreshold=policy[key]??thresholds[key];
 const remainingForFreeShipping=Math.max(0,freeShippingThreshold-goodsTotal);
 const freeShipping=remainingForFreeShipping===0;
 const terms=freeShipping
  ? (courier?'کرایه ارسال فوری بر عهده MOTIF است. امکان ارسال و زمان تحویل با هماهنگی تأیید می‌شود.':'ارسال پست پیشتاز رایگان است. MOTIF کرایه را در مبدأ می‌پردازد.')
  : (courier?'کرایه ارسال فوری با توافق مشتری تعیین و هنگام تحویل پرداخت می‌شود؛ این کرایه جدا از مبلغ کالا و پرداخت آنلاین است.':'هزینه پست پیشتاز بر عهده مشتری است و هنگام تحویل به شرکت پست پرداخت می‌شود؛ مبلغ کرایه توسط پست تعیین می‌شود و جدا از مبلغ کالا است.');
 return {policyRevision:policy.revision,shippingFee:0,goodsTotal,totalPrice:goodsTotal,shippingChargeMode:freeShipping?merchantPays:recipientPays,
  freeShipping,freeShippingThreshold,remainingForFreeShipping,shippingDueAtDelivery:freeShipping?0:null,terms,
 eta:courier?(karaj?policy.karajEta:policy.tehranEta):normal(customer.province)==='البرز'?policy.postalLocalEta:policy.postalEta};
}
function publicView(policy){return {revision:policy.revision,...Object.fromEntries(etaKeys.map(key=>[key,policy[key]])),...Object.fromEntries(amountKeys.map(key=>[key,policy[key]??thresholds[key]]))};}
module.exports={defaults,thresholds,recipientPays,merchantPays,read,validate,save,calculate,publicView};
