const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const storefront=require('../src/lib/storefront'),site=require('../public/site-content');
const {sections}=require('../src/lib/customer-guides'),policyLib=require('../src/lib/shipping-policy');
const policy={...policyLib.defaults,...policyLib.thresholds,revision:'icons-fixture'};
const product={id:'p1',title:'لباس آزمایشی',isActive:true,basePrice:5000000,images:[],variants:[{id:'v1',stock:2,priceDelta:0,size:'L',color:'مشکی'}]};
const publicDir=path.join(__dirname,'../public'),artifacts=path.join(__dirname,'../artifacts');
fs.mkdirSync(artifacts,{recursive:true});
// This server has no database or payment provider. All writes fail closed.
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(url.pathname.startsWith('/api/')){
  const data=url.pathname==='/api/products'?[product]:url.pathname==='/api/products/p1'?product:
   url.pathname==='/api/checkout/shipping-policy'?policy:
   url.pathname==='/api/checkout/shipping'?{mode:'postpaid',ready:true,public:true,trackingAvailable:false,policy,provinces:['البرز','تهران'],cities:{}}:
   url.pathname==='/api/checkout/logistics/settings'?{courierEnabled:true}:{};
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));
 }
 if(['/shipping-guide','/payment-guide','/tracking-guide'].includes(url.pathname)){
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(storefront.renderGuide(url.pathname.slice(1),site.defaults,policy,false));
 }
 if(url.pathname==='/cart'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(storefront.renderUtility('cart'));}
 const file=path.join(publicDir,path.basename(url.pathname));
 if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.svg')?'image/svg+xml':file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 try{
 for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>localStorage.setItem('motif-cart',JSON.stringify([{productId:'p1',variantId:'v1',quantity:1}])));
  for(const kind of ['shipping-guide','payment-guide','tracking-guide']){
   await page.goto(origin+'/'+kind);
   assert.deepEqual(await page.locator('.customer-guide>p').allTextContents(),sections(kind,policy,false).paragraphs);
   assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await page.locator('.shipping-icon:not([aria-hidden="true"]),.shipping-icon:not([focusable="false"])').count(),0);
   if(kind==='shipping-guide'){
    assert.deepEqual(await page.locator('.customer-guide>p use').evaluateAll(uses=>uses.map(u=>u.getAttribute('href').split('#')[1])),['truck','bike','gift','wallet','package','clock','map-pin']);
    await page.screenshot({path:path.join(artifacts,`shipping-icons-guide-${width}.png`),fullPage:true});
   }
  }
  await page.goto(origin+'/cart');await page.locator('#guestCheckout').waitFor();
  await page.selectOption('[name="province"]','البرز');await page.fill('[name="city"]','کرج');
  await page.locator('.method-truck').waitFor();assert.equal(await page.locator('.method-bike').isVisible(),false);
  await page.selectOption('[aria-label="روش ارسال"]','COORDINATED_COURIER');
  await page.locator('.method-bike').waitFor();assert.equal(await page.locator('.method-truck').isVisible(),false);
  assert.match(await page.locator('#freeShippingText').innerText(),/پیک کرج.*مشمول ارسال رایگان/);
  assert.equal(await page.locator('#freeShippingMeter').getAttribute('max'),'5000000');
  assert.match(await page.locator('#cartTotal').innerText(),/۵٬۰۰۰٬۰۰۰/);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(artifacts,`shipping-icons-cart-${width}.png`),fullPage:true});
  await page.getByRole('link',{name:'راهنمای ارسال',exact:true}).focus();
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'/shipping-guide');
  assert.deepEqual(errors,[]);await context.close();
 }
 // Guides and their icons remain rendered without JavaScript.
 const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();
 await page.goto(origin+'/shipping-guide');assert.equal(await page.locator('.customer-guide svg').count(),9);
 assert.deepEqual(await page.locator('.customer-guide>p').allTextContents(),sections('shipping-guide',policy,false).paragraphs);
 await context.close();console.log('PASS: 320/390/1280 RTL guides, exact Persian copy, cart threshold, method icons, accessibility attributes, keyboard focus, no-JS guide. Synthetic GET-only fixture.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
