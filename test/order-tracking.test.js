const assert = require('node:assert/strict');
const test = require('node:test');
const { createTracking, createMockProvider } = require('../src/lib/order-tracking');

function fixture() {
  const rows = [];
  const sent = [];
  const phone = '09120000000';
  const orderId = 'sample-order';
  let time = Date.now();
  let queue = Promise.resolve();

  function matches(row, where) {
    return Object.entries(where).every(([key, filter]) => {
      if (!filter || typeof filter !== 'object') return row[key] === filter;
      if ('gt' in filter) return row[key] > filter.gt;
      if ('gte' in filter) return row[key] >= filter.gte;
      if ('lt' in filter) return row[key] < filter.lt;
      return false;
    });
  }
  const table = {
    async findFirst({ where, orderBy }) {
      const candidates = rows.filter(row => matches(row, where));
      if (orderBy) candidates.sort((a, b) => b.createdAt - a.createdAt);
      return candidates[0] && { ...candidates[0] };
    },
    async count({ where }) { return rows.filter(row => matches(row, where)).length; },
    async create({ data }) { rows.push({ attempts: 0, consumedAt: null, ...data }); },
    async deleteMany({ where }) {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
    },
    async updateMany({ where, data }) {
      const selected = rows.filter(row => matches(row, where));
      for (const row of selected) {
        if (data.attempts) row.attempts += data.attempts.increment;
        else Object.assign(row, data);
      }
      return { count: selected.length };
    },
  };
  const prisma = {
    orderTrackingChallenge: table,
    checkoutReservation: {
      async findFirst({ where }) { return where.orderId === orderId && where.phone === phone ? { orderId } : null; },
    },
    order: {
      async findUnique() {
        return { id: orderId, status: 'SHIPPED', totalPrice: 500, shipmentTrackingCode: 'sample', payment: { isSuccessful: true } };
      },
    },
    $transaction(callback) {
      const result = queue.then(() => callback({ orderTrackingChallenge: table, $queryRaw() {} }));
      queue = result.catch(() => {});
      return result;
    },
  };
  const tracking = createTracking({
    prisma, provider: createMockProvider(message => sent.push(message)),
    secret: 'a'.repeat(32), now: () => time,
  });
  return { tracking, rows, sent, phone, orderId, advance(minutes) { time += minutes * 60000; } };
}

test('only matching order and mobile create a challenge; correct OTP succeeds once', async () => {
  const f = fixture();
  const fake = await f.tracking.issue(f.orderId, '09120000001');
  assert.ok(fake.challengeId);
  assert.equal(f.sent.length, 0);
  const { challengeId } = await f.tracking.issue(f.orderId, f.phone);
  const { token } = f.sent[0];
  assert.notEqual(f.rows[0].tokenHash, token);
  const results = await Promise.all([f.tracking.verify(challengeId, token), f.tracking.verify(challengeId, token)]);
  assert.deepEqual(results.filter(Boolean), [{
    orderNumber: f.orderId, status: 'SHIPPED', totalPrice: 500, shipmentTrackingCode: 'sample', paid: true,
  }]);
});

test('OTP expires and five incorrect attempts exhaust another challenge', async () => {
  const f = fixture();
  let result = await f.tracking.issue(f.orderId, f.phone);
  f.advance(5);
  assert.equal(await f.tracking.verify(result.challengeId, f.sent[0].token), null);
  result = await f.tracking.issue(f.orderId, f.phone);
  const correct = f.sent[1].token;
  const wrong = correct === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal(await f.tracking.verify(result.challengeId, wrong), null);
  assert.equal(f.rows[1].attempts, 5);
  assert.equal(await f.tracking.verify(result.challengeId, correct), null);
});

test('concurrent resend is throttled, old code is replaced, hourly limit applies', async () => {
  const f = fixture();
  const first = await f.tracking.issue(f.orderId, f.phone);
  await Promise.all([f.tracking.issue(f.orderId, f.phone), f.tracking.issue(f.orderId, f.phone)]);
  assert.equal(f.sent.length, 1);
  f.advance(1);
  await f.tracking.issue(f.orderId, f.phone);
  assert.equal(await f.tracking.verify(first.challengeId, f.sent[0].token), null);
  f.advance(1);
  await f.tracking.issue(f.orderId, f.phone);
  f.advance(1);
  await f.tracking.issue(f.orderId, f.phone);
  assert.equal(f.sent.length, 3);
});
