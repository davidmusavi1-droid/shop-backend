const {randomUUID}=require('node:crypto');
const {fail,integer}=require('./parcel-shipping');
const defaults=Object.freeze({
 threshold:5000000,postalFreeEnabled:true,karajFreeEnabled:true,
 postalFreeEvidence:'',postalFreeValidUntil:null,
 postalEta:'۳ تا ۵ روز کاری پس از تحویل به پست برای سایر استان‌ها',
 postalLocalEta:'۱ تا ۳ روز کاری پس از تحویل به پست برای استان البرز',
 karajEta:'۱ تا ۲ روز کاری پس از تأیید هماهنگی',
 tehranEta:'۱ تا ۳ روز کاری پس از تأیید هماهنگی'
});
async function read(db){
 const row=await db.shippingOperations.findUnique({where:{id:'customer-shipping-policy'}});
 return {revision:row?.settings.revision||'initial',...defaults,...row?.settings};
}
function validate(b){
 if(typeof b?.postalFreeEnabled!=='boolean'||typeof b.karajFreeEnabled!=='boolean')throw fail(400,'قوانین ارسال نامعتبر است');
 const value={threshold:integer(b.threshold,1,2147483646),postalFreeEnabled:b.postalFreeEnabled,karajFreeEnabled:b.karajFreeEnabled};
 for(const k of ['postalEta','postalLocalEta','karajEta','tehranEta']){
  if(typeof b[k]!=='string'||b[k].trim().length<3||b[k].length>250)throw fail(400,'بازه تقریبی تحویل را وارد کنید');
  value[k]=b[k].trim();
 }
 if(typeof b.postalFreeEvidence!=='string'||b.postalFreeEvidence.length>500)throw fail(400,'مرجع پست نامعتبر است');
 value.postalFreeEvidence=b.postalFreeEvidence.trim();
 value.postalFreeValidUntil=b.postalFreeValidUntil||null;
 if(value.postalFreeValidUntil){
  const date=Date.parse(value.postalFreeValidUntil);
  if(value.postalFreeEvidence.length<12||!Number.isFinite(date)||date<=Date.now()||date>Date.now()+90*86400000)throw fail(400,'مرجع واقعی و اعتبار تأیید پست (حداکثر ۹۰ روز) لازم است');
  value.postalFreeValidUntil=new Date(date).toISOString();
 }
 return value;
}
async function save(db,b){
 const value=validate(b);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(143755317)`;
  const current=await read(tx);
  if(current.revision!==b.expectedRevision)throw fail(409,'قوانین تغییر کرده؛ دوباره بارگذاری کنید');
  const settings={...value,revision:randomUUID()};
  await tx.shippingOperations.upsert({where:{id:'customer-shipping-policy'},create:{id:'customer-shipping-policy',settings},update:{settings}});
  return settings;
 });
}
const normal=s=>String(s||'').trim().replace(/[يى]/g,'ی').replace(/ك/g,'ک');
function calculate(policy,method,customer,goodsTotal){
 integer(goodsTotal,1);
 const courier=method==='COORDINATED_COURIER',karaj=normal(customer.province)==='البرز'&&normal(customer.city)==='کرج';
 const tehran=normal(customer.province)==='تهران'&&normal(customer.city)==='تهران';
 if(courier&&!karaj&&!tehran)throw fail(409,'پیک فقط برای شهر کرج و شهر تهران است');
 const eligible=courier?karaj&&policy.karajFreeEnabled:policy.postalFreeEnabled;
 // «بالای» is strictly greater; exactly the threshold remains postpaid.
 const free=eligible&&goodsTotal>policy.threshold;
 const ready=!free||courier||Boolean(policy.postalFreeEvidence&&Date.parse(policy.postalFreeValidUntil)>Date.now());
 const shippingChargeMode=free?'MERCHANT_PAYS':'RECIPIENT_AT_DELIVERY';
 const terms=free?'کرایه ارسال بر عهده فروشگاه است؛ مشتری کرایه‌ای پرداخت نمی‌کند.':courier?'کرایه پیک جدا از مبلغ کالا است و هنگام تحویل به پیک پرداخت می‌شود. مبلغ کرایه پیش از پذیرش با شما هماهنگ می‌شود.':'کرایه پست جدا از مبلغ کالا است و هنگام تحویل به شرکت پست پرداخت می‌شود؛ مبلغ آن توسط پست تعیین می‌شود.';
 return {policyRevision:policy.revision,shippingFee:0,goodsTotal,totalPrice:goodsTotal,shippingChargeMode,shippingDueAtDelivery:free?0:null,terms,
 freeShipping:free,freeShippingEligible:eligible,freeShippingReady:ready,freeShippingThreshold:policy.threshold,
 remainingForFreeShipping:eligible?Math.max(0,policy.threshold+1-goodsTotal):null,
 eta:courier?(karaj?policy.karajEta:policy.tehranEta):normal(customer.province)==='البرز'?policy.postalLocalEta:policy.postalEta};
}
function publicView(policy){
 return {revision:policy.revision,threshold:policy.threshold,postalFreeEnabled:policy.postalFreeEnabled,karajFreeEnabled:policy.karajFreeEnabled,
 postalFreeReady:Boolean(policy.postalFreeEvidence&&Date.parse(policy.postalFreeValidUntil)>Date.now()),postalEta:policy.postalEta,postalLocalEta:policy.postalLocalEta,karajEta:policy.karajEta,tehranEta:policy.tehranEta};
}
module.exports={defaults,read,validate,save,calculate,publicView};
