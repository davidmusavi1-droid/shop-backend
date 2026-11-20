const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { reserve, checkoutInput } = require('../src/lib/checkout');
const { createOnlinePayment } = require('../src/lib/online-payment');
const { createRetryPayment } = require('../src/lib/online-payment-retry');
const { TTL } = require('../src/lib/zibal-retry-policy');
// Fixed, synthetic, disposable CI database only. No inherited production URL.
assert.equal(process.env.DATABASE_URL, 'postgresql://motif_retry:retry_fixture_only@127.0.0.1:5432/motif_retry');
const p = new PrismaClient();
let time = Date.now(), next = 7000000000, requests = 0;
const responses = new Map();
let requestError = false, pauseInquiry, verify201 = false;
const gateway = {
  async request(amount) {
    requests++;
    assert.equal(amount, 1000000);
    if (requestError) throw Error('Simulated lost response');
    const id = String(++next);
    responses.set(id, { result: 100, status: -1, amount, paidAt: null, verifiedAt: null });
    return { result: 100, trackId: id };
  },
  async inquiry(id) {
    if (pauseInquiry) await pauseInquiry;
    const r = responses.get(id);
    if (r instanceof Error) throw r;
    return r;
  },
  async verify(id) {
    if (verify201) { responses.set(id, { result: 100, status: 1, amount: 1000000 }); return { result: 201 }; }
    return { result: 202 };
  },
  redirect: id => '/mock/' + id,
};
const options = { now: () => new Date(time) }; // Same confirmed contract as the opt-in live retry engine.
const service = () => createRetryPayment(p, gateway, options);
async function fixture(legacy = false) {
  time = Date.now();
  const product = await p.product.create({ data: {
    title: 'Synthetic retry fixture', basePrice: 100000, images: [], customerNeeds: [], styles: [],
    variants: { create: { size: 'T', color: 'fixture', sku: randomUUID(), stock: 1, itemImages: [] } },
  }, include: { variants: true } });
  const variantId = product.variants[0].id, key = randomUUID();
  const order = await reserve(p, checkoutInput({ customer: { fullName: 'Synthetic retry', phone: '09000000000',
    province: 'Fixture', city: 'Fixture', address: 'Not a shipping address', postalCode: '0000000000' },
  items: [{ variantId, quantity: 1 }] }, key));
  const first = await (legacy ? createOnlinePayment(p, gateway, options.now) : service()).start(order.orderNumber, key);
  assert.equal(first.status, 'OPEN');
  return { orderId: order.orderNumber, key, variantId, first: first.url.split('/').pop() };
}
const stock = f => p.variant.findUniqueOrThrow({ where: { id: f.variantId } }).then(x => x.stock);
const failed = id => responses.set(id, { result: 100, status: 11, amount: 1000000, paidAt: null, verifiedAt: null });
async function run() {
  await p.shippingSettings.create({ data: { id: 'default', fee: 0 } });
  const f = await fixture();
  failed(f.first); time += TTL - 1;
  const before = requests;
  assert.equal((await service().start(f.orderId, f.key)).code, 'RETRY_NOT_PROVEN_SAFE');
  assert.equal(requests, before);
  assert.equal(await stock(f), 0);
  console.log('PASS status 11 before full 30-minute expiry blocks retry and preserves stock');

  time += 1;
  const second = await service().start(f.orderId, f.key);
  assert.equal(second.status, 'OPEN');
  const secondId = second.url.split('/').pop();
  assert.notEqual(secondId, f.first);
  const pay = await p.payment.findUniqueOrThrow({ where: { orderId: f.orderId } });
  let rows = await p.zibalPaymentAttempt.findMany({ where: { paymentId: pay.id }, orderBy: { sequence: 'asc' } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].trackId, f.first);
  assert.equal((await p.zibalAttempt.findUniqueOrThrow({ where: { paymentId: pay.id } })).trackId, f.first);
  assert.equal(await stock(f), 0);
  assert.equal((await p.checkoutReservation.findUniqueOrThrow({ where: { orderId: f.orderId } })).expiresAt.getTime(), time + TTL);
  console.log('PASS new track retains legacy history and does not deduct stock again');

  assert.equal((await service().verify(f.first)).status, 'PENDING');
  assert.equal(await stock(f), 0);
  const resumeCount = requests;
  const duplicates = await Promise.all(Array.from({ length: 8 }, () => service().start(f.orderId, f.key)));
  assert.equal(requests, resumeCount);
  assert.ok(duplicates.every(x => x.status === 'PENDING' || x.url === second.url));
  console.log('PASS delayed failed callback and concurrent resume cannot release or re-charge');

  verify201 = true;
  const verified = await Promise.all(Array.from({ length: 8 }, () => service().verify(secondId)));
  verify201 = false;
  assert.ok(verified.some(x => x.status === 'PAID'));
  assert.equal((await service().verify(secondId)).status, 'PAID');
  assert.equal((await service().start(f.orderId, f.key)).status, 'PAID');
  assert.equal((await p.order.findUniqueOrThrow({ where: { id: f.orderId } })).status, 'PAID');
  assert.equal(await p.payment.count({ where: { orderId: f.orderId, isSuccessful: true } }), 1);
  assert.equal(await stock(f), 0);
  console.log('PASS 201 uses inquiry; concurrent callbacks settle exactly once');

  const concurrent = await fixture(); failed(concurrent.first); time += TTL;
  const count = requests;
  const races = await Promise.all(Array.from({ length: 12 }, () => service().start(concurrent.orderId, concurrent.key)));
  assert.equal(requests, count + 1);
  assert.ok(races.some(x => x.status === 'OPEN'));
  assert.equal(await stock(concurrent), 0);
  console.log('PASS concurrent retries create exactly one new gateway request');

  for (const reply of [new Error('timeout'), { result: 203 }, { result: 100, status: -1, amount: 999999 },
    { result: 100, status: 2, amount: 1000000 }]) {
    const x = await fixture(); time += TTL; responses.set(x.first, reply);
    const calls = requests;
    assert.equal((await service().start(x.orderId, x.key)).status, 'PENDING');
    assert.equal(requests, calls); assert.equal(await stock(x), 0);
  }
  console.log('PASS timeout, error, mismatched amount and unverified payment block new attempts');

  const lost = await fixture(); failed(lost.first); time += TTL; requestError = true;
  assert.equal((await service().start(lost.orderId, lost.key)).code, 'REQUEST_OUTCOME_UNKNOWN');
  requestError = false; const lostCalls = requests;
  assert.equal((await service().start(lost.orderId, lost.key)).status, 'PENDING');
  assert.equal(requests, lostCalls); assert.equal(await stock(lost), 0);
  console.log('PASS lost request response cannot be retried blindly');

  const imported = await fixture(true); failed(imported.first); time += TTL;
  const importedPayment = await p.payment.findUniqueOrThrow({ where: { orderId: imported.orderId } });
  const importedTrack = await p.zibalAttempt.findUniqueOrThrow({ where: { paymentId: importedPayment.id } });
  assert.equal((await service().start(imported.orderId, imported.key)).status, 'OPEN');
  assert.deepEqual(await p.zibalAttempt.findUniqueOrThrow({ where: { paymentId: importedPayment.id } }), importedTrack);
  assert.equal(await p.zibalPaymentAttempt.count({ where: { paymentId: importedPayment.id } }), 2);
  console.log('PASS existing v37 track is imported without rewriting its record');

  const closed = await fixture();
  await p.order.update({ where: { id: closed.orderId }, data: { status: 'CANCELED' } }); // Test-only inconsistent fixture.
  responses.set(closed.first, { result: 100, status: 1, amount: 1000000 });
  assert.equal((await service().verify(closed.first)).status, 'PENDING');
  assert.equal((await p.payment.findUniqueOrThrow({ where: { orderId: closed.orderId } })).isSuccessful, false);
  assert.equal(await stock(closed), 0);
  console.log('PASS a closed order is never reported paid without a committed settlement');

  const limit = await fixture();
  for (let i = 0; i < 2; i++) { failed(String(next)); time += TTL; assert.equal((await service().start(limit.orderId, limit.key)).status, 'OPEN'); }
  failed(String(next)); time += TTL;
  const limitCalls = requests;
  assert.equal((await service().start(limit.orderId, limit.key)).code, 'RETRY_LIMIT');
  assert.equal(requests, limitCalls); assert.equal(await stock(limit), 0);
  console.log('PASS three-attempt and absolute reservation limits block unlimited renewal');

  const late = await fixture(); failed(late.first); time += TTL;
  await service().start(late.orderId, late.key);
  responses.set(late.first, { result: 100, status: 1, amount: 1000000 });
  assert.equal((await service().verify(late.first)).status, 'PAID');
  const lateCalls = requests;
  assert.equal((await service().start(late.orderId, late.key)).status, 'PAID');
  assert.equal(requests, lateCalls); assert.equal(await stock(late), 0);
  console.log('PASS contradictory late payment evidence settles once and blocks subsequent requests');

  const expiry = await fixture(); time += TTL;
  const expired = await Promise.all([service().expire(expiry.orderId, expiry.key), service().expire(expiry.orderId, expiry.key)]);
  assert.ok(expired.some(x => x.status === 'EXPIRED')); assert.equal(await stock(expiry), 1);
  await service().expire(expiry.orderId, expiry.key); assert.equal(await stock(expiry), 1);
  const eleven = await fixture(); failed(eleven.first); time += TTL;
  assert.equal((await service().expire(eleven.orderId, eleven.key)).status, 'PENDING'); assert.equal(await stock(eleven), 0);
  console.log('PASS only valid expired pending inquiry releases inventory, exactly once');

  const eventRow = await p.zibalAttemptEvent.findFirstOrThrow();
  await assert.rejects(p.zibalAttemptEvent.update({ where: { id: eventRow.id }, data: { operation: 'TAMPER' } }));
  await assert.rejects(p.zibalAttemptEvent.delete({ where: { id: eventRow.id } }));
  assert.ok(await p.zibalAttemptEvent.count() > 10);
  console.log('PASS PostgreSQL enforces immutable audit history');
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => p.$disconnect());
