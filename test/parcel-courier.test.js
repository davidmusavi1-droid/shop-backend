const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('../src/lib/parcel-shipping');
const shipping=require('../src/lib/destination-shipping');
test('courier matches city and province, not neighbouring cities',()=>{
 assert(p.eligible({province:'البرز',city:'کرج'}));assert(p.eligible({province:'تهران',city:'تهران'}));
 for(const c of [{province:'تهران',city:'پردیس'},{province:'البرز',city:'فردیس'},{province:'فارس',city:'تهران'}])assert(!p.eligible(c));
});
test('settings permit owner durations but no unbounded reservation',()=>{
 assert.equal(p.settingsInput({...p.defaults,supportPhone:'02112345678',courierEnabled:true}).requestMinutes,120);
 for(const reservationMinutes of [0,1,29,31,1.5])assert.throws(()=>p.settingsInput({...p.defaults,reservationMinutes}),/نامعتبر/);
 assert.throws(()=>p.settingsInput({...p.defaults,courierEnabled:true}),/پشتیبانی/);
});
test('measurements require explicit approval and exact integers',()=>{
 assert.throws(()=>p.weightInput({grams:200,approved:false}));
 assert.throws(()=>p.weightInput({grams:20.2,approved:true}));
 assert.equal(p.weightInput({grams:200,approved:true}).grams,200);
});
test('packing identity is independent of item order and rejects duplicate variants',()=>{
 assert.equal(p.signature([{variantId:'a',quantity:1},{variantId:'b',quantity:2}]),p.signature([{variantId:'b',quantity:2},{variantId:'a',quantity:1}]));
 assert.throws(()=>p.planInput({approved:true,items:[{variantId:'a',quantity:1},{variantId:'a',quantity:1}]}));
});
test('actual multi-item parcel adds tare and requires exact approved packing',async()=>{
 const items=[{variantId:'a',quantity:2},{variantId:'b',quantity:1}];
 const db={shippingPackingPlan:{findUnique:async()=>({tareGrams:60,lengthMm:300,widthMm:250,heightMm:100,approvedAt:new Date()})},
 shippingMeasurement:{findMany:async()=>[{variantId:'a',grams:250,approvedAt:new Date()},{variantId:'b',grams:500,approvedAt:new Date()}]}};
 assert.equal((await p.parcel(db,items)).grams,1060);
 db.shippingPackingPlan.findUnique=async()=>null;
 await assert.rejects(p.parcel(db,items),/بسته‌بندی/);
});
test('weight bands respect exact boundary, dimensions and integer amounts',()=>{
 const row={minGrams:1,maxGrams:500,maxLengthMm:300,maxWidthMm:250,maxHeightMm:100};
 assert(p.fits(row,{grams:500,lengthMm:300,widthMm:250,heightMm:100}));
 assert(!p.fits(row,{grams:501,lengthMm:300,widthMm:250,heightMm:100}));
 assert(!p.fits(row,{grams:250,lengthMm:301,widthMm:250,heightMm:100}));
 assert.throws(()=>p.bounds({...row,minGrams:501}));
});
test('production shipping refuses unmeasured or missing weight coverage, no zero fallback',()=>{
 const old=process.env.MOTIF_PARCEL_SHIPPING;process.env.MOTIF_PARCEL_SHIPPING='true';
 try{
 const tariff={id:'test',carrier:'POST_PISHTAZ',source:'synthetic only',originProvince:'البرز',originCity:'کرج',validFrom:new Date(),validUntil:new Date(Date.now()+60000),rules:[{province:'تهران',city:'*',fee:100,maxItems:10,maxGoodsTomans:100000,minGrams:1,maxGrams:500,maxLengthMm:300,maxWidthMm:300,maxHeightMm:300}]};
 const customer={province:'تهران',city:'تهران',postalCode:'1111111111'},items=[{quantity:1,unitPrice:1000}];
 assert.throws(()=>shipping.calculate(tariff,customer,items),/مرسوله/);
 assert.throws(()=>shipping.calculate(tariff,customer,items,{grams:501,lengthMm:100,widthMm:100,heightMm:100}),/قابل محاسبه/);
 const q=shipping.calculate(tariff,customer,items,{grams:500,lengthMm:100,widthMm:100,heightMm:100});assert.equal(q.totalPrice,1100);assert.equal(q.details.parcel.grams,500);
 }finally{if(old===undefined)delete process.env.MOTIF_PARCEL_SHIPPING;else process.env.MOTIF_PARCEL_SHIPPING=old;}
});

test('JSONB key ordering does not change accepted customer or parcel fingerprints',()=>{
 const a={customer:{name:'synthetic',city:'تهران'},parcel:{approvedAt:new Date('2026-11-20T00:00:00.000Z'),items:[{quantity:1,variantId:'a'}]}};
 const b={parcel:{items:[{variantId:'a',quantity:1}],approvedAt:'2026-11-20T00:00:00.000Z'},customer:{city:'تهران',name:'synthetic'}};
 assert.equal(p.hash(a),p.hash(b));
 assert.notEqual(p.hash(a),p.hash({...b,customer:{...b.customer,city:'کرج'}}));
});

test('Tehran cutoff switches from today to tomorrow and rejects stale same-day offers',()=>{
 const before=new Date('2026-11-28T16:29:00Z'),at=new Date('2026-11-28T16:30:00Z'),after=new Date('2026-11-28T16:31:00Z');
 assert.deepEqual(p.deliverySchedule('20:00',before),{today:'2026-11-28',tomorrow:'2026-11-29',todayAvailable:true});
 assert.equal(p.requestedDeliveryDate('today','20:00',at),'2026-11-28');
 assert.equal(p.requestedDeliveryDate(undefined,'20:00',after),'2026-11-29');
 assert.throws(()=>p.requestedDeliveryDate('today','20:00',after),e=>e.statusCode===409);
 assert.equal(p.requestedDeliveryDate('tomorrow','20:00',after),'2026-11-29');
 assert.throws(()=>p.ensureDeliveryDate('2026-11-28','20:00',after),e=>e.statusCode===409);
 assert.doesNotThrow(()=>p.ensureDeliveryDate('2026-11-29','20:00',after));
 assert.equal(p.deliverySchedule('19:30',new Date('2026-12-31T21:00:00Z')).tomorrow,'2027-01-02');
 assert.throws(()=>p.settingsInput({...p.defaults,courierCutoff:'24:00'}),e=>e.statusCode===400);
 assert.equal(p.settingsInput({...p.defaults,courierCutoff:'19:15'}).courierCutoff,'19:15');
});
