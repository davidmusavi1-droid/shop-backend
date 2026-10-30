const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const product=(id,productType,customerNeeds,variants)=>({id,title:id,productType,customerNeeds,isActive:true,basePrice:100,images:[],variants});
 const v=(id,width,stock=1)=>({id,size:'L',color:'مشکی',stock,priceDelta:0,chestWidthCm:width,itemImages:[]});
 const products=[product('بادگیر','بادگیر',['پاییزه','روزمره'],[{...v('wrong',50),priceDelta:10},{...v('fit',60),priceDelta:80},{...v('sold',60,0)}]),product('بدون اندازه','دورس',['روزمره'],[v('unknown',null)]),product('کمر قبلی','شلوار',['مناسب کار'],[{...v('old',null),waistCm:84}]),product('شلوار مناسب','شلوار',['مناسب کار'],[{...v('new',null),waistWidthCm:42,totalLengthCm:100,riseCm:30,thighWidthCm:32,hemWidthCm:20}])];
 await page.route('http://motif.test/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:JSON.stringify(u.pathname==='/api/products'?products:products.find(p=>p.id===decodeURIComponent(u.pathname.split('/').at(-1))))});
  const requested=path.basename(u.pathname),file=['catalog.js','store.js','site-content.js','store.css'].includes(requested)?requested:'index.html';return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(__dirname,'../public',file),'utf8')});
 });
 await page.goto('http://motif.test/collection');await page.locator('#products .card').first().waitFor();await page.locator('#advancedMeasurements>summary').click();
 assert.equal(await page.locator('#products .card').count(),4);
 assert.deepEqual(await page.locator('#needs button').allTextContents(),['همه','روزمره','ورزشی','پاییزه','مناسب سرما','مناسب کار']);
 await page.fill('#widthMin','۵۵');await page.fill('#widthMax','۶۵');
 assert.equal(await page.locator('#products .card').count(),1);assert((await page.locator('#products .card').innerText()).includes('۱۸۰'));
 await page.screenshot({path:'/tmp/motif-measurements-mobile.png',fullPage:true});
 await page.locator('#products .card').click();await page.locator('#detail').waitFor();
 assert(new URL(page.url()).pathname.startsWith('/products/'));
 assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://motifdress.com/products/'+encodeURIComponent('بادگیر'));
 assert.equal(await page.locator('.choices button[aria-pressed=true]').count(),1);
 assert((await page.locator('.price').innerText()).includes('۱۸۰'));
 await page.locator('.choices button').first().click();assert((await page.locator('.match-note').innerText()).includes('منطبق نیست'));
 await page.locator('.back').click();assert.equal(await page.inputValue('#widthMin'),'۵۵');
 await page.fill('#widthMin','۷۰');assert(await page.locator('#rangeError').isVisible());assert.equal(await page.locator('#products .card').count(),0);
 await page.selectOption('#measureKind','pants');assert.equal(await page.inputValue('#widthMin'),'');
 await page.fill('#widthMin','40');await page.fill('#widthMax','45');assert.equal(await page.locator('#products .card').count(),1);assert((await page.locator('#products .card').innerText()).includes('شلوار مناسب'));
 await page.locator('#resetFilters').click();await page.getByRole('button',{name:'پاییزه',exact:true}).click();assert.equal(await page.locator('#products .card').count(),1);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/motif-measurements-desktop.png',fullPage:true});
 await page.goto('http://motif.test/products/'+encodeURIComponent('بادگیر')+'?variant=fit');await page.locator('#detail').waitFor();assert((await page.locator('.price').innerText()).includes('۱۸۰'));
 await page.reload();await page.locator('#detail').waitFor();assert((await page.locator('.price').innerText()).includes('۱۸۰'));
 await page.goto('http://motif.test/#product/'+encodeURIComponent('بادگیر')+'?variant=fit');await page.locator('#detail').waitFor();assert(new URL(page.url()).pathname.startsWith('/products/'));
 await page.setViewportSize({width:390,height:844});await page.goto('http://motif.test/');await page.locator('#featured .card').first().waitFor();
 assert.equal(await page.locator('#quickForm').isVisible(),false);await page.locator('#quickToggle').click();await page.selectOption('#quickKind','pants');await page.fill('#quickWidth','۴۲');await page.fill('#quickLength','۱۰۰');await page.selectOption('#quickSize','L');await page.locator('#quickExtra>summary').click();await page.fill('#quickRise','۳۰');await page.fill('#quickThigh','۳۲');await page.fill('#quickHem','۲۰');
 await page.screenshot({path:'/tmp/motif-fit-finder-mobile.png',fullPage:true});await page.locator('#quickForm button').click();await page.locator('#products .card').waitFor();assert.equal(await page.locator('#products .card').count(),1);assert.match(page.url(),/rise=30/);assert.match(page.url(),/size=L/);
 await page.locator('#editMeasurements').click();assert.equal(await page.inputValue('#resultRise'),'30');await page.fill('#resultRise','۴۰');await page.locator('#exactForm button').click();assert.equal(await page.locator('#products .card').count(),0);
 await page.goto('http://motif.test/');await page.locator('#quickToggle').click();await page.fill('#quickWidth','۵۶');await page.locator('#quickToggle').click();await page.locator('#quickToggle').click();assert.equal(await page.inputValue('#quickWidth'),'۵۶');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS: exact needs, Persian ranges, matched price/variant, unknown/legacy exclusion, bounds, reset, mobile. Mock API.');
 }finally{await browser.close();}
})();
