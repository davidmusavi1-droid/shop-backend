'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { assertTestEnvironment } = require('../src/lib/smart-panel/test-environment');
assertTestEnvironment();
const origin=process.env.ADMIN_ORIGIN;
const panel=origin+'/smart-panel/';
const api=origin+'/api/admin/smart-panel';
let browser;

before(async () => {
  browser=await chromium.launch({
    headless:true, ...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),
  });
});
after(() => browser?.close());
const name=(page,value)=>page.getByRole('button',{name:value,exact:true});
const waitFor=(page,text)=>page.getByText(text,{exact:false}).first().waitFor();
const saved=page=>page.locator('#save-label').filter({hasText:/^ذخیره‌شده در سرور آزمایشی$/}).waitFor();

async function login(page,url=panel){
  await page.goto(url);
  await page.locator('#smart-password').fill(process.env.ADMIN_TOKEN);
  await name(page,'ورود به پنل').click();
  await page.getByRole('heading',{name:'داشبورد',exact:true}).waitFor();
}
async function editor(page){
  await page.locator('.hero [data-page=new]').click();
  await name(page,'نمای یک‌صفحه‌ای').first().click();
  const id=new URL(page.url()).hash.split('=')[1];
  assert.match(id,/^[a-f0-9-]{36}$/);
  await page.locator('#section-identity summary').click();
  return id;
}
async function verifyRtl(page,width){
  const layout=await page.locator('html').evaluate(node=>({
    dir:getComputedStyle(node).direction,
    width:node.clientWidth,
    scroll:node.scrollWidth,
    mobile:getComputedStyle(node.querySelector('.mobile-nav')).display,
    sidebar:getComputedStyle(node.querySelector('.sidebar')).display,
  }));
  assert.equal(layout.dir,'rtl');
  assert.equal(layout.width,width);
  assert.equal(layout.scroll,width,'avoid viewport overflow');
  assert.equal(layout.mobile,width<860?'grid':'none');
  assert.equal(layout.sidebar,width<860?'none':'flex');
}
async function context(t,viewport){
  const c=await browser.newContext({viewport});
  t.after(()=>c.close());
  return c;
}

test('desktop: exact approved layout, create, server autosave and reload',async t=>{
  const c=await context(t,{width:1360,height:900});
  const page=await c.newPage();
  await login(page);
  await verifyRtl(page,1360);
  const id=await editor(page);
  await page.locator('#f-name').fill('پروندهٔ دسکتاپ');
  await saved(page);
  await page.reload();
  await page.locator('#section-identity summary').click();
  assert.equal(await page.locator('#f-name').inputValue(),'پروندهٔ دسکتاپ');
  assert.equal((await (await page.request.get(api+'/dossiers/'+id)).json()).name,'پروندهٔ دسکتاپ');
});

test('mobile: RTL wizard, five stages, gallery upload and independent trouser measurements',async t=>{
  const c=await context(t,{width:390,height:844});
  const page=await c.newPage();
  await login(page);
  await verifyRtl(page,390);
  await page.locator('#mobile [data-page=new]').click();
  await page.locator('.step').first().waitFor();
  assert.equal(await page.locator('.step').count(),5);
  const pixels={create:{width:24,height:24,channels:3,background:'#6a7862'}};
  const jpg=await sharp(pixels).jpeg().toBuffer();
  await page.locator('#files').setInputFiles([
    {name:'front.jpg',mimeType:'image/jpeg',buffer:jpg},
    {name:'label.jpg',mimeType:'image/jpeg',buffer:jpg},
  ]);
  await name(page,'افزودن به گالری').click();
  await page.locator('.image-card').nth(1).waitFor();
  await page.locator('.image-card').nth(1).getByRole('checkbox',{name:'لیبل'}).check();
  await waitFor(page,'گالری در سرور ذخیره شد.');
  await page.locator('.step[data-index="2"]').click();
  await page.locator('#f-type').selectOption('شلوار');
  await page.locator('#section-measure summary').click();
  await page.locator('#f-waist').fill('۴۲');
  await page.locator('#f-waistCircumference').fill('۸۶');
  await saved(page);
  const id=new URL(page.url()).hash.split('=')[1];
  const data=await (await page.request.get(api+'/dossiers/'+id)).json();
  assert.equal(data.waist,'42');
  assert.equal(data.waistCircumference,'86');
  assert.deepEqual(data.images[1].groups,['product','label']);
  await verifyRtl(page,390);
});

test('two tabs: stale revision cannot overwrite server and both values are visible',async t=>{
  const c=await context(t,{width:1360,height:900});
  const first=await c.newPage();
  await login(first);
  const id=await editor(first);
  await first.locator('#f-name').fill('نسخهٔ پایه');
  await saved(first);
  const second=await c.newPage();
  await second.goto(panel+'#dossier='+id);
  await second.locator('#section-identity summary').click();
  assert.equal(await second.locator('#f-name').inputValue(),'نسخهٔ پایه');
  await first.locator('#f-name').fill('تغییر تب اول');
  await saved(first);
  await second.locator('#f-name').fill('تغییر تب دوم');
  await second.locator('#save-label').filter({hasText:'تعارض نسخه'}).waitFor();
  await name(second,'بررسی تعارض').click();
  const dialog=second.getByRole('dialog');
  assert.match(await dialog.innerText(),/تغییر تب اول/);
  assert.match(await dialog.innerText(),/تغییر تب دوم/);
  assert.equal((await (await first.request.get(api+'/dossiers/'+id)).json()).name,'تغییر تب اول');
});

test('offline draft persists across reload and requires explicit recovery before save',async t=>{
  const c=await context(t,{width:1360,height:900});
  const page=await c.newPage();
  await login(page);
  const id=await editor(page);
  await page.locator('#f-name').fill('پیش‌نویس پایه');
  await saved(page);
  await c.setOffline(true);
  await page.locator('#f-name').fill('تغییر بدون اتصال');
  await waitFor(page,'نسخهٔ بازیابی محلی محفوظ است');
  // Reload using the same browser storage, after restoring the network.
  // Turning off autosave stops the online retry for this recovery test.
  await page.locator('#nav [data-page=settings]').click();
  await page.locator('#auto-save').uncheck();
  await c.setOffline(false);
  page.on('dialog',dialog=>dialog.accept());
  await page.reload();
  await page.locator('#nav [data-page=settings]').click();
  await name(page,'مقایسه و بازیابی').click();
  const dialog=page.getByRole('dialog');
  assert.match(await dialog.innerText(),/پیش‌نویس پایه/);
  assert.match(await dialog.innerText(),/تغییر بدون اتصال/);
  await name(page,'بازیابی در فرم').click();
  assert.equal((await (await page.request.get(api+'/dossiers/'+id)).json()).name,'پیش‌نویس پایه');
  await name(page,'ذخیره پیش‌نویس').click();
  await saved(page);
  assert.equal((await (await page.request.get(api+'/dossiers/'+id)).json()).name,'تغییر بدون اتصال');
});
