const test=require('node:test'),assert=require('node:assert/strict');
const {breakdown}=require('../src/lib/shipping-costs');
test('all-inclusive shipping adds freight, packing, insurance, other costs and approved margin exactly',()=>{
 const result=breakdown({freight:1000,packing:200,insurance:50,other:30,margin:100},true);
 assert.equal(result.total,1380);
 assert.throws(()=>breakdown({freight:1000,packing:-1,insurance:0,other:0}));
 assert.throws(()=>breakdown({freight:1000,packing:0.5,insurance:0,other:0}));
 assert.throws(()=>breakdown({freight:2147483647,packing:1,insurance:0,other:0}));
});
test('owner approval is required and mismatched inclusive breakdown cannot be published',()=>{
 const old=process.env.MOTIF_PARCEL_SHIPPING;process.env.MOTIF_PARCEL_SHIPPING='true';
 try{
 const shipping=require('../src/lib/destination-shipping');
 const policy={source:'synthetic fixture only',carrier:'POST_PISHTAZ',originProvince:'البرز',originCity:'کرج',validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),allInclusive:true,merchantCoversDifference:true,
 rules:shipping.provinces.map(province=>({province,city:'*',fee:1380,maxItems:2,maxGoodsTomans:100000,minGrams:1,maxGrams:1000,maxLengthMm:1000,maxWidthMm:1000,maxHeightMm:1000,costs:{freight:1000,packing:200,insurance:50,other:30,margin:100}}))};
 assert.throws(()=>shipping.tariffInput(policy),/مالک/);
 assert.equal(shipping.tariffInput({...policy,ownerApproved:true}).rules[0].fee,1380);
 policy.rules[0].fee=1381;
 assert.throws(()=>shipping.tariffInput({...policy,ownerApproved:true}),/برابر نیست/);
 }finally{if(old===undefined)delete process.env.MOTIF_PARCEL_SHIPPING;else process.env.MOTIF_PARCEL_SHIPPING=old;}
});
