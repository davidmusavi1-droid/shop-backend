const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const view=require('../src/lib/storefront');
const product={id:'p1',title:'بادگیر <test>',brand:'MOTIF',description:'سبک "و" راحت',isActive:true,images:[],variants:[{id:'v1',size:'L',color:'مشکی',stock:1,priceDelta:20,chestWidthCm:60,waistCm:84}],basePrice:100,identityPurpose:'برای هوای خنک'};
test('server-rendered product contains metadata, real measurements and escaped content without JS',()=>{
 const html=view.renderProduct(product);
 assert(html.includes('<title>بادگیر &lt;test&gt; | MOTIF</title>'));
 assert(html.includes('rel="canonical" href="https://motifdress.com/products/p1"'));
 assert(html.includes('name="description"'));
 assert(html.includes('برای هوای خنک'));
 assert(html.includes('۶۰ سانتی‌متر'));
 assert(html.includes('دور کمر: ۸۴ سانتی‌متر'));
 assert(html.includes('۱۲۰ تومان'));
 assert(html.includes('<section id="catalog" hidden>'));
});
test('injected markup and template replacement tokens remain literal content',()=>{
 const html=view.renderProduct({...product,title:'</title><script>alert(1)</script>$&',images:['javascript:alert(1)','https://example.com/a" onerror="alert(1)']});
 assert(!html.includes('<script>alert(1)</script>'));
 assert(!html.includes('src="javascript:'));
 assert(!html.includes(' onerror="alert'));
 assert(html.includes('$&amp;'));
});
test('home and sitemap use stable product paths and exclude inactive or sold-out products',()=>{
 const list=[product,{...product,id:'inactive',isActive:false},{...product,id:'sold',variants:[{stock:0}]}];
 const html=view.renderHome(list),xml=view.sitemap(list);
 assert(html.includes('href="/products/p1"'));
 assert(xml.includes('https://motifdress.com/products/p1'));
 assert(!xml.includes('inactive'));assert(!xml.includes('/sold'));
 assert(!xml.includes('lastmod')); // Stock changes do not reliably update Product.updatedAt.
});
function loadRoutes(prisma){const routes={};const router={get:(path,fn)=>{routes[path]=fn;}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/storefront'),'utf8'),{module:{exports:{}},URL,require:name=>name==='express'?{Router:()=>router}:name.includes('site-content')?{published:async()=>require('../public/site-content').defaults}:name.includes('prisma')?prisma:view,console:{error:()=>{}}});return routes;}
async function call(fn,id='p1',path='/products/p1',originalUrl=path){let status=200,body,redirect,headers={};const res={set(k,v){headers[k]=v;return this;},status(n){status=n;return this;},type(t){headers.type=t;return this;},send(b){body=b;return this;},redirect(n,url){status=n;redirect=url;return this;}};await fn({params:{id},path,originalUrl},res);return {status,body,redirect,headers};}
test('public product route uses actual 404 and temporary DB failure uses 503',async()=>{
 for(const p of [null,{...product,isActive:false},{...product,variants:[{stock:0}]}]){
  const r=await call(loadRoutes({product:{findUnique:async()=>p}})['/products/:id']);assert.equal(r.status,404);assert(r.body.includes('noindex'));
 }
 const routes=loadRoutes({product:{findUnique:async()=>{throw Error('DB secret');},findMany:async()=>{throw Error('DB secret');}}});
 for(const path of ['/products/:id','/','/sitemap.xml']){const r=await call(routes[path]);assert.equal(r.status,503);assert(!r.body.includes('DB secret'));}
});
test('canonical ignores host and query; trailing slash redirects; sitemap is not cached',async()=>{
 const routes=loadRoutes({product:{findUnique:async()=>product,findMany:async()=>[product]}});
 const good=await call(routes['/products/:id']);assert.equal(good.status,200);
 const slash=await call(routes['/products/:id'],'p1','/products/p1/');assert.equal(slash.status,301);assert.equal(slash.redirect,'/products/p1');
 const sitemap=await call(routes['/sitemap.xml']);assert.equal(sitemap.headers['Cache-Control'],'no-store');
});

test('published settings seed round-trips safely without executable script injection',()=>{
 const settings=structuredClone(require('../public/site-content').defaults);settings.text.aboutTitle='</script><script>alert(1)</script>';
 const html=view.renderHome([],settings),match=html.match(/<script type="application\/json" id="publishedSiteContent">([\s\S]*?)<\/script>/);
 assert(match);assert.equal(JSON.parse(match[1]).text.aboutTitle,settings.text.aboutTitle);assert(!match[1].includes('<'));
});

test('each category links to the same product URL, and the breadcrumb follows only the priority', async () => {
 const catalog = require('../public/catalog');
 const shared = {...product, productCode:'MOTIF-006', productType:'بادگیر',
  mainCategories:['بادگیر','کاپشن'], fabrics:[catalog.fabrics[0],'نایلون']};
 const [windbreaker,jacket] = shared.mainCategories.map(catalog.categoryPath);
 const baseUrl = view.ORIGIN + '/products/p1';
 for (const categoryPath of [windbreaker,jacket]) {
  const collection = view.renderCollection([shared],new URL(categoryPath,view.ORIGIN).searchParams);
  assert(collection.includes('rel="canonical" href="'+view.ORIGIN+categoryPath+'"'));
  assert.equal(collection.match(/href="\/products\/p1"/g).length,1);
 }
 const html = view.renderProduct(shared);
 assert(html.includes('جنس پارچه: '+catalog.fabrics[0]+'، نایلون'));
 assert(!html.includes('GORE-TEX'));
 const list = html.match(/id="productBreadcrumbData">([^<]+)<\/script>/)[1];
 const schema = JSON.parse(list);
 assert.deepEqual(schema.itemListElement.map(v=>[v.position,v.name,v.item]),[
  [1,'خانه',view.ORIGIN+'/'],[2,'بادگیر',view.ORIGIN+windbreaker],[3,shared.title,baseUrl],
 ]);
 assert(html.includes('<a href="'+windbreaker+'">بادگیر</a>'));
 const changed = view.renderProduct({...shared,productType:'کاپشن'});
 assert(changed.includes('rel="canonical" href="'+baseUrl+'"'));
 assert(changed.includes('<a href="'+jacket+'">کاپشن</a>'));
 const xml = view.sitemap([shared]);
 assert.equal(xml.match(/\/products\/p1</g).length,1);
 assert(xml.includes(windbreaker));assert(xml.includes(jacket));

 const handlers = loadRoutes({product:{findUnique:async()=>shared,findMany:async()=>[shared]}});
 const redirect = await call(handlers['/products/:id'],'p1','/products/p1/','/products/p1/?variant=v1');
 assert.equal(redirect.redirect,'/products/p1?variant=v1');
 const filters = await call(handlers['/collection'],'p1','/collection',jacket+'&fabric=نایلون&fabric=پنبه');
 assert.equal(filters.status,200);
 assert(!filters.body.includes('href="/products/p1"'));
});
