const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
assert.equal(process.env.DATABASE_URL, 'postgresql://motif_retry:retry_fixture_only@127.0.0.1:5432/motif_retry');
Object.assign(process.env, { NODE_ENV: 'production', MOTIF_CHECKOUT_PREVIEW: 'true',
  MOTIF_CHECKOUT_PUBLIC: 'true', MOTIF_ZIBAL_MODE: 'public', MOTIF_ZIBAL_PROVIDER: 'live',
  MOTIF_ZIBAL_RETRY_ENABLED: 'true', ZIBAL_MERCHANT: 'synthetic-local-only',
  ZIBAL_CALLBACK_URL: 'https://motifdress.com/api/payment/verify', ADMIN_TOKEN: 'synthetic-admin-fixture-only' });
delete process.env.MOTIF_ZIBAL_REQUESTS_DISABLED;
delete process.env.MOTIF_ZIBAL_PILOT_ORDER_ID;
delete process.env.MOTIF_ZIBAL_PILOT_MAX_TOMANS;
const p = require('../src/lib/prisma');
async function measuredProduct(args) {
 const product=await p.product.create(args);
 const parcel=require('../src/lib/parcel-shipping');
 const v=product.variants[0],items=[{variantId:v.id,quantity:1}];
 await p.shippingMeasurement.create({data:{variantId:v.id,...parcel.weightInput({grams:250,approved:true})}});
 await p.shippingPackingPlan.create({data:parcel.planInput({items,tareGrams:50,lengthMm:300,widthMm:250,heightMm:50,approved:true})});
 return product;
}
let server, requests = 0, verifies = 0, inquiryStatus = -1, verificationStatus = 1;
const gateway = { async request(amount) { requests++; assert.equal(amount, 125000); return { result: 100, trackId: 8200000000 + requests }; },
  async inquiry() { return { result: 100, status: inquiryStatus, amount: 125000 }; },
  async verify() { verifies++; inquiryStatus = verificationStatus; return { result: 100, status: 1, amount: 125000 }; },
  redirect: id => 'https://gateway.zibal.ir/start/' + id };
// Factory injection is test-only. No HTTP request reaches Zibal or a bank.
const zibal = require('../src/lib/zibal'), factory = zibal.createZibalGateway;
zibal.createZibalGateway = () => ({ ...gateway });
const checkoutRouter = require('../src/routes/checkout');
const paymentRouter = require('../src/routes/payment');
const { publicCheckout } = require('../src/lib/checkout-access');
const { configureLiveZibal } = require('../src/lib/zibal-live');
zibal.createZibalGateway = factory;
async function request(path, options = {}) { return fetch('http://127.0.0.1:' + server.address().port + path,
  { ...options, headers: { Origin: 'https://motifdress.com', ...options.headers } }); }
async function run() {
  assert.equal(publicCheckout(), true);
  const config = configureLiveZibal(process.env);
  assert.equal(config.public, true); assert.equal(config.orderId, null);
  assert.equal(configureLiveZibal({ ...process.env, MOTIF_ZIBAL_MODE: 'pilot' }), null);
  assert.equal(configureLiveZibal({ ...process.env, MOTIF_ZIBAL_RETRY_ENABLED: 'false' }), null);
  const shipping = require('../src/lib/destination-shipping');
  const tariff = await shipping.publish(p, { expectedTariffId: (await p.shippingTariffState.findUnique({where:{id:'default'}}))?.activeTariffId || null,
    source:'Synthetic fixture only; not a real carrier tariff',carrier:'POST_PISHTAZ',originProvince:'البرز',originCity:'کرج',
    validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),allInclusive:true,merchantCoversDifference:true,ownerApproved:true,
    rules:shipping.provinces.map(province=>({province,city:'*',fee:2500,maxItems:100,maxGoodsTomans:2147483647,minGrams:1,maxGrams:1000,maxLengthMm:500,maxWidthMm:500,maxHeightMm:500})) });
  await p.shippingSettings.upsert({ where: { id: 'default' }, create: { id: 'default', fee: 2500 }, update: { fee: 2500 } });
  const product = await measuredProduct({ data: { title: 'Public fixture only', basePrice: 10000,
    images: [], customerNeeds: [], styles: [], variants: { create: { size: 'T', color: 'test', sku: randomUUID(), stock: 1, itemImages: [] } } }, include: { variants: true } });
  const app = express(); app.use(express.json()); app.use('/api/checkout', checkoutRouter); app.use('/api/payment', paymentRouter);
  app.get('/api/products', async (_req, res) => res.json(await p.product.findMany({ include: { variants: true } })));
  app.get('/api/products/:id', async (req, res) => res.json(await p.product.findUnique({ where: { id: req.params.id }, include: { variants: true } })));
  app.get('/cart', (_req, res) => res.sendFile(require('node:path').resolve('public/index.html')));
  app.use(express.static('public'));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  assert.equal((await request('/api/checkout/shipping')).status, 200);
  assert.equal((await request('/api/checkout/shipping', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"shippingFee":0}' })).status, 401);
  assert.equal((await request('/api/checkout/card-transfer/orders')).status, 401);
  console.log('PASS public customer routes open only with explicit flags; admin settings/orders remain protected');
  const key = randomUUID(), payload = JSON.stringify({ items: [{ variantId: product.variants[0].id, quantity: 1 }],
    customer: { fullName: 'Synthetic public guest', phone: '09000000001', address: 'Not a real address', province: 'تهران', city: 'تهران', postalCode: '0000000000' }, shippingAcceptance: {tariffId:tariff.id,shippingFee:2500,totalPrice:12500}, totalPrice: 1 });
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: payload };
  let r = await request('/api/checkout/orders', options); assert.equal(r.status, 201); const order = await r.json();
  assert.equal(order.totalPrice, 12500); assert.equal(order.shippingFee, 2500);
  r = await request('/api/checkout/orders', options); assert.equal((await r.json()).orderNumber, order.orderNumber);
  assert.equal((await p.variant.findUniqueOrThrow({ where: { id: product.variants[0].id } })).stock, 0);
  console.log('PASS production-mode guest order computes shipping server-side, reserves once and reuses request key');
  const wrong = { method: 'POST', headers: { 'Idempotency-Key': randomUUID() } };
  assert.equal((await request('/api/payment/request/' + order.orderNumber, wrong)).status, 404); assert.equal(requests, 0);
  r = await request('/api/payment/request/' + order.orderNumber, { method: 'POST', headers: { 'Idempotency-Key': key } });
  assert.equal(r.status, 200); assert.equal((await r.json()).status, 'OPEN'); assert.equal(requests, 1);
  console.log('PASS public payment is bound to the saved order capability, with exact server rial amount');
  // Stop new customer writes without disabling callbacks for in-flight payments.
  process.env.MOTIF_CHECKOUT_PUBLIC = 'false'; process.env.MOTIF_ZIBAL_REQUESTS_DISABLED = 'true';
  assert.equal((await request('/api/checkout/orders', options)).status, 401);
  assert.equal((await request('/api/payment/request/' + order.orderNumber, { method: 'POST', headers: { 'Idempotency-Key': key } })).status, 401);
  inquiryStatus = 2;
  r = await request('/api/payment/verify?trackId=8200000001'); assert.equal(r.status, 200);
  let html = await r.text(); assert.ok(html.includes('پرداخت تأیید شد')); assert.ok(html.includes(order.orderNumber));
  assert.equal(verifies, 1);
  r = await request('/api/payment/verify?trackId=8200000001'); assert.ok((await r.text()).includes('پرداخت تأیید شد'));
  assert.equal(verifies, 1); assert.equal(await p.payment.count({ where: { orderId: order.orderNumber, isSuccessful: true } }), 1);
  assert.equal((await p.variant.findUniqueOrThrow({ where: { id: product.variants[0].id } })).stock, 0);
  console.log('PASS emergency request shutdown retains status-2 callbacks, result order number and exactly-once settlement');
  process.env.MOTIF_CHECKOUT_PUBLIC = 'true'; delete process.env.MOTIF_ZIBAL_REQUESTS_DISABLED;
  const secondProduct = await measuredProduct({ data: { title: 'Second synthetic public fixture', basePrice: 10000,
    images: [], customerNeeds: [], styles: [], variants: { create: { size: 'T', color: 'test', sku: randomUUID(), stock: 1, itemImages: [] } } }, include: { variants: true } });
  const secondKey = randomUUID();
  r = await request('/api/checkout/orders', { ...options, headers: { ...options.headers, 'Idempotency-Key': secondKey },
    body: payload.replace(product.variants[0].id, secondProduct.variants[0].id) });
  const secondOrder = await r.json();
  inquiryStatus = -1; verificationStatus = -1;
  r = await request('/api/payment/request/' + secondOrder.orderNumber, { method: 'POST', headers: { 'Idempotency-Key': secondKey } });
  assert.equal(r.status, 200);
  r = await request('/api/payment/verify?trackId=8200000002');
  assert.ok(!(await r.text()).includes('<h1>پرداخت تأیید شد'));
  assert.equal((await p.payment.findUniqueOrThrow({ where: { orderId: secondOrder.orderNumber } })).isSuccessful, false);
  console.log('PASS even OPEN inquiry plus successful verify cannot settle without a fresh paid inquiry');
  const fixtureProduct = title => measuredProduct({ data: { title, basePrice: 10000, images: [], customerNeeds: [], styles: [],
    variants: { create: { size: 'T', color: 'fixture', sku: randomUUID(), stock: 1, itemImages: [] } } }, include: { variants: true } });
  const raceProduct = await fixtureProduct('Synthetic cross-method race'); const raceKey = randomUUID();
  r = await request('/api/checkout/orders', { ...options, headers: { ...options.headers, 'Idempotency-Key': raceKey },
    body: payload.replace(product.variants[0].id, raceProduct.variants[0].id) });
  const raceOrder = await r.json();
  await p.cardTransferSettings.upsert({ where: { id: 'default' }, create: { id: 'default', enabled: true, cardNumber: '0000000000000000', accountHolder: 'Synthetic fixture' }, update: { enabled: true } });
  const jpg = await require('sharp')({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const form = new FormData(); form.append('receipt', new Blob([jpg], { type: 'image/jpeg' }), 'synthetic.jpg');
  await Promise.all([request('/api/payment/request/' + raceOrder.orderNumber, { method: 'POST', headers: { 'Idempotency-Key': raceKey } }),
    request('/api/checkout/card-transfer/orders/' + raceOrder.orderNumber + '/receipt', { method: 'POST', headers: { 'Idempotency-Key': raceKey }, body: form })]);
  const method = await p.payment.findUniqueOrThrow({ where: { orderId: raceOrder.orderNumber }, include: { zibalAttempt: true, cardTransfer: true } });
  assert.equal(await p.payment.count({ where: { orderId: raceOrder.orderNumber } }), 1);
  assert.notEqual(Boolean(method.zibalAttempt), Boolean(method.cardTransfer));
  assert.equal(method.isSuccessful, false);
  assert.equal((await p.variant.findUniqueOrThrow({ where: { id: raceProduct.variants[0].id } })).stock, 0);
  await p.cardTransferSettings.update({ where: { id: 'default' }, data: { enabled: false } });
  console.log('PASS simultaneous online and card-transfer claim selects exactly one method and one reservation');
  const { paymentResult } = require('../src/lib/payment-result');
  html = paymentResult({ status: 'PENDING', code: 'PAYMENT_REVIEW' }, { orderNumber: '<script>bad</script>' });
  assert.ok(html.includes('دوباره پرداخت نکنید')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<h1>پرداخت تأیید شد'));
  assert.ok(html.includes('width=device-width'));
  console.log('PASS unresolved result is never success; order number is escaped and page supports mobile viewport');
  const state = require('../public/checkout-state'); const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const first = await state.request(payload, storage), resumed = await state.request(payload, storage);
  assert.equal(resumed.key, first.key); assert.ok(![...values.values()].join('').includes('09000000001'));
  assert.notEqual((await state.request(payload + ' ', storage)).key, first.key);
  await assert.rejects(state.request(payload, { getItem() {}, setItem() { throw Error('storage blocked'); } }));
  state.complete(storage); assert.equal(values.size, 0);
  console.log('PASS pending checkout survives reload without storing customer data; blocked persistence stops submission');
  if (process.env.MOTIF_PUBLIC_BROWSER_TEST === 'true') {
    const { chromium } = require('playwright');
    const fs = require('node:fs/promises'); await fs.mkdir('artifacts', { recursive: true });
    const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
    try {
      for (const [label, width] of [['desktop', 1280], ['mobile', 320]]) {
        const item = await fixtureProduct('Synthetic browser ' + label);
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage(); const origin = 'http://127.0.0.1:' + server.address().port;
        // Fail closed on every outside request, including payment redirects.
        await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        // Seed before application startup; a late fixture write can race init/saveCart.
        await page.addInitScript(value => localStorage.setItem('motif-cart', JSON.stringify(value)), [{ productId: item.id, variantId: item.variants[0].id, quantity: 1 }]);
        await page.goto(origin + '/cart'); await page.locator('#guestCheckout').waitFor({ state: 'visible' });
        for (const [name, value] of Object.entries({ fullName: 'Synthetic browser', phone: '09000000002', province: 'تهران', city: 'تهران', address: 'Not a shipping address', postalCode: '0000000000' })) {
          if(name==='province')await page.locator('#guestCheckout [name="province"]').selectOption(value);
          else await page.locator('#guestCheckout [name="' + name + '"]').fill(value);
        }
        assert.ok(await page.locator('#guestCheckout button.primary').isDisabled());
        await page.locator('#quoteShipping').click();
        await page.waitForFunction(()=>!document.querySelector('#guestCheckout button.primary').disabled);
        assert.ok((await page.locator('#checkoutShipping').innerText()).includes('۱۲٬۵۰۰'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: 'artifacts/public-checkout-' + label + '-form.png', fullPage: true });
        await page.locator('#guestCheckout button.primary').click();
        await page.waitForFunction(() => document.getElementById('checkoutMessage').textContent.includes('شماره سفارش '));
        await page.locator('#onlinePayment').waitFor({ state: 'visible' });
        assert.ok(!(await page.locator('#checkoutMessage').innerText()).includes('آزمایشی'));
        const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('motif-card-order')));
        assert.equal(saved.total, 12500); assert.ok(saved.number);
        assert.equal((await p.variant.findUniqueOrThrow({ where: { id: item.variants[0].id } })).stock, 0);
        await page.screenshot({ path: 'artifacts/public-checkout-' + label + '-order.png', fullPage: true });
        await context.close();
        console.log('PASS ' + label + ' customer browser checkout, shipping, order number, online action and no horizontal overflow');
      }
    } finally { await browser.close(); }
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve)); await p.$disconnect();
});
