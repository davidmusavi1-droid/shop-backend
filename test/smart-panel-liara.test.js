'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { configuration, liaraProvider } = require('../src/lib/smart-panel/liara');

const model = 'google/gemini-2.5-flash';
const endpoint = 'https://ai.liara.ir/api/000000000000000000000000/v1/chat/completions';
const fakeKey = 'synthetic-test-key-only';
const cfg = { endpoint, key: fakeKey, model, researchModel: model + ':online' };
const approved = { MOTIF_C2_MODE: 'approved', MOTIF_C2_OPERATIONS: 'analyze',
  MOTIF_C2_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(), MOTIF_C2_API_KEY: fakeKey, MOTIF_C2_BASE_URL: endpoint.replace('/chat/completions', '') };
const target = { database: 'motif_smart_test_c02' };
const images = ['first', 'second', 'third'].map(id => ({ id, bytes: Buffer.from(id) }));
const analysis = {
  brand: { value: 'THE NORTH FACE', image: 1, evidence: 'THE NORTH FACE' },
  labelSize: { value: 'XL', image: 2, evidence: 'SIZE: XL' },
  fabric: { value: '۱۰۰٪ پلی‌استر', image: 2, evidence: 'SHELL: 100% POLYESTER' },
  type: { value: 'کاپشن', image: 3, evidence: 'شکل پوشاک' },
  authenticity: null, waterproofing: null, technology: null, commercialModel: null,
};
const url = 'https://www.thenorthface.com/en-us/about-us';
const finding = { claim: 'ادعای آزمایشی', url, title: 'عنوان آزمایشی', evidence: 'شاهد آزمایشی', design: null };

function json(value, extra) {
  return Response.json({ id: 'fixture-1', choices: [{ finish_reason: 'stop', message: {
    content: typeof value === 'string' ? value : JSON.stringify(value),
  } }], usage: { prompt_tokens: 869, completion_tokens: 183, total_tokens: 1052, total_cost_toman: 260 }, ...extra });
}

test('configuration fails closed without server approval, dedicated DB, official endpoint and allowlisted models', () => {
  assert.equal(configuration({}, target), null);
  for (const [env, db] of [
    [{ ...approved, MOTIF_C2_MODE: 'test' }, target],
    [{ ...approved, MOTIF_C2_EXPIRES_AT: '2020-01-01T00:00:00Z' }, target],
    [{ ...approved, MOTIF_C2_EXPIRES_AT: new Date(Date.now() + 7_200_000).toISOString() }, target],
    [approved, null], [approved, { database: 'motif_smart_test' }],
    [{ ...approved, MOTIF_C2_BASE_URL: 'https://elsewhere.invalid/v1' }, target],
    [{ ...approved, MOTIF_C2_BASE_URL: approved.MOTIF_C2_BASE_URL + '?send=1' }, target],
    [{ ...approved, MOTIF_C2_VISION_MODEL: model + ':thinking' }, target],
    [{ ...approved, MOTIF_C2_OPERATIONS: 'analyze,research' }, target],
    [{ ...approved, MOTIF_C2_OPERATIONS: 'analyze,research', MOTIF_C2_RESEARCH_MODEL: model + ':online' }, target],
  ]) assert.throws(() => configuration(env, db), /requires explicit approval/);
  assert.equal(configuration(approved, target).endpoint, endpoint);
  assert.deepEqual(configuration({ ...approved, MOTIF_C2_OPERATIONS: 'analyze,research',
    MOTIF_C2_RESEARCH_TARIFF_CONFIRMED: 'yes', MOTIF_C2_RESEARCH_MODEL: model + ':online' }, target).operations, ['analyze', 'research']);
});

test('one structured vision request carries only the three numbered JPEGs and preserves provenance', async () => {
  let calls = 0;
  const provider = liaraProvider(cfg, { fetcher: async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer ' + fakeKey);
    const data = JSON.parse(options.body);
    assert.equal(data.model, model);
    assert.equal(data.max_tokens, 600);
    assert.deepEqual(data.response_format, { type: 'json_object' });
    assert.match(data.messages[0].content, /غیرقابل اعتماد/);
    const prompt = data.messages[1].content[0].text;
    assert.match(prompt, /برای type، نمای کلی پوشاک/);
    assert.match(prompt, /type را null بگذار/);
    assert.doesNotMatch(prompt, /کاپشن|ژاکت|jacket|THE NORTH FACE/i);
    assert.deepEqual(data.messages[1].content.slice(1).map(image => image.image_url.url),
      images.map(image => 'data:image/jpeg;base64,' + image.bytes.toString('base64')));
    return json(analysis);
  } });
  const result = await provider.analyze(images);
  assert.equal(calls, 1);
  assert.deepEqual(result.result.analysis.map(item => item.imageId), ['first', 'second', 'second', 'third']);
  assert.deepEqual(result.result.unknown, ['authenticity', 'waterproofing', 'technology', 'commercialModel']);
  assert.equal(result.usage.requestId, 'fixture-1');
  assert.equal(result.usage.totalTokens, 1052);
  assert.equal(result.usage.costToman, 260);
});

test('a valid null garment type stays unknown without dropping the label findings', async () => {
  const provider = liaraProvider(cfg, { fetcher: async () => json({ ...analysis, type: null }) });
  const { result } = await provider.analyze(images);
  assert.deepEqual(result.analysis.map(item => item.key), ['brand', 'labelSize', 'fabric']);
  assert.ok(result.unknown.includes('type'));
});

test('malformed or incomplete JSON, missing evidence, wrong image, unsupported claims and injected write fields are rejected', async () => {
  const { type, ...incomplete } = analysis;
  for (const answer of [
    '{', incomplete, { ...analysis, brand: { ...analysis.brand, evidence: '' } },
    { ...analysis, brand: { ...analysis.brand, image: 4 } },
    { ...analysis, type: { ...type, evidence: '' } },
    { ...analysis, waterproofing: analysis.brand }, { ...analysis, price: '1', publish: true },
    { ...analysis, brand: { ...analysis.brand, value: fakeKey } },
  ]) {
    await assert.rejects(liaraProvider(cfg, { fetcher: async () => json(answer) }).analyze(images),
      { status: 502, code: 'AI_INVALID_RESPONSE' });
  }
});

test('429, network disconnect, timeout and overlong responses are bounded and never retried', async () => {
  for (const [expected, fixture] of [
    ['AI_RATE_LIMIT', async () => new Response('secret error body', { status: 429 })],
    ['AI_UNAVAILABLE', async () => { throw new TypeError('secret transport text'); }],
    ['AI_TIMEOUT', (_url, { signal }) => new Promise((_, reject) => {
      const keepAlive = setTimeout(() => reject(new Error('timeout did not abort')), 250);
      signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
    })],
    ['AI_INVALID_RESPONSE', async () => new Response('x'.repeat(100_000))],
  ]) {
    let calls = 0;
    await assert.rejects(liaraProvider(cfg, { timeoutMs: 10, fetcher: (...args) => {
      calls++;
      return fixture(...args);
    } }).analyze(images), error => error.code === expected &&
      !error.message.includes('secret') && error.usage.model === model);
    assert.equal(calls, 1);
  }
});

test('research uses the approved public subject and a real citation slot while source review stays pending', async () => {
  const provider = liaraProvider(cfg, { fetcher: async (_url, { body }) => {
    const data = JSON.parse(body);
    assert.equal(data.model, model + ':online');
    assert.match(data.messages[1].content, /THE NORTH FACE/);
    assert.doesNotMatch(body, /base64|dossier|MOTIF/);
    return json(finding, { citations: [url] });
  } });
  const { result } = await provider.research({ brand: 'THE NORTH FACE' });
  assert.equal(result.status, 'pending_source_review');
  assert.equal(result.checkedAt, null);
  assert.ok(result.retrievedAt);
  assert.equal(result.url, url);
});

test('research rejects invented links, unsafe destinations and unrequested injected fields', async () => {
  for (const [value, citations] of [
    [finding, []],
    [{ ...finding, design: { claim: 'بدون شاهد', url, title: 'طراحی', evidence: '' } }, [url]],
    [{ ...finding, design: { claim: 'نشانی بدون استناد', url: url + '/unretrieved', title: 'طراحی', evidence: 'شاهد' } }, [url]],
    [{ ...finding, url: 'http://127.0.0.1/admin' }, ['http://127.0.0.1/admin']],
    [{ ...finding, url: 'https://www.thenorthface.com.attacker.invalid/' }, ['https://www.thenorthface.com.attacker.invalid/']],
    [{ ...finding, publish: true }, [url]],
  ]) await assert.rejects(liaraProvider(cfg, { fetcher: async () => json(value, { citations }) }).research({ brand: 'THE NORTH FACE' }),
    { code: 'AI_INVALID_RESPONSE' });
});

test('raw model response is retained privately before validation and credential echoes are discarded', async () => {
  const archived = [];
  const raw = '{invalid JSON';
  const retain = text => archived.push(text);
  const invalid = liaraProvider(cfg, { fetcher: async () => new Response(raw) });
  await assert.rejects(invalid.analyze(images, retain), { code: 'AI_INVALID_RESPONSE' });
  const echo = liaraProvider(cfg, { fetcher: async () => json({ ...analysis, brand: { ...analysis.brand, value: fakeKey } }) });
  await assert.rejects(echo.analyze(images, retain), { code: 'AI_INVALID_RESPONSE' });
  assert.deepEqual(archived, [raw]);
});
