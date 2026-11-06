const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const catalog=require('../public/catalog'),view=require('../src/lib/storefront');
function routes(prisma={}){const handlers={};const router=Object.fromEntries(['get','post','patch'].map(method=>[method,(url,...h)=>handlers[method+' '+url]=h.at(-1)]));vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/products'),'utf8'),{module:{exports:{}},require:n=>n==='express'?{Router:()=>router}:n.includes('requireAdmin')?()=>{}:prisma});return handlers;}
async function call(fn,body){let error,result;await fn({body,params:{id:'p1'}},{status(){return this;},json(v){result=v;}},e=>error=e);return {status:error?.statusCode||200,error,result};}
const base={title:'test',productType:'کاپشن',basePrice:2350000,variants:[{size:'M',color:'black',sku:'test',stock:1}]};
test('all grades remain explicit, defects block publication with independent product and variant arrays',async()=>{
 let saved;const r=routes({product:{create:async({data})=>saved=data}});
 for(const grade of ['N','A_PLUS','A','B','C']){assert.equal((await call(r['post /'],{...base,qualityGrade:grade})).status,200);assert.equal(saved.qualityGrade,grade);}
 for(const grade of ['B','C']){
  assert.equal((await call(r['post /'],{...base,qualityGrade:grade,defect:'hole',images:['https://img.test/main']})).status,400);
  assert.equal((await call(r['post /'],{...base,qualityGrade:grade,defect:'hole',isActive:false})).status,200);
  assert.equal((await call(r['post /'],{...base,qualityGrade:grade,defect:'hole',defectImages:['https://img.test/defect']})).status,200);
  assert.equal(saved.images.length,0);assert.equal(saved.defectImages.length,1);
 }
 assert.equal((await call(r['post /'],{...base,variants:[{...base.variants[0],itemDefect:'tear'}]})).status,400);
 assert.equal((await call(r['post /'],{...base,defectImages:['https://img.test/product-defect'],variants:[{...base.variants[0],itemDefect:'tear'}]})).status,400);
 assert.equal((await call(r['post /'],{...base,variants:[{...base.variants[0],itemDefect:'tear',itemDefectImages:['https://img.test/variant-defect']}]})).status,200);
});
test('old client omitting new fields and grades preserves product and variant attributes',async()=>{
 const current={...base,id:'p1',updatedAt:new Date(),qualityGrade:'A_PLUS',defectImages:['https://img.test/defect'],mainFabric:'کتان',seasons:['پاییز'],variants:[{...base.variants[0],id:'v1',itemGrade:'N',sleeveFromNeckCm:73,itemDefectImages:['https://img.test/item-defect']}]};let productData,variantData;
 const tx={product:{findUnique:async()=>current,updateMany:async({data})=>{productData=data;return {count:1};}},variant:{updateMany:async({data})=>{variantData=data;return {count:1};}}};
 const r=routes({$transaction:fn=>fn(tx)});
 assert.equal((await call(r['patch /:id'],{...base,updatedAt:current.updatedAt.toISOString(),variants:[{...base.variants[0],id:'v1',expectedStock:1}]})).status,200);
 assert.equal(productData.qualityGrade,'A_PLUS');assert.equal(variantData.itemGrade,'N');assert.equal(variantData.sleeveFromNeckCm,73);assert.equal(productData.defectImages[0],current.defectImages[0]);assert.equal(variantData.itemDefectImages[0],current.variants[0].itemDefectImages[0]);assert.equal(productData.mainFabric,'کتان');
});
test('technology claims require verification and evidence, unsupported fabrics and invalid attributes reject',async()=>{
 const r=routes({product:{create:async({data})=>data}});
 for(const input of [{mainFabric:'گورتکس'},{mainFabric:'Gore-Tex'},{mainFabric:'کوهنوردی'},{fabricTechnology:'Gore-Tex'},{fabricTechnology:'Gore-Tex',technologyVerified:true},{seasons:['بهار','wrong']},{hasHood:'true'},{variants:[{...base.variants[0],sleeveFromNeckCm:-3}]}])assert.equal((await call(r['post /'],{...base,...input})).status,400);
 assert.equal((await call(r['post /'],{...base,fabricTechnology:'Gore-Tex',technologyVerified:true,technologyEvidence:'https://brand.test/model'})).status,200);
 assert.equal((await call(r['post /'],{...base,mainFabric:'نامشخص',fabricNote:'احتمالاً شمعی',uses:['کوهنوردی']})).status,200);
});
test('price display parses pasted localized integers and signed variant differences without altering numeric amounts',()=>{
 for(const price of ['2350000','2,350,000','۲٬۳۵۰٬۰۰۰','٢,٣٥٠,٠٠٠']){assert.equal(catalog.priceNumber(price),2350000);assert.equal(catalog.formatPriceInput(price),'2,350,000');}
 assert.equal(catalog.priceNumber('-۵۰٬۰۰۰'),-50000);for(const invalid of ['2.5','abc',''])assert(Number.isNaN(catalog.priceNumber(invalid)));
});
test('independent filters intersect and upper-body matching ignores sleeve',()=>{
 const p={...base,isActive:true,mainFabric:'شمعی',complementaryFabrics:['نایلون'],seasons:['پاییز','زمستان'],uses:['روزمره','کوهنوردی'],hasHood:true,garmentDesign:'تمام‌زیپ',variants:[{...base.variants[0],chestWidthCm:59,lengthCm:69,sleeveFromNeckCm:73}]};
 for(const q of ['type=کاپشن&season=پاییز&season=زمستان&fabric=نایلون&use=کوهنوردی&hood=true','width=59&length=69&sleeve=1000','need=پاییزه','need=مناسب سرما'])assert.equal(catalog.filterProducts([p],new URLSearchParams(q)).length,1);
 for(const q of ['season=تابستان','hood=false','fabric=کتان'])assert.equal(catalog.filterProducts([p],new URLSearchParams(q)).length,0);
});
test('SSR keeps defect media out of primary gallery and full guide collapsed',()=>{
 const p={...base,id:'p1',isActive:true,qualityGrade:'B',defect:'small hole <script>',defectImages:['https://img.test/defect'],images:['https://img.test/front'],variants:[{...base.variants[0],priceDelta:0,sleeveFromNeckCm:73}]};const html=view.renderProduct(p);
 assert(html.includes('<p>گرید B</p><details class="quality-guide">'));assert(html.includes('جزئیات وضعیت محصول'));assert(html.includes('small hole &lt;script&gt;'));assert(html.includes('۷۳ سانتی‌متر'));assert(!html.includes('class="quality-guide" open'));
 const primary=html.slice(html.indexOf('<div class="detail">'),html.indexOf('<h1>'));assert(!primary.includes('https://img.test/defect'));
});
