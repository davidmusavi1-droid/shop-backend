const test = require('node:test');
const assert = require('node:assert/strict');
const { configureLiveZibal } = require('../src/lib/zibal-live');
const { toRials } = require('../src/lib/zibal');

const env = {
  NODE_ENV: 'production', MOTIF_CHECKOUT_PREVIEW: 'true', MOTIF_ZIBAL_PROVIDER: 'live',
  ZIBAL_MERCHANT: 'fixture-only', ZIBAL_CALLBACK_URL: 'https://motifdress.com/api/payment/verify',
  MOTIF_ZIBAL_PILOT_ORDER_ID: '5a0ab7b2-7147-4e55-ba68-a7bf647a69ab',
  MOTIF_ZIBAL_PILOT_MAX_TOMANS: '25000',
};

test('live configuration requires explicit opt-in, real-mode credential and pilot limits', () => {
  assert.equal(configureLiveZibal({}), null);
  for (const [key, value] of Object.entries({
    NODE_ENV: 'test', MOTIF_CHECKOUT_PREVIEW: 'false', MOTIF_ZIBAL_PROVIDER: 'mock',
    ZIBAL_MERCHANT: 'zibal', ZIBAL_CALLBACK_URL: 'http://motifdress.com/api/payment/verify',
    MOTIF_ZIBAL_PILOT_ORDER_ID: 'any', MOTIF_ZIBAL_PILOT_MAX_TOMANS: 'Infinity',
  })) assert.equal(configureLiveZibal({ ...env, [key]: value }), null, key);
});

test('live transport sends JSON only to the fixed Zibal API and validates responses', async () => {
  const sent = [];
  const { gateway, maxTomans } = configureLiveZibal(env, async (url, options) => {
    sent.push([url, options]);
    return { ok: true, json: async () => ({ result: 100 }) };
  });
  assert.equal(maxTomans, 25000);
  await gateway.request(toRials(25000));
  await gateway.verify('123');
  await gateway.inquiry('123');
  assert.deepEqual(sent.map(([url]) => url), ['request', 'verify', 'inquiry'].map(path => 'https://gateway.zibal.ir/v1/' + path));
  assert.deepEqual(JSON.parse(sent[0][1].body), { merchant: 'fixture-only', amount: 250000, callbackUrl: env.ZIBAL_CALLBACK_URL });
  for (const [, options] of sent) {
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(gateway.redirect('123'), 'https://gateway.zibal.ir/start/123');
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ result: '100' }) }]) {
    const disabled = configureLiveZibal(env, async () => response);
    await assert.rejects(disabled.gateway.inquiry('123'), /Zibal/);
  }
});
