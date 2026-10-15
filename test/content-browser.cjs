const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {defaults,validate}=require('../public/site-content');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 const images=Array.from({length:5},(_,i)=>'https://images.test/photo-'+i+'.png');
 const p={id:'jacket',title:'بادگیر',brand:'THE NORTH FACE',basePrice:2900000,isActive:true,customerNeeds:['پاییزه'],productType:'بادگیر',images,identityPurpose:'برای روزهای خنک',variants:[{id:'fit',size:'M',color:'مشکی',stock:1,priceDelta:0,chestWidthCm:56,lengthCm:70,itemImages:[]},{id:'large',size:'L',color:'مشکی',stock:2,priceDelta:100000,chestWidthCm:60,lengthCm:76,itemImages:['https://images.test/large.png']}]};
 let state={version:0,draft:structuredClone(defaults),published:structuredClone(defaults),history:[]},orderRequests=0;
 state.draft.slides=[0,1].map(i=>({id:String(i),enabled:true,image:images[i],mobileImage:'',alt:'بادگیر',title:i?'تازه‌رسیده‌ها':'برای روزهایی که در جریانی.',subtitle:'انتخاب‌های روزمره',button:i?'دیدن تازه‌رسیده‌ها':'دیدن انتخاب‌های پاییزه',target:i?{kind:'newest',value:''}:{kind:'need',value:'پاییزه'},mobileX:50,mobileY:50,desktopX:50,desktopY:50}));state.published=structuredClone(state.draft);
 await context.route('https://images.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1EAAAAASUVORK5CYII=','base64')}));
 await context.route('http://motif.test/**',r=>{
  const u=new URL(r.request().url());
  if(u.pathname.startsWith('/api/orders')){orderRequests++;return r.fulfill({status:503,json:{}});}
  if(u.pathname==='/api/products/admin/list')return r.fulfill({json:[p]});
  if(u.pathname==='/api/products')return r.fulfill({json:[p]});
  if(u.pathname==='/api/products/jacket')return r.fulfill({json:p});
  if(u.pathname==='/api/site')return r.fulfill({json:state.published});
  if(u.pathname.startsWith('/api/site/admin')){
   assert.equal(r.request().headers()['x-admin-token'],'test');
   if(r.request().method()==='POST'){const body=r.request().postDataJSON();assert.equal(body.version,state.version);state.version++;if(u.pathname.endsWith('/draft'))state.draft=validate(body.content);else if(u.pathname.endsWith('/publish')){state.history.unshift({id:'old',at:new Date().toISOString(),content:state.published});state.published=structuredClone(state.draft);}}
   return r.fulfill({json:state});
  }
  const name=u.pathname.startsWith('/icons/')?u.pathname.slice(1):path.basename(u.pathname),file=path.join(__dirname,'../public',name||'index.html');const exists=fs.existsSync(file)&&fs.statSync(file).isFile();const f=exists?file:path.join(__dirname,'../public/index.html');return r.fulfill({contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'text/html',body:fs.readFileSync(f)});
 });
 await page.goto('http://motif.test');await page.locator('#featured .card').waitFor();
 assert.equal(await page.locator('#hero .slide-controls button').count(),2);
 await page.locator('#hero .slide-controls button').nth(1).click();assert.equal(await page.locator('#hero .slide:visible a').getAttribute('href'),'/collection');
 await page.fill('#quickWidth','۵۶');await page.fill('#quickLength','۷۰');await page.locator('#quickForm button').click();await page.locator('#products .card').waitFor();assert.match(page.url(),/width=56/);
 await page.locator('#products .card').click();await page.locator('#detail').waitFor();assert((await page.locator('#detail .tag').textContent()).includes('THE NORTH FACE / MOTIF SELECTION'));
 assert.equal(await page.locator('.thumbs button').count(),5);await page.locator('.thumbs button').nth(3).click();assert.equal(await page.locator('.main-photo img').getAttribute('src'),images[3]);
 assert.equal(await page.locator('#detail .main-photo').evaluate(e=>getComputedStyle(e,'::after').backgroundImage),'none');
 await page.getByRole('button',{name:'L · مشکی',exact:true}).click();assert((await page.locator('.price').innerText()).includes('۳٬۰۰۰٬۰۰۰'));assert.equal(await page.locator('.thumbs button').count(),6);
 await page.getByRole('button',{name:'افزودن به سبد',exact:true}).click();await page.locator('a[href="/cart"]').click();await page.locator('.cart-row').waitFor();assert((await page.locator('#cartTotal').innerText()).includes('۳٬۰۰۰٬۰۰۰'));assert.equal(orderRequests,0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/motif-cart-mobile.png',fullPage:true});
 await page.goto('http://motif.test/admin.html');await page.fill('#token','test');await page.locator('#loginForm button').click();await page.locator('#siteButton').click();await page.getByText('شعارها و متن‌های صفحه',{exact:true}).click();
 await page.getByLabel('شعار معرفی MOTIF',{exact:true}).fill('انتخاب با شخصیت.');await page.getByRole('button',{name:'ذخیرهٔ پیش‌نویس',exact:true}).click();await page.getByText('پیش‌نویس ذخیره شد؛ سایت هنوز تغییر نکرده است.',{exact:true}).waitFor();assert.equal(state.published.text.aboutTitle,defaults.text.aboutTitle);
 await page.getByRole('button',{name:'پیش‌نمایش موبایل',exact:true}).click();const preview=page.frameLocator('iframe');await preview.locator('[data-copy=aboutTitle]').filter({hasText:'انتخاب با شخصیت.'}).waitFor();assert.equal(state.published.text.aboutTitle,defaults.text.aboutTitle);
 await page.getByRole('button',{name:'انتشار پیش‌نویس ذخیره‌شده',exact:true}).click();await page.getByText('محتوا منتشر شد.',{exact:true}).waitFor();assert.equal(state.published.text.aboutTitle,'انتخاب با شخصیت.');
 await page.screenshot({path:'/tmp/motif-cms-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS connected mobile home/results, dynamic brand, five-photo gallery, variant isolation, non-reserving cart, draft/private preview/publish.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
