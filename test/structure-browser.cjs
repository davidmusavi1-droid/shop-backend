const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const site=require('../public/site-content');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}: {})});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let products=[],payload,attempt=0;
 await page.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1EAAAAASUVORK5CYII=','base64')}));
 await page.route('http://motif.test/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/site')return route.fulfill({json:site.defaults});
  if(u.pathname==='/api/products/admin/list')return route.fulfill({json:products});
  if(u.pathname==='/api/uploads/images'){attempt++;return route.fulfill(attempt===1?{status:502,json:{error:'مجوز نوشتن در فضای عکس لیارا کافی نیست.'}}:{status:201,json:{url:'https://img.test/defect-'+attempt+'.webp'}});}
  if(u.pathname.startsWith('/api/products')){
   if(route.request().method()!=='GET'){payload=route.request().postDataJSON();const p={...payload,id:'p'+products.length,updatedAt:new Date().toISOString(),variants:payload.variants.map((v,i)=>({...v,id:'v'+i}))};products=[p];return route.fulfill({json:p});}
   return route.fulfill({json:u.pathname==='/api/products'?products:products[0]});
  }
  const file=u.pathname.endsWith('.js')||u.pathname.endsWith('.css')?u.pathname.slice(1):u.pathname==='/admin.html'?'admin.html':'index.html';
  return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(__dirname,'../public',file))});
 });
 await page.goto('http://motif.test/admin.html');await page.locator('#token').fill('test');await page.locator('#loginForm button').click();
 page.on('dialog',d=>d.accept());const stage=async(n)=>page.locator('#steps li').nth(n-1).getByRole('button').click();
 const pf=k=>page.locator('#productFields [data-key='+k+']'),vf=k=>page.locator('#editor [data-key='+k+']').first();
 for(const [i,type]of ['کاپشن','شلوار','سویشرت'].entries()){
  await page.locator('#mobileNav').getByRole('button',{name:'ثبت محصول',exact:true}).click();await pf('productType').fill(type);await pf('title').fill(type+' تست');await pf('productCode').fill('MOTIF-TEST-'+i);await pf('brand').fill('MOTIF');await stage(2);await vf('color').fill('سبز');
  await stage(3);await pf('basePrice').fill('۲٬۳۵۰٬۰۰۰');await pf('basePrice').dispatchEvent('input');assert.equal(await pf('basePrice').inputValue(),'2,350,000');await vf('priceDelta').fill('-50,000');
  await stage(1);await pf('mainFabric').fill('شمعی');await pf('complementaryFabrics').locator('input[value="نایلون"]').check();await pf('seasons').locator('input[value="پاییز"]').check();await pf('seasons').locator('input[value="زمستان"]').check();await pf('uses').locator('input[value="روزمره"]').check();await pf('uses').locator('input[value="مناسب کار"]').check();await pf('hasHood').selectOption('true');await pf('garmentDesign').fill('تمام‌زیپ');await stage(2);if(type!=='شلوار'){await vf('sleeveFromNeckCm').fill('73');await vf('chestWidthCm').fill('59');await vf('lengthCm').fill('69');}await stage(3);
  for(const grade of ['N','A_PLUS','A','B','C']){await pf('qualityGrade').selectOption(grade);assert.equal(await pf('defectImages').evaluate(n=>!n.closest('.image-editor').hidden),['B','C'].includes(grade));}
  await pf('qualityGrade').selectOption('B');
  await stage(4);const mainBox=page.locator('#productFields .image-editor:has([data-key=images])'),defectBox=page.locator('#productFields .image-editor:has([data-key=defectImages])');
  await mainBox.locator('summary').click();await pf('images').fill('https://img.test/front.webp');await pf('images').dispatchEvent('input');
  if(i===0){
   await stage(3);await pf('defect').fill('سوراخ کوچک در پایین لباس');await stage(4);
   const input=defectBox.locator('input[type=file]'),photo={name:'defect.png',mimeType:'image/png',buffer:Buffer.from('mock PNG bytes')};
   await input.setInputFiles(photo);await page.waitForFunction(()=>!document.querySelector('#save').disabled);assert.match(await defectBox.locator('[role=status]').textContent(),/مجوز نوشتن/);assert(!(await defectBox.locator('[role=status]').textContent()).includes('0 عکس اضافه شد'));
   await input.setInputFiles([photo,{...photo,name:'defect-2.jpg',mimeType:'image/jpeg'}]);await page.waitForFunction(()=>!document.querySelector('#save').disabled);assert.equal((await pf('defectImages').inputValue()).split('\n').length,2);
   await defectBox.getByRole('button',{name:'حذف از محصول',exact:true}).first().click();assert.equal(await pf('images').inputValue(),'https://img.test/front.webp');
  }
  await page.locator('#save').click();await page.getByText('محصول ذخیره شد.',{exact:true}).first().waitFor();assert.equal(payload.productType,type);assert.equal(payload.basePrice,2350000);assert.equal(payload.variants[0].priceDelta,-50000);assert.equal(payload.variants[0].sleeveFromNeckCm,type==='شلوار'?null:73);assert.deepEqual(payload.seasons,['پاییز','زمستان']);assert.deepEqual(payload.uses,['روزمره','مناسب کار']);assert.equal(payload.qualityGrade,'B');assert.equal(payload.images[0],'https://img.test/front.webp');
  if(i===0){assert.equal(payload.defectImages.length,1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/motif-structure-admin-mobile.png',fullPage:true});}
 }
 // Render the actual store scripts with API fixtures; defect media never enters primary gallery.
 products[0].isActive=true;products[0].defect='سوراخ کوچک';products[0].defectImages=['https://img.test/defect-final.webp'];
 await page.goto('http://motif.test/products/p0');await page.locator('#detail').waitFor();assert.match(await page.locator('.facts').innerText(),/۷۳ سانتی‌متر/);assert(!await page.locator('.quality-guide').evaluate(n=>n.open));assert.match(await page.locator('.facts').innerText(),/گرید\s+B/);assert(!(await page.locator('.main-photo').innerHTML()).includes('defect-final'));
 await page.locator('.quality-guide summary').click();assert.match(await page.locator('.quality-guide').innerText(),/ظاهر بسیار نزدیک به نو/);assert.match(await page.locator('.condition-details').innerText(),/سوراخ کوچک/);assert.equal(await page.locator('.defect-gallery img').getAttribute('src'),'https://img.test/defect-final.webp');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/motif-structure-detail-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/motif-structure-detail-desktop.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto('http://motif.test/collection?season=زمستان&fabric=نایلون');await page.locator('#products .card').waitFor();assert.match(await page.locator('#products .card').innerText(),/گرید B/);assert.equal(await page.locator('#quickForm [name*=sleeve],#quickForm [id*=sleeve]').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: three categories, all grades, localized prices, independent attributes, sleeve, upload failures, defect isolation, guide and mobile/desktop. Mocked API; real DOM/scripts.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
