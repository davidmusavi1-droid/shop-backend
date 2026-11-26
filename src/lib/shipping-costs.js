const {randomUUID}=require('node:crypto');
const {fail,integer,hash}=require('./parcel-shipping');
const costKeys=['freight','packing','insurance','other'];
function breakdown(body,withMargin=false){
 if(!body||typeof body!=='object')throw fail(400,'اجزای هزینه ارسال را کامل کنید');
 const costs={};let total=0;
 for(const k of [...costKeys,...(withMargin?['margin']:[])]){costs[k]=integer(body[k],0);total+=costs[k];}
 integer(total,1);return {costs,total};
}
async function record(db,orderId,body){
 if(typeof body?.requestKey!=='string'||!/^[0-9a-f-]{36}$/i.test(body.requestKey)||typeof body.note!=='string'||!body.note.trim()||body.note.length>500)throw fail(400,'شناسه و شرح هزینه واقعی لازم است');
 const {costs,total}=breakdown(body.costs);
 const requestHash=hash({costs,note:body.note.trim()});
 return db.$transaction(async tx=>{
  const id='shipping-cost:'+orderId;
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${id},0))`;
  const saved=await tx.shippingOperations.findUnique({where:{id}});
  const events=saved?.settings.events||[];
  const existing=events.find(x=>x.requestKey===body.requestKey);
  if(existing){if(existing.requestHash!==requestHash)throw fail(409,'شناسه تکراری با اطلاعات متفاوت');return existing;}
  const order=await tx.order.findUnique({where:{id:orderId},include:{payment:true,shippingSnapshot:true}});
  if(!order?.payment?.isSuccessful||!order.shippingSnapshot||!['PAID','PROCESSING','SHIPPED','DELIVERED'].includes(order.status))throw fail(409,'سفارش پرداخت‌شده و مبلغ ارسال تأییدشده لازم است');
  if(events.length>=20)throw fail(409,'سقف اصلاحات گزارش این سفارش تکمیل است');
  const snapshot=order.shippingSnapshot;
  if(snapshot.details.shippingChargeMode==='RECIPIENT_AT_DELIVERY')throw fail(409,'کرایه این سفارش مستقیماً به پست پرداخت می‌شود و هزینه دریافتی فروشگاه نیست');
  const event={id:randomUUID(),requestKey:body.requestKey,requestHash,orderId,costs,actualTotal:total,charged:snapshot.fee,difference:total-snapshot.fee,note:body.note.trim(),createdAt:new Date().toISOString(),
   method:snapshot.details.method||snapshot.details.carrier,tariffId:snapshot.tariffId,destination:snapshot.details.destination,parcel:snapshot.details.parcel||null};
  const settings={kind:'SHIPPING_COST_AUDIT',events:[...events,event]};
  await tx.shippingOperations.upsert({where:{id},create:{id,settings},update:{settings}});
  // Accounting evidence only: never update order, payment, reservation or stock.
  return event;
 });
}
async function report(db){
 const rows=await db.shippingOperations.findMany({where:{id:{startsWith:'shipping-cost:'}},orderBy:{id:'asc'},take:500});
 const latest=rows.map(r=>r.settings.events?.at(-1)).filter(Boolean);
 return {orders:latest,totalDifference:latest.reduce((sum,e)=>sum+e.difference,0),truncated:rows.length===500};
}
module.exports={breakdown,record,report};
