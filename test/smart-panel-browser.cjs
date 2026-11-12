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

test('AI mock failure leaves the dossier editable when the manager returns to the form', async t => {
  const c = await context(t, { width: 1360, height: 900 });
  const page = await c.newPage();
  await login(page);
  const id = await editor(page);
  await page.locator('#f-name').fill('پروندهٔ پایدار پس از خطا');
  await page.locator('#f-brand').fill('THE NORTH FACE');
  await saved(page);
  await page.locator('#nav [data-page=settings]').click();
  await page.locator('#mock-failure').check();
  await page.locator('#nav [data-page=research]').click();
  await page.locator('button[data-act=edit][data-id="' + id + '"]').click();
  await name(page, 'اجرای تحقیق آزمایشی').click();
  await name(page, 'تأیید نام روی لیبل و شروع تحقیق').click();
  await page.locator('#brand-research-progress').filter({ hasText:'تحقیق آزمایشی قطع شد' }).waitFor();
  await page.reload();
  await page.locator('#section-identity summary').click();
  assert.equal(await page.locator('#f-name').inputValue(), 'پروندهٔ پایدار پس از خطا');
  await page.locator('#f-name').fill('ادامهٔ ثبت دستی');
  await saved(page);
  const current = await (await page.request.get(api + '/dossiers/' + id)).json();
  assert.equal(current.name, 'ادامهٔ ثبت دستی');
  assert.equal(current.research, null);
  assert.equal(current.publication, 'none');
});

test('C2.2P mobile research links, independent review and safe transfer', async t => {
  const c = await context(t, { width: 320, height: 760 });
  const page = await c.newPage();
  await login(page);
  const id = await editor(page);
  await page.locator('#section-research summary').click();
  const start = name(page, 'اجرای تحقیق آزمایشی');
  assert.equal(await start.isDisabled(), true);
  for (const unknown of ['نامشخص', 'فاقد برند مشخص', 'برند نامشخص', 'بدون‌لیبل']) {
    await page.locator('#f-brand').fill(unknown);
    assert.equal(await start.isDisabled(), true);
  }
  await page.locator('#f-brand').fill('THE NORTH FACE');
  await page.locator('#f-type').selectOption('کاپشن');
  await page.locator('#text-1').fill('متن قبلی مدیر');
  const source = 'https://www.thenorthface.com/en-us/about-us/our-story';
  let openedSource;
  await c.route('https://www.thenorthface.com/**', route => {
    openedSource = route.request().url();
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<h1>منبع نمونه</h1>' });
  });
  await start.click();
  await name(page, 'تأیید نام روی لیبل و شروع تحقیق').click();
  const identity = page.locator('.research-claim').filter({ has: page.getByRole('heading', { name:'هویت برند', exact:true }) });
  const design = page.locator('.research-claim').filter({ has: page.getByRole('heading', { name:'رویکرد طراحی برند', exact:true }) });
  await identity.getByText('در انتظار بررسی منبع',{exact:true}).waitFor();
  assert.equal(await identity.getByRole('link').getAttribute('href'), source);
  assert.match(await identity.getByRole('link').innerText(), /https:\/\//);
  const popupEvent = page.waitForEvent('popup');
  await identity.getByRole('link').click();
  const popup = await popupEvent;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(openedSource, source);
  assert.equal(popup.url(), source);
  await popup.close();
  await identity.getByRole('button', { name:'تأیید این ادعا' }).click();
  await name(page, 'تأیید مطابقت شاهد و ادعا').click();
  await identity.getByText('تأیید مدیر',{exact:true}).waitFor();
  assert.equal(await name(page, 'ساخت پیش‌نویس سه‌بخشی').count(), 0);
  await design.getByRole('button', { name:'رد این ادعا' }).click();
  await name(page, 'ساخت پیش‌نویس سه‌بخشی').click();

  const transfer = name(page, 'انتقال بخش‌های تأییدشده به فیلدهای خالی');
  await transfer.waitFor();
  assert.equal(await transfer.isDisabled(), true);
  const draft = i => page.locator('[data-draft-section="'+i+'"]');
  const sectionText = draft(0).getByRole('textbox');
  await sectionText.fill('متن ویرایش‌شدهٔ مدیر');
  await saved(page);
  assert.equal((await (await page.request.get(api+'/dossiers/'+id)).json()).researchDraft.sections[0], 'متن ویرایش‌شدهٔ مدیر');
  await draft(0).getByRole('button', { name:'تأیید این بخش' }).click();
  await draft(0).getByText('تأیید مدیر',{exact:true}).waitFor();
  await sectionText.fill('متن بازبینی‌شدهٔ مدیر');
  assert.equal(await transfer.isDisabled(), true);
  await draft(0).getByRole('button', { name:'تأیید این بخش' }).click();
  await draft(1).getByRole('button', { name:'تأیید این بخش' }).click();
  await draft(2).getByRole('button', { name:'رد این بخش' }).click();
  await transfer.click();
  await draft(0).getByText('منتقل شد',{exact:true}).waitFor();
  const p = await (await page.request.get(api + '/dossiers/' + id)).json();
  assert.deepEqual(p.content, [
    { text:'متن بازبینی‌شدهٔ مدیر', approved:true },
    { text:'متن قبلی مدیر', approved:false },
    { text:'', approved:false },
  ]);
  assert.equal(p.analysis, null);
  assert.equal(p.publication, 'none');
  await verifyRtl(page,320);
  assert.equal(await identity.getByRole('link').evaluate(link => link.scrollWidth <= link.clientWidth), true);
  assert.ok(await transfer.evaluate(button => button.getBoundingClientRect().height >= 44));
});

test('C2.2P no source leaves brand text uneditable and unverified', async t => {
  const c = await context(t, { width:390, height:844 });
  const page = await c.newPage();
  await login(page);
  await editor(page);
  await page.locator('#f-brand').fill('برند نمونهٔ بدون منبع');
  await page.locator('#f-type').selectOption('بادگیر');
  await page.locator('#section-research summary').click();
  await name(page, 'اجرای تحقیق آزمایشی').click();
  await name(page, 'تأیید نام روی لیبل و شروع تحقیق').click();
  await waitFor(page, 'منبع معتبر یافت نشد');
  await name(page, 'ساخت پیش‌نویس سه‌بخشی').click();
  const identity = page.locator('[data-draft-section="0"]');
  await identity.getByText('بدون منبع تأییدشده',{exact:true}).waitFor();
  assert.equal(await identity.getByRole('textbox').count(), 0);
  assert.equal(await identity.getByRole('button', { name:'تأیید این بخش' }).count(), 0);
});

test('P0 PUMA mobile: label conflict provenance and optional style confirmation', async t => {
  const c = await context(t, { width: 320, height: 760 });
  const page = await c.newPage();
  await login(page);
  const id = await editor(page);
  await page.locator('#f-brand').fill('PUMA');
  await saved(page);
  const dossier = api + '/dossiers/' + id;
  await page.route(url => url.pathname === new URL(api + '/dossiers').pathname, async route => {
    const response = await route.fetch();
    if (route.request().method() !== 'GET') return route.fulfill({ response });
    const list = await response.json();
    const labelObservations = [
      { key: 'country', value: 'China', origin: 'sewn', evidence: 'MADE IN CHINA' },
      { key: 'country', value: 'Pakistan', origin: 'hangtag', evidence: 'MADE IN PAKISTAN' },
      { key: 'styleNumber', value: '558700', origin: 'sewn', evidence: 'STYLE NO. 558700' },
    ];
    list.items = list.items.map(p => p.id === id ? { ...p, labelObservations } : p);
    return route.fulfill({ response, json: list });
  });
  await page.reload();
  await page.locator('#section-analysis summary').click();
  const analysis = page.locator('#section-analysis');
  await analysis.getByText('مشاهده‌های متعارض', { exact: false }).waitFor();
  await analysis.getByText(/تگ آویز · تعلق به لباس نیازمند بررسی/).waitFor();
  await analysis.getByText('MADE IN CHINA', { exact: true }).waitFor();
  const confirm = name(page, 'تأیید شمارهٔ استایل');
  assert.equal(await confirm.isDisabled(), true);
  await page.locator('#f-styleNumber').fill('۵۵۸۷۹۸');
  await confirm.click();
  await analysis.getByText('تأیید مدیر', { exact: true }).waitFor();
  const p = await (await page.request.get(dossier)).json();
  assert.equal(p.styleNumber, '558798');
  assert.equal(p.styleConfirmed, true);
  await page.locator('#section-research summary').click();
  await name(page, 'اجرای تحقیق آزمایشی').click();
  await page.getByText('شمارهٔ استایل تأییدشده 558798', { exact: true }).waitFor();
  await name(page, 'انصراف').click();
  await verifyRtl(page, 320);
});
