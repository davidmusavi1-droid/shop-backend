const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{setTimeout:delay}=require('node:timers/promises'),{PrismaClient}=require('@prisma/client');
const u=new URL(process.env.DATABASE_URL);assert(['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/motif_test','Disposable database only');
const prisma=new PrismaClient(),token=process.env.ADMIN_TOKEN;assert(token);const base='http://127.0.0.1:4188',ids=[];
const server=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:'4188'},stdio:'inherit'});
async function api(method,body,id=''){const r=await fetch(base+'/api/products'+(id?'/'+id:''),{method,headers:{'Content-Type':'application/json','X-Admin-Token':token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
const edit=p=>({...p,variants:p.variants.map(v=>({...v,expectedStock:v.stock}))});
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===39)throw Error('Startup failure');await delay(250);}
 for(const [i,productType]of ['کاپشن','شلوار','سویشرت'].entries()){
 const data={title:productType,brand:'MOTIF',productType,productCode:'STRUCTURE-'+i,basePrice:2350000,inventoryMode:'MULTI',qualityGrade:'A_PLUS',images:['https://img.example/front.webp'],mainFabric:'شمعی',complementaryFabrics:['نایلون','کتان'],seasons:['پاییز','زمستان'],uses:['روزمره','مناسب کار'],hasHood:true,garmentDesign:'تمام‌زیپ',variants:[{size:'M',color:'green',sku:'structure-'+i,stock:1,priceDelta:-50000,chestWidthCm:59,lengthCm:69,sleeveFromNeckCm:73,waistCm:84,riseCm:28,totalLengthCm:100,thighWidthCm:30,hemWidthCm:20,itemGrade:'N',itemImages:['https://img.example/item.webp']}]};
 let r=await api('POST',data);assert.equal(r.status,201,JSON.stringify(r.body));let p=r.body;ids.push(p.id);const variantId=p.variants[0].id;
 assert.equal(p.variants[0].sleeveFromNeckCm,73);assert.equal(p.basePrice+p.variants[0].priceDelta,2300000);assert.deepEqual(p.seasons,data.seasons);assert.deepEqual(p.uses,data.uses);
 // Older client edits preserve every new field and both explicitly different grades.
 const legacy={title:p.title,basePrice:p.basePrice,updatedAt:p.updatedAt,variants:[{id:variantId,size:'M',color:'green',sku:'structure-'+i,stock:1,priceDelta:-50000,expectedStock:1}]};
 r=await api('PATCH',legacy,p.id);assert.equal(r.status,200,JSON.stringify(r.body));p=r.body;assert.equal(p.qualityGrade,'A_PLUS');assert.equal(p.variants[0].itemGrade,'N');assert.equal(p.variants[0].sleeveFromNeckCm,73);assert.deepEqual(p.images,data.images);assert.deepEqual(p.variants[0].itemImages,data.variants[0].itemImages);assert.deepEqual(p.complementaryFabrics,data.complementaryFabrics);
 for(const grade of ['N','A_PLUS','A','B','C']){r=await api('PATCH',{...edit(p),qualityGrade:grade},p.id);assert.equal(r.status,200);p=r.body;assert.equal(p.qualityGrade,grade);assert.equal(p.variants[0].itemGrade,'N');}
 const before=await prisma.product.findUnique({where:{id:p.id},include:{variants:true}});
 r=await api('PATCH',{...edit(p),defect:'small hole'},p.id);assert.equal(r.status,400);assert.deepEqual(await prisma.product.findUnique({where:{id:p.id},include:{variants:true}}),before);
 r=await api('PATCH',{...edit(p),isActive:false,defect:'small hole'},p.id);assert.equal(r.status,200);p=r.body;
 r=await api('PATCH',{...edit(p),isActive:true},p.id);assert.equal(r.status,400);
 r=await api('PATCH',{...edit(p),isActive:true,defectImages:['https://img.example/defect.webp','https://img.example/defect2.webp']},p.id);assert.equal(r.status,200);p=r.body;
 assert.equal(p.variants[0].id,variantId);assert.deepEqual(p.images,data.images);
 const detailed=await (await fetch(base+'/products/'+p.id)).text();assert(detailed.includes('جزئیات وضعیت محصول'));assert(detailed.includes('طول آستین از کنار گردن'));assert(detailed.includes('small hole'));
 r=await api('PATCH',{...edit(p),variants:p.variants.map(v=>({...v,expectedStock:v.stock,itemDefect:'tear'}))},p.id);assert.equal(r.status,400);
 r=await api('PATCH',{...edit(p),variants:p.variants.map(v=>({...v,expectedStock:v.stock,itemDefect:'tear',itemDefectImages:['https://img.example/variant-defect.webp']}))},p.id);assert.equal(r.status,200);p=r.body;
 r=await api('PATCH',{...edit(p),defectImages:[]},p.id);assert.equal(r.status,400);
 r=await api('PATCH',{...edit(p),defect:null,defectImages:[]},p.id);assert.equal(r.status,200);assert.deepEqual(r.body.images,data.images);assert.equal(r.body.variants[0].itemDefectImages.length,1);
 }
 const headers={'Content-Type':'application/json','X-Admin-Token':token};
 const optionsUrl=base+'/api/products/admin/fabrics';
 assert.equal((await fetch(optionsUrl)).status,401);
 async function add(label){return fetch(optionsUrl,{method:'POST',headers,body:JSON.stringify({label})});}
 const added=await add('ویسکوز آزمایشی');
 assert.equal(added.status,201);assert.equal(await added.json(),'ویسکوز آزمایشی');
 assert.equal((await add('ويسكوز‌آزمایشی')).status,409);
 assert((await (await fetch(optionsUrl,{headers})).json()).includes('ویسکوز آزمایشی'));
 const {fabrics,categoryPath}=require('../public/catalog');
 const input={
  title:'Integration windbreaker',productCode:'STRUCTURE-WIND',basePrice:200,qualityGrade:'A',
  productType:'بادگیر',mainCategories:['بادگیر','کاپشن'],fabrics:[fabrics[0],'ویسکوز آزمایشی'],
  fabricBasis:'SELLER',customerNeeds:['روزمره'],variants:[{size:'M',color:'red',sku:'wind-1',stock:1}],
 };
 const created=await api('POST',input);
 assert.equal(created.status,201,JSON.stringify(created.body));
 let p=created.body;ids.push(p.id);
 assert.deepEqual(p.fabrics,input.fabrics);assert.equal(p.fabricTechnology,null);
 const canonical='/products/'+p.id;
 for(const name of input.mainCategories){
  const page=await (await fetch(base+categoryPath(name))).text();
  assert(page.includes('href="'+canonical+'"'));
 }
 assert.equal((await api('PATCH',{...edit(p),mainCategories:['کاپشن']},p.id)).status,400);
 const changed=await api('PATCH',{...edit(p),mainCategories:['کاپشن'],productType:'کاپشن',fabrics:['کتان']},p.id);
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal(changed.body.variants[0].id,p.variants[0].id);
 assert.equal(changed.body.variants[0].stock,1);
 assert.equal(changed.body.productCode,p.productCode);
 const detail=await (await fetch(base+canonical)).text();
 assert(detail.includes('href="https://motifdress.com'+canonical+'"'));
 assert(detail.includes('href="'+categoryPath('کاپشن')+'">کاپشن</a>'));
 assert(detail.includes('جنس پارچه: کتان'));
 console.log('PASS: persisted fabric option, duplicate prevention, two categories, shared stock and canonical URL.');
 console.log('PASS: PostgreSQL attributes, three categories, five grades, independent photos, explicit publication validation, immutable old grades and variant IDs.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{server.kill('SIGTERM');await prisma.variant.deleteMany({where:{productId:{in:ids}}});await prisma.product.deleteMany({where:{id:{in:ids}}});await prisma.fabricOption.deleteMany({where:{label:'ویسکوز آزمایشی'}});await prisma.$disconnect();});
