// Runs against a disposable local PostgreSQL database only.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright');
const url = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/motif_test', 'Use disposable local motif_test database');
const prisma = new PrismaClient();
const base = 'http://127.0.0.1:' + (process.env.PORT || '4187');
const token = process.env.ADMIN_TOKEN;
assert(token);
const server = spawn(process.execPath, ['src/server.js'], { env: process.env, stdio: 'inherit' });
let browser;
async function api(path, method = 'GET', body, auth = true) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-Admin-Token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const edit = p => ({ ...p, variants: p.variants.map(v => ({ ...v, expectedStock: v.stock })) });
async function main() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    if (i === 59) throw new Error('Server failed to start');
    await delay(500);
  }
  assert.equal((await api('/api/products/admin/list', 'GET', null, false)).status, 401);
  assert.equal((await api('/health','GET',null,false)).data.contentReady,true);
  assert.equal((await api('/api/site/admin', 'GET', null, false)).status, 401);
  let site=(await api('/api/site/admin')).data;
  const original=structuredClone(site.published),draft=structuredClone(site.draft);
  draft.text.aboutTitle='منتخب تازهٔ MOTIF';
  draft.socials=[{platform:'instagram',label:'اینستاگرام MOTIF',enabled:true,url:'https://www.instagram.com/motif.test/'}];
  assert.equal((await api('/api/site/admin/draft','POST',{version:site.version,content:draft},false)).status,401);
  const competing=await Promise.all([1,2].map(()=>api('/api/site/admin/draft','POST',{version:site.version,content:draft})));
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  assert.deepEqual((await api('/api/site','GET',null,false)).data,original);
  site=(await api('/api/site/admin')).data;
  const invalid=structuredClone(draft);invalid.socials[0].url='javascript:alert(1)';
  assert.equal((await api('/api/site/admin/draft','POST',{version:site.version,content:invalid})).status,400);
  site=(await api('/api/site/admin/publish','POST',{version:site.version})).data;
  assert.equal((await api('/api/site','GET',null,false)).data.text.aboutTitle,draft.text.aboutTitle);
  assert((await (await fetch(base+'/')).text()).includes('منتخب تازهٔ MOTIF'));
  assert((await (await fetch(base+'/contact')).text()).includes('اینستاگرام MOTIF'));
  assert.equal((await api('/api/site/admin/publish','POST',{version:site.version-1})).status,409);
  site=(await api('/api/site/admin/restore','POST',{version:site.version,revisionId:site.history[0].id})).data;
  assert.deepEqual(site.draft,original);
  assert.equal((await api('/api/site','GET',null,false)).data.text.aboutTitle,draft.text.aboutTitle);
  const created = await api('/api/products', 'POST', { title: 'Integration product', basePrice: 100, inventoryMode: 'MULTI', variants: [{ sku: 'integration-L', size: 'L', color: 'black', stock: 1 }] });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  let p = created.data;
  const originalId = p.variants[0].id;
  // Direct HTML is useful without JavaScript and has a stable canonical URL.
  const direct = await fetch(base + '/products/' + p.id + '?variant=' + p.variants[0].id);
  assert.equal(direct.status, 200);
  const html = await direct.text();
  assert(html.includes('<h1>Integration product</h1>'));
  assert(html.includes('href="https://motifdress.com/products/' + p.id + '"'));
  const home = await (await fetch(base + '/')).text();
  assert(home.includes('href="/products/' + p.id + '"'));
  assert((await (await fetch(base + '/sitemap.xml')).text()).includes('/products/' + p.id));

  // A real order changes stock after the administrator has loaded the form.
  const stale = edit(p);
  const order = await api('/api/orders', 'POST', { customer: { fullName: 'Integration test', phone: '09000000000' }, items: [{ variantId: originalId, quantity: 1 }] }, false);
  assert.equal(order.status, 201);
  stale.title = 'Must roll back';
  assert.equal((await api('/api/products/' + p.id, 'PATCH', stale)).status, 409);
  p = await prisma.product.findUnique({ where: { id: p.id }, include: { variants: true } });
  assert.equal(p.title, 'Integration product');
  assert.equal(p.variants[0].stock, 0);
  assert.equal((await fetch(base + '/products/' + p.id)).status, 404);
  assert(!(await (await fetch(base + '/sitemap.xml')).text()).includes('/products/' + p.id));

  assert.equal((await api('/api/products/' + p.id, 'GET', null, false)).status, 404);
  assert((await api('/api/products/admin/list')).data.some(x => x.id === p.id));
  // Browser uses actual API and database; no request mocking.
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', err => errors.push(err.message));
  await page.goto(base + '/admin.html');
  await page.locator('#token').fill('wrong');
  await page.locator('#loginForm button').click();
  await page.locator('#message').filter({ hasText: 'نامعتبر' }).waitFor();
  assert(await page.locator('#workspace').isHidden());
  await page.locator('#token').fill(token);
  await page.locator('#loginForm button').click();
  await page.locator('#workspace').waitFor();
  await page.locator('#filter').selectOption('sold');
  await page.getByRole('button', { name: 'ویرایش', exact: true }).click();
  await page.locator('#productFields [data-key=title]').fill('Edited in browser');
  await page.locator('#addVariant').click();
  const second = page.locator('#variants fieldset').nth(1);
  for (const [key, value] of Object.entries({ size: 'XL', color: 'black', sku: 'integration-XL' })) await second.locator('[data-key=' + key + ']').fill(value);
  await page.locator('[data-key=customerNeeds] input[value="پاییزه"]').check();
  await page.locator('#variants fieldset').first().locator('[data-key=waistWidthCm]').fill('42');
  assert.equal(await page.locator('[data-key=styles]').count(),0);
  await page.locator('#save').click();
  await page.getByText('محصول ذخیره شد.', { exact: true }).waitFor();
  p = await prisma.product.findUnique({ where: { id: p.id }, include: { variants: true } });
  assert.equal(p.title, 'Edited in browser'); assert.equal(p.variants.length, 2);
  assert.deepEqual(p.customerNeeds, ['پاییزه']);
  assert.equal(p.variants.find(v=>v.id===originalId).waistWidthCm,42);
  assert(p.variants.some(v => v.id === originalId && v.stock === 0));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
  assert.deepEqual(errors, []);
  await page.locator('#logout').click(); assert(await page.locator('#workspace').isHidden());
  // Two concurrent edits cannot both save a stale snapshot.
  p = (await api('/api/products/admin/list')).data.find(x => x.id === p.id);
  const results = await Promise.all(['A', 'B'].map(title => api('/api/products/' + p.id, 'PATCH', { ...edit(p), title })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await prisma.orderItem.findFirst({ where: { orderId: order.data.id } })).variantId, originalId);
  console.log('PASS: PostgreSQL product editing, stock conflicts, mobile admin, content auth, draft/public isolation, concurrent content editors, publish, stale writes, restore-to-draft and SSR content');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  await prisma.$disconnect(); server.kill('SIGTERM');
});
