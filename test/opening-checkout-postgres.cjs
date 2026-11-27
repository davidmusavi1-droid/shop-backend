'use strict';
// Isolated synthetic database only. Never contacts a real gateway, SMS or carrier.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const target=new URL(process.env.DATABASE_URL);
assert(['127.0.0.1','localhost'].includes(target.hostname)&&target.pathname==='/motif_shipping');
process.env.NODE_ENV='test';process.env.MOTIF_POSTPAID_SHIPPING='true';process.env.MOTIF_CHECKOUT_PREVIEW='true';
process.env.MOTIF_CHECKOUT_LIMITS='true';delete process.env.MOTIF_PUBLIC_CHECKOUT;
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const checkout=require('../src/lib/checkout'),post=require('../src/lib/postpaid-shipping'),policy=require('../src/lib/shipping-policy');
const express=require('express'),sharp=require('sharp'),path=require('node:path');
const {loginAdmin}=require('../scripts/admin-http-client.cjs');
let server,origin,auth,seq=0;
const customer=()=>({fullName:'Synthetic opening',phone:'0912999'+String(++seq).padStart(4,'0'),province:'البرز',city:'کرج',address:'Synthetic address only',postalCode:'1111111111'});
async function reserve(c=customer(),price=10000){
 const product=await db.product.create({data:{title:'Synthetic opening item',basePrice:price,images:[],customerNeeds:[],styles:[],variants:{create:{size:'test',color:'test',sku:randomUUID(),stock:1,itemImages:[]}}},include:{variants:true}});
 const variant=product.variants[0],items=[{variantId:variant.id,quantity:1}],q=await post.quote(db,c,[{...items[0],unitPrice:price}]);
 const input=checkout.checkoutInput({customer:c,items,shippingAcceptance:{tariffId:q.tariffId,shippingFee:0,totalPrice:q.totalPrice,shippingChargeMode:q.shippingChargeMode,termsAccepted:true}},randomUUID());
 return {order:await checkout.reserve(db,input),input,variant,product,q};
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
 const state=await policy.read(db);
 await assert.rejects(reserve(customer(),5000001),e=>e.statusCode===503);
 const saved=await policy.save(db,{...state,expectedRevision:state.revision,postalFreeEvidence:'Synthetic postal approval for isolated test only',postalFreeValidUntil:new Date(Date.now()+3600000).toISOString()});
 await assert.rejects(policy.save(db,{...state,expectedRevision:state.revision}),e=>e.statusCode===409);
 const free=await reserve(customer(),5000001);
 assert.equal(free.q.shippingChargeMode,'MERCHANT_PAYS');
 const snapshot=await db.orderShippingSnapshot.findUnique({where:{orderId:free.order.orderNumber}});
 assert.equal(snapshot.fee,0);assert.equal(snapshot.details.freeShipping,true);assert.equal(snapshot.details.policyRevision,saved.revision);
 const threshold=await reserve(customer(),5000000);assert.equal(threshold.q.shippingChargeMode,'RECIPIENT_AT_DELIVERY');
 await assert.rejects(db.$executeRawUnsafe('UPDATE "OrderShippingSnapshot" SET "fee"=1 WHERE "orderId"=$1',free.order.orderNumber));
 for(const name of ['shipping-guide','payment-guide','tracking-guide']){
  const r=await fetch(origin+'/'+name);assert.equal(r.status,200);const html=await r.text();assert(html.includes('MOTIF'));assert(html.includes('class="guide"'));
 }
 process.env.NODE_ENV='production';
 assert.equal((await json('/api/checkout/orders',{},{})).status,401);
 process.env.NODE_ENV='test';
 console.log('PASS strict free threshold, real-approval gate, stale settings, immutable snapshot, independent guides and closed production checkout');
 const samePhone=customer();
 await reserve(samePhone);await reserve(samePhone);await reserve(samePhone);
 await assert.rejects(reserve(samePhone),e=>e.statusCode===429);
 console.log('PASS DB-serialized mobile order quota prevents unlimited stock holds');
 if(process.env.MOTIF_PARCEL_BROWSER==='true'){
  const {chromium}=require('playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
  try{for(const width of [320,1280]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(cart=>localStorage.setItem('motif-cart',JSON.stringify(cart)),[{productId:free.product.id,variantId:free.variant.id,quantity:1}]);
   // The already-reserved item has no stock; restore fixture only for visual cart checks.
   await db.variant.update({where:{id:free.variant.id},data:{stock:1}});
   await page.goto(origin+'/cart');await page.locator('#guestCheckout').waitFor({state:'visible'});
   await page.locator('#freeShippingProgress').waitFor({state:'visible'});
   assert((await page.locator('#freeShippingText').textContent()).includes('رایگان'));
   const panel=page.locator('#cardReceipt');await panel.evaluate(e=>e.hidden=false);
   assert.equal(await panel.locator('[name="receipt"]').getAttribute('required'),null);
   assert.equal(await panel.locator('[name="bankTrackingCode"]').count(),1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await fsMkdir();await page.screenshot({path:'artifacts/parcel-courier-opening-'+width+'.png',fullPage:true});
   for(const name of ['shipping-guide','payment-guide','tracking-guide']){
    await page.goto(origin+'/'+name);await page.locator('.guide').waitFor({state:'visible'});assert(await page.locator('#serverContent').isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   assert.deepEqual(errors,[]);await context.close();
  }}finally{await browser.close();}
  console.log('PASS desktop/mobile progress, evidence fields, three readable guide pages and no horizontal overflow');
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));await db.$disconnect();});
async function fsMkdir(){await require('node:fs/promises').mkdir('artifacts',{recursive:true});}
