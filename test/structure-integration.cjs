const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{setTimeout:delay}=require('node:timers/promises'),{PrismaClient}=require('@prisma/client');
const u=new URL(process.env.DATABASE_URL);assert(['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/motif_test','Disposable database only');
const prisma=new PrismaClient(),token=process.env.ADMIN_TOKEN;assert(token);const base='http://127.0.0.1:4188',ids=[];
const server=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:'4188'},stdio:'inherit'});
async function api(method,body,id=''){const r=await fetch(base+'/api/products'+(id?'/'+id:''),{method,headers:{'Content-Type':'application/json','X-Admin-Token':token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
const edit=p=>({...p,variants:p.variants.map(v=>({...v,expectedStock:v.stock}))});
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===39)throw Error('Startup failure');await delay(250);}
 for(const [i,productType]of ['کاپشن','شلوار','سویشرت'].entries()){
 const data={title:productType,productType,productCode:'STRUCTURE-'+i,basePrice:2350000,inventoryMode:'MULTI',qualityGrade:'A_PLUS',images:['https://img.example/front.webp'],mainFabric:'شمعی',complementaryFabrics:['نایلون','کتان'],seasons:['پاییز','زمستان'],uses:['روزمره','مناسب کار'],hasHood:true,garmentDesign:'تمام‌زیپ',variants:[{size:'M',color:'green',sku:'structure-'+i,stock:1,priceDelta:-50000,chestWidthCm:59,lengthCm:69,sleeveFromNeckCm:73,waistCm:84,riseCm:28,totalLengthCm:100,thighWidthCm:30,hemWidthCm:20,itemGrade:'N',itemImages:['https://img.example/item.webp']}]};
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
 console.log('PASS: PostgreSQL attributes, three categories, five grades, independent photos, explicit publication validation, immutable old grades and variant IDs.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{server.kill('SIGTERM');await prisma.variant.deleteMany({where:{productId:{in:ids}}});await prisma.product.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();});
