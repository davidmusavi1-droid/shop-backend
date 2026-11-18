'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reviewedFabric } = require('../src/lib/smart-panel/store');

test('transfers only an accepted, evidenced fabric into a wholly empty product', () => {
  const product = { fabrics: [], fabricBasis: 'UNKNOWN' };
  const observation = { key: 'fabric', kind: 'label', value: '۱۰۰٪ پلی‌استر',
    evidence: 'SHELL 100% POLYESTER', imageId: 'label' };
  const draft = { fabric: [observation.value], sources: { fabric: 'label' },
    analysis: [observation], gallery: [{ id: 'label' }] };
  assert.equal(reviewedFabric(product, JSON.parse(JSON.stringify(draft))), 'پلی‌استر');
  for (const existing of [{ fabrics: ['پنبه'] }, { mainFabric: 'نایلون' },
    { complementaryFabrics: ['پنبه'] }, { fabricNote: 'مشخصات دستی' }, { fabricBasis: 'SELLER' }]) {
    assert.equal(reviewedFabric({ ...product, ...existing }, draft), null);
  }
  assert.equal(reviewedFabric(product, { ...draft, sources: { fabric: 'manual' } }), null);
  assert.equal(reviewedFabric(product, { ...draft, gallery: [] }), null);
  assert.equal(reviewedFabric(product, { ...draft, fabric: ['پنبه'] }), null);
});
