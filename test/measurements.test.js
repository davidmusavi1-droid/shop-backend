const { test } = require('node:test');
const assert = require('node:assert/strict');
const { range, variants, needs } = require('../public/catalog');
const filter = (widthMin='', widthMax='', lengthMin='', lengthMax='', kind='garment') => ({kind,width:range(widthMin,widthMax),length:range(lengthMin,lengthMax)});
test('inclusive measurement ranges accept Persian digits and decimal values', () => {
  const p={variants:[55,60.5,65,66].map((n,i)=>({id:i,stock:1,chestWidthCm:n}))};
  assert.deepEqual(variants(p,filter('۵۵','۶۵')).map(v=>v.id),[0,1,2]);
  assert.deepEqual(variants(p,filter('٦٠٫٥','۶۵')).map(v=>v.id),[1,2]);
});
test('same in-stock variant must match every measurement; unknown and zero never match', () => {
  const p={variants:[{stock:0,chestWidthCm:60,lengthCm:70},{stock:1,chestWidthCm:60,lengthCm:80},{stock:1,chestWidthCm:50,lengthCm:70},{stock:1,chestWidthCm:null,lengthCm:70},{stock:1,chestWidthCm:0,lengthCm:70}]};
  assert.equal(variants(p,filter(55,65,65,75)).length,0);
  assert.equal(variants(p,filter()).length,4);
});
test('flat waist never falls back to legacy circumference', () => {
  const p={variants:[{id:'old',stock:1,waistCm:84},{id:'new',stock:1,waistWidthCm:42,totalLengthCm:100}]};
  assert.deepEqual(variants(p,filter(40,45,95,105,'pants')).map(v=>v.id),['new']);
});
test('invalid, reversed and negative ranges cannot match',()=>{
  for(const [lo,hi] of [[65,55],[-1,65],['abc',65],[0,65],['Infinity',65]])assert.equal(variants({variants:[{stock:1,chestWidthCm:60}]},filter(lo,hi)).length,0);
});
test('approved category wording and order is exact',()=>assert.deepEqual(needs,['روزمره','ورزشی','پاییزه','مناسب سرما','مناسب کار']));
