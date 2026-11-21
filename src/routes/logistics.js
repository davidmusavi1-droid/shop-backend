const express=require('express');
const prisma=require('../lib/prisma');
const admin=require('../middleware/requireAdmin');
const checkout=require('../lib/checkout');
const p=require('../lib/parcel-shipping');
const courier=require('../lib/coordinated-courier');
const {randomUUID}=require('node:crypto');
const router=express.Router();
const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.statusCode||500).json({error:e.statusCode?e.message:'تنظیمات ارسال موقتاً در دسترس نیست'});}};
router.post('/costs/:id',admin,handle(async(req,res)=>res.json(await require('../lib/shipping-costs').record(prisma,req.params.id,req.body))));
router.get('/costs',admin,handle(async(req,res)=>res.json(await require('../lib/shipping-costs').report(prisma))));
router.get('/postpaid',admin,handle(async(req,res)=>{
 const state=await prisma.shippingTariffState.findUnique({where:{id:'postpaid'},include:{activeTariff:true}});
 res.json({policy:state?.activeTariff||null});
}));
router.post('/postpaid',admin,handle(async(req,res)=>res.json(await require('../lib/postpaid-shipping').publish(prisma,req.body))));
router.get('/settings',handle(async(req,res)=>{const s=await p.settings(prisma);res.json({supportPhone:s.supportPhone,courierEnabled:s.courierEnabled,requestMinutes:s.requestMinutes,offerMinutes:s.offerMinutes,reservationMinutes:s.reservationMinutes,tipaxEnabled:false});}));
router.put('/settings',admin,handle(async(req,res)=>{
 const settings=p.settingsInput(req.body);
 await prisma.shippingOperations.upsert({where:{id:'default'},create:{id:'default',settings},update:{settings}});res.json(settings);
}));
router.get('/admin',admin,handle(async(req,res)=>{
 const [settings,measurements,plans,requests]=await Promise.all([p.settings(prisma),prisma.shippingMeasurement.findMany(),prisma.shippingPackingPlan.findMany(),prisma.courierRequest.findMany({orderBy:{createdAt:'desc'},take:50})]);
 res.json({settings,measurements,plans,requests:requests.map(({tokenHash,phoneHash,clientHash,...r})=>r)});
}));
router.put('/measurements/:id',admin,handle(async(req,res)=>{
 if(!await prisma.variant.findUnique({where:{id:req.params.id}}))throw p.fail(404,'تنوع پیدا نشد');
 const data=p.weightInput(req.body);
 res.json(await prisma.shippingMeasurement.upsert({where:{variantId:req.params.id},create:{variantId:req.params.id,...data},update:data}));
}));
router.post('/packing-plans',admin,handle(async(req,res)=>{
 const data=p.planInput(req.body);
 for(const x of data.items)if(!await prisma.variant.findUnique({where:{id:x.variantId}}))throw p.fail(404,'تنوع پیدا نشد');
 res.json(await prisma.shippingPackingPlan.upsert({where:{id:data.id},create:data,update:data}));
}));
router.post('/courier',handle(async(req,res)=>{
 const body={...req.body,shippingMethod:undefined,courierAcceptance:undefined,shippingAcceptance:undefined};
 const input=checkout.checkoutInput(body,req.get('Idempotency-Key'));
 input.clientHash=p.hash(req.ip||'unknown');
 res.status(201).json(await courier.request(prisma,input,req.get('X-Courier-Token')));
}));
router.get('/courier/:id',handle(async(req,res)=>res.json(await courier.get(prisma,req.params.id,req.get('X-Courier-Token')))));
router.post('/courier/:id/accept',handle(async(req,res)=>{
 const row=await prisma.courierRequest.findUnique({where:{id:req.params.id}});
 courier.authorize(row,req.get('X-Courier-Token'));
 if(req.body?.accepted!==true)throw p.fail(400,'مبلغ قطعی را تأیید کنید');
 const input=checkout.checkoutInput({...row.payload,shippingMethod:'COORDINATED_COURIER',courierAcceptance:{requestId:row.id,token:req.get('X-Courier-Token'),revision:req.body.revision,shippingFee:req.body.shippingFee,totalPrice:req.body.totalPrice}},req.get('Idempotency-Key'));
 res.status(201).json(await checkout.reserve(prisma,input));
}));
router.post('/courier/:id/offer',admin,handle(async(req,res)=>res.json(await courier.offer(prisma,req.params.id,req.body))));
module.exports=router;
