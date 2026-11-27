const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../src/lib/shipping-policy'),post=require('../src/lib/postpaid-shipping'),evidence=require('../src/lib/card-evidence');
const config={...policy.defaults,revision:'fixture'};
const karaj={province:'البرز',city:'کرج',postalCode:'1111111111'},tehran={province:'تهران',city:'تهران',postalCode:'1111111111'};
test('all amounts and both courier cities remain customer-paid with no incentives',()=>{
 for(const total of [1,4999999,5000000,5000001,20000000]){
  for(const [method,c] of [['POST_PISHTAZ_POSTPAID',karaj],['POST_PISHTAZ_POSTPAID',tehran],['COORDINATED_COURIER',karaj],['COORDINATED_COURIER',tehran]]){
   const q=policy.calculate({...config,threshold:1,postalFreeEnabled:true,karajFreeEnabled:true},method,c,total);
   assert.equal(q.totalPrice,total);assert.equal(q.shippingFee,0);assert.equal(q.shippingChargeMode,'RECIPIENT_AT_DELIVERY');assert.equal(q.shippingDueAtDelivery,null);
   for(const key of ['freeShipping','freeShippingThreshold','remainingForFreeShipping'])assert.equal(q[key],undefined);
  }
 }
 assert.throws(()=>policy.calculate(config,'TIPAX',karaj,10000));
 assert.throws(()=>policy.calculate(config,'COORDINATED_COURIER',{province:'البرز',city:'فردیس'},6000000));
});
test('old stored settings are ignored and old offer revisions are retired',async()=>{
 const db={shippingOperations:{findUnique:async()=>({settings:{...config,threshold:1,postalFreeEnabled:true,karajFreeEnabled:true,postalFreeEvidence:'obsolete'}})}};
 const state=await policy.read(db),visible=policy.publicView(state);
 assert.equal(state.revision,'postpaid-only-v1:fixture');
 for(const key of ['threshold','postalFreeEnabled','karajFreeEnabled','postalFreeEvidence'])assert.equal(visible[key],undefined);
 for(const key of ['threshold','postalFreeEnabled','karajFreeEnabled','postalFreeEvidence','postalFreeValidUntil'])assert.throws(()=>policy.validate({...config,[key]:1}));
 assert.equal(policy.validate(config).postalEta,config.postalEta);
 assert.throws(()=>policy.validate({...config,postalEta:''}));
});
test('destination normalization and amount validation remain strict',()=>{
 assert.equal(policy.calculate(config,'COORDINATED_COURIER',{province:'البرز',city:' كرج '},5000001).eta,config.karajEta);
 for(const value of [0,-1,1.5,'5000000',2147483648])assert.throws(()=>policy.calculate(config,'POST_PISHTAZ_POSTPAID',karaj,value));
});
test('bank codes normalize Persian digits, reject unsafe input and compare exact idempotent evidence',()=>{
 assert.equal(evidence.trackingCode('۱۲۳۴۵۶'), '123456');
 assert.equal(evidence.trackingCode(''),null);
 for(const c of ['12345','1'.repeat(41),'<script>',{},'123 456'])assert.throws(()=>evidence.trackingCode(c));
 const hash=evidence.digest(Buffer.from('fixture'));
 assert.equal(evidence.same({bankTrackingCode:'123456',receiptDigest:hash},'123456',hash),true);
 assert.equal(evidence.same({bankTrackingCode:'123456',receiptDigest:hash},'123457',hash),false);
});

test('large postal orders need only actual postpaid approval and exact recipient-paid acceptance',async()=>{
 const db={shippingOperations:{findUnique:async()=>({settings:{...config,threshold:1,postalFreeEnabled:true}})},shippingTariffState:{findUnique:async()=>({activeTariff:{id:'post',carrier:'POST_PISHTAZ_POSTPAID',validFrom:new Date(0),validUntil:new Date(Date.now()+60000)}})}};
 const q=await post.quote(db,karaj,[{unitPrice:5000001,quantity:1}]);
 assert.equal(q.shippingChargeMode,'RECIPIENT_AT_DELIVERY');assert.equal(q.details.shippingDueAtDelivery,null);
 post.accepted({shippingAcceptance:{tariffId:'post',shippingFee:0,totalPrice:5000001,shippingChargeMode:'RECIPIENT_AT_DELIVERY',termsAccepted:true}},q);
 assert.throws(()=>post.accepted({shippingAcceptance:{tariffId:'post',shippingFee:0,totalPrice:5000001,shippingChargeMode:'MERCHANT_PAYS',termsAccepted:true}},q));
 db.shippingTariffState.findUnique=async()=>null;
 await assert.rejects(post.quote(db,karaj,[{unitPrice:5000001,quantity:1}]),e=>e.statusCode===503);
});
