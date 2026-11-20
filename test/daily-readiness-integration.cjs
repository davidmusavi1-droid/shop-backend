'use strict';
// Synthetic records only. Provider and object storage are injected fixtures; no external AI traffic.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const express = require('express');
const sharp = require('sharp');
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.pathname, '/motif_test');
assert.equal(process.env.MOTIF_SMART_PANEL, 'store');
assert.match(process.env.ADMIN_TOKEN, /^smart-test-/);
const db = require('../src/lib/prisma');
const requireAdmin = require('../src/middleware/requireAdmin');
const { createRouter, assets } = require('../src/routes/smart-panel');
const { liaraProvider } = require('../src/lib/smart-panel/liara');
const { loginAdmin } = require('../scripts/admin-http-client.cjs');
const { issues } = require('../public/admin-readiness');

let server, browser, origin, auth, dossier, product;
let paidCalls = 0;
const ids = [];
const uploads = new Map();
const source = 'https://about.puma.com/en';
const oldUrl = 'https://photos.example.test/motif/products/legacy.webp';
const storage = {
  canRead: url=>url === oldUrl || uploads.has(url),
  read: async url=>uploads.get(url).bytes,
  upload: async (bytes, options)=>{
    const url='https://photos.example.test/motif/products/'+options.digest+'.'+(options.format==='jpeg'?'jpg':options.format);
    uploads.set(url, { bytes: Buffer.from(bytes), ...options }); return { url };
  },
};
const cfg = { operations: ['analyze', 'research'], dailyLimit: 20, estimates: { analyze: 0.02, research: 0.03 },
  estimatesToman:{analyze:1000,research:3000},dailyBudgetToman:40000,
  dailyBudgetUsd: 2, key: 'fixture-only-never-a-real-key', labelObservations: true, separateStyle: true,
  model: 'google/gemini-2.5-flash', researchModel: 'perplexity/sonar', endpoint: 'https://fixture.invalid/chat/completions' };
let fault = null, cancelStarted, cancelGate;
const provider = liaraProvider(cfg, { fetcher: async (url, options)=>{
  assert.equal(url, cfg.endpoint); paidCalls++;
  if(fault==='timeout')throw new DOMException('fixture timeout','TimeoutError');
  const input=JSON.parse(options.body);
  const result=input.model===cfg.model ? {
    brand: { value:'PUMA',image:1,evidence:'PUMA sewn label' }, labelSize:null,
    fabric: { value:'100% POLYESTER',image:1,evidence:'SHELL 100% POLYESTER' },
    type:{value:'Jacket',image:2,evidence:'Jacket visible'}, authenticity:null,waterproofing:null,
    technology:null,commercialModel:null,labelObservations:[],
  } : {claim:'هویت برند با شاهد',url:source,title:'PUMA',evidence:'PUMA',design:null,style:null};
  return Response.json({id:'fixture-'+paidCalls,usage:{prompt_tokens:50,completion_tokens:60,total_tokens:110,cost:0.001},
    citations:[source],choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
} });
const base='/api/admin/smart-panel';
async function request(path, method='GET', body, headers={}) {
  const r=await fetch(origin+path,{method,headers:{...auth,...headers,...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{})},
    body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
async function ok(path, method, body, headers) {const r=await request(path,method,body,headers);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
const path=()=>base+'/dossiers/'+dossier.id;
async function update(suffix, method='POST', body={}) {dossier=await ok(path()+suffix,method,{...body,version:dossier.version});return dossier;}
const edit=p=>({...p,variants:p.variants.map(v=>({...v,expectedStock:v.stock}))});

async function main() {
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name,'motif_test');
  const app=express();app.use(express.json());app.use(express.static('public'));
  app.use((req,res,next)=>{if(fault==='cancel'&&req.path.endsWith('/ai/c2/analyze'))res.once('close',()=>cancelGate.resolve());next();});
  app.use('/api/admin/session',require('../src/routes/admin-session')(requireAdmin.sessions));
  app.use('/smart-panel',assets(true));
  app.use(base,requireAdmin,createRouter(db,{store:true,c2:{...cfg,provider:{...provider,analyze:async(images,record,hooks)=>{if(fault==='cancel'){cancelStarted.resolve();await cancelGate.promise;}return provider.analyze(images,record,hooks);}}},storage}));
  app.use('/api/products',require('../src/routes/products'));
  app.use((err,req,res,next)=>res.status(err.statusCode||err.status||500).json({error:err.message,code:err.code}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  origin='http://127.0.0.1:'+server.address().port;process.env.ADMIN_ORIGIN=origin;
  auth=await loginAdmin(origin,process.env.ADMIN_TOKEN);
  product=await ok('/api/products','POST',{productCode:'MOTIF-971',title:'Daily synthetic fixture',brand:'PUMA',
    isActive:false,basePrice:0,inventoryMode:'SINGLE',identityHistory:'متن دستی محصول محفوظ',images:[oldUrl],
    variants:[{sku:'daily-971',size:'',color:'',stock:1}]});ids.push(product.id);
  dossier=await ok(base+'/store/products/'+product.id+'/dossier','POST',{});
  const photos=[];
  for(const format of ['jpeg','png']) {
    const bytes=await sharp({create:{width:25,height:30,channels:3,background:format==='png'?'blue':'red'}})[format]().toBuffer();
    photos.push(bytes);
    dossier=await ok(path()+'/images?imageId='+randomUUID()+'&version='+dossier.version+'&name=fixture.'+(format==='jpeg'?'jpg':format),
      'POST',bytes,{'Content-Type':'image/'+format});
    const r=await fetch(origin+base+'/dossiers/'+dossier.id+'/images/'+dossier.images.at(-1).id,{headers:auth});
    assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
  }
  assert.equal((await request(path()+'/ai/c2/analyze','POST',{version:dossier.version})).status,409);
  assert.equal(paidCalls,0,'A missing quote must not reach the provider fixture');
  for(const operation of ['analyze','research']) {
    const q=await ok(path()+'/ai/quote?operation='+operation);assert.equal(q.requests,1);
    const r=await ok(path()+'/ai/c2/'+operation,'POST',{version:dossier.version,quote:q.token,
      ...(operation==='research'?{mode:'live',labelConfirmed:true}:{})});dossier=r.dossier;
    if(operation==='analyze') {
      assert.equal((await request(path()+'/ai/accept','POST',{version:dossier.version,key:'brand'})).status,409);
      for(const key of ['type','fabric'])await update('/ai/accept','POST',{key});
      assert.equal(dossier.type,'کاپشن');assert.deepEqual(dossier.fabric,['پلی‌استر']);
    }
  }
  assert.equal(paidCalls,2); // Both are local function calls, never outbound requests.
  await update('/brand-research/verify-source');await update('/brand-research/generate');
  for(const index of [0,1,2])await update('/brand-research/review-draft','POST',{index,decision:'approved'});
  await update('','PATCH',{fields:{content:['هویت دستی تأییدشده','فلسفهٔ طراحی تأییدشده','کاربرد پیشنهادی تأییدشده'].map(text=>({text}))}});
  for(const index of [0,1,2])await update('/content/'+index,'POST',{approve:true});
  // Manual approvals remain transferable after changing an optional research identifier.
  await update('','PATCH',{fields:{styleNumber:'unverified-optional'}});
  await update('','PATCH',{fields:{styleNumber:''}});
  let preview=await ok(path()+'/store-transfer');
  assert.equal(preview.sections.identityHistory,undefined);
  assert.equal(preview.sections.identityDesign,'فلسفهٔ طراحی تأییدشده');
  assert.equal(preview.suggestions.productType,'کاپشن');assert.equal(preview.suggestions.fabric,'پلی‌استر');
  const exported=await ok(path()+'/store-gallery-export','POST',{version:dossier.version,updatedAt:product.updatedAt});
  dossier=exported.dossier;preview=await ok(path()+'/store-transfer');
  assert.equal(uploads.size,2);
  for(const bytes of photos)assert.ok([...uploads.values()].some(item=>item.bytes.equals(bytes)));
  assert.deepEqual((await db.product.findUnique({where:{id:product.id}})).images,[oldUrl]);
  assert.equal((await db.product.findUnique({where:{id:product.id}})).identityDesign,null);

  // A legacy spelling blocks numeric reuse, even though no existing code is rewritten.
  const alias=await db.product.create({data:{title:'Legacy fixture',productCode:'MOTIF-13',basePrice:0,isActive:false}});ids.push(alias.id);
  const duplicate=await request('/api/products','POST',{productCode:'MOTIF-013',title:'Duplicate',basePrice:0,isActive:false,
    inventoryMode:'SINGLE',variants:[{sku:'duplicate-971',size:'',color:'',stock:1}]});
  assert.equal(duplicate.status,409);assert.equal((await db.product.findUnique({where:{id:alias.id}})).productCode,'MOTIF-13');
  const competing=await Promise.all(['MOTIF-972','MOTIF-0972'].map((productCode,i)=>request('/api/products','POST',{
    productCode,title:'Concurrent synthetic code',basePrice:0,isActive:false,inventoryMode:'SINGLE',
    variants:[{sku:'concurrent-'+i,size:'',color:'',stock:1}]})));
  for(const r of competing)if(r.status===201)ids.push(r.data.id);
  assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);

  if(process.env.MOTIF_DAILY_BROWSER==='1') {
    const {chromium}=require('playwright-core');
    browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:320,height:850}});
    await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    const page=await context.newPage();await page.goto(origin+'/admin.html');
    await page.locator('#token').fill(process.env.ADMIN_TOKEN);await page.locator('#loginForm button').click();
    await page.locator('#recent article').filter({hasText:'Daily synthetic fixture'}).getByRole('button',{name:'ویرایش',exact:true}).click();
    const open=async()=>{await page.locator('#openC22').click();return page.frameLocator('#c22Frame');};
    let frame=await open();
    await frame.locator('#section-analysis summary').click();
    await frame.getByRole('button',{name:'تحلیل تصاویر تأییدشده',exact:true}).click();
    await frame.getByRole('heading',{name:'تأیید مصرف AI',exact:true}).waitFor();
    assert.match(await frame.locator('#dialog').innerText(),/تومان/);
    assert.match(await frame.locator('#dialog').innerText(),/آغازشده/);
    assert.match(await frame.locator('#dialog').innerText(),/یک درخواست Gemini/);
    await frame.getByRole('button',{name:'انصراف',exact:true}).click();
    assert.equal(paidCalls,2,'Cancelling a cost preview must not call even the local provider fixture');
    await frame.locator('#section-research summary').click();
    await frame.getByRole('button',{name:'پیشنهادهای مشخصات محصول',exact:true}).click();
    await frame.getByRole('button',{name:'درج در فیلدهای خالی',exact:true}).click();
    await page.locator('#c22Dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-key=productType]').inputValue(),'کاپشن');
    await page.locator('#save').click();await page.locator('#saveSuccess').waitFor();
    frame=await open();await frame.getByRole('button',{name:'پیش‌نمایش افزودن عکس‌ها به محصول',exact:true}).click();
    await frame.getByRole('button',{name:'تأیید و افزودن به فرم محصول',exact:true}).click();
    await page.locator('#c22Dialog').waitFor({state:'hidden'});
    assert.equal((await page.locator('[data-key=images]').inputValue()).split('\n').length,3);
    await page.locator('#save').click();await page.locator('#saveSuccess').waitFor();
    frame=await open();await frame.locator('#section-research summary').click();
    await frame.getByRole('button',{name:'پیش‌نمایش انتقال متن‌های تأییدشده',exact:true}).click();
    await frame.getByRole('button',{name:'تأیید و درج در فرم محصول',exact:true}).click();
    await page.locator('#c22Dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-key=identityHistory]').inputValue(),'متن دستی محصول محفوظ');
    assert.equal(await page.locator('[data-key=identityDesign]').inputValue(),'فلسفهٔ طراحی تأییدشده');
    assert.equal((await db.product.findUnique({where:{id:product.id}})).identityDesign,null);
    assert.equal(await page.locator('html').evaluate(e=>e.scrollWidth),320);
    await page.locator('#save').click();await page.locator('#saveSuccess').waitFor();
    await context.close();
    product=await db.product.findUnique({where:{id:product.id},include:{variants:true}});
    dossier=(await db.smartDossier.findUnique({where:{id:dossier.id}}));
  } else {
    product=await ok('/api/products/'+product.id,'PATCH',{...edit(product),
      ...preview.sections,productType:preview.suggestions.productType,mainCategories:[preview.suggestions.productType],
      fabrics:[preview.suggestions.fabric],fabricBasis:'LABEL',images:[oldUrl,...preview.gallery],
      c22Transfer:{id:dossier.id,version:dossier.version,keys:Object.keys(preview.sections)}});
  }
  const saved=await db.product.findUnique({where:{id:product.id},include:{variants:true}});
  assert.equal(saved.identityHistory,'متن دستی محصول محفوظ');assert.equal(saved.identityDesign,'فلسفهٔ طراحی تأییدشده');
  assert.equal(saved.basePrice,0);assert.equal(saved.variants[0].stock,1);assert.equal(saved.qualityGrade,null);
  assert.equal(saved.variants[0].color,'');assert.equal(saved.variants[0].lengthCm,null);assert.equal(saved.isActive,false);
  assert.ok(issues(saved).length>0,'Incomplete products remain blocked from publication');
  // Explicit synthetic manager input completes readiness; AI never supplies these values.
  product=await ok('/api/products/'+saved.id,'PATCH',{...edit(saved),basePrice:2500000,qualityGrade:'A',
    variants:saved.variants.map(v=>({...v,expectedStock:v.stock,color:'black',chestWidthCm:60,lengthCm:70,sleeveFromNeckCm:80}))});
  assert.deepEqual(issues(product),[]);
  const current=await ok(path());dossier=current;await update('/approve');
  assert.equal(dossier.phase,'approved');assert.equal((await db.product.findUnique({where:{id:product.id}})).isActive,false);
  const usage=await ok(base+'/ai/usage');assert.equal(usage.counts.analyze,1);assert.equal(usage.counts.research,1);
  assert.equal(usage.unknownCosts,0);assert.equal(paidCalls,2);
  const readback=await ok(path());assert.deepEqual(readback.content.map(item=>item.approved),[true,true,true]);
  const removed=dossier.images.at(-1);
  await update('/images','PATCH',{gallery:dossier.images.slice(0,-1).map(image=>({id:image.id,groups:image.groups})),mainImage:dossier.mainImage});
  assert.deepEqual(Buffer.from((await db.smartImage.findUnique({where:{id:removed.id}})).bytes),photos[1]);
  assert.equal((await fetch(origin+removed.url,{headers:auth})).status,404);
  assert.equal((await db.product.findUnique({where:{id:product.id}})).images.length,3);
  // Targeted quota acceptance in the SAME existing synthetic database, never production.
  const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
  async function quotaFixture(code) {
    const p=await ok('/api/products','POST',{productCode:code,title:'Quota synthetic fixture',brand:'PUMA',isActive:false,basePrice:0,inventoryMode:'SINGLE',variants:[{sku:code,size:'',color:'',stock:1}]});ids.push(p.id);
    let d=await ok(base+'/store/products/'+p.id+'/dossier','POST',{});
    for(const [i,bytes] of photos.entries())d=await ok(base+'/dossiers/'+d.id+'/images?imageId='+randomUUID()+'&version='+d.version+'&name=quota.'+(i?'png':'jpg'),'POST',bytes,{'Content-Type':i?'image/png':'image/jpeg'});
    return d;
  }
  const target=await quotaFixture('MOTIF-975'), targetPath=base+'/dossiers/'+target.id;
  fault='cancel';cancelStarted=deferred();cancelGate=deferred();
  let q=await ok(targetPath+'/ai/quote?operation=analyze');
  const controller=new AbortController();
  const cancelled=fetch(origin+targetPath+'/ai/c2/analyze',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({version:target.version,quote:q.token}),signal:controller.signal}).catch(e=>e);
  await cancelStarted.promise;controller.abort();await cancelled;await cancelGate.promise;
  // Wait on server-side durable evidence, not another operation or provider retry.
  let released;
  for(let n=0;n<100;n++){released=await db.smartAiRun.findFirst({where:{dossierId:target.id,status:'released'}});if(released)break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(released,'client cancellation is released before fetch');assert.equal(paidCalls,2);
  assert.equal((await ok(base+'/ai/usage')).used,2);
  fault='timeout';q=await ok(targetPath+'/ai/quote?operation=analyze');
  assert.equal((await request(targetPath+'/ai/c2/analyze','POST',{version:target.version,quote:q.token})).status,504);
  assert.equal((await db.smartAiRun.findFirst({where:{dossierId:target.id,status:'unknown'}})).usage.lifecycle.phase,'unknown');
  assert.equal((await request(targetPath+'/ai/c2/analyze','POST',{version:target.version,quote:q.token})).status,409);assert.equal(paidCalls,3);
  const left=await quotaFixture('MOTIF-976'),right=await quotaFixture('MOTIF-977');
  await db.smartAiRun.createMany({data:Array.from({length:16},()=>({id:randomUUID(),operation:'analyze',scope:'quota-fixture-'+randomUUID(),dossierId:target.id,version:target.version,status:'unknown',model:cfg.model,usage:{estimateToman:1000,estimateUsd:0.02}}))});
  const [lq,rq]=await Promise.all([left,right].map(d=>ok(base+'/dossiers/'+d.id+'/ai/quote?operation=analyze')));fault=null;
  const race=await Promise.all([left,right].map((d,i)=>request(base+'/dossiers/'+d.id+'/ai/c2/analyze','POST',{version:d.version,quote:[lq,rq][i].token})));
  assert.deepEqual(race.map(r=>r.status).sort(),[200,429]);assert.equal(paidCalls,4);
  const quota=await ok(base+'/ai/usage');assert.equal(quota.used,20);assert.equal(quota.remaining,0);assert.equal(quota.statusCounts.released,1);assert.equal(quota.statusCounts.unknown,17);
  console.log('PASS: pre-send HTTP cancellation releases quota; sent timeout and duplicate stay reserved; concurrent requests cannot exceed 20; zero external AI calls');
  console.log('PASS: daily draft → original JPG/PNG → fixture Gemini/Sonar → mapped approvals → gallery/text previews → saved readback → independent dossier approval; no external AI calls');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  await browser?.close();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));
  const rows=await db.smartDossier.findMany({where:{productId:{in:ids}},select:{id:true}});
  const where={dossierId:{in:rows.map(row=>row.id)}};
  await db.smartEvent.deleteMany({where});await db.smartAiRun.deleteMany({where});
  await db.smartApproval.deleteMany({where});await db.smartImage.deleteMany({where});
  await db.smartDossier.deleteMany({where:{id:{in:rows.map(row=>row.id)}}});
  await db.variant.deleteMany({where:{productId:{in:ids}}});await db.product.deleteMany({where:{id:{in:ids}}});
  await db.$disconnect();
});
