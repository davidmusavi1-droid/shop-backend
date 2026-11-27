const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../src/lib/shipping-policy'),post=require('../src/lib/postpaid-shipping'),evidence=require('../src/lib/card-evidence');
const config={...policy.defaults,...policy.thresholds,revision:'fixture'};
const karaj={province:'البرز',city:'کرج',postalCode:'1111111111'},tehran={province:'تهران',city:'تهران',postalCode:'1111111111'};
test('each method uses its own inclusive threshold on the net goods amount',()=>{
 for(const [method,customer,threshold] of [
  ['POST_PISHTAZ_POSTPAID',karaj,5000000],
  ['COORDINATED_COURIER',karaj,5000000],
  ['COORDINATED_COURIER',tehran,7000000]
 ]){
  for(const total of [threshold-1,threshold,threshold+1]){
   const q=policy.calculate(config,method,customer,total);
   assert.equal(q.totalPrice,total);
   assert.equal(q.shippingFee,0);
   assert.equal(q.freeShippingThreshold,threshold);
   assert.equal(q.freeShipping,total>=threshold);
   assert.equal(q.remainingForFreeShipping,Math.max(0,threshold-total));
   assert.equal(q.shippingChargeMode,total>=threshold?'MERCHANT_PAYS':'RECIPIENT_AT_DELIVERY');
  }
 }
 const edited={...config,tehranFreeThreshold:6000000};
 assert.equal(policy.calculate(edited,'COORDINATED_COURIER',tehran,6000000).freeShipping,true);
 assert.throws(()=>policy.calculate(config,'TIPAX',karaj,10000));
 assert.throws(()=>policy.calculate(config,'COORDINATED_COURIER',{province:'قم',city:'قم'},6000000));
});
test('old stored settings are ignored and old offer revisions are retired',async()=>{
 const db={shippingOperations:{findUnique:async()=>({settings:{...config,threshold:1,postalFreeEnabled:true,karajFreeEnabled:true,postalFreeEvidence:'obsolete'}})}};
 const state=await policy.read(db),visible=policy.publicView(state);
 assert.equal(state.revision,'free-shipping-v1:fixture');
 for(const key of ['threshold','postalFreeEnabled','karajFreeEnabled','postalFreeEvidence'])assert.equal(visible[key],undefined);
 for(const key of ['threshold','postalFreeEnabled','karajFreeEnabled','postalFreeEvidence','postalFreeValidUntil'])assert.throws(()=>policy.validate({...config,[key]:1}));
 assert.equal(policy.validate(config).postalEta,config.postalEta);
 assert.equal(visible.tehranFreeThreshold,7000000);
 assert.throws(()=>policy.validate({...config,tehranFreeThreshold:0}));
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

test('merchant-paid postage needs a fresh acceptance but not recipient-paid approval',async()=>{
 const db={shippingOperations:{findUnique:async()=>null},shippingTariffState:{findUnique:async()=>null}};
 const q=await post.quote(db,karaj,[{unitPrice:2500000,quantity:2}]);
 assert.equal(q.shippingChargeMode,'MERCHANT_PAYS');
 assert.equal(q.details.shippingDueAtDelivery,0);
 const input={shippingAcceptance:{tariffId:q.tariffId,shippingFee:0,totalPrice:5000000,shippingChargeMode:q.shippingChargeMode,termsAccepted:true,policyRevision:q.policyRevision}};
 post.accepted(input,q);
 assert.throws(()=>post.accepted({shippingAcceptance:{...input.shippingAcceptance,policyRevision:'old'}},q));
 await assert.rejects(post.quote(db,karaj,[{unitPrice:4999999,quantity:1}]),e=>e.statusCode===503);
});
