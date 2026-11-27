const test=require('node:test'),assert=require('node:assert/strict');
const post=require('../src/lib/postpaid-shipping');
test('postpaid shipping charges only goods and requires explicit acceptance, never means free shipping',async()=>{
 const db={shippingOperations:{findUnique:async()=>null},shippingTariffState:{findUnique:async()=>({activeTariff:{id:'synthetic',carrier:'POST_PISHTAZ_POSTPAID',source:'Synthetic confirmation',validFrom:new Date(Date.now()-1000),validUntil:new Date(Date.now()+60000)}})}};
 const q=await post.quote(db,{province:'تهران',city:'تهران',postalCode:'1111111111'},[{quantity:2,unitPrice:10000}]);
 assert.equal(q.shippingFee,0);assert.equal(q.totalPrice,20000);assert.equal(q.details.shippingDueAtDelivery,null);
 assert(q.terms.includes('شرکت پست'));
 assert.throws(()=>post.accepted({shippingAcceptance:{tariffId:q.tariffId,shippingFee:0,totalPrice:20000}},q));
 post.accepted({shippingAcceptance:{tariffId:q.tariffId,shippingFee:0,totalPrice:20000,shippingChargeMode:post.mode,termsAccepted:true}},q);
 db.shippingTariffState.findUnique=async()=>null;
 await assert.rejects(post.quote(db,{province:'تهران',city:'تهران',postalCode:'1111111111'},[{quantity:1,unitPrice:10000}]),/تأیید نشده/);
});
