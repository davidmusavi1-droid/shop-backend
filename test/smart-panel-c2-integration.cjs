'use strict';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { assertTestEnvironment, verifyTestDatabase } = require('../src/lib/smart-panel/test-environment');
const { liaraProvider } = require('../src/lib/smart-panel/liara');
const db = require('../src/lib/prisma');
const requireAdmin = require('../src/middleware/requireAdmin');
const { createRouter } = require('../src/routes/smart-panel');

const target = assertTestEnvironment();
assert.equal(target.database, 'motif_smart_test_c02');
assert.ok(process.env.C02_FIXTURES_DIR, 'Unpack the approved C02 synthetic pilot archive and set C02_FIXTURES_DIR.');
const origin = process.env.ADMIN_ORIGIN;
const base = '/api/admin/smart-panel';
const cfg = { model: 'google/gemini-2.5-flash', researchModel: 'perplexity/sonar',
  endpoint: 'https://fake-c2.test/never-connected', key: 'fake-local-C02-key', expiresAt: Date.now() + 3_600_000, operations: ['analyze', 'research'] };
const filenames = ['C02-01-brand.jpg', 'C02-02-label.jpg', 'C02-03-overview.jpg'];
const fields = { name: 'پروندهٔ ساختگی', type: 'نوع ثبت‌شده توسط مدیر', price: '470000', stock: '1', grade: 'B', defect: 'ایراد نمونه', chest: '54' };
const result = {
  brand: { value: 'THE NORTH FACE', image: 1, evidence: 'THE NORTH FACE' },
  labelSize: { value: 'XL', image: 2, evidence: 'SIZE: XL' },
  fabric: { value: '۱۰۰٪ پلی‌استر', image: 2, evidence: 'SHELL: 100% POLYESTER' },
  type: { value: 'کاپشن', image: 3, evidence: 'نمای جلو با آستین‌ها، خط بازشوی میانی و خطوط جیب' },
  authenticity: null, waterproofing: null, technology: null, commercialModel: null,
};
const url = 'https://www.thenorthface.com/en-us/about-us';
let server, cookie, csrf, files, count, respond, pumaMode;
const pumaFiles = ['01-1000050747.jpg', '02-1000050746.jpg', '03-1000050745.jpg', '04-1000050742.jpg'];
let pumaImages;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function providerResponse(content = result, extra = {}) {
  return Response.json({ id: 'test-response-id', choices: [{ finish_reason: 'stop',
    message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
  usage: { prompt_tokens: 869, completion_tokens: 183, total_tokens: 1052, total_cost_toman: 260 }, ...extra });
}

before(async () => {
  await verifyTestDatabase(db, target);
  assert.equal(await db.smartAiRun.count(), 0, 'Use a fresh disposable DB, never an existing pilot database.');
  files = await Promise.all(filenames.map(file => readFile(path.join(process.env.C02_FIXTURES_DIR, file))));
  const app = express();
  app.use(express.json());
  app.use('/api/admin/session', require('../src/routes/admin-session')(requireAdmin.sessions));
  const provider = liaraProvider(cfg, { timeoutMs: 1000, fetcher: (...args) => {
    count++;
    return respond(...args);
  } });
  const c02Router = createRouter(db, { ...target, c2: { ...cfg, provider } });
  let pumaRouter;
  if (process.env.PUMA_FIXTURES_DIR) {
    pumaImages = await Promise.all(pumaFiles.map(file => readFile(path.join(process.env.PUMA_FIXTURES_DIR, file))));
    const pumaConfig = { ...cfg, imageDigests: pumaImages.map(bytes => createHash('sha256').update(bytes).digest('hex')) };
    const pumaProvider = liaraProvider(pumaConfig, { timeoutMs: 1000, fetcher: (...args) => {
      count++;
      return respond(...args);
    } });
    pumaRouter = createRouter(db, { ...target, c2: { ...pumaConfig, provider: pumaProvider } });
  }
  app.use(base, requireAdmin, (req, res, next) => (pumaMode ? pumaRouter : c02Router)(req, res, next));
  await new Promise((resolve, reject) => {
    server = app.listen(target.port, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const login = await fetch(origin + '/api/admin/session/login', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_TOKEN }) });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  csrf = (await login.json()).csrf;
});

beforeEach(async () => {
  await db.smartAiRun.deleteMany();
  count = 0;
  pumaMode = false;
  respond = async () => providerResponse();
});
after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await db.$disconnect();
});

async function call(route, method = 'GET', body, expected = 200, authenticated = true) {
  const headers = authenticated ? { Cookie: cookie, Origin: origin, 'X-Admin-CSRF': csrf } : {};
  if (body !== undefined) headers['Content-Type'] = Buffer.isBuffer(body) ? 'image/jpeg' : 'application/json';
  const response = await fetch(origin + base + route, {
    method, headers, body: Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
const route = p => '/dossiers/' + p.id;
const run = (p, operation = 'analyze', expected = 200) => call(route(p) + '/ai/c2/' + operation, 'POST', {
  version: p.version, ...(operation === 'research' ? { mode: 'live', labelConfirmed: true } : {}),
}, expected);
const reviewResearch = (p, action, expected = 200, input = {}) => call(route(p) + '/brand-research/' + action,
  'POST', { version: p.version, ...input }, expected);
const decide = (p, index, decision = 'approved') => reviewResearch(p, 'review-draft', 200, { index, decision });
const patch = (p, fields) => call(route(p), 'PATCH', { version: p.version, fields });
const tnf = p => patch(p, { brand: 'THE NORTH FACE', type: 'کاپشن', closure: 'زیپ کامل', uses: ['روزمره'] });
const claim = { claim: 'برند در سال ۱۹۶۶ از سان‌فرانسیسکو آغاز شد.', url, title: 'عنوان نمونه', evidence: 'متن نمونه',
  design: { claim: 'کاوش در طبیعت از ایده‌های اصلی برند است.', url, title: 'عنوان طراحی', evidence: 'شاهد جداگانهٔ طراحی' } };
const runs = async p => (await call(route(p) + '/ai/c2')).runs;
async function dossier(withImages = true) {
  let p = await call('/dossiers', 'POST', { id: randomUUID() }, 201);
  p = await call(route(p), 'PATCH', { version: p.version, fields });
  if (withImages) for (const index of [2, 0, 1]) {
    const query = new URLSearchParams({ version: p.version, name: filenames[index], imageId: randomUUID() });
    p = await call(route(p) + '/images?' + query, 'POST', files[index], 201);
  }
  return p;
}
function manualUnchanged(p) {
  for (const [field, value] of Object.entries(fields)) assert.equal(p[field], value);
  assert.equal(p.phase, 'draft');
  assert.equal(p.approvedVersion, null);
  assert.equal(p.publication, 'none');
}

test('C02 through Express and private JPG storage, JSON audit, manager-only acceptance and durable duplicate guard', async () => {
  const p = await dossier();
  const catalogBefore = await db.product.count();
  respond = async (_url, { body }) => {
    const request = JSON.parse(body);
    assert.equal(request.model, cfg.model);
    assert.deepEqual(request.messages[1].content.slice(1).map(item => item.image_url.url),
      files.map(file => 'data:image/jpeg;base64,' + file.toString('base64')));
    assert.doesNotMatch(body, /470000|پروندهٔ ساختگی|نوع ثبت‌شده توسط مدیر|ایراد نمونه/);
    return providerResponse();
  };
  const first = await run(p);
  const raw = await db.smartAiRun.findUniqueOrThrow({ where: { id: first.run.id }, select: { rawResponse: true } });
  assert.deepEqual(JSON.parse(JSON.parse(raw.rawResponse).choices[0].message.content), result);
  assert.equal(Object.hasOwn(first.run, 'rawResponse'), false);
  assert.equal(Object.hasOwn((await runs(p))[0], 'rawResponse'), false);
  assert.equal(first.run.status, 'completed');
  assert.equal(first.run.usage.requestId, 'test-response-id');
  assert.equal(first.run.usage.totalTokens, 1052);
  assert.equal(first.run.usage.costToman, 260);
  assert.equal(first.run.result.analysis.length, 4);
  assert.deepEqual(first.run.result.analysis.map(row => row.imageId), [1, 2, 2, 0].map(index => p.images[index].id));
  assert.deepEqual(first.run.result.analysis.find(row => row.key === 'type'), {
    key: 'type', value: result.type.value, imageId: p.images[0].id, kind: 'image', evidence: result.type.evidence,
  });
  manualUnchanged(first.dossier);
  assert.equal(first.dossier.brand, '');
  const duplicate = await run(first.dossier, 'analyze', 409);
  assert.equal(duplicate.code, 'AI_ALREADY_ATTEMPTED');
  const accepted = await call(route(p) + '/ai/accept', 'POST', { version: first.dossier.version, key: 'brand' });
  assert.equal(accepted.brand, 'THE NORTH FACE');
  manualUnchanged(accepted);
  assert.equal(await db.product.count(), catalogBefore);
  assert.equal(count, 1);
});

test('authentication, stale version and absent private C02 fixtures never call the provider', async () => {
  const p = await dossier(false);
  await call(route(p) + '/ai/c2/analyze', 'POST', { version: p.version }, 401, false);
  const stale = await run({ ...p, version: 0 }, 'analyze', 409);
  assert.equal(stale.code, 'VERSION_CONFLICT');
  await run(p, 'analyze', 400);
  assert.equal((await runs(p)).length, 0);
  assert.equal(count, 0);
  manualUnchanged(await call(route(p)));
});

test('failed 429 is audited, duplicate is blocked, manual edits can resume', async () => {
  const p = await dossier();
  respond = async () => new Response('provider private details', { status: 429 });
  const failure = await run(p, 'analyze', 429);
  assert.equal(failure.code, 'AI_RATE_LIMIT');
  assert.doesNotMatch(JSON.stringify(failure), /provider private details/);
  const after = await call(route(p));
  manualUnchanged(after);
  assert.equal(after.version, p.version);
  assert.equal(after.analysis, null);
  assert.equal((await runs(p))[0].status, 'failed');
  assert.equal((await run(p, 'analyze', 409)).code, 'AI_ALREADY_ATTEMPTED');
  const edited = await call(route(p), 'PATCH', { version: p.version, fields: { name: 'ادامهٔ فرم' } });
  assert.equal(edited.name, 'ادامهٔ فرم');
  assert.equal(count, 1);
});

test('corrupt and untrusted results cannot replace proposals or protected fields', async () => {
  const p = await dossier();
  respond = async () => providerResponse({ ...result, price: 1, stock: 99, grade: 'A', publish: true });
  assert.equal((await run(p, 'analyze', 502)).code, 'AI_INVALID_RESPONSE');
  const after = await call(route(p));
  manualUnchanged(after);
  assert.equal(after.analysis, null);
  assert.equal(after.version, p.version);
  const [attempt] = await runs(p);
  assert.equal(attempt.status, 'failed');
  assert.equal(attempt.usage.requestId, 'test-response-id');
});

test('concurrent duplicate and revision change cannot cause a second request or overwrite edits', async () => {
  const p = await dossier();
  const started = deferred();
  const release = deferred();
  respond = async () => { started.resolve(); await release.promise; return providerResponse(); };
  const pending = run(p, 'analyze', 409);
  await started.promise;
  try {
    assert.equal((await run(p, 'analyze', 409)).code, 'AI_ALREADY_ATTEMPTED');
    await call(route(p), 'PATCH', { version: p.version, fields: { price: '480000' } });
  } finally { release.resolve(); }
  assert.equal((await pending).code, 'VERSION_CONFLICT');
  const after = await call(route(p));
  assert.equal(after.price, '480000');
  assert.equal(after.analysis, null);
  assert.equal((await runs(p))[0].errorCode, 'VERSION_CONFLICT');
  assert.equal(count, 1);
});

test('research without images sends only the public brand and keeps drafts and publication under manager control', async () => {
  const p = await tnf(await dossier(false));
  const before = await db.product.count();
  respond = async (_url, { body }) => {
    assert.doesNotMatch(body, /470000|پروندهٔ ساختگی|ایراد نمونه|base64|MOTIF|زیپ کامل/);
    const request = JSON.parse(body);
    assert.equal(request.model, cfg.researchModel);
    assert.deepEqual(request.web_search_options, { search_context_size: 'low' });
    assert.equal(request.max_tokens, 480);
    return providerResponse(claim, { search_results: [{ url }] });
  };

  const response = await run(p, 'research');
  let edited = response.dossier;
  assert.equal(edited.analysis, null);
  assert.equal(response.run.result.status, 'pending_source_review');
  assert.equal(response.run.result.checkedAt, null);
  assert.equal(response.run.result.url, url);
  assert.equal(response.run.usage.costToman, 260);
  assert.equal(Object.hasOwn(response.run, 'rawResponse'), false);
  assert.equal(edited.research.id, response.run.id);
  assert.deepEqual(edited.content, p.content);
  assert.equal((await reviewResearch(edited, 'generate', 400)).code, 'INVALID_INPUT');
  assert.equal((await run(edited, 'research')).dossier.version, edited.version);
  assert.equal((await call(route(edited) + '/ai/research', 'POST', { version: edited.version }, 409)).code,
    'BRAND_RESEARCH_REQUIRED');

  edited = await reviewResearch(edited, 'verify-source');
  assert.equal(edited.research.finding.status, 'manager_verified');
  assert.equal(edited.research.finding.design.status, 'pending_source_review');
  await reviewResearch(edited, 'generate', 400);
  edited = await reviewResearch(edited, 'verify-source', 200, { claim: 'design' });
  edited = await reviewResearch(edited, 'generate');
  assert.deepEqual(edited.research.draft.sections, [
    claim.claim,
    claim.design.claim + '\nاین کاپشن زیپ سرتاسری دارد.',
    'برای پوشش روزمره پیشنهاد می‌شود.',
  ]);
  edited = await patch(edited, { content: [{ text: '' }, { text: 'توضیح دستی مدیر' }, { text: '' }] });
  edited = await call(route(edited) + '/content/1', 'POST', { version: edited.version, approve: true });
  await reviewResearch(edited, 'apply-draft', 400);
  edited = await decide(edited, 0);
  edited = await decide(edited, 1);
  edited = await decide(edited, 2);
  assert.deepEqual(edited.research.draft.decisions, ['approved', 'approved', 'approved']);
  edited = await decide(edited, 2, 'rejected');
  assert.deepEqual(edited.research.draft.decisions, ['approved', 'approved', 'rejected']);
  edited = await patch(edited, { researchDraft: {
    ...edited.researchDraft, sections: ['بازنویسی هویت با همان منبع', ...edited.researchDraft.sections.slice(1)],
  } });
  assert.deepEqual(edited.research.draft.decisions, ['pending', 'approved', 'rejected']);
  await reviewResearch(edited, 'apply-draft', 400);
  edited = await decide(edited, 0);
  edited = await reviewResearch(edited, 'apply-draft');
  assert.deepEqual(edited.content, [
    { text: 'بازنویسی هویت با همان منبع', approved: true },
    { text: 'توضیح دستی مدیر', approved: true },
    { text: '', approved: false },
  ]);
  assert.deepEqual(edited.research.draft.transferred, [true, false, false]);
  edited = await patch(edited, { content: edited.content.map((item, index) =>
    ({ text: index === 0 ? 'متن ویرایش‌شدهٔ مدیر' : item.text })) });
  edited = await call(route(edited) + '/content/0', 'POST', { version: edited.version, approve: true });
  assert.deepEqual(edited.content[0], { text: 'متن ویرایش‌شدهٔ مدیر', approved: true });
  assert.equal(edited.content[2].approved, false);
  for (const key of ['brand', 'price', 'stock', 'grade', 'defect', 'chest', 'publication', 'phase']) {
    assert.equal(edited[key], p[key], key);
  }
  assert.deepEqual(edited.images, p.images);
  await call(route(edited) + '/publish-test', 'POST', {}, 409);
  assert.equal(await db.product.count(), before);
  assert.equal(count, 1);
});

test('no source or rejected evidence never enters the brand section', async () => {
  for (const withSource of [false, true]) {
    await db.smartAiRun.deleteMany();
    let p = await tnf(await dossier(false));
    respond = async () => withSource ? providerResponse(claim, { citations: [url] }) : providerResponse(null);
    p = (await run(p, 'research')).dossier;
    if (withSource) {
      p = await reviewResearch(p, 'reject-source');
      p = await reviewResearch(p, 'reject-source', 200, { claim: 'design' });
    }
    assert.equal(p.research.finding.status, withSource ? 'rejected' : 'no_source');
    p = await reviewResearch(p, 'generate');
    assert.equal(p.research.draft.sections.length, 3);
    assert.equal(p.research.draft.sections[0], '');
    await reviewResearch(p, 'review-draft', 400, { index: 0, decision: 'approved' });
    assert.doesNotMatch(p.research.draft.sections[1], /کاوش در طبیعت/);
    p = await reviewResearch(p, 'reject-draft');
    assert.equal(p.research.draft.status, 'rejected');
    await reviewResearch(p, 'apply-draft', 409);
    assert.ok(p.content.every(item => item.text === ''));
  }
  assert.equal(count, 2);
});

test('missing brand or label, wrong mode and unsupported brand stop before the paid slot', async () => {
  let p = await dossier(false);
  assert.equal((await run(p, 'research', 422)).code, 'BRAND_LABEL_REQUIRED');
  p = await patch(p, { brand: 'فاقد برند مشخص' });
  assert.equal((await run(p, 'research', 422)).code, 'BRAND_LABEL_REQUIRED');
  p = await tnf(p);
  const endpoint = route(p) + '/ai/c2/research';
  assert.equal((await call(endpoint, 'POST', { version: p.version, mode: 'live', labelConfirmed: false }, 422)).code,
    'BRAND_LABEL_REQUIRED');
  await call(endpoint, 'POST', { version: p.version, mode: 'mock', labelConfirmed: true }, 400);
  p = await patch(p, { brand: 'برند دیگر' });
  assert.equal((await run(p, 'research', 422)).code, 'BRAND_SOURCE_POLICY_REQUIRED');
  assert.deepEqual(await runs(p), []);
  assert.equal(count, 0);
});

test('uncited response fails closed; the paid slot survives the error', async () => {
  const p = await tnf(await dossier(false));
  respond = async () => providerResponse(claim);
  assert.equal((await run(p, 'research', 502)).code, 'AI_INVALID_RESPONSE');
  assert.equal((await run(p, 'research', 409)).code, 'AI_ALREADY_ATTEMPTED');
  assert.deepEqual(await call(route(p)), p);
  assert.equal((await runs(p))[0].usage.requestId, 'test-response-id');
  assert.equal(count, 1);
});

test('an invalid stored source cannot be displayed as verified or supply text', async () => {
  const p = await tnf(await dossier(false));
  respond = async () => providerResponse(claim, { citations: [url] });
  const { dossier: researched } = await run(p, 'research');
  const row = await db.smartDossier.findUniqueOrThrow({ where: { id: p.id } });
  await db.smartDossier.update({ where: { id: p.id }, data: { payload: {
    ...row.payload, research: { ...row.payload.research, finding: {
      ...row.payload.research.finding, url: 'https://example.invalid/source', status: 'manager_verified',
    } },
  } } });
  const current = await call(route(researched));
  assert.equal(current.research.finding.url, null);
  assert.equal(current.research.finding.status, 'invalid_source');
  assert.equal(current.research.finding.design.status, 'pending_source_review');
  const rejected = await reviewResearch(current, 'reject-source', 200, { claim: 'design' });
  await reviewResearch(current, 'verify-source', 409);
  const generated = await reviewResearch(rejected, 'generate');
  assert.equal(generated.research.draft.sections[0], '');
  assert.doesNotMatch(generated.research.draft.sections[1], /کاوش در طبیعت/);
});

test('changed research subject or product evidence cannot apply a stale draft', async () => {
  let p = await tnf(await dossier(false));
  respond = async () => providerResponse(claim, { citations: [url] });
  p = (await run(p, 'research')).dossier;
  p = await reviewResearch(p, 'verify-source');
  p = await reviewResearch(p, 'verify-source', 200, { claim: 'design' });
  p = await reviewResearch(p, 'generate');
  p = await patch(p, { closure: 'دکمه' });
  assert.equal(p.research.draftCurrent, false);
  await reviewResearch(p, 'apply-draft', 409);
  p = await reviewResearch(p, 'generate');
  assert.match(p.research.draft.sections[1], /دکمه/);
  p = await patch(p, { brand: 'برند جدید' });
  assert.equal(p.research.current, false);
  await reviewResearch(p, 'apply-draft', 409);
  assert.equal(count, 1);
});

test('a changed private file and a forged protected-field suggestion are refused', async () => {
  const p = await dossier();
  await writeFile(path.join(target.storageDir, p.images[0].id + '.jpg'), files[0]);
  assert.equal((await run(p, 'analyze', 422)).code, 'AI_IMAGE_MISMATCH');
  assert.equal(count, 0);
  const original = await db.smartDossier.findUniqueOrThrow({ where: { id: p.id } });
  await db.smartDossier.update({ where: { id: p.id }, data: {
    payload: { ...original.payload, analysis: [{ key: 'price', value: '1', imageId: p.images[0].id, kind: 'image' }] },
  } });
  await call(route(p) + '/ai/accept', 'POST', { version: p.version, key: 'price' }, 400);
  assert.equal((await call(route(p))).price, fields.price);
});

test('network disconnect, timeout, incomplete JSON and empty evidence preserve manual values through the API', async () => {
  const p = await dossier();
  for (const [status, code, fixture] of [
    [503, 'AI_UNAVAILABLE', async () => { throw new TypeError('simulated disconnect'); }],
    [504, 'AI_TIMEOUT', (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })],
    [502, 'AI_INVALID_RESPONSE', async () => providerResponse('{')],
    [502, 'AI_INVALID_RESPONSE', async () => providerResponse({ ...result, brand: { ...result.brand, evidence: '' } })],
  ]) {
    await db.smartAiRun.deleteMany({ where: { dossierId: p.id } });
    respond = fixture;
    assert.equal((await run(p, 'analyze', status)).code, code);
    const current = await call(route(p));
    manualUnchanged(current);
    assert.equal(current.analysis, null);
    assert.equal(current.version, p.version);
    assert.equal((await runs(p))[0].errorCode, code);
    if (status === 502) {
      const audit = await db.smartAiRun.findUniqueOrThrow({ where: { operation_scope: { operation: 'analyze', scope: 'pilot' } } });
      assert.ok(audit.rawResponse, 'Invalid model output is retained privately');
    }
  }
  assert.equal(count, 4);
});


test('offline PUMA: conflicting labels, corrected style, independent citations and stale research', {
  skip: !process.env.PUMA_FIXTURES_DIR && 'Set PUMA_FIXTURES_DIR to the private four-photo fixture directory.',
}, async () => {
  pumaMode = true;
  let p = await dossier(false);
  for (const [index, bytes] of pumaImages.entries()) {
    const query = new URLSearchParams({ version: p.version, name: pumaFiles[index], imageId: randomUUID() });
    p = await call(route(p) + '/images?' + query, 'POST', bytes, 201);
  }
  assert.equal(p.canAnalyze, true);
  respond = async (_url, { body }) => {
    const [, ...images] = JSON.parse(body).messages[1].content;
    assert.equal(images.length, 4);
    return providerResponse({ ...result, brand: { value: 'PUMA', image: 3, evidence: 'PUMA' },
      labelObservations: [
        { key: 'country', value: 'China', image: 1, origin: 'sewn', evidence: 'MADE IN CHINA' },
        { key: 'country', value: 'Pakistan', image: 3, origin: 'hangtag', evidence: 'MADE IN PAKISTAN' },
        { key: 'styleNumber', value: '558700', image: 2, origin: 'sewn', evidence: 'STYLE NO. 558700' },
      ] });
  };
  p = (await run(p)).dossier;
  assert.deepEqual(p.labelObservations.map(({ key, origin, imageId }) =>
    [key, origin, p.images.find(image => image.id === imageId).name]), [
    ['country', 'sewn', pumaFiles[0]], ['country', 'hangtag', pumaFiles[2]], ['styleNumber', 'sewn', pumaFiles[1]],
  ]);
  assert.equal(p.country, '');
  assert.equal(p.styleNumber, '');
  p = await patch(p, { brand: 'PUMA', type: 'بادگیر', styleNumber: '۵۵۸۷۹۸',
    content: [{ text: 'متن مدیر' }, { text: '' }, { text: '' }] });
  assert.equal((await run(p, 'research', 422)).code, 'STYLE_CONFIRMATION_REQUIRED');
  assert.equal(count, 1);
  const confirm = (dossier, styleNumber = dossier.styleNumber, status = 200) => call(
    route(dossier) + '/style-confirmation', 'POST', { version: dossier.version, styleNumber }, status);
  await confirm(p, '558700', 400);
  p = await confirm(p);
  assert.equal(p.styleNumber, '558798');
  assert.equal(p.styleConfirmed, true);
  assert.equal(p.labelObservations[2].value, '558700');
  const identityUrl = 'https://about.puma.com/en/puma/puma-timeline';
  const designUrl = 'https://www.volvocars.com/intl/media/press-releases/2903CB8F0C3A8BFF/';
  const finding = {
    claim: 'PUMA در سال ۱۹۴۸ آغاز به کار کرد.', url: identityUrl, title: 'PUMA Timeline', evidence: '1948',
    design: { claim: 'PUMA تأمین‌کنندهٔ پوشاک Volvo Ocean Race بود.', url: designUrl,
      title: 'Volvo Ocean Race', evidence: 'official supplier of footwear, clothing and accessories' },
  };
  respond = async (_url, { body }) => {
    const input = JSON.parse(body).messages[1].content;
    assert.match(input, /"brand":"PUMA","styleNumber":"558798"/);
    assert.doesNotMatch(input, /558700|PAKISTAN|متن مدیر|base64/);
    const response = await providerResponse(finding).json();
    response.choices[0].message.annotations = [identityUrl, designUrl].map(url =>
      ({ type: 'url_citation', url_citation: { url } }));
    return Response.json(response);
  };
  p = (await run(p, 'research')).dossier;
  assert.equal(p.research.finding.url, identityUrl);
  assert.equal(p.research.finding.design.url, designUrl);
  p = await reviewResearch(p, 'verify-source');
  p = await reviewResearch(p, 'verify-source', 200, { claim: 'design' });
  p = await reviewResearch(p, 'generate');
  p = await decide(p, 0);
  p = await decide(p, 1);
  p = await reviewResearch(p, 'apply-draft');
  assert.equal(p.content[0].text, 'متن مدیر');
  assert.match(p.content[1].text, /Volvo Ocean Race/);
  p = await patch(p, { styleNumber: '558799' });
  assert.equal(p.styleConfirmed, false);
  assert.equal(p.research.current, false);
  p = await confirm(await patch(p, { styleNumber: '558798' }));
  assert.equal(p.research.current, false);
  assert.equal((await reviewResearch(p, 'generate', 409)).code, 'RESEARCH_STALE');
  assert.equal(count, 2);
});
