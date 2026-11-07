const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare}=require('../src/lib/prepare-products');
test('product code migration is additive, split into executable statements and checked before startup',async()=>{
 const calls=[];
 await prepare({$executeRawUnsafe:async sql=>calls.push(sql),fabricOption:{findFirst:async()=>calls.push('options')},product:{findFirst:async query=>{assert.deepEqual(query.select,{productCode:true,fabrics:true,fabricBasis:true,mainCategories:true});calls.push('ready');}}});
 assert.match(calls[0],/ADD COLUMN IF NOT EXISTS "productCode"/);
 assert.match(calls[1],/CREATE UNIQUE INDEX IF NOT EXISTS/);
 assert.deepEqual(calls.slice(2),['options','ready']);
 assert.doesNotMatch(calls.join(' '),/DROP|DELETE|TRUNCATE/);
});
