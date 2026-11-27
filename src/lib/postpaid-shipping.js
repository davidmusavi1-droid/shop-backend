const {randomUUID}=require('node:crypto');
const policy=require('./shipping-policy');
const shipping=require('./destination-shipping');
const {fail}=require('./parcel-shipping');
const required=()=>process.env.NODE_ENV==='production'||process.env.MOTIF_POSTPAID_SHIPPING==='true';
const mode='RECIPIENT_AT_DELIVERY';
const terms='هزینه ارسال بر عهده خریدار است و هنگام تحویل مرسوله به شرکت پست پرداخت می‌شود.';
async function active(db){
 const state=await db.shippingTariffState.findUnique({where:{id:'postpaid'},include:{activeTariff:true}});
 const policy=state?.activeTariff;
 if(!policy||policy.carrier!=='POST_PISHTAZ_POSTPAID'||+policy.validFrom>Date.now()||+policy.validUntil<=Date.now())throw fail(503,'امکان پیشتاز پس‌کرایه از مبدأ کرج هنوز تأیید نشده است');
 return policy;
}
async function publish(db,b){
 const until=new Date(b.validUntil);
 if(b.confirmed!==true||typeof b.evidence!=='string'||b.evidence.trim().length<12||b.evidence.length>500||!Number.isFinite(+until)||+until<=Date.now()||+until>Date.now()+90*86400000)throw fail(400,'تأیید واقعی پست، مرجع آن و تاریخ اعتبار لازم است');
 return db.$transaction(async tx=>{
 await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(143755316)`;
 const old=await tx.shippingTariffState.findUnique({where:{id:'postpaid'}});
 if((old?.activeTariffId||null)!==(b.expectedPolicyId||null))throw fail(409,'تأییدیه ارسال تغییر کرده است');
 const p=await tx.shippingTariff.create({data:{id:randomUUID(),source:b.evidence.trim(),carrier:'POST_PISHTAZ_POSTPAID',originProvince:'البرز',originCity:'کرج',validFrom:new Date(),validUntil:until,rules:[]}});
 await tx.shippingTariffState.upsert({where:{id:'postpaid'},create:{id:'postpaid',activeTariffId:p.id},update:{activeTariffId:p.id}});
 return p;
 });
}
async function quote(db,customer,items){
 const p=await active(db),destination=shipping.destination(customer);
 let goodsTotal=0;
 for(const x of items){if(!Number.isSafeInteger(x.unitPrice)||x.unitPrice<0)throw fail(400,'مبلغ کالا نامعتبر است');goodsTotal+=x.unitPrice*x.quantity;}
 if(!Number.isSafeInteger(goodsTotal)||goodsTotal<=0||goodsTotal>2147483647)throw fail(400,'مبلغ کالا نامعتبر است');
 const current=await policy.read(db), cost=policy.calculate(current,'POST_PISHTAZ_POSTPAID',customer,goodsTotal);
 return {...cost,tariffId:p.id,shippingFee:0,goodsTotal,totalPrice:goodsTotal,shippingChargeMode:cost.shippingChargeMode,terms:cost.terms,details:{...cost,
 method:'POST_PISHTAZ_POSTPAID',carrier:'POST_PISHTAZ',shippingChargeMode:cost.shippingChargeMode,shippingFee:0,goodsTotal,totalPrice:goodsTotal,shippingDueAtDelivery:cost.shippingDueAtDelivery,terms:cost.terms,customerAccepted:true,originProvince:'البرز',originCity:'کرج',destination,policyId:p.id,source:p.source
 }};
}
function accepted(input,q){
 const a=input.shippingAcceptance;
 if(!a||a.tariffId!==q.tariffId||a.shippingFee!==0||a.totalPrice!==q.totalPrice||a.shippingChargeMode!==q.shippingChargeMode||a.termsAccepted!==true)throw fail(409,'شرایط پس‌کرایه و مبلغ کالا را صریحاً تأیید کنید');
}
module.exports={required,mode,terms,active,publish,quote,accepted};
