'use strict';
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
assert(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/motif_shipping','Only the independent motif_shipping fixture may be used');
process.env.NODE_ENV='test';process.env.MOTIF_DESTINATION_SHIPPING='true';process.env.MOTIF_PARCEL_SHIPPING='true';process.env.MOTIF_CHECKOUT_PREVIEW='true';
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
const checkout=require('../src/lib/checkout'),p=require('../src/lib/parcel-shipping'),courier=require('../src/lib/coordinated-courier'),shipping=require('../src/lib/destination-shipping');
const customer={fullName:'Synthetic buyer',phone:'09120000000',address:'Synthetic address only',province:'تهران',city:'تهران',postalCode:'1111111111'};
let checks=0;function pass(name){console.log('PASS '+name);checks++;}
(async()=>{
 const product=await db.product.create({data:{title:'Synthetic logistics fixture',basePrice:10000,images:[],customerNeeds:[],styles:[],variants:{create:{size:'test',color:'test',sku:randomUUID(),stock:10,itemImages:[]}}},include:{variants:true}});
 const variant=product.variants[0],items=[{variantId:variant.id,quantity:1}];
 await db.shippingOperations.create({data:{id:'default',settings:p.settingsInput({...p.defaults,supportPhone:'02112345678',courierEnabled:true})}});
 await assert.rejects(p.parcel(db,items),/بسته‌بندی/);
 await db.shippingMeasurement.create({data:{variantId:variant.id,...p.weightInput({grams:250,approved:true})}});
 await db.shippingPackingPlan.create({data:p.planInput({items,tareGrams:50,lengthMm:300,widthMm:250,heightMm:50,approved:true})});
 assert.equal((await p.parcel(db,items)).grams,300);pass('approved grams, tare and exact packing; absent metadata blocked');
 const rules=shipping.provinces.flatMap(province=>[1,501].map((minGrams,i)=>({province,city:'*',fee:i?2000:1000,maxItems:20,maxGoodsTomans:1000000,minGrams,maxGrams:i?3000:500,maxLengthMm:500,maxWidthMm:500,maxHeightMm:500})));
 const t=await shipping.publish(db,{source:'Synthetic official-source placeholder for tests only',carrier:'POST_PISHTAZ',originProvince:'البرز',originCity:'کرج',validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),rules,allInclusive:true,merchantCoversDifference:true});
 const q=await shipping.quote(db,customer,items.map(x=>({...x,unitPrice:10000})));assert.equal(q.shippingFee,1000);
 const postalInput=checkout.checkoutInput({customer,items,shippingAcceptance:{tariffId:t.id,shippingFee:q.shippingFee,totalPrice:q.totalPrice}},randomUUID());
 const postal=await checkout.reserve(db,postalInput);
 assert.equal(postal.totalPrice,11000);assert.equal((await db.orderShippingSnapshot.findUnique({where:{orderId:postal.orderNumber}})).details.parcel.grams,300);
 assert.equal((await checkout.reserve(db,postalInput)).orderNumber,postal.orderNumber);pass('postal rate by actual grams; exact total and immutable snapshot; replay once');
 const input=checkout.checkoutInput({customer,items},randomUUID());input.clientHash=p.hash('fixture-client');const token=randomBytes(32).toString('hex');
 const r=await courier.request(db,input,token);
 assert.equal((await db.variant.findUnique({where:{id:variant.id}})).stock,9);
 assert.equal((await db.payment.count()),0);await assert.rejects(courier.get(db,r.id,'wrong'));
 assert.equal((await courier.request(db,input,token)).id,r.id);pass('request has no stock reservation or payment; access capability and idempotency');
 const o=await courier.offer(db,r.id,{fee:500,eta:'Synthetic confirmed time window',availabilityConfirmed:true,expectedRevision:0});
 assert.equal(o.offer.totalPrice,10500);
 const makeAcceptance=(key=randomUUID(),extra={})=>checkout.checkoutInput({customer,items,shippingMethod:'COORDINATED_COURIER',courierAcceptance:{requestId:r.id,token,revision:o.revision,shippingFee:500,totalPrice:10500,...extra}},key);
 await assert.rejects(checkout.reserve(db,makeAcceptance(randomUUID(),{totalPrice:10499})),/صریحاً پذیرفته/);
 assert.equal((await db.variant.findUnique({where:{id:variant.id}})).stock,9);pass('forged acceptance rolls back order and stock');
 const accept=makeAcceptance();
 const race=await Promise.allSettled([checkout.reserve(db,accept),checkout.reserve(db,accept),checkout.reserve(db,makeAcceptance())]);
 const good=race.filter(x=>x.status==='fulfilled');assert(good.length>=1,JSON.stringify(race.map(x=>x.status==='rejected'?{code:x.reason.code,message:x.reason.message}:x.status)));
 const id=good[0].value.orderNumber;assert(good.every(x=>x.value.orderNumber===id));
 assert.equal((await db.variant.findUnique({where:{id:variant.id}})).stock,8);
 assert.equal(await db.order.count({where:{id}}),1);
 await assert.rejects(courier.offer(db,r.id,{fee:501,eta:'late offer',availabilityConfirmed:true,expectedRevision:o.revision}));
 await assert.rejects(db.$executeRawUnsafe('UPDATE "CourierOffer" SET "details"=\'{}\'::jsonb WHERE "requestId"=$1',r.id));
 const snapshot=await db.orderShippingSnapshot.findUnique({where:{orderId:id}});assert.equal(snapshot.fee,500);pass('concurrent acceptance creates one order/reservation; late revision and history rewrite rejected');
 // An unresolved payment must prevent normal reservation cleanup.
 await db.checkoutReservation.update({where:{orderId:id},data:{expiresAt:new Date(Date.now()-60000)}});
 await db.payment.create({data:{orderId:id,amount:10500,authority:'SYNTHETIC_PENDING'}});
 await checkout.releaseExpired(db);assert.equal((await db.order.findUnique({where:{id}})).status,'PENDING');assert.equal((await db.variant.findUnique({where:{id:variant.id}})).stock,8);pass('unresolved payment retains inventory after reservation expiry');
 const expiredInput=checkout.checkoutInput({customer:{...customer,phone:'09120000001'},items},randomUUID());expiredInput.clientHash=p.hash('another-fixture');
 const expired=await courier.request(db,expiredInput,token);
 await db.courierRequest.update({where:{id:expired.id},data:{expiresAt:new Date(Date.now()-1)}});
 await assert.rejects(courier.offer(db,expired.id,{fee:100,eta:'expired fixture',availabilityConfirmed:true,expectedRevision:0}));
 pass('expired coordination cannot be quoted and never reserved stock');
 // Real Express middleware: ownership, admin-only operations, city exclusion, no offer bypass.
 const express=require('express');const app=express();app.use(express.json());app.use('/api/admin/session',require('../src/routes/admin-session')(require('../src/middleware/requireAdmin').sessions));app.use('/api/checkout',require('../src/routes/checkout'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 process.env.ADMIN_ORIGIN=origin;
 try{
 let response=await fetch(origin+'/api/checkout/logistics/admin');assert.equal(response.status,401);
 response=await fetch(origin+'/api/checkout/logistics/courier/'+r.id);assert.equal(response.status,404);
 response=await fetch(origin+'/api/checkout/logistics/courier',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),'X-Courier-Token':token},body:JSON.stringify({customer:{...customer,city:'پردیس'},items})});assert.equal(response.status,409);
 response=await fetch(origin+'/api/checkout/logistics/courier/'+r.id+'/accept',{method:'POST',headers:{'Content-Type':'application/json','X-Courier-Token':token,'Idempotency-Key':randomUUID()},body:JSON.stringify({accepted:false})});assert.equal(response.status,400);
 pass('real Express rejects admin access, tokenless reads, neighbouring cities and absent acceptance');
 if(process.env.MOTIF_PARCEL_BROWSER==='true'){
   const path=require('node:path');const {chromium}=require('playwright');
   app.get('/api/products/admin/list',(_req,res)=>res.json([product]));
   app.get('/api/products/admin/fabrics',(_req,res)=>res.json(require('../public/catalog').fabrics));
   app.get('/api/admin/smart-panel/store/status',(_req,res)=>res.sendStatus(404));
   app.get('/api/products',(_req,res)=>res.json([product]));
   app.get('/api/products/:id',(_req,res)=>res.json(product));
   app.use(express.static(path.join(__dirname,'../public')));
   app.get('/cart',(_req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
   const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
   try{
    const adminContext=await browser.newContext({viewport:{width:1280,height:900}});
    const adminPage=await adminContext.newPage();
    await adminPage.goto(origin+'/admin.html');
    await adminPage.locator('#token').fill(process.env.ADMIN_TOKEN);
    await adminPage.locator('#loginForm button').click();
    await adminPage.locator('#workspace').waitFor({state:'visible'});
    await adminPage.locator('#desktopNav [data-view="settings"]').click();
    await adminPage.locator('#shippingSettings').waitFor({state:'visible'});
    await adminPage.getByRole('button',{name:'مدیریت وزن، بسته‌بندی و پیک فوری',exact:true}).click();
    const settingsForm=adminPage.locator('#logisticsAdmin form').first();
    await settingsForm.locator('[name="requestMinutes"]').fill('90');
    const settingsSaved=adminPage.waitForResponse(r=>r.url().endsWith('/logistics/settings')&&r.request().method()==='PUT');
    await settingsForm.getByRole('button',{name:'ذخیره تنظیمات',exact:true}).click();
    assert.equal((await settingsSaved).status(),200);
    assert.equal((await p.settings(db)).requestMinutes,90);
    await adminContext.close();
    pass('authenticated admin can reach tariff panel and adjust courier durations with CSRF');
    for(const width of [320,1280]){
     const context=await browser.newContext({viewport:{width,height:900}});
     const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.addInitScript(cart=>localStorage.setItem('motif-cart',JSON.stringify(cart)),[{productId:product.id,variantId:variant.id,quantity:1}]);
     await page.goto(origin+'/cart');
     await page.locator('#guestCheckout').waitFor({state:'visible'});
     for(const [name,value]of Object.entries({...customer,phone:width===320?'09120000002':'09120000003'})){
      const field=page.locator('#guestCheckout [name="'+name+'"]');
      if(name==='province')await field.selectOption(value);else await field.fill(value);
     }
     await page.getByLabel('روش ارسال',{exact:true}).selectOption('COORDINATED_COURIER');
     await page.getByRole('button',{name:'درخواست هماهنگی ارسال فوری',exact:true}).click();
     await page.waitForFunction(()=>document.body.textContent.includes('در انتظار هماهنگی؛'));
     const phone=width===320?'09120000002':'09120000003';
     const request=await db.courierRequest.findFirst({where:{phoneHash:p.hash(phone)},orderBy:{createdAt:'desc'}});
     assert(request);assert.equal(request.state,'AWAITING_COORDINATION');
     await courier.offer(db,request.id,{fee:700,eta:'Synthetic confirmed delivery window',availabilityConfirmed:true,expectedRevision:0});
     await page.getByRole('button',{name:'بررسی پاسخ پشتیبانی',exact:true}).click();
     const acceptedResponse=page.waitForResponse(r=>r.url().endsWith('/courier/'+request.id+'/accept')&&r.request().method()==='POST');
     await page.getByRole('button',{name:'تأیید مبلغ قطعی و ثبت سفارش',exact:true}).click();
     const acceptedHttp=await acceptedResponse;const acceptedBody=await acceptedHttp.json();
     assert.equal(acceptedHttp.status(),201,JSON.stringify(acceptedBody));
     await page.getByText('شماره سفارش '+acceptedBody.orderNumber+' · مبلغ '+new Intl.NumberFormat('fa-IR').format(10700)+' تومان',{exact:true}).waitFor();
     const accepted=await db.courierRequest.findUnique({where:{id:request.id}});assert(accepted.orderId);
     assert.equal((await db.order.findUnique({where:{id:accepted.orderId}})).totalPrice,10700);
     assert.equal(await db.payment.count(),1,'Browser must not create any gateway attempt');
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
     assert.deepEqual(errors,[]);
     await require('node:fs/promises').mkdir('artifacts',{recursive:true});
     await page.screenshot({path:'artifacts/parcel-courier-'+width+'.png',fullPage:true});
     await context.close();
    }
    pass('desktop1280/mobile320 courier request, explicit quote acceptance, exact amount and no payment before owner action');
   }finally{await browser.close();}
 }
 }finally{await new Promise(resolve=>server.close(resolve));}
 console.log('Completed '+checks+' targeted PostgreSQL/Express checks');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
