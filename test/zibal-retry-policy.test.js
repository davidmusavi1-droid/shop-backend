const test = require('node:test');
const assert = require('node:assert/strict');
const { TTL, evidence, auditResponse } = require('../src/lib/zibal-retry-policy');
const issued = new Date(0), now = new Date(TTL);
const failed = { result: 100, status: 11, amount: 1000000, paidAt: null, verifiedAt: null };
test('confirmed status-11 finality requires full expiry and explicit null payment timestamps', () => {
  assert.equal(evidence(failed, 1000000, issued, new Date(TTL - 1)), 'UNKNOWN');
  assert.equal(evidence(failed, 1000000, issued, now), 'UNPAID');
  assert.equal(evidence(failed, 1000000, null, now), 'UNKNOWN');
  assert.equal(evidence({ ...failed, paidAt: undefined }, 1000000, issued, now), 'UNKNOWN');
  assert.equal(evidence({ ...failed, verifiedAt: undefined }, 1000000, issued, now), 'UNKNOWN');
});
test('paid, unverified, mismatched and missing amounts block retry', () => {
  for (const status of [1, 2]) assert.notEqual(evidence({ ...failed, status }, 1000000, issued, now), 'UNPAID');
  for (const amount of [undefined, '1000000', 1000001]) {
    assert.equal(evidence({ ...failed, amount }, 1000000, issued, now), 'UNKNOWN');
  }
  assert.equal(evidence({ ...failed, paidAt: '2026-11-19' }, 1000000, issued, now), 'REVIEW');
  assert.equal(evidence({ ...failed, refNumber: 1 }, 1000000, issued, now), 'REVIEW');
});
test('expired pending requires full 30 minutes and matching integer rials', () => {
  const r = { result: 100, status: -1, amount: 1000000 };
  assert.equal(evidence(r, 1000000, issued, new Date(TTL - 1)), 'OPEN');
  assert.equal(evidence(r, 1000000, issued, now), 'UNPAID');
  assert.equal(evidence(null, 1000000, issued, now), 'UNKNOWN');
  assert.equal(evidence({ ...r, result: 203 }, 1000000, issued, now), 'UNKNOWN');
});
test('audit strips merchant, card and arbitrary provider fields', () => {
  assert.deepEqual(auditResponse({ ...failed, merchant: 'secret', cardNumber: 'private', customer: 'private' }), failed);
});
