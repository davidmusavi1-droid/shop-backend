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
  const created = await api('/api/products', 'POST', { title: 'Integration product', basePrice: 100, inventoryMode: 'MULTI', variants: [{ sku: 'integration-L', size: 'L', color: 'black', stock: 1 }] });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  let p = created.data;
  const originalId = p.variants[0].id;
  // A real order changes stock after the administrator has loaded the form.
  const stale = edit(p);
  const order = await api('/api/orders', 'POST', { customer: { fullName: 'Integration test', phone: '09000000000' }, items: [{ variantId: originalId, quantity: 1 }] }, false);
  assert.equal(order.status, 201);
  stale.title = 'Must roll back';
  assert.equal((await api('/api/products/' + p.id, 'PATCH', stale)).status, 409);
  p = await prisma.product.findUnique({ where: { id: p.id }, include: { variants: true } });
  assert.equal(p.title, 'Integration product');
  assert.equal(p.variants[0].stock, 0);
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
  console.log('PASS: real PostgreSQL create/edit, stock conflict rollback, sold-out visibility, mobile browser login/edit/multiple sizes/logout, concurrent editors and order references');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  await prisma.$disconnect(); server.kill('SIGTERM');
});
