const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminSessions, settings } = require('../src/lib/admin-session');
const createRouter = require('../src/routes/admin-session');
const { memoryDb } = require('./session-fixture.cjs');

const minute = 60_000;
const start = Date.UTC(2026, 0, 1);
const origin = 'https://motifdress.com';
const password = 'disposable-test-password';
const expired = 'نشست مدیریت شما به پایان رسیده است. لطفاً دوباره وارد شوید.';

test('server-side admin sessions with an injected clock and real HTTP', async t => {
  const realDb = process.env.MOTIF_SESSION_TEST_DB === '1';
  let prisma;
  if (realDb) {
    const url = new URL(process.env.DATABASE_URL);
    assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/motif_test');
    prisma = new (require('@prisma/client').PrismaClient)();
    assert.equal(await prisma.adminSession.count(), 0, 'Expected a clean CI database');
  } else prisma = memoryDb();

  let now = start;
  const env = { ADMIN_TOKEN: password };
  const app = express();
  const sessions = createAdminSessions({ prisma, env, clock: () => now });
  const route = '/api/admin/session';
  app.use(express.json());
  app.use(route, createRouter(sessions));
  app.post('/write', sessions.configured, sessions.authenticate({ extend: true }), (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (path, { method = 'GET', headers, body } = {}) => fetch(base + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  async function login(headers = {}, secret = password) {
    const response = await call(route + '/login', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: { password: secret },
    });
    const cookie = response.headers.get('set-cookie');
    const state = await response.json();
    return { response, cookie, state, headers: { Origin: origin, Cookie: cookie?.split(';')[0], 'X-Admin-CSRF': state.csrf } };
  }
  const status = headers => call(route, { headers });
  const post = (path, headers) => call(path, { method: 'POST', headers });
  const go = value => { now = start + value * minute; };
  try {
    await t.test('requires exact origin, rejects the old reusable header, and issues a protected cookie', async () => {
      assert.equal((await status({ 'X-Admin-Token': password })).status, 401);
      assert.equal((await login({ Origin: 'https://motifdress.com.evil.test' })).response.status, 403);
      assert.equal((await login({ 'Sec-Fetch-Site': 'cross-site' })).response.status, 403);
      assert.equal((await login({}, 'wrong')).response.status, 403);
      const { response, cookie, state, headers } = await login();
      assert.equal(response.status, 200);
      assert.match(cookie, /^__Host-motif-admin=[A-Za-z0-9_-]{43};/);
      for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=43200'])
        assert(cookie.includes(flag));
      assert(!cookie.includes('Domain='));
      assert(!JSON.stringify(state).includes(headers.Cookie.split('=')[1]));
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await status({ Cookie: headers.Cookie + '; ' + headers.Cookie })).status, 401);
      assert.throws(() => settings({ ADMIN_ORIGIN: 'http://motifdress.com' }));
      assert.throws(() => settings({ NODE_ENV: 'production', ADMIN_ORIGIN: 'http://127.0.0.1:4187' }));
    });
    await t.test('status reads at 10, 30, and 50 minutes do not extend the deadline', async () => {
      go(0);
      const { headers } = await login();
      for (const elapsed of [10, 30, 50, 59.99]) {
        go(elapsed);
        const response = await status(headers);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).remainingMs, Math.round((60 - elapsed) * minute));
      }
      go(60);
      const response = await status(headers);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { code: 'SESSION_EXPIRED', error: expired });
      assert.equal((await post(route + '/activity', headers)).status, 401);
    });
    await t.test('valid activity extends from server time; wrong origin and CSRF cannot extend it', async () => {
      go(100);
      const { headers } = await login();
      go(150);
      for (const invalid of [
        { ...headers, Origin: 'https://evil.test' },
        { ...headers, 'X-Admin-CSRF': '' },
        { ...headers, 'X-Admin-CSRF': 'wrong' },
      ]) assert.equal((await post(route + '/activity', invalid)).status, 403);
      assert.equal((await (await status(headers)).json()).remainingMs, 10 * minute);
      assert.equal((await (await post(route + '/activity', headers)).json()).remainingMs, 60 * minute);
      go(170);
      assert.equal((await post('/write', headers)).status, 204);
      go(229);
      assert.equal((await status(headers)).status, 200);
      go(230);
      assert.equal((await status(headers)).status, 401);
    });
    await t.test('concurrent updates obey the 12-hour cap and cannot recreate a revoked session', async () => {
      go(300);
      const { headers } = await login();
      for (let elapsed = 50; elapsed <= 700; elapsed += 50) {
        go(300 + elapsed);
        const results = await Promise.all([post(route + '/activity', headers), post(route + '/activity', headers)]);
        assert.deepEqual(results.map(result => result.status), [200, 200]);
      }
      assert.equal((await (await status(headers)).json()).remainingMs, 20 * minute);
      go(1020);
      assert.equal((await post(route + '/activity', headers)).status, 401);

      const live = await login();
      const [logout] = await Promise.all([post(route + '/logout', live.headers), post(route + '/activity', live.headers)]);
      assert.equal(logout.status, 204);
      assert.match(logout.headers.get('set-cookie'), /__Host-motif-admin=;/);
      assert.equal((await status(live.headers)).status, 401);
      assert.equal((await post('/write', live.headers)).status, 401);
    });
    await t.test('new login rotates the cookie, and changing the configured password invalidates previous sessions', async () => {
      const old = await login();
      const newer = await login({ Cookie: old.headers.Cookie });
      assert.notEqual(newer.headers.Cookie, old.headers.Cookie);
      assert.equal((await status(old.headers)).status, 401);
      assert.equal((await status(newer.headers)).status, 200);
      env.ADMIN_TOKEN = 'replacement';
      assert.equal((await post('/write', newer.headers)).status, 401);
      env.ADMIN_TOKEN = password;
    });
    await t.test('wrong passwords are rate limited and a later window allows login', async () => {
      go(1040);
      for (let i = 0; i < 20; i++) assert.equal((await login({}, 'wrong')).response.status, 403);
      const blocked = await login();
      assert.equal(blocked.response.status, 429);
      assert.equal(blocked.response.headers.get('retry-after'), '900');
      go(1055);
      assert.equal((await login()).response.status, 200);
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (realDb) {
      await prisma.adminSession.deleteMany();
      await prisma.$disconnect();
    }
  }
});
