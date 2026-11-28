const {randomUUID,randomBytes,timingSafeEqual}=require('node:crypto');
const policy=require('./shipping-policy');
const {destination}=require('./destination-shipping');
const p=require('./parcel-shipping');
const {fail}=p;
const capability=token=>p.hash(String(token||''));
function authorize(row,token) {
  const actual=Buffer.from(capability(token)),expected=Buffer.from(row?.tokenHash||'');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw fail(404,'درخواست پیدا نشد');
}
async function lock(tx,id){await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${'courier:'+id},0))`;}
function publicOffer(offer) {
  if(!offer)return offer;
  const {courierAgreedFee,...visible}=offer;
  return visible;
}
function view(row) {
  return {id:row.id,state:row.state,expiresAt:row.expiresAt,revision:row.revision,offer:publicOffer(row.offer),orderNumber:row.orderId,customer:row.payload.customer,items:row.payload.items,deliveryDate:row.payload.deliveryDate};
}
async function request(db,input,token) {
  const config=await p.settings(db);
  if(!config.courierEnabled || !p.eligible(input.customer))throw fail(409,'ارسال فوری فقط برای شهر تهران و شهر کرج و پس از هماهنگی ممکن است');
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail(400,'شناسه دسترسی درخواست نامعتبر است');
  return db.$transaction(async tx=>{
    await lock(tx,input.requestKey);
    const saved=await tx.courierRequest.findUnique({where:{requestKey:input.requestKey}});
    if(saved){authorize(saved,token);if(saved.requestHash!==input.requestHash)throw fail(409,'شناسه درخواست تکراری با اطلاعات متفاوت');return view(saved);}
    const now=new Date();
    const deliveryDate=p.requestedDeliveryDate(input.deliveryDay,config.courierCutoff,now);
    // Persist limits in PostgreSQL, without exposing whether a mobile number has requests.
    await lock(tx,'client:'+input.clientHash);
    const clientCount=await tx.courierRequest.count({where:{clientHash:input.clientHash,createdAt:{gte:new Date(+now-3600000)}}});
    if(clientCount>=20)throw fail(429,'تعداد درخواست زیاد است؛ بعداً تلاش کنید');
    await lock(tx,'phone:'+p.hash(input.customer.phone));
    const recent=await tx.courierRequest.count({where:{phoneHash:p.hash(input.customer.phone),createdAt:{gte:new Date(+now-3600000)}}});
    if(recent>=3)throw fail(429,'تعداد درخواست زیاد است؛ بعداً تلاش کنید');
    const parcel=await p.parcel(tx,input.items);
    for(const item of input.items){const v=await tx.variant.findUnique({where:{id:item.variantId},include:{product:true}});if(!v?.product.isActive||v.stock<item.quantity)throw fail(409,'موجودی کافی نیست');}
    const row=await tx.courierRequest.create({data:{id:randomUUID(),requestKey:input.requestKey,requestHash:input.requestHash,tokenHash:capability(token),clientHash:input.clientHash,phoneHash:p.hash(input.customer.phone),payload:{customer:input.customer,items:input.items,parcel,deliveryDate},state:'AWAITING_COORDINATION',expiresAt:new Date(+now+config.requestMinutes*60000)}});
    return view(row);
  });
}
async function get(db,id,token){const row=await db.courierRequest.findUnique({where:{id}});authorize(row,token);return view(row);}
async function offer(db,id,body) {
  const config=await p.settings(db);
  if(!config.courierEnabled)throw fail(409,'ارسال فوری غیرفعال است');
  const fee=p.integer(body.fee);
  if(typeof body.eta!=='string'||body.eta.trim().length<3||body.eta.length>250||body.availabilityConfirmed!==true)throw fail(400,'امکان ارسال و بازه تحویل را تأیید کنید');
  return db.$transaction(async tx=>{
    await lock(tx,id);
    const row=await tx.courierRequest.findUnique({where:{id}});
    const now=new Date();
    if(!row||row.orderId||!['AWAITING_COORDINATION','OFFERED'].includes(row.state)||+row.expiresAt<=+now||row.revision!==body.expectedRevision)throw fail(409,'درخواست منقضی یا تغییر کرده است');
    p.ensureDeliveryDate(row.payload.deliveryDate,config.courierCutoff,now);
    const parcel=await p.parcel(tx,row.payload.items);
    let goodsTotal=0;
    const priced=[];
    for(const item of row.payload.items){const v=await tx.variant.findUnique({where:{id:item.variantId},include:{product:true}});if(!v?.product.isActive||v.stock<item.quantity)throw fail(409,'موجودی کافی نیست');const unitPrice=v.product.basePrice+v.priceDelta;p.integer(unitPrice,0);goodsTotal+=unitPrice*item.quantity;priced.push({...item,unitPrice});}
    const cost=policy.calculate(await policy.read(tx),'COORDINATED_COURIER',row.payload.customer,goodsTotal);
    const totalPrice=p.integer(goodsTotal);
    const expiresAt=new Date(Math.min(+row.expiresAt,+now+config.offerMinutes*60000));
    const tariff=await tx.shippingTariff.create({data:{id:randomUUID(),source:'تأیید دستی پشتیبانی؛ پیشنهاد '+id,carrier:'COORDINATED_COURIER',originProvince:'البرز',originCity:'کرج',validFrom:now,validUntil:expiresAt,rules:[]}});
    const quote={...cost,tariffId:tariff.id,shippingFee:0,courierDueAtDelivery:cost.freeShipping?0:fee,courierAgreedFee:fee,shippingDueAtDelivery:cost.freeShipping?0:fee,goodsTotal,totalPrice,eta:body.eta.trim(),deliveryDate:row.payload.deliveryDate,expiresAt:expiresAt.toISOString(),reservationMinutes:30,parcel,items:priced};
    await tx.courierOffer.create({data:{requestId:id,revision:row.revision+1,details:quote}});
    return view(await tx.courierRequest.update({where:{id},data:{state:'OFFERED',revision:row.revision+1,offer:quote}}));
  });
}
async function acceptedQuote(tx,input,items) {
  const a=input.courierAcceptance;
  await lock(tx,a.requestId);
  const row=await tx.courierRequest.findUnique({where:{id:a.requestId}});
  authorize(row,a.token);
  if(row.orderId||row.state!=='OFFERED'||row.revision!==a.revision||!row.offer||+new Date(row.offer.expiresAt)<=Date.now()||+row.expiresAt<=Date.now())throw fail(409,'پیشنهاد تغییر کرده یا منقضی شده است');
  if(p.hash({customer:input.customer,items:input.items})!==p.hash({customer:row.payload.customer,items:row.payload.items}))throw fail(409,'نشانی یا سبد تغییر کرده است؛ درخواست جدید لازم است');
  const config=await p.settings(tx);if(!config.courierEnabled||!p.eligible(input.customer))throw fail(409,'ارسال فوری در دسترس نیست');
  p.ensureDeliveryDate(row.payload.deliveryDate,config.courierCutoff,new Date());
  const parcel=await p.parcel(tx,items);
  // Reapproval is necessary if measurements/packing changed after the offer.
  if(p.hash(parcel)!==p.hash(row.offer.parcel))throw fail(409,'اطلاعات مرسوله تغییر کرده است؛ پیشنهاد جدید لازم است');
  const goodsTotal=items.reduce((sum,x)=>sum+x.unitPrice*x.quantity,0);
  if(goodsTotal!==row.offer.goodsTotal)throw fail(409,'قیمت کالا تغییر کرده است؛ پیشنهاد جدید لازم است');
  const currentCost=policy.calculate(await policy.read(tx),'COORDINATED_COURIER',input.customer,goodsTotal);
  const offer=row.offer;
  const agreedFee=offer.courierAgreedFee;
  if(currentCost.policyRevision!==offer.policyRevision||currentCost.shippingChargeMode!==offer.shippingChargeMode||offer.shippingFee!==0||
     !Number.isInteger(agreedFee)||agreedFee<=0||offer.courierDueAtDelivery!==(currentCost.freeShipping?0:agreedFee)) {
    throw fail(409,'شرایط ارسال تغییر کرده است؛ پیشنهاد تازه دریافت کنید');
  }
  const q={...row.offer,details:{...row.offer,method:'COORDINATED_COURIER',carrier:'COORDINATED_COURIER',requestId:row.id,revision:row.revision,destination:destination(input.customer),originProvince:'البرز',originCity:'کرج',customerAccepted:true,allInclusive:false}};
  if(a.totalPrice!==q.totalPrice||a.shippingFee!==q.shippingFee)throw fail(409,'مبلغ پیشنهاد باید صریحاً پذیرفته شود');
  return q;
}
async function bind(tx,input,orderId,q) {
  const a=input.courierAcceptance;
  const result=await tx.courierRequest.updateMany({where:{id:a.requestId,orderId:null,state:'OFFERED',revision:a.revision},data:{state:'ACCEPTED',orderId}});
  if(result.count!==1)throw fail(409,'این درخواست قبلاً به سفارش تبدیل شده است');
  return new Date(Date.now()+30*60000);
}
module.exports={request,get,offer,acceptedQuote,bind,view,authorize,lock};
