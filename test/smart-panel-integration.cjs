'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const { assertTestEnvironment, verifyTestDatabase } = require('../src/lib/smart-panel/test-environment');
const target = assertTestEnvironment();
const origin = process.env.ADMIN_ORIGIN;
const api = '/api/admin/smart-panel';
const prisma = new PrismaClient();
let cookie, csrf, jpeg, png;

before(async () => {
  await verifyTestDatabase(prisma, target);
  const login = await fetch(origin+'/api/admin/session/login', {
    method:'POST', headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({password:process.env.ADMIN_TOKEN}),
  });
  assert.equal(login.status,200,'test login');
  cookie=login.headers.get('set-cookie').split(';')[0];
  csrf=(await login.json()).csrf;
  const image={create:{width:32,height:24,channels:3,background:'#54624a'}};
  jpeg=await sharp(image).jpeg().toBuffer();
  png=await sharp(image).png().toBuffer();
});
after(() => prisma.$disconnect());

async function request(route, method='GET', body, options={}) {
  const headers=options.unauthorized ? {} : {Cookie:cookie,Origin:origin,'X-Admin-CSRF':csrf};
  const binary=Buffer.isBuffer(body);
  if(body!==undefined) headers['Content-Type']=binary?'image/jpeg':'application/json';
  Object.assign(headers,options.headers);
  const result=await fetch(origin+route,{method,headers,body:binary?body:JSON.stringify(body)});
  return {
    status:result.status,
    body:result.headers.get('content-type')?.includes('application/json')?await result.json():Buffer.from(await result.arrayBuffer()),
  };
}
async function call(route, method, body, expected=200, options) {
  const result=await request(api+route,method,body,options);
  assert.equal(result.status,expected,JSON.stringify(result.body));
  return result.body;
}
const route=p=>'/dossiers/'+p.id;
const uploadPath=(p,id=randomUUID(),name='gallery.jpg')=>route(p)+'/images?'+new URLSearchParams({imageId:id,name,version:String(p.version)});
async function create() {
  const id=randomUUID();
  return call('/dossiers','POST',{id},201);
}
function save(p,fields,code) {
  return call(route(p),'PATCH',{version:p.version,fields,code});
}
async function ready(code) {
  const p=await save(await create(), {
    name:'پرونده آزمایشی', type:'بادگیر', color:'زیتونی', fabric:['پلی‌آمید'],
    chest:'۵۹', length:'۷۱', sleeve:'۷۷', price:'۲٬۴۵۰٬۰۰۰', stock:'۱', grade:'A+',
  },code);
  return call(uploadPath(p),'POST',jpeg,201);
}
async function freeCode() {
  const {reserved,legacy}=await call('/codes');
  const taken=new Set([...reserved.map(row=>row.code),...legacy.map(row=>row.normalized)]);
  for(let i=500;i<1000;i++){
    const code='MOTIF-'+i;
    if(!taken.has(code)) return code;
  }
  throw new Error('Test code pool exhausted.');
}
const approve=p=>call(route(p)+'/approve','POST',{version:p.version});

test('empty draft and idempotent creation, persisted read, and stale revision rejection', async () => {
  const p=await create();
  const repeat=await call('/dossiers','POST',{id:p.id},201);
  assert.equal(repeat.id,p.id);
  assert.equal(repeat.version,0);
  assert.equal(p.phase,'draft');
  const saved=await save(p,{name:'نام ناقص'});
  assert.equal(saved.version,1);
  assert.equal((await call(route(p))).name,'نام ناقص');
  const stale=await call(route(p),'PATCH',{version:0,fields:{name:'بازنویسی'}},409);
  assert.equal(stale.code,'VERSION_CONFLICT');
  assert.equal((await call(route(p))).name,'نام ناقص');
  await call(route(saved)+'/approve','POST',{version:saved.version},422);
});

test('multiple JPGs, byte preservation, validation, ownership and private read', async () => {
  const p=await create(), other=await create();
  const id=randomUUID();
  const a=await call(uploadPath(p,id),'POST',jpeg,201);
  assert.equal(a.mainImage,id);
  const retry=await call(uploadPath(p,id),'POST',jpeg);
  assert.equal(retry.version,a.version);
  const b=await call(uploadPath(a,randomUUID(),'label.jpg'),'POST',jpeg,201);
  assert.equal(b.images.length,2);
  assert.equal((await call(uploadPath(b),'POST',png,415)).code,'INVALID_IMAGE');
  await call(uploadPath(b),'POST',Buffer.alloc(3_000_001),413);
  const wrongRoute=route(other)+'/images/'+id;
  await call(wrongRoute,'GET',undefined,404);
  const file=b.images[0].url;
  assert.equal((await request(file,'GET',undefined,{unauthorized:true})).status,401);
  assert.deepEqual((await request(file)).body,jpeg);
  const layout=[{id:b.images[1].id,groups:['product']},{id,groups:['product','label','defect']}];
  const arranged=await call(route(b)+'/images','PATCH',{version:b.version,gallery:layout,mainImage:b.images[1].id});
  assert.equal(arranged.mainImage,b.images[1].id);
  assert.deepEqual(arranged.images.map(({id,groups})=>({id,groups})),layout);
  await call(route(other)+'/images','PATCH',{version:other.version,gallery:layout,mainImage:id},400);
  await call(route(arranged)+'/images','PATCH',{version:arranged.version,gallery:[layout[0]],mainImage:layout[0].id});
  assert.equal((await request(file)).status,404);
});

test('unauthenticated dossier, invalid Origin and missing CSRF are rejected', async () => {
  await call('/dossiers','GET',undefined,401,{unauthorized:true});
  await call('/dossiers','POST',{id:randomUUID()},403,{headers:{Origin:'https://other.invalid'}});
  await call('/dossiers','POST',{id:randomUUID()},403,{headers:{'X-Admin-CSRF':''}});
  assert.equal((await request('/.smart-panel-test/guess.jpg','GET')).status,404);
});

test('concurrent reservation, archive/delete retention and immutable approval snapshot', async () => {
  const code=await freeCode();
  const productCount=await prisma.product.count();
  const a=await ready(code), b=await ready(code.toLowerCase());
  const results=await Promise.all([a,b].map(p=>request(api+route(p)+'/approve','POST',{version:p.version})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409],JSON.stringify(results));
  assert.equal(results.find(r=>r.status===409).body.code,'CODE_TAKEN');
  const winner=results.find(r=>r.status===200).body;
  const loser=winner.id===a.id?b:a;
  assert.equal(winner.phase,'approved');
  assert.equal(winner.publication,'none');
  assert.equal(winner.approvedVersion,winner.version);
  assert.equal(winner.reserved,code);
  assert.equal(await prisma.product.count(),productCount);
  const frozen=await prisma.smartApproval.findUniqueOrThrow({where:{dossierId_version:{dossierId:winner.id,version:winner.version}}});
  const amended=await save(winner,{name:'عنوان جدید'});
  assert.equal(amended.phase,'draft');
  assert.equal(amended.approvedVersion,null);
  assert.equal(amended.reserved,code);
  await call(route(amended),'PATCH',{version:amended.version,fields:{},code:'MOTIF-499'},409);
  const reapproved=await approve(amended);
  assert.equal(reapproved.phase,'approved');
  assert.equal(frozen.snapshot.fields.name,'پرونده آزمایشی');
  const held=await prisma.smartApproval.findUniqueOrThrow({where:{dossierId_version:{dossierId:winner.id,version:winner.version}}});
  assert.deepEqual(held.snapshot,frozen.snapshot);
  await call(route(reapproved)+'/queue','POST',{version:reapproved.version},409);
  await call(route(reapproved)+'/publish-test','POST',{version:reapproved.version},409);
  await call(route(reapproved)+'/archive','POST',{version:reapproved.version});
  await call(route(reapproved),'GET',undefined,404);
  await call(route(loser)+'/approve','POST',{version:loser.version},409);
  const secondCode=await freeCode();
  const deleted=await approve(await ready(secondCode));
  await call(route(deleted),'DELETE',{version:deleted.version});
  const later=await ready(secondCode);
  await call(route(later)+'/approve','POST',{version:later.version},409);
  assert.equal(await prisma.product.count(),productCount);
  const {reserved}=await call('/codes');
  assert.equal(reserved.find(row=>row.code===code).reason,'archived');
  assert.equal(reserved.find(row=>row.code===secondCode).reason,'deleted');
});

test('mock result and outage preserve approved values and allow manual editing', async () => {
  const p=await approve(await ready(await freeCode()));
  const failure=await call(route(p)+'/ai/research','POST',{version:p.version,provider:'disabled'},503);
  assert.equal(failure.code,'AI_UNAVAILABLE');
  const failedAnalysis=await call(route(p)+'/ai/analyze','POST',{version:p.version,provider:'mock',simulateFailure:true},503);
  assert.equal(failedAnalysis.code,'AI_UNAVAILABLE');
  assert.deepEqual(await call(route(p)),p);
  const analyzed=await call(route(p)+'/ai/analyze','POST',{version:p.version,provider:'mock'});
  assert.equal(analyzed.phase,'approved');
  assert.equal(analyzed.approvedVersion,p.approvedVersion);
  assert.equal(analyzed.name,p.name);
  assert.equal(analyzed.color,p.color);
  assert.equal(analyzed.analysis[0].imageId,p.images[0].id);
  const researched=await call(route(p)+'/ai/research','POST',{version:analyzed.version,provider:'mock'});
  assert.equal(researched.research.suggestedContent[0],'');
  assert.deepEqual(researched.content,p.content);
  const accepted=await call(route(p)+'/ai/accept','POST',{version:researched.version,key:'labelSize'});
  assert.equal(accepted.labelSize,'L');
  assert.equal(accepted.phase,'draft');
  const edited=await save(accepted,{color:'خاکستری'});
  assert.equal(edited.color,'خاکستری');
  assert.ok((await call('/events')).some(row=>row.dossierId===p.id && row.action==='ai_unavailable'));
});

test('existing catalog SKU, variants, measurements and categories stay intact', async () => {
  const code=await freeCode();
  const legacy=await prisma.product.create({
    data:{
      title:'محصول قدیمی آزمایشی', productCode:code.toLowerCase(), basePrice:1500000,
      isActive:true, images:[], customerNeeds:[], styles:[], productType:'شلوار', mainCategories:['شلوار','روزمره'],
      variants:{create:[{sku:'test-'+randomUUID(),size:'M',color:'سبز',stock:1,waistCm:88,waistWidthCm:41,itemImages:[]}]},
    },include:{variants:true},
  });
  const p=await ready(code);
  assert.equal((await call(route(p)+'/approve','POST',{version:p.version},409)).code,'CODE_TAKEN');
  assert.deepEqual(await prisma.product.findUnique({where:{id:legacy.id},include:{variants:true}}),legacy);
  const product=await request('/api/products/'+legacy.id);
  assert.equal(product.status,200);
  assert.equal(product.body.variants[0].sku,legacy.variants[0].sku);
  assert.equal(product.body.variants[0].waistCm,88);
  assert.equal(product.body.variants[0].waistWidthCm,41);
});
