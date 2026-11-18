const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const express = require('express');
const { configureSandboxZibal, assertSandboxEnvironment } = require('../src/lib/zibal-sandbox');

const env = {
  NODE_ENV: 'test', MOTIF_CHECKOUT_PREVIEW: 'true', MOTIF_ZIBAL_PROVIDER: 'sandbox',
  DATABASE_URL: 'postgresql://fixture:fixture@motif-checkout-test-db:5432/postgres',
  ADMIN_ORIGIN: 'https://motif-checkout-test.liara.run',
  MOTIF_ZIBAL_SANDBOX_ORIGIN: 'https://motif-checkout-test.liara.run',
  MOTIF_ZIBAL_SANDBOX_MAX_TOMANS: '200000',
};
const orderId = '5a0ab7b2-7147-4e55-ba68-a7bf647a69ab';
const requestKey = '03487749-a6ec-4a7c-a641-c67c26fd0510';

test('sandbox requires explicit isolated configuration and refuses production credentials and origins', () => {
  assert.ok(configureSandboxZibal(env));
  for (const patch of [
    { NODE_ENV: 'production' }, { MOTIF_CHECKOUT_PREVIEW: 'false' }, { MOTIF_ZIBAL_PROVIDER: 'live' },
    { ZIBAL_MERCHANT: 'fixture-live' }, { ZIBAL_CALLBACK_URL: 'https://motifdress.com/api/payment/verify' },
    { DATABASE_URL: 'postgresql://fixture:fixture@motif-db:5432/postgres' },
    { DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/production' },
    { DATABASE_URL: 'postgresql://fixture:fixture@motif-checkout-test-db:5432/production' },
    { DATABASE_URL: 'postgresql://fixture:fixture@motif-checkout-test-db:5432/postgres?host=motif-db' },
    { MOTIF_ZIBAL_SANDBOX_MAX_TOMANS: 'Infinity' }, { MOTIF_ZIBAL_SANDBOX_MAX_TOMANS: '1.5' },
    { MOTIF_ZIBAL_SANDBOX_ORIGIN: 'http://motif-checkout-test.liara.run' },
    { MOTIF_ZIBAL_SANDBOX_ORIGIN: 'https://motif-checkout-test.liara.run/extra' },
    { MOTIF_ZIBAL_SANDBOX_ORIGIN: 'https://motif-checkout-test.liara.run/?redirect=other' },
    { MOTIF_ZIBAL_SANDBOX_ORIGIN: 'https://user:password@motif-checkout-test.liara.run' },
    { MOTIF_ZIBAL_SANDBOX_ORIGIN: 'https://motifdress.com', ADMIN_ORIGIN: 'https://motifdress.com' },
    { MOTIF_ZIBAL_SANDBOX_ORIGIN: 'https://www.motifdress.com', ADMIN_ORIGIN: 'https://www.motifdress.com' },
    { ADMIN_ORIGIN: 'https://motifdress.com' },
  ]) assert.equal(configureSandboxZibal({ ...env, ...patch }), null, JSON.stringify(patch));
  assert.throws(() => assertSandboxEnvironment({ ...env, NODE_ENV: 'production' }));
  assert.doesNotThrow(() => assertSandboxEnvironment({ MOTIF_ZIBAL_PROVIDER: 'live' }));
  const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  assert.ok(server.indexOf('assertSandboxEnvironment(process.env)') < server.indexOf("require('./lib/prisma')"));
});

test('sandbox transport fixes merchant, API and HTTPS callback and rejects invalid responses', async () => {
  const sent = [];
  const config = configureSandboxZibal(env, async (url, options) => {
    sent.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ result: 100 }) };
  });
  await config.gateway.request(1500000);
  await config.gateway.verify('123');
  await config.gateway.inquiry('123');
  assert.deepEqual(sent.map(x => x.url), ['request', 'verify', 'inquiry'].map(x => 'https://gateway.zibal.ir/v1/' + x));
  assert.deepEqual(sent[0].body, { merchant: 'zibal', amount: 1500000,
    callbackUrl: env.MOTIF_ZIBAL_SANDBOX_ORIGIN + '/api/payment/sandbox/verify' });
  assert.equal(config.gateway.redirect('123'), 'https://gateway.zibal.ir/start/123');
  for (const { options, body } of sent) {
    assert.equal(body.merchant, 'zibal');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  }
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ result: '100' }) }]) {
    const broken = configureSandboxZibal(env, async () => response);
    await assert.rejects(broken.gateway.request(1500000), /sandbox/);
  }
});

function databaseFixture() {
  const order = { id: orderId, totalPrice: 150000, status: 'PENDING' };
  let payment, attempt;
  const stats = { successfulWrites: 0 };
  const prisma = {
    checkoutReservation: { async findFirst({ where }) {
      if (where.orderId !== orderId || where.requestKey !== requestKey ||
          where.order?.totalPrice?.lte < order.totalPrice) return null;
      return { orderId, requestKey, order: { ...order, payment: payment ? { ...payment, zibalAttempt: { ...attempt } } : null } };
    } },
    order: { async updateMany({ where, data }) {
      if (where.id !== order.id || where.status !== order.status) return { count: 0 };
      Object.assign(order, data);
      return { count: 1 };
    } },
    payment: {
      async findUnique() { return payment ? { ...payment, zibalAttempt: { ...attempt } } : null; },
      async create({ data }) {
        payment = { id: 'sandbox-payment', orderId: data.orderId, amount: data.amount, isSuccessful: false };
        attempt = { paymentId: payment.id, state: 'REQUESTING', trackId: null };
        return { ...payment, zibalAttempt: { ...attempt } };
      },
      async update({ data }) { Object.assign(payment, data); stats.successfulWrites++; return payment; },
    },
    zibalAttempt: {
      async findFirst({ where }) { return attempt?.trackId === where.trackId ? { paymentId: payment.id } : null; },
      async findUnique({ where }) { return attempt?.trackId === where.trackId ? { ...attempt, payment: { ...payment } } : null; },
      async update({ data }) { Object.assign(attempt, data); return { ...attempt }; },
      async updateMany({ where, data }) {
        if (attempt.state !== where.state) return { count: 0 };
        Object.assign(attempt, data);
        return { count: 1 };
      },
    },
    async $transaction(action) { return action(prisma); },
  };
  return { prisma, order, stats };
}

async function withSandbox(action, verification = { result: 100, status: 1, amount: 1500000 }) {
  const fixture = databaseFixture();
  const sent = [];
  const gatewayFetch = async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    if (!url.endsWith('/request') && verification instanceof Error) throw verification;
    return { ok: true, json: async () => url.endsWith('/request') ? { result: 100, trackId: 123456789 } : verification };
  };
  const filename = path.join(__dirname, '../src/routes/payment.js');
  const originalRequire = createRequire(filename);
  const context = { module: { exports: {} }, process: { env }, require(name) {
    if (name === '../lib/prisma') return fixture.prisma;
    if (name === '../lib/zibal-sandbox') return { configureSandboxZibal: value => configureSandboxZibal(value, gatewayFetch) };
    return originalRequire(name);
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const app = express();
  app.use('/api/payment', context.module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await action({ ...fixture, sent, base }); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('Express sandbox request and callback verify on the server and repeated callback writes once', async () => {
  await withSandbox(async ({ base, sent, order, stats }) => {
    const headers = { 'Idempotency-Key': requestKey };
    const availability = await fetch(base + '/api/payment/availability?orderId=' + orderId, { headers });
    assert.deepEqual(await availability.json(), { sandbox: true });
    assert.equal((await fetch(base + '/api/payment/request/' + orderId, { method: 'POST' })).status, 404);
    const start = await fetch(base + '/api/payment/request/' + orderId, { method: 'POST', headers });
    assert.deepEqual(await start.json(), { status: 'OPEN', url: 'https://gateway.zibal.ir/start/123456789' });
    assert.equal(sent[0].body.amount, 1500000);
    const repeated = await fetch(base + '/api/payment/request/' + orderId, { method: 'POST', headers });
    assert.equal((await repeated.json()).url, 'https://gateway.zibal.ir/start/123456789');
    assert.equal(sent.filter(x => x.url.endsWith('/request')).length, 1);
    const callback = '/api/payment/sandbox/verify?trackId=123456789&success=1&status=1';
    assert.equal((await fetch(base + '/api/payment/verify?trackId=123456789')).status, 404);
    for (const bad of ['0', 'unknown', '123456789&trackId=2', '999']) {
      assert.equal((await fetch(base + '/api/payment/sandbox/verify?trackId=' + bad)).status, 404);
    }
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = await fetch(base + callback);
      assert.equal(result.status, 200);
      assert.match(await result.text(), /پرداخت آزمایشی زیبال تأیید شد/);
    }
    assert.equal(order.status, 'PAID');
    assert.equal(stats.successfulWrites, 1);
    assert.equal(sent.filter(x => x.url.endsWith('/verify')).length, 1);
  });
});

test('forged success callback with a mismatching server amount keeps the order unpaid', async () => {
  await withSandbox(async ({ base, order, stats }) => {
    await fetch(base + '/api/payment/request/' + orderId, { method: 'POST', headers: { 'Idempotency-Key': requestKey } });
    const result = await fetch(base + '/api/payment/sandbox/verify?trackId=123456789&success=1&amount=1500000');
    assert.match(await result.text(), /تأیید نشده/);
    assert.equal(order.status, 'PENDING');
    assert.equal(stats.successfulWrites, 0);
  }, { result: 100, status: 1, amount: 1500001 });
});

test('failed or unreachable sandbox verification cannot turn callback success into payment', async () => {
  for (const reply of [{ result: 202 }, new Error('offline')]) {
    await withSandbox(async ({ base, order, stats }) => {
      await fetch(base + '/api/payment/request/' + orderId, { method: 'POST', headers: { 'Idempotency-Key': requestKey } });
      const response = await fetch(base + '/api/payment/sandbox/verify?trackId=123456789&success=1');
      assert.match(await response.text(), /تأیید نشده/);
      assert.equal(order.status, 'PENDING');
      assert.equal(stats.successfulWrites, 0);
    }, reply);
  }
});

test('sandbox frontend follows only the official payment page URL', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/store.js'), 'utf8');
  const functionSource = source.slice(source.indexOf('async function showOnlinePayment(order)'), source.lastIndexOf('try { void showOnlinePayment'));
  for (const url of ['https://gateway.zibal.ir/start/123', 'https://gateway.zibal.ir.attacker.test/start/123', 'javascript:alert(1)']) {
    const button = {}, status = {}, destinations = [];
    const context = { Date, $, location: { assign: value => destinations.push(value) },
      fetch: async path => ({ ok: true, json: async () => path.includes('availability') ? { sandbox: true } : { status: 'OPEN', url } }) };
    function $(id) { return id === 'onlinePayment' ? button : status; }
    vm.runInNewContext(functionSource + '\nthis.show = showOnlinePayment;', context);
    await context.show({ number: orderId, key: requestKey, expiry: new Date(Date.now() + 60000).toISOString() });
    assert.equal(button.hidden, false);
    await button.onclick();
    assert.deepEqual(destinations, url === 'https://gateway.zibal.ir/start/123' ? [url] : []);
  }
});
