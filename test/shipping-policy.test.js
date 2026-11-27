const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../src/lib/shipping-policy'),post=require('../src/lib/postpaid-shipping'),evidence=require('../src/lib/card-evidence');
const confirmed={...policy.defaults,revision:'fixture',postalFreeEvidence:'Synthetic approval only',postalFreeValidUntil:new Date(Date.now()+60000).toISOString()};
const karaj={province:'البرز',city:'کرج',postalCode:'1111111111'},tehran={province:'تهران',city:'تهران',postalCode:'1111111111'};
test('exact threshold is postpaid; strictly above is free only for eligible methods and cities',()=>{
 for(const total of [4999999,5000000,5000001]){
  for(const [method,c,free] of [['POST_PISHTAZ_POSTPAID',tehran,total>5000000],['COORDINATED_COURIER',karaj,total>5000000],['COORDINATED_COURIER',tehran,false]]){
   const q=policy.calculate(confirmed,method,c,total);
   assert.equal(q.freeShipping,free);assert.equal(q.totalPrice,total);assert.equal(q.shippingFee,0);
   assert.equal(q.shippingChargeMode,free?'MERCHANT_PAYS':'RECIPIENT_AT_DELIVERY');
  }
 }
 assert.throws(()=>policy.calculate(confirmed,'COORDINATED_COURIER',{province:'البرز',city:'فردیس'},6000000));
});
test('postal free shipping blocks without actual unexpired approval; courier and postpaid remain independent',()=>{
 assert.equal(policy.calculate({...confirmed,postalFreeEvidence:''},'POST_PISHTAZ_POSTPAID',karaj,5000001).freeShippingReady,false);
 assert.equal(policy.calculate({...confirmed,postalFreeValidUntil:new Date(0).toISOString()},'POST_PISHTAZ_POSTPAID',karaj,5000001).freeShippingReady,false);
 assert.equal(policy.calculate({...confirmed,postalFreeEvidence:''},'POST_PISHTAZ_POSTPAID',karaj,5000000).freeShippingReady,true);
 assert.equal(policy.calculate({...confirmed,postalFreeEvidence:''},'COORDINATED_COURIER',karaj,5000001).freeShippingReady,true);
 assert.equal(policy.calculate({...confirmed,karajFreeEnabled:false},'COORDINATED_COURIER',karaj,5000001).freeShipping,false);
});
test('configurable threshold, amounts, destination normalization and admin validation',()=>{
 const q=policy.calculate({...confirmed,threshold:100},'COORDINATED_COURIER',{province:'البرز',city:' كرج '},101);
 assert.equal(q.freeShipping,true);
 assert.equal(policy.calculate(confirmed,'POST_PISHTAZ_POSTPAID',karaj,5000000).remainingForFreeShipping,1);
 for(const threshold of [0,-1,1.5,'5000000',2147483647])assert.throws(()=>policy.validate({...confirmed,threshold}));
 assert.throws(()=>policy.validate({...confirmed,postalFreeValidUntil:new Date(0).toISOString()}));
 assert.equal(policy.validate(confirmed).threshold,5000000);
});
test('bank codes normalize Persian digits, reject unsafe input and compare exact idempotent evidence',()=>{
 assert.equal(evidence.trackingCode('۱۲۳۴۵۶'), '123456');
 assert.equal(evidence.trackingCode(''),null);
 for(const c of ['12345','1'.repeat(41),'<script>',{},'123 456'])assert.throws(()=>evidence.trackingCode(c));
 const hash=evidence.digest(Buffer.from('fixture'));
 assert.equal(evidence.same({bankTrackingCode:'123456',receiptDigest:hash},'123456',hash),true);
 assert.equal(evidence.same({bankTrackingCode:'123456',receiptDigest:hash},'123457',hash),false);
});
test('free postal quote requires approval and explicit matching charge-mode acceptance',async()=>{
 const db={shippingOperations:{findUnique:async()=>({settings:confirmed})},shippingTariffState:{findUnique:async()=>({activeTariff:{id:'post',carrier:'POST_PISHTAZ_POSTPAID',validFrom:new Date(0),validUntil:new Date(Date.now()+60000)}})}};
 const q=await post.quote(db,karaj,[{unitPrice:5000001,quantity:1}]);
 assert.equal(q.shippingChargeMode,'MERCHANT_PAYS');assert.equal(q.details.shippingDueAtDelivery,0);
 post.accepted({shippingAcceptance:{tariffId:'post',shippingFee:0,totalPrice:5000001,shippingChargeMode:'MERCHANT_PAYS',termsAccepted:true}},q);
 assert.throws(()=>post.accepted({shippingAcceptance:{tariffId:'post',shippingFee:0,totalPrice:5000001,shippingChargeMode:'RECIPIENT_AT_DELIVERY',termsAccepted:true}},q));
 db.shippingOperations.findUnique=async()=>null;
 await assert.rejects(post.quote(db,karaj,[{unitPrice:5000001,quantity:1}]),e=>e.statusCode===503);
});
