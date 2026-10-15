const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requestContext, errorHandler } = require('../src/lib/http-security');
const requireAdmin = require('../src/middleware/requireAdmin');

test('HTTP errors hide secrets; malformed input and admin data cannot be cached', async t => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'synthetic-test-token';
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '1kb' }));
  app.get('/private', requireAdmin, (req, res) => res.json({ ok: true }));
  app.post('/error', () => { throw Error('postgres://user:secret@private-db/customer-phone'); });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = previous;
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const logs = [], original = console.log;
  console.log = line => logs.push(line);
  t.after(() => { console.log = original; });
  let response = await fetch(url + '/error', { method: 'POST' });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  let body = await response.json();
  assert.equal(body.requestId, response.headers.get('x-request-id'));
  assert(!JSON.stringify(body).includes('secret'));
  response = await fetch(url + '/error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private":"secret"' });
  assert.equal(response.status, 400);
  assert(!(await response.text()).includes('secret'));
  response = await fetch(url + '/error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(2048) }) });
  assert.equal(response.status, 413);
  assert(!logs.join('\n').includes('secret'));
  assert(!logs.join('\n').includes('customer-phone'));
  // Successful authentication never consumes the failed-login budget.
  for (let i = 0; i < 25; i++) {
    response = await fetch(url + '/private', { headers: { 'X-Admin-Token': 'synthetic-test-token' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.text();
  }
  for (let i = 0; i < 20; i++) {
    response = await fetch(url + '/private', { headers: { 'X-Admin-Token': 'incorrect' } });
    assert.equal(response.status, 403);
    await response.text();
  }
  // Untrusted X-Forwarded-For cannot bypass the limiter in a direct app.
  response = await fetch(url + '/private', { headers: { 'X-Admin-Token': 'incorrect', 'X-Forwarded-For': '203.0.113.99' } });
  assert.equal(response.status, 429);
  assert(Number(response.headers.get('retry-after')) > 0);
  await response.text();
});
