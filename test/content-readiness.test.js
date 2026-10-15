const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepare,ready}=require('../src/lib/prepare-content');
test('startup applies only static additive content SQL before verifying the model',async()=>{
 const calls=[];await prepare({$executeRawUnsafe:async sql=>calls.push(sql),siteContent:{findUnique:async()=>calls.push('read')}});
 assert.match(calls[0],/CREATE TABLE IF NOT EXISTS "SiteContent"/);
 assert.doesNotMatch(calls[0],/DROP\s|TRUNCATE\s|DELETE\s|ALTER\s/i);
 assert.equal(calls[1],'read');
});
test('a missing table, missing columns or unavailable database fails readiness',async()=>{
 for(const code of ['P2021','P2022','P1001'])await assert.rejects(()=>ready({siteContent:{findUnique:async()=>{throw Object.assign(new Error('private connection details'),{code});}}}));
});
test('an empty but ready table is healthy; failed SQL never reaches the read',async()=>{
 await ready({siteContent:{findUnique:async()=>null}});
 let read=false;await assert.rejects(()=>prepare({$executeRawUnsafe:async()=>{throw Error('permission');},siteContent:{findUnique:async()=>{read=true;}}}));assert.equal(read,false);
});
