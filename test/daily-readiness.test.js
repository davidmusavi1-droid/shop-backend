'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { approvedSections, checkTransfer, reviewedFabric } = require('../src/lib/smart-panel/store');
const { mapType, mapFabric } = require('../src/lib/smart-panel/suggestion-options');
const { emptyPayload, draftFields } = require('../src/lib/smart-panel/validation');
const { checkCode, codeKey, valid } = require('../src/lib/motif-code');
const budget = require('../src/lib/smart-panel/ai-budget');
const { createStorage } = require('../src/lib/image-storage');
const id = '12345678-1234-4234-8234-123456789abc';

test('manual approvals survive readback and stale research; edits revoke only their own approval', async () => {
  const payload = { ...emptyPayload(), brand: 'PUMA',
    content: ['هویت مستند', 'طراحی قابل مشاهده', 'کاربرد پیشنهادی'].map(text => ({ text, approved: true })) };
  const saved = JSON.parse(JSON.stringify(payload));
  saved.research = { kind: 'brand', brand: 'Other brand', mode: 'live', finding: { status: 'no_source' }, draft: null };
  const sections = approvedSections(saved);
  assert.deepEqual(Object.values(sections), payload.content.map(item=>item.text));
  const changed = draftFields({ content: [{ text: 'ویرایش مدیر' }, ...payload.content.slice(1)] }, saved);
  assert.deepEqual(changed.content.map(item=>item.approved), [false, true, true]);
  assert.equal(approvedSections(changed).identityHistory, undefined);
  assert.equal(approvedSections(changed).identityDesign, payload.content[1].text);
  const previous = process.env.MOTIF_SMART_PANEL;
  process.env.MOTIF_SMART_PANEL = 'store';
  const tx = { $queryRaw: async () => [{ version: 2, payload: saved }] };
  try {
    await checkTransfer(tx, { id: 'product' }, { brand: 'PUMA', identityDesign: sections.identityDesign },
      { id, version: 2, keys: ['identityDesign'] });
    await assert.rejects(checkTransfer(tx, { id: 'product', identityDesign: 'متن دستی' },
      { brand: 'PUMA', identityDesign: sections.identityDesign }, { id, version: 2, keys: ['identityDesign'] }), { code: 'C22_TRANSFER_STALE' });
    await assert.rejects(checkTransfer(tx, { id: 'product' }, { brand: 'PUMA', identityDesign: 'متن دستکاری‌شده' },
      { id, version: 2, keys: ['identityDesign'] }), { code: 'C22_TRANSFER_STALE' });
  } finally { if (previous === undefined) delete process.env.MOTIF_SMART_PANEL; else process.env.MOTIF_SMART_PANEL = previous; }
});

test('exact English options map without inventing blends or technical claims', () => {
  assert.equal(mapType('Jacket'), 'کاپشن');
  assert.equal(mapType('WINDBREAKER'), 'بادگیر');
  assert.equal(mapType('possibly a jacket'), null);
  assert.equal(mapFabric('100% POLYESTER'), 'پلی‌استر');
  assert.equal(mapFabric('polyamide'), 'پلی‌آمید');
  for (const input of ['GORE-TEX', 'waterproof polyester', '80% cotton 20% polyester', 'unknown']) assert.equal(mapFabric(input), null);
  const payload = { ...emptyPayload(), fabric: ['پلی‌استر'], sources: { fabric: 'label' }, gallery: [{ id }],
    analysis: [{ key: 'fabric', kind: 'label', value: '100% POLYESTER', evidence: 'SHELL 100% POLYESTER', imageId: id }] };
  assert.equal(reviewedFabric({ fabrics: [], fabricBasis: 'UNKNOWN' }, payload), 'پلی‌استر');
  assert.equal(reviewedFabric({ fabrics: ['پنبه'], fabricBasis: 'SELLER' }, payload), null);
});

test('final code format is shared and legacy aliases cannot create another number', async () => {
  assert.equal(codeKey(' motif-۰۱۳ '), 'MOTIF-13');
  assert.equal(codeKey('MOTIF-13'), codeKey('MOTIF-013'));
  assert.ok(valid('MOTIF-013')); assert.ok(valid('MOTIF-1000'));
  for (const code of ['MOTIF-13', 'MOTIF-000', 'MOTIF-0013', 'C22-PUMA-558798']) assert.equal(valid(code), false);
  const queries = [];
  const tx = { $queryRaw: async (...args) => { queries.push(args); return queries.length % 2 === 0 ? [{ id: 'legacy' }] : []; },
    smartCode: { findMany: async () => [] } };
  await assert.rejects(checkCode(tx, 'MOTIF-013', { final: true }), { code: 'MOTIF_CODE_TAKEN' });
  await assert.rejects(checkCode(tx, 'MOTIF-13', { final: true }), { code: 'MOTIF_CODE_INVALID' });
  assert.equal(queries.length, 2);
});

test('quotes require pricing, expire, bind the operation and never reserve or call a provider', () => {
  const row = { id, version: 4 };
  const config = { key: 'fixture-only-signing-key', operations: ['analyze', 'research'], dailyLimit: 40,
    estimates: { analyze: 0.02, research: 0.03 }, dailyBudgetUsd: 1 };
  const usage = budget.summarize([{ operation: 'analyze', status: 'failed', usage: { estimateUsd: 0.02 } }], config);
  assert.equal(usage.remaining, 39); assert.equal(usage.unknownCosts, 1);
  const q = budget.quote(row, 'research', config, usage);
  assert.equal(q.requests, 1); assert.equal(q.estimateUsd, 0.03);
  assert.equal(budget.verifyQuote(q.token, row, 'research', config).estimateUsd, 0.03);
  assert.throws(()=>budget.verifyQuote(q.token, row, 'analyze', config), { code: 'AI_QUOTE_REQUIRED' });
  assert.throws(()=>budget.verifyQuote(q.token, { ...row, version: 5 }, 'research', config), { code: 'AI_QUOTE_REQUIRED' });
  assert.throws(()=>budget.verifyQuote(q.token, row, 'research', config, q.expires + 1), { code: 'AI_QUOTE_REQUIRED' });
  assert.throws(()=>budget.quote(row, 'research', { ...config, dailyBudgetUsd: null }, usage), { code: 'AI_BUDGET_REQUIRED' });
  assert.throws(()=>budget.quote(row, 'research', config, { ...usage, reservedUsd: 0.99 }), { code: 'AI_DAILY_LIMIT' });
  assert.throws(()=>budget.quote(row, 'research', { ...config, operations: [] }, usage), { code: 'AI_UNAVAILABLE' });
});

test('storage keeps JPEG/PNG bytes and MIME while retaining legacy WebP URLs', async () => {
  const sent = [];
  const env = { LIARA_ENDPOINT: 'https://storage.iran.liara.site', LIARA_BUCKET: 'fixture-images',
    LIARA_ACCESS_KEY: 'fixture-only', LIARA_SECRET_KEY: 'fixture-only', LIARA_PUBLIC_URL: 'https://photos.example.test' };
  const storage = createStorage(env, () => ({ send: async cmd => { sent.push(cmd.input); } }));
  for (const format of ['jpeg', 'png']) {
    const input = Buffer.from(format);
    const result = await storage.upload(input, { format, digest: 'a'.repeat(64) });
    assert.ok(storage.canRead(result.url)); assert.equal(sent.at(-1).Body, input);
    assert.equal(sent.at(-1).ContentType, 'image/' + format);
  }
  assert.ok(storage.canRead('https://photos.example.test/motif/products/' + id + '.webp'));
  assert.equal(storage.canRead('https://evil.test/motif/products/' + id + '.png'), false);
});
