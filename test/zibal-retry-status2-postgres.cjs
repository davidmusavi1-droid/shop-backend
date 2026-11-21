const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { reserve, checkoutInput } = require('../src/lib/checkout');
const { createRetryPayment } = require('../src/lib/online-payment-retry');
const { TTL } = require('../src/lib/zibal-retry-policy');

// Existing disposable CI PostgreSQL only. Never inherit a production URL.
assert.equal(process.env.DATABASE_URL, 'postgresql://motif_retry:retry_fixture_only@127.0.0.1:5432/motif_retry');
process.env.NODE_ENV = 'test';
process.env.MOTIF_CHECKOUT_PREVIEW = 'true';
process.env.MOTIF_ZIBAL_PROVIDER = 'mock';
process.env.MOTIF_ZIBAL_RETRY_ENABLED = 'true';
const p = require('../src/lib/prisma');
let nextTrack = 8100000000, server;
const scripts = new Map();
const reply = (status, amount = 100000) => ({ result: 100, status, amount,
  paidAt: [1, 2].includes(status) ? '2026-11-20T12:00:00' : null,
  verifiedAt: status === 1 ? '2026-11-20T12:00:01' : null });
const gateway = {
  async request() { throw Error('No payment request is permitted in callback tests'); },
  redirect: () => { throw Error('No redirect is permitted in callback tests'); },
  async inquiry(id) {
    const s = scripts.get(id); s.calls.push('inquiry');
    if (s.current instanceof Error) throw s.current;
    return s.current;
  },
  async verify(id) {
    const s = scripts.get(id); s.calls.push('verify');
    // Status 2 must not have committed local success before server verification.
    assert.equal((await p.payment.findUniqueOrThrow({ where: { orderId: s.orderId } })).isSuccessful, false);
    if (s.pause) { s.entered(); await s.pause; }
    s.current = s.after;
    if (s.result instanceof Error) throw s.result;
    return s.result;
  },
};
// Exercise the actual Express callback router with a network-free provider.
// No production config, credentials, customer data or gateway URL is used.
const zibal = require('../src/lib/zibal');
const originalFactory = zibal.createZibalGateway;
zibal.createZibalGateway = () => gateway;
const router = require('../src/routes/payment');
zibal.createZibalGateway = originalFactory;

async function fixture(initial = reply(2), after = reply(1), result = { result: 100 }, age = 0) {
  const product = await p.product.create({ data: {
    title: 'Synthetic status-2 callback fixture', basePrice: 10000, images: [], customerNeeds: [], styles: [],
    variants: { create: { size: 'T', color: 'fixture', sku: randomUUID(), stock: 1, itemImages: [] } },
  }, include: { variants: true } });
  const variantId = product.variants[0].id, key = randomUUID();
  const order = await reserve(p, checkoutInput({ customer: { fullName: 'Synthetic callback', phone: '09000000000',
    province: 'Fixture', city: 'Fixture', address: 'Not a real address', postalCode: '0000000000' },
    items: [{ variantId, quantity: 1 }] }, key));
  const track = String(++nextTrack), issuedAt = new Date(Date.now() - age);
  const payment = await p.payment.create({ data: { orderId: order.orderNumber, amount: 10000,
    zibalAttempt: { create: { trackId: track, state: 'OPEN', trackIssuedAt: issuedAt } },
    zibalAttempts: { create: { sequence: 1, trackId: track, state: 'OPEN', issuedAt } },
  } });
  const state = { orderId: order.orderNumber, current: initial, after, result, calls: [] };
  scripts.set(track, state);
  return { orderId: order.orderNumber, paymentId: payment.id, track, variantId, key, state };
}
async function callback(f, suffix = '') {
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/payment/verify?trackId=${f.track}${suffix}`);
  assert.equal(r.status, 200);
  return r.text();
}
async function local(f, paid) {
  assert.equal((await p.order.findUniqueOrThrow({ where: { id: f.orderId } })).status, paid ? 'PAID' : 'PENDING');
  assert.equal((await p.payment.findUniqueOrThrow({ where: { id: f.paymentId } })).isSuccessful, paid);
  assert.equal(await p.payment.count({ where: { orderId: f.orderId } }), 1);
  assert.equal((await p.variant.findUniqueOrThrow({ where: { id: f.variantId } })).stock, 0);
}
async function run() {
  await p.shippingSettings.upsert({ where: { id: 'default' }, create: { id: 'default', fee: 0 }, update: { fee: 0 } });
  const app = express(); app.use('/api/payment', router);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });

  const paid = await fixture(reply(1));
  await callback(paid); await local(paid, true);
  assert.deepEqual(paid.state.calls, ['inquiry']);
  console.log('PASS status 1 settles from matching server inquiry without another verify');

  const unverified = await fixture();
  await callback(unverified); await local(unverified, true);
  assert.deepEqual(unverified.state.calls, ['inquiry', 'verify', 'inquiry']);
  const events = await p.zibalAttemptEvent.findMany({ where: { attempt: { paymentId: unverified.paymentId } } });
  assert.equal(events.filter(x => x.operation === 'verify').length, 1);
  assert.ok(events.some(x => x.operation === 'inquiry' && x.response.status === 2));
  assert.ok(events.some(x => x.operation === 'inquiry' && x.response.status === 1));
  console.log('PASS real Express callback status 2 verifies existing track then requires fresh status 1; audit preserved');

  const remains = await fixture(reply(2), reply(2), { result: 100, status: 1, amount: 100000 });
  await callback(remains); await local(remains, false);
  assert.deepEqual(remains.state.calls, ['inquiry', 'verify', 'inquiry']);
  assert.equal((await createRetryPayment(p, gateway).start(remains.orderId, remains.key)).code, 'PAYMENT_REVIEW');
  assert.equal((await createRetryPayment(p, gateway).expire(remains.orderId, remains.key)).status, 'PENDING');
  await local(remains, false);
  console.log('PASS neither status 2 nor verify success alone marks paid, retries or releases inventory');

  for (const [name, result, after, success] of [
    ['201 confirmed', { result: 201 }, reply(1), true],
    ['201 unresolved', { result: 201 }, reply(2), false],
    ['lost verify response reconciled', new Error('mock timeout'), reply(1), true],
    ['lost verify and inquiry unresolved', new Error('mock timeout'), new Error('mock inquiry timeout'), false],
    ['post-verify amount mismatch', { result: 100 }, reply(1, 99999), false],
  ]) {
    const f = await fixture(reply(2), after, result);
    await callback(f); await local(f, success);
    assert.deepEqual(f.state.calls, ['inquiry', 'verify', 'inquiry']);
    console.log('PASS ' + name);
  }

  for (const amount of [99999, '100000', undefined]) {
    const f = await fixture(reply(2, amount));
    // Passing undefined to a default parameter restores its default; omit explicitly.
    if (amount === undefined) delete f.state.current.amount;
    await callback(f, '&success=1&status=1'); await local(f, false);
    assert.deepEqual(f.state.calls, ['inquiry']);
  }
  console.log('PASS wrong, string and missing rial amounts block verify despite forged callback claims');

  const failed = await fixture(reply(11), reply(1), { result: 100 }, TTL + 1000);
  await callback(failed, '&success=1&status=1'); await local(failed, false);
  assert.deepEqual(failed.state.calls, ['inquiry']);
  assert.equal((await createRetryPayment(p, gateway).expire(failed.orderId, failed.key)).status, 'PENDING');
  await local(failed, false);
  console.log('PASS status 11 never verifies or releases inventory in callback');

  const delayed = await fixture(reply(2), reply(1), { result: 100 }, TTL + 1000);
  // Model a late callback for an older attempt while a newer attempt exists.
  await p.zibalPaymentAttempt.update({ where: { trackId: delayed.track }, data: { state: 'UNPAID' } });
  await p.zibalPaymentAttempt.create({ data: { paymentId: delayed.paymentId, sequence: 2,
    trackId: String(++nextTrack), state: 'OPEN', issuedAt: new Date() } });
  await callback(delayed); await local(delayed, true);
  assert.equal((await createRetryPayment(p, gateway).start(delayed.orderId, delayed.key)).status, 'PAID');
  assert.deepEqual(delayed.state.calls, ['inquiry', 'verify', 'inquiry']);
  console.log('PASS delayed paid status-2 callback after 30 minutes reconciles old track and blocks new payment');

  const concurrent = await fixture();
  let entered, release;
  const reached = new Promise(resolve => { entered = resolve; });
  concurrent.state.entered = entered;
  concurrent.state.pause = new Promise(resolve => { release = resolve; });
  const first = callback(concurrent);
  await reached;
  const others = await Promise.all(Array.from({ length: 6 }, () => callback(concurrent)));
  assert.equal(others.length, 6);
  await local(concurrent, false);
  release(); await first;
  await Promise.all(Array.from({ length: 6 }, () => callback(concurrent)));
  await local(concurrent, true);
  assert.deepEqual(concurrent.state.calls, ['inquiry', 'verify', 'inquiry']);
  assert.equal(await p.zibalPaymentAttempt.count({ where: { paymentId: concurrent.paymentId, state: 'PAID' } }), 1);
  console.log('PASS concurrent and repeated callbacks verify once, commit one payment, never deduct stock twice');
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await p.$disconnect();
});
