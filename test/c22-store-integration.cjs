'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const sharp = require('sharp');
const { createRouter, assets } = require('../src/routes/smart-panel');
const { liaraProvider } = require('../src/lib/smart-panel/liara');
const { approvedSections } = require('../src/lib/smart-panel/store');
const requireAdmin = require('../src/middleware/requireAdmin');
const db = require('../src/lib/prisma');

const origin = 'http://127.0.0.1:56544';
const base = '/api/admin/smart-panel';
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.origin, 'null');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.pathname, '/motif_smart_test_c22_store');
assert.equal(target.username, 'motif_smart_test');
assert.equal(process.env.MOTIF_SMART_PANEL, 'store');
assert.equal(process.env.ADMIN_ORIGIN, origin);
assert.match(process.env.ADMIN_TOKEN, /^smart-test-[a-f0-9]{32,}$/);

const fixedUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, total_cost_toman: 100 };
const photoUrl = 'https://storage.example.test/motif/products/fixture.webp';
const source = 'https://about.puma.com/en';
const vision = { brand: { value: 'PUMA', image: 1, evidence: 'PUMA' }, labelSize: null, fabric: null,
  type: null, authenticity: null, waterproofing: null, technology: null, commercialModel: null,
  labelObservations: [
    { key: 'styleNumber', value: '558766', image: 1, origin: 'sewn', evidence: 'STYLE NO.' },
    { key: 'country', value: 'CHINA', image: 1, origin: 'sewn', evidence: 'MADE IN CHINA' },
    { key: 'country', value: 'PAKISTAN', image: 1, origin: 'hangtag', evidence: 'MADE IN PAKISTAN' },
  ] };
let server, browser, jpeg, product, cookie, csrf, dossier, calls = [], responseMode = 'normal';
const cfg = { operations: ['analyze', 'research'], dailyLimit: 4, labelObservations: true, separateStyle: true,
  model: 'google/gemini-2.5-flash', researchModel: 'perplexity/sonar',
  endpoint: 'https://fixture.invalid/chat/completions', key: 'local-fixture-key' };

async function request(path, method = 'GET', data, auth = true) {
  const binary = Buffer.isBuffer(data);
  const headers = { Origin: origin, ...(auth && { Cookie: cookie, 'X-Admin-CSRF': csrf }) };
  if (data !== undefined) headers['Content-Type'] = binary ? 'image/jpeg' : 'application/json';
  const response = await fetch(origin + path, {
    method, headers, body: data === undefined ? undefined : binary ? data : JSON.stringify(data),
  });
  return { response, status: response.status, data: await response.json() };
}
async function ok(path, method, data) {
  const result = await request(path, method, data);
  assert.ok(result.response.ok, JSON.stringify(result.data));
  return result.data;
}
async function update(path, method = 'POST', data = {}) {
  dossier = await ok(base + '/dossiers/' + dossier.id + path, method, { ...data, version: dossier.version });
  return dossier;
}

before(async () => {
  const [identity] = await db.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity, { db: 'motif_smart_test_c22_store', role: 'motif_smart_test' });
  assert.equal(await db.product.count(), 1, 'Only the synthetic migration sentinel may exist');
  assert.equal(await db.smartDossier.count(), 0);
  product = await db.product.findFirstOrThrow({ include: { variants: true } });
  assert.equal(product.identityHistory, 'متن دستی محفوظ');
  assert.equal(product.basePrice, 2490000);
  assert.equal(product.variants[0].stock, 3);

  jpeg = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#bd6a66' } }).jpeg().toBuffer();
  const provider = liaraProvider(cfg, { fetcher: async (url, options) => {
    assert.equal(url, cfg.endpoint);
    const input = JSON.parse(options.body);
    calls.push(input);
    if (responseMode === 'timeout') throw Object.assign(new Error(), { name: 'TimeoutError' });
    const visionRequest = input.model === cfg.model;
    const content = visionRequest ? vision : { claim: 'ادعای هویت با شاهد', url: responseMode === 'invalid' ?
      'https://puma.example.test/' : source, title: 'PUMA', evidence: 'متن شاهد', design: null, style: null };
    return Response.json({ id: 'fixture-' + calls.length, usage: fixedUsage, citations: [source],
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });
  } });
  const app = express();
  app.use(express.json());
  app.use(express.static('public'));
  app.use('/smart-panel', assets(true));
  app.use('/api/admin/session', require('../src/routes/admin-session')(requireAdmin.sessions));
  const storage = { canRead: url => url === photoUrl, read: async () => jpeg };
  app.use(base, requireAdmin, createRouter(db, { store: true, c2: { ...cfg, provider }, storage }));
  app.use('/off', requireAdmin, createRouter(db, { store: true }));
  app.use('/api/products', require('../src/routes/products'));
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ error: error.message }));
  server = await new Promise(resolve => {
    const listening = app.listen(56544, '127.0.0.1', () => resolve(listening));
  });
  const login = await request('/api/admin/session/login', 'POST', { password: process.env.ADMIN_TOKEN }, false);
  assert.equal(login.status, 200);
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  csrf = login.data.csrf;
});

after(async () => {
  await browser?.close();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await db.$disconnect();
});

test('links a product, reads a selected stored image, reserves Gemini once and records usage', async () => {
  assert.equal((await request(base + '/store/status', 'GET', undefined, false)).status, 401);
  const link = base + '/store/products/' + product.id + '/dossier';
  dossier = await ok(link, 'POST');
  assert.equal((await ok(link, 'POST')).id, dossier.id);
  const listing = await ok(base + '/dossiers/' + dossier.id + '/store-images');
  assert.deepEqual(listing.images, [{ index: 0 }]);
  await update('/store-images', 'POST', { index: 0, updatedAt: listing.updatedAt });
  const path = base + '/dossiers/' + dossier.id + '/ai/c2/';
  assert.equal((await request('/off/dossiers/' + dossier.id + '/ai/c2/analyze', 'POST', { version: dossier.version })).status, 503);
  const [a, b] = await Promise.all([request(path + 'analyze', 'POST', { version: dossier.version }),
    request(path + 'analyze', 'POST', { version: dossier.version })]);
  const success = [a, b].find(run => run.status === 200);
  assert.ok(success, JSON.stringify([a.data, b.data]));
  assert.ok([a, b].some(run => run.status === 409));
  assert.equal(calls.length, 1);
  assert.equal(success.data.run.usage.costToman, 100);
  assert.equal(success.data.run.usage.totalTokens, 30);
  assert.equal((await db.smartAiRun.findFirst()).rawResponse, null);
  dossier = success.data.dossier;
  assert.equal(dossier.labelObservations.length, 3);
});

test('research uses confirmed style and transfer protects manual text and stale versions', async () => {
  await update('', 'PATCH', { fields: { styleNumber: '558798' } });
  const path = base + '/dossiers/' + dossier.id;
  const send = () => request(path + '/ai/c2/research', 'POST', { version: dossier.version, mode: 'live', labelConfirmed: true });
  assert.equal((await send()).status, 422);
  await update('/style-confirmation', 'POST', { styleNumber: '558798' });
  const research = await send();
  assert.equal(research.status, 200, JSON.stringify(research.data));
  dossier = research.data.dossier;
  assert.equal(dossier.research.finding.style, null);
  assert.match(calls.at(-1).messages[1].content, /558798/);
  assert.doesNotMatch(calls.at(-1).messages[1].content, /558766/);
  assert.deepEqual(approvedSections((await db.smartDossier.findUnique({ where: { id: dossier.id } })).payload), {});
  await update('/brand-research/verify-source');
  await update('/brand-research/generate');
  for (const index of [0, 1, 2]) await update('/brand-research/review-draft', 'POST', { index, decision: 'approved' });
  const preview = await ok(path + '/store-transfer');
  assert.deepEqual(Object.keys(preview.sections), ['identityDesign', 'identityUseCases']);
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).identityDesign, null);

  const invalid = await request('/api/products/' + product.id, 'PATCH', {
    updatedAt: product.updatedAt, variants: product.variants.map(variant => ({ id: variant.id, expectedStock: variant.stock })),
    identityHistory: 'ادعای جایگزین', c22Transfer: { id: dossier.id, version: dossier.version, keys: ['identityHistory'] },
  });
  assert.equal(invalid.status, 409, JSON.stringify(invalid.data));
  const saved = await ok('/api/products/' + product.id, 'PATCH', {
    updatedAt: product.updatedAt, variants: product.variants.map(variant => ({ id: variant.id, expectedStock: variant.stock })),
    identityUseCases: preview.sections.identityUseCases,
    c22Transfer: { id: dossier.id, version: preview.version, keys: ['identityUseCases'] },
  });
  assert.equal(saved.identityUseCases, preview.sections.identityUseCases);
  assert.equal(saved.identityHistory, 'متن دستی محفوظ');
  for (const key of ['basePrice', 'qualityGrade', 'isActive', 'images']) assert.deepEqual(saved[key], product[key]);
  for (const key of ['stock', 'lengthCm', 'chestWidthCm']) assert.equal(saved.variants[0][key], product.variants[0][key]);

  await update('', 'PATCH', { fields: { styleNumber: '559000' } });
  assert.deepEqual((await ok(path + '/store-transfer')).sections, {});
  const stale = await request('/api/products/' + product.id, 'PATCH', {
    updatedAt: saved.updatedAt, variants: saved.variants.map(variant => ({ id: variant.id, expectedStock: variant.stock })),
    ...preview.sections, c22Transfer: { id: dossier.id, version: preview.version, keys: Object.keys(preview.sections) },
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
});

test('at 320px the linked form previews reviewed text and leaves saving to the manager',
  { skip: process.env.MOTIF_C22_BROWSER !== '1' }, async () => {
  // Seed only the C2.2 review state to isolate the new browser integration.
  const prior = await db.smartDossier.findUnique({ where: { id: dossier.id } });
  const run = await db.smartAiRun.findFirst({ where: { operation: 'research' } });
  const { brandResearchState, researchAction } = require('../src/lib/smart-panel/brand-research');
  let payload = { ...prior.payload, styleConfirmed: true, styleNumber: '558798' };
  payload.research = brandResearchState(payload, run.result, 'live', run.id);
  for (const [action, options] of [['verify-source'], ['generate'], ['review-draft', { index: 1, decision: 'approved' }]]) {
    payload = researchAction(payload, action, options);
  }
  await db.smartDossier.update({ where: { id: dossier.id }, data: { payload, version: { increment: 1 } } });
  const { chromium } = require('playwright-core');
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 850 } });
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin + '/admin.html');
  await page.locator('#token').fill(process.env.ADMIN_TOKEN);
  await page.locator('#loginForm button').click();
  await page.locator('#recent').getByRole('button', { name: 'ویرایش', exact: true }).click();
  await page.locator('#openC22').click();
  const frame = page.frameLocator('#c22Frame');
  await frame.locator('#section-analysis summary').click();
  await frame.getByText('مشاهده‌های متعارض', { exact: false }).waitFor();
  await frame.locator('#section-research summary').click();
  const html = await frame.locator('html').evaluate(node => ({
    dir: getComputedStyle(node).direction, visible: node.clientWidth, total: node.scrollWidth,
  }));
  assert.equal(html.dir, 'rtl');
  assert.equal(html.total, html.visible);
  assert.equal(await page.locator('html').evaluate(node => node.scrollWidth), 320);
  await frame.getByRole('button', { name: 'پیش‌نمایش انتقال به فرم محصول', exact: true }).click();
  await frame.getByRole('button', { name: 'درج در فرم محصول', exact: true }).click();
  await page.locator('#clearC22').waitFor();
  assert.equal(await page.locator('[data-key="identityHistory"]').inputValue(), 'متن دستی محفوظ');
  assert.ok(await page.locator('[data-key="identityDesign"]').inputValue());
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).identityDesign, null);
  await page.locator('#save').click();
  await page.locator('#saveSuccess').waitFor();
  const saved = await db.product.findUnique({ where: { id: product.id }, include: { variants: true } });
  assert.ok(saved.identityDesign);
  assert.equal(saved.identityHistory, 'متن دستی محفوظ');
  for (const key of ['basePrice', 'qualityGrade', 'isActive', 'images']) assert.deepEqual(saved[key], product[key]);
  for (const key of ['stock', 'lengthCm', 'chestWidthCm']) assert.equal(saved.variants[0][key], product.variants[0][key]);
  await context.close();
});

test('invalid citations, timeout and global quota stop further attempts', async () => {
  dossier = await ok(base + '/dossiers/' + dossier.id);
  const path = base + '/dossiers/' + dossier.id;
  await update('', 'PATCH', { fields: { styleNumber: '559001' } });
  await update('/style-confirmation', 'POST', { styleNumber: '559001' });
  const send = () => request(path + '/ai/c2/research', 'POST', { version: dossier.version, mode: 'live', labelConfirmed: true });
  responseMode = 'invalid';
  assert.equal((await send()).status, 502);
  assert.equal((await send()).status, 409);
  await update('', 'PATCH', { fields: { styleNumber: '559002' } });
  await update('/style-confirmation', 'POST', { styleNumber: '559002' });
  responseMode = 'timeout';
  assert.equal((await send()).status, 504);
  assert.equal((await send()).status, 429);
  assert.equal(calls.length, 4);
});
