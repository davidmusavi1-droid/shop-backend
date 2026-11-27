const {randomUUID}=require('node:crypto');
const {fail,integer}=require('./parcel-shipping');
const defaults=Object.freeze({
 postalEta:'۳ تا ۵ روز کاری پس از تحویل به پست برای سایر استان‌ها',
 postalLocalEta:'۱ تا ۳ روز کاری پس از تحویل به پست برای استان البرز',
 karajEta:'۱ تا ۲ روز کاری پس از تأیید هماهنگی',
 tehranEta:'۱ تا ۳ روز کاری پس از تأیید هماهنگی'
});
const etaKeys=Object.keys(defaults);
async function read(db){
 const row=await db.shippingOperations.findUnique({where:{id:'customer-shipping-policy'}});
 // Only ETA text survives old JSON settings; retired incentives never reactivate.
 const saved=row?.settings||{},value={revision:'postpaid-only-v1:'+(saved.revision||'initial'),...defaults};
 for(const key of etaKeys)if(typeof saved[key]==='string'&&saved[key].trim().length>=3&&saved[key].length<=250)value[key]=saved[key];
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
 if(courier&&!karaj&&!tehran)throw fail(409,'پیک فقط برای شهر کرج و شهر تهران است');
 const terms=courier?'کرایه پیک با توافق مشتری تعیین و هنگام تحویل پرداخت می‌شود؛ این کرایه جدا از مبلغ کالا و پرداخت آنلاین است.':'هزینه پست پیشتاز بر عهده مشتری است و هنگام تحویل به شرکت پست پرداخت می‌شود؛ مبلغ کرایه توسط پست تعیین می‌شود و جدا از مبلغ کالا است.';
 return {policyRevision:policy.revision,shippingFee:0,goodsTotal,totalPrice:goodsTotal,shippingChargeMode:'RECIPIENT_AT_DELIVERY',shippingDueAtDelivery:null,terms,
 eta:courier?(karaj?policy.karajEta:policy.tehranEta):normal(customer.province)==='البرز'?policy.postalLocalEta:policy.postalEta};
}
function publicView(policy){return {revision:policy.revision,...Object.fromEntries(etaKeys.map(key=>[key,policy[key]]))};}
module.exports={defaults,read,validate,save,calculate,publicView};
