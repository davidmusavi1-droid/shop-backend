const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
assert.equal(process.env.DATABASE_URL,'postgresql://motif_retry:retry_fixture_only@127.0.0.1:5432/motif_retry');
process.env.MOTIF_DESTINATION_SHIPPING='true';
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const shipping=require('../src/lib/destination-shipping');
const {reserve,checkoutInput}=require('../src/lib/checkout');
const {toRials}=require('../src/lib/zibal');
const customer={fullName:'Synthetic shipping',phone:'09000000003',province:'تهران',city:'تهران',postalCode:'1234567890',address:'Not a real address'};
const policy=(fee,expectedTariffId=null)=>({expectedTariffId,source:'Synthetic tariff only; not a real carrier rate',carrier:'Fixture',originProvince:'تهران',originCity:'تهران',
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),allInclusive:true,merchantCoversDifference:true,
  rules:shipping.provinces.map(province=>({province,city:'*',fee:province==='تهران'?fee:fee+3000,maxItems:2,maxGoodsTomans:500000}))});
async function run(){
  await p.shippingTariffState.upsert({where:{id:'default'},create:{id:'default'},update:{activeTariffId:null}});
  await p.shippingSettings.upsert({where:{id:'default'},create:{id:'default',fee:0},update:{fee:0}});
  const product=await p.product.create({data:{title:'Synthetic destination shipping',basePrice:10000,images:[],customerNeeds:[],styles:[],
    variants:{create:{size:'T',color:'fixture',sku:randomUUID(),stock:1,itemImages:[]}}},include:{variants:true}});
  const items=[{variantId:product.variants[0].id,quantity:1}],lines=[{quantity:1,unitPrice:10000}];
  const count=await p.order.count();
  await assert.rejects(reserve(p,checkoutInput({items,customer},randomUUID())),{statusCode:503});
  assert.equal(await p.order.count(),count);assert.equal((await p.variant.findUniqueOrThrow({where:{id:items[0].variantId}})).stock,1);
  console.log('PASS no approved tariff rejects order and rolls back stock despite legacy zero fee');
  const first=await shipping.publish(p,policy(5000));const quote=await shipping.quote(p,customer,lines);
  assert.equal(quote.totalPrice,15000);
  assert.equal((await shipping.quote(p,{...customer,province:'گیلان',city:'رشت'},lines)).shippingFee,8000);
  await assert.rejects(reserve(p,checkoutInput({items,customer,shippingAcceptance:{tariffId:first.id,shippingFee:0,totalPrice:10000}},randomUUID())),{statusCode:409});
  assert.equal((await p.variant.findUniqueOrThrow({where:{id:items[0].variantId}})).stock,1);
  console.log('PASS destination changes server shipping; forged browser fee cannot reserve or pay');
  const second=await shipping.publish(p,policy(7000,first.id));
  await assert.rejects(reserve(p,checkoutInput({items,customer,shippingAcceptance:quote},randomUUID())),{statusCode:409});
  assert.equal((await p.variant.findUniqueOrThrow({where:{id:items[0].variantId}})).stock,1);
  await assert.rejects(shipping.publish(p,policy(6000,first.id)),{statusCode:409});
  console.log('PASS tariff change between quote and order is rejected; concurrent admin revision is guarded');
  const q=await shipping.quote(p,customer,lines),key=randomUUID();
  const input=checkoutInput({items,customer,shippingAcceptance:q},key);
  const order=await reserve(p,input);assert.equal(order.shippingFee,7000);assert.equal(order.totalPrice,17000);assert.equal(toRials(order.totalPrice),170000);
  const frozen=await p.orderShippingSnapshot.findUniqueOrThrow({where:{orderId:order.orderNumber}});
  assert.equal(frozen.tariffId,second.id);assert.equal(frozen.details.totalPrice,17000);assert.equal(frozen.fee,7000);
  await shipping.publish(p,policy(9000,second.id));
  const resumed=await reserve(p,input);assert.equal(resumed.orderNumber,order.orderNumber);assert.equal(resumed.totalPrice,17000);
  assert.deepEqual(await p.orderShippingSnapshot.findUniqueOrThrow({where:{orderId:order.orderNumber}}),frozen);
  assert.equal((await p.variant.findUniqueOrThrow({where:{id:items[0].variantId}})).stock,0);
  await assert.rejects(p.shippingTariff.update({where:{id:second.id},data:{source:'tamper'}}));
  await assert.rejects(p.orderShippingSnapshot.update({where:{orderId:order.orderNumber},data:{fee:1}}));
  console.log('PASS accepted amount and tariff snapshot stay immutable across later changes and order replay; exact rial conversion');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>p.$disconnect());
