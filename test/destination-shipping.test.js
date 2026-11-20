const test = require('node:test');
const assert = require('node:assert/strict');
const shipping = require('../src/lib/destination-shipping');
const input = () => ({ source: 'Synthetic approved tariff fixture', carrier: 'Fixture carrier', originProvince: 'تهران', originCity: 'تهران',
  validFrom: new Date(Date.now()-1000).toISOString(), validUntil: new Date(Date.now()+86400000).toISOString(),
  allInclusive: true, merchantCoversDifference: true,
  rules: shipping.provinces.map(province=>({province,city:'*',fee:5000,maxItems:2,maxGoodsTomans:500000})) });
const destination = {province:'تهران',city:'تهران',postalCode:'1234567890'};
test('tariffs require approved source, all costs, full national coverage and positive amounts',()=>{
  assert.equal(shipping.provinces.length,31);
  assert.equal(shipping.tariffInput(input()).rules.length,31);
  for(const patch of [{source:''},{allInclusive:false},{merchantCoversDifference:false},{rules:input().rules.slice(1)},
    {rules:input().rules.map((r,i)=>i? r:{...r,fee:0})},{rules:input().rules.map((r,i)=>i?r:{...r,fee:'5000'})}]){
    assert.throws(()=>shipping.tariffInput({...input(),...patch}));
  }
});
test('province base and exact-city overrides calculate a final all-inclusive server amount',()=>{
  const t={id:'fixture-version',...shipping.tariffInput(input())};
  t.rules.push({province:'تهران',city:'تهران',fee:8000,maxItems:2,maxGoodsTomans:500000});
  assert.equal(shipping.calculate(t,destination,[{unitPrice:10000,quantity:1}]).totalPrice,18000);
  assert.equal(shipping.calculate(t,{...destination,city:'ری'},[{unitPrice:10000,quantity:1}]).totalPrice,15000);
  assert.equal(shipping.calculate(t,{...destination,province:'گیلان',city:'رشت'},[{unitPrice:10000,quantity:2}]).totalPrice,25000);
  for(const dest of [{...destination,province:'unknown'},{...destination,city:'*'},{...destination,postalCode:'123'}])
    assert.throws(()=>shipping.calculate(t,dest,[{unitPrice:10000,quantity:1}]));
  assert.throws(()=>shipping.calculate(t,destination,[{unitPrice:10000,quantity:3}]));
});
test('client acceptance must match the computed version, shipping and final total exactly',()=>{
  const q={tariffId:'version',shippingFee:5000,totalPrice:15000};
  assert.doesNotThrow(()=>shipping.accepted({shippingAcceptance:{...q}},q));
  for(const a of [undefined,{...q,tariffId:'old'},{...q,shippingFee:0},{...q,totalPrice:1}])
    assert.throws(()=>shipping.accepted({shippingAcceptance:a},q));
});
test('missing, future and expired tariff never fall back to a zero fee',async()=>{
  for(const activeTariff of [null,{validFrom:new Date(Date.now()+10000),validUntil:new Date(Date.now()+20000)},
    {validFrom:new Date(0),validUntil:new Date(1)}]){
    await assert.rejects(shipping.active({shippingTariffState:{findUnique:async()=>({activeTariff})}}),{statusCode:503});
  }
});
