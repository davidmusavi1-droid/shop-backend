'use strict';
// Isolated synthetic database only. Never contacts a real gateway, SMS or carrier.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const target=new URL(process.env.DATABASE_URL);
assert(['127.0.0.1','localhost'].includes(target.hostname)&&target.pathname==='/motif_shipping');
process.env.NODE_ENV='test';process.env.MOTIF_POSTPAID_SHIPPING='true';process.env.MOTIF_CHECKOUT_PREVIEW='true';
process.env.MOTIF_CHECKOUT_LIMITS='true';process.env.MOTIF_CHECKOUT_PUBLIC='false';
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const checkout=require('../src/lib/checkout'),post=require('../src/lib/postpaid-shipping'),policy=require('../src/lib/shipping-policy');
const express=require('express'),sharp=require('sharp'),path=require('node:path');
const {loginAdmin}=require('../scripts/admin-http-client.cjs');
let server,origin,auth,seq=0;
const customer=()=>({fullName:'Synthetic opening',phone:'0912999'+String(++seq).padStart(4,'0'),province:'البرز',city:'کرج',address:'Synthetic address only',postalCode:'1111111111'});
async function reserve(c=customer(),price=10000,race=false){
 const product=await db.product.create({data:{title:'Synthetic opening item',basePrice:price,images:[],customerNeeds:[],styles:[],variants:{create:{size:'test',color:'test',sku:randomUUID(),stock:1,itemImages:[]}}},include:{variants:true}});
 const variant=product.variants[0],items=[{variantId:variant.id,quantity:1}],q=await post.quote(db,c,[{...items[0],unitPrice:price}]);
 const input=checkout.checkoutInput({customer:c,items,shippingAcceptance:{tariffId:q.tariffId,shippingFee:0,totalPrice:q.totalPrice,shippingChargeMode:q.shippingChargeMode,policyRevision:q.policyRevision,termsAccepted:true}},randomUUID());
 const results=race?await Promise.all([checkout.reserve(db,input),checkout.reserve(db,input)]):[await checkout.reserve(db,input)];
 if(race)assert.equal(results[0].orderNumber,results[1].orderNumber);
 return {order:results[0],input,variant,product,q};
}
async function proof(r,code,image){
 const form=new FormData();if(code!==undefined)form.append('bankTrackingCode',code);
 if(image)form.append('receipt',new Blob([image],{type:'image/png'}),'synthetic.png');
 return fetch(origin+'/api/checkout/card-transfer/orders/'+r.order.orderNumber+'/receipt',{method:'POST',headers:{'Idempotency-Key':r.input.requestKey},body:form});
}
const json=(url,body,headers=auth)=>fetch(origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
const payment=r=>db.payment.findUnique({where:{orderId:r.order.orderNumber},include:{cardTransfer:true}});
const stock=r=>db.variant.findUnique({where:{id:r.variant.id}}).then(v=>v.stock);
const review=(r,approved)=>json('/api/checkout/card-transfer/orders/'+r.order.orderNumber+'/review',{approved});
(async()=>{
 await db.cardTransferSettings.upsert({where:{id:'default'},create:{id:'default',enabled:true,cardNumber:'0000000000000000',accountHolder:'Synthetic only'},update:{enabled:true}});
 const app=express();app.use(express.json());app.use('/api/admin/session',require('../src/routes/admin-session')(require('../src/middleware/requireAdmin').sessions));
 app.use('/api/checkout',require('../src/routes/checkout'));app.use('/api/site',require('../src/routes/site-content'));
 app.use('/api/products',require('../src/routes/products'));app.use(require('../src/routes/storefront'));app.use(express.static(path.join(__dirname,'../public')));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;process.env.ADMIN_ORIGIN=origin;
 auth=await loginAdmin(origin,process.env.ADMIN_TOKEN);
 const a=await reserve();
 assert.equal(await stock(a),0);assert(Math.abs(Date.parse(a.order.expiresAt)-Date.now()-30*60000)<10000);
 assert.equal((await proof(a)).status,400);assert.equal(await payment(a),null);
 assert.equal((await proof(a,'bad')).status,400);
 const race=await Promise.all([proof(a,'۱۲۳۴۵۶۷۸۹'),proof(a,'123456789')]);assert(race.every(r=>r.status===202));
 const stored=await payment(a);assert.equal(stored.cardTransfer.receipt,null);assert.equal(stored.cardTransfer.bankTrackingCode,'123456789');
 assert.equal(await db.payment.count({where:{orderId:a.order.orderNumber}}),1);
 assert.equal((await proof(a,'123456780')).status,409);
 await db.checkoutReservation.update({where:{orderId:a.order.orderNumber},data:{expiresAt:new Date(0)}});
 await checkout.releaseExpired(db);assert.equal(await stock(a),0);
 assert.equal((await fetch(origin+'/api/checkout/card-transfer/orders/'+a.order.orderNumber+'/receipt')).status,401);
 assert.equal((await review(a,true)).status,200);assert.equal((await review(a,true)).status,200);assert.equal((await review(a,false)).status,409);
 assert.equal(await stock(a),0);assert.equal((await payment(a)).isSuccessful,true);
 console.log('PASS code-only, Persian normalization, concurrent replay, evidence conflict, expiry hold and single approval');
 const b=await reserve();
 assert.equal((await proof(b,'123456789')).status,409);assert.equal(await payment(b),null);
 const png=await sharp({create:{width:20,height:20,channels:3,background:'red'}}).png().toBuffer();
 assert.equal((await proof(b,undefined,png)).status,202);assert((await payment(b)).cardTransfer.receipt.length>0);
 const c=await reserve();assert.equal((await proof(c,undefined,png)).status,409);
 const blue=await sharp({create:{width:21,height:20,channels:3,background:'blue'}}).png().toBuffer();
 assert.equal((await proof(c,'987654321',blue)).status,202);
 const list=await fetch(origin+'/api/checkout/card-transfer/orders',{headers:auth}).then(r=>r.json());
 const row=list.orders.find(r=>r.id===c.order.orderNumber);
 assert.equal(row.payment.cardTransfer.bankTrackingCode,'987654321');assert.equal(row.payment.cardTransfer.hasReceipt,true);
 assert.equal(row.payment.cardTransfer.receipt,undefined);assert.equal(row.payment.cardTransfer.receiptDigest,undefined);
 const download=await fetch(origin+'/api/checkout/card-transfer/orders/'+b.order.orderNumber+'/receipt',{headers:auth});
 assert.equal(download.status,200);assert.match(download.headers.get('cache-control'),/no-store/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');
 assert.equal((await review(b,false)).status,200);assert.equal((await review(b,false)).status,200);assert.equal(await stock(b),1);
 assert.equal((await review(c,true)).status,200);
 const expired=await reserve();await db.checkoutReservation.update({where:{orderId:expired.order.orderNumber},data:{expiresAt:new Date(0)}});
 assert.equal((await proof(expired,'654321000')).status,409);await checkout.releaseExpired(db);assert.equal(await stock(expired),1);
 const mismatched=await reserve();assert.equal((await proof(mismatched,'654321001')).status,202);
 await db.payment.update({where:{orderId:mismatched.order.orderNumber},data:{amount:9999}});
 assert.equal((await review(mismatched,true)).status,409);assert.equal(await stock(mismatched),0);
 console.log('PASS receipt-only and both, cross-order duplicates, private downloads, admin evidence, single rejection release, expired upload and amount mismatch');
 const before=await db.orderShippingSnapshot.findMany({orderBy:{orderId:'asc'}});
 await db.shippingOperations.upsert({where:{id:'customer-shipping-policy'},create:{id:'customer-shipping-policy',settings:{...policy.defaults,revision:'obsolete',threshold:1,postalFreeEnabled:true,karajFreeEnabled:true}},update:{settings:{...policy.defaults,revision:'obsolete',threshold:1,postalFreeEnabled:true,karajFreeEnabled:true}}});
 const state=await policy.read(db);
 const saved=await policy.save(db,{...state,expectedRevision:state.revision});
 await assert.rejects(policy.save(db,{...state,expectedRevision:state.revision}),e=>e.statusCode===409);
 await assert.rejects(policy.save(db,{...saved,expectedRevision:saved.revision,threshold:1,postalFreeEnabled:true}),e=>e.statusCode===409);
 const large=await reserve(customer(),5000001);
 assert.equal(large.q.shippingChargeMode,'MERCHANT_PAYS');
 const snapshot=await db.orderShippingSnapshot.findUnique({where:{orderId:large.order.orderNumber}});
 assert.equal(snapshot.fee,0);assert.equal(snapshot.details.shippingChargeMode,'MERCHANT_PAYS');assert.equal(snapshot.details.policyRevision,saved.revision);
 for(const price of [4999999,5000000,20000000])assert.equal((await reserve(customer(),price)).q.shippingChargeMode,price>=5000000?'MERCHANT_PAYS':'RECIPIENT_AT_DELIVERY');
 assert.deepEqual(await db.orderShippingSnapshot.findMany({where:{orderId:{in:before.map(r=>r.orderId)}},orderBy:{orderId:'asc'}}),before);
 assert.throws(()=>checkout.checkoutInput({customer:large.input.customer,items:large.input.items,shippingAcceptance:{tariffId:large.q.tariffId,shippingFee:0,totalPrice:large.order.totalPrice,shippingChargeMode:'INVALID_MODE',termsAccepted:true}},randomUUID()),e=>e.statusCode===400);
 assert.equal((await json('/api/checkout/shipping/tariff',{})).status,409);
 assert.equal((await fetch(origin+'/api/checkout/shipping/tariff',{headers:auth}).then(r=>r.json())).mode,'postpaid');
 assert.equal((await fetch(origin+'/api/checkout/logistics/settings').then(r=>r.json())).tipaxEnabled,false);
 assert.equal((await json('/api/checkout/shipping/quote',{customer:large.input.customer,items:large.input.items,shippingMethod:'TIPAX'})).status,409);
 await assert.rejects(db.$executeRawUnsafe('UPDATE "OrderShippingSnapshot" SET "fee"=1 WHERE "orderId"=$1',large.order.orderNumber));
 for(const name of ['shipping-guide','payment-guide','tracking-guide']){
  const r=await fetch(origin+'/'+name);assert.equal(r.status,200);const html=await r.text();assert(html.includes('MOTIF'));assert(html.includes('class="customer-guide"'));
  if(name==='shipping-guide'){
   assert(html.includes((5000000).toLocaleString('fa-IR')));
   assert(html.includes((7000000).toLocaleString('fa-IR')));
  }
  if(name==='payment-guide')assert(html.includes('کرایه ارسال رایگان با MOTIF است'));
 }
 process.env.NODE_ENV='production';process.env.ADMIN_ORIGIN='https://motifdress.com';
 assert.equal((await json('/api/checkout/orders',{},{})).status,401);
 process.env.NODE_ENV='test';process.env.ADMIN_ORIGIN=origin;
 console.log('PASS recipient-paid and merchant-paid postage, obsolete-settings rejection, disabled Tipax, immutable history, independent guides and closed checkout');

 // Exercise actual courier offers/acceptance and zero-fee SQL, including Arabic Kaf.
 const parcel=require('../src/lib/parcel-shipping'),courier=require('../src/lib/coordinated-courier');
 for(const [city,fee,price] of [['كرج',500,10000],['كرج',700,5000001],['تهران',600,10000],['تهران',800,6999999],['تهران',850,7000000]]){
  const recipient={...customer(),province:city==='تهران'?'تهران':'البرز',city};
  const product=await db.product.create({data:{title:'Synthetic courier policy boundary',basePrice:price,images:[],customerNeeds:[],styles:[],variants:{create:{size:'test',color:'test',sku:randomUUID(),stock:1,itemImages:[]}}},include:{variants:true}});
  const items=[{variantId:product.variants[0].id,quantity:1}];
  await db.shippingMeasurement.create({data:{variantId:items[0].variantId,...parcel.weightInput({grams:200,approved:true})}});
  await db.shippingPackingPlan.create({data:parcel.planInput({items,tareGrams:50,lengthMm:300,widthMm:200,heightMm:50,approved:true})});
  const input=checkout.checkoutInput({customer:recipient,items},randomUUID());input.clientHash=parcel.hash('synthetic-opening-courier');
  const token=require('node:crypto').randomBytes(32).toString('hex');
  const request=await courier.request(db,input,token);
  await assert.rejects(courier.offer(db,request.id,{fee:0,eta:'Synthetic confirmed delivery',availabilityConfirmed:true,expectedRevision:0}),e=>e.statusCode===400);
  const offer=await courier.offer(db,request.id,{fee,eta:'Synthetic confirmed delivery',availabilityConfirmed:true,expectedRevision:0});
  const free=price>=(city==='تهران'?7000000:5000000);
  assert.equal(offer.offer.totalPrice,price);assert.equal(offer.offer.shippingFee,0);assert.equal(offer.offer.courierDueAtDelivery,free?0:fee);
  const acceptedInput=checkout.checkoutInput({customer:recipient,items,shippingMethod:'COORDINATED_COURIER',courierAcceptance:{requestId:request.id,token,revision:offer.revision,shippingFee:0,totalPrice:price}},randomUUID());
  const accepted=await checkout.reserve(db,acceptedInput);
  const shipping=await db.orderShippingSnapshot.findUnique({where:{orderId:accepted.orderNumber}});
  assert.equal(shipping.fee,0);assert.equal(shipping.details.shippingChargeMode,free?'MERCHANT_PAYS':'RECIPIENT_AT_DELIVERY');
  assert.equal(shipping.details.destination.city,city==='كرج'?'کرج':'تهران');
  assert.equal((await db.variant.findUnique({where:{id:items[0].variantId}})).stock,0);
 }
 console.log('PASS agreed positive courier fares for Karaj/Tehran below and above old boundary, Arabic spelling and goods-only totals');

 const samePhone=customer();
 await reserve(samePhone);await reserve(samePhone);await reserve(samePhone,10000,true);
 await assert.rejects(reserve(samePhone),e=>e.statusCode===429);
 console.log('PASS DB-serialized mobile order quota prevents unlimited stock holds');
 if(process.env.MOTIF_PARCEL_BROWSER==='true'){
  const {chromium}=require('playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
  try{for(const width of [320,1280]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(cart=>localStorage.setItem('motif-cart',JSON.stringify(cart)),[{productId:large.product.id,variantId:large.variant.id,quantity:1}]);
   // The already-reserved item has no stock; restore fixture only for visual cart checks.
   await db.variant.update({where:{id:large.variant.id},data:{stock:1}});
   await page.goto(origin+'/cart');await page.locator('#guestCheckout').waitFor({state:'visible'});
   assert(await page.locator('#freeShippingProgress').isVisible());
   assert.equal(await page.locator('#freeShippingMeter').getAttribute('max'),'5000000');
   assert((await page.locator('#freeShippingText').innerText()).includes('مشمول ارسال رایگان'));
   const form=page.locator('#guestCheckout');
   await form.locator('[name="fullName"]').fill('Synthetic user');
   await form.locator('[name="phone"]').fill('09129999999');
   await form.locator('[name="province"]').selectOption('البرز');
   await form.locator('[name="city"]').fill('کرج');
   await form.locator('[name="postalCode"]').fill('1111111111');
   await form.locator('[name="address"]').fill('Synthetic address');
   const agreement=page.locator('#postpaidAgreement input');
   const quote=page.waitForResponse(r=>r.url().endsWith('/api/checkout/shipping/quote'));
   await page.locator('#quoteShipping').click();
   assert.equal((await quote).status(),200);
   await agreement.waitFor();
   assert.equal(await agreement.isChecked(),false);
   const confirm=form.getByRole('button',{name:'تأیید شرایط ارسال و مبلغ کالا',exact:true});
   assert.equal(await confirm.isEnabled(),false);
   assert.equal(await page.getByRole('link',{name:'مطالعه کامل شرایط ارسال'}).getAttribute('href'),'/shipping-guide');
   assert.doesNotMatch(await form.innerText(),/زمان قطعی تضمین نمی‌شود/);
   await agreement.check();
   assert(await confirm.isEnabled());
   const panel=page.locator('#cardReceipt');await panel.evaluate(e=>e.hidden=false);
   assert.equal(await panel.locator('[name="receipt"]').getAttribute('required'),null);
   assert.equal(await panel.locator('[name="bankTrackingCode"]').count(),1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await fsMkdir();await page.screenshot({path:'artifacts/parcel-courier-opening-'+width+'.png',fullPage:true});
   for(const name of ['shipping-guide','payment-guide','tracking-guide']){
    await page.goto(origin+'/'+name);await page.locator('article.customer-guide').waitFor({state:'visible'});assert(await page.locator('#serverContent').isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
  console.log('PASS desktop/mobile absence of incentives, evidence fields, three readable guide pages and no horizontal overflow');
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));await db.$disconnect();});
async function fsMkdir(){await require('node:fs/promises').mkdir('artifacts',{recursive:true});}
