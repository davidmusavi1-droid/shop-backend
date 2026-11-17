'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertTestEnvironment } = require('../src/lib/smart-panel/test-environment');
const V = require('../src/lib/smart-panel/validation');

test('smart panel guard rejects production, external endpoints and cloud credentials', () => {
  const isolated = {
    MOTIF_SMART_PANEL:'test', NODE_ENV:'test', PORT:'4189',
    DATABASE_URL:'postgresql://motif_smart_test@127.0.0.1:55473/motif_smart_test',
    ADMIN_ORIGIN:'http://127.0.0.1:4189', ADMIN_TOKEN:'smart-test-' + 'a'.repeat(40),
  };
  assert.equal(assertTestEnvironment(isolated).database, 'motif_smart_test');
  for (const change of [
    { NODE_ENV:'production' }, { S3_BUCKET:'anything' },
    { DATABASE_URL:isolated.DATABASE_URL.replace('127.0.0.1','example.invalid') },
    { DATABASE_URL:isolated.DATABASE_URL.replace('/motif_smart_test','/motif') },
    { DATABASE_URL:isolated.DATABASE_URL + '?host=example.invalid' },
    { DIRECT_URL:isolated.DATABASE_URL }, { ADMIN_ORIGIN:'https://motifdress.com' },
  ]) assert.throws(() => assertTestEnvironment({ ...isolated, ...change }), /isolated loopback/);
});

test('draft fields preserve empty values and normalize measurements without deriving circumference', () => {
  const empty = V.emptyPayload();
  const result = V.draftFields({ type:'شلوار', waist:'۴۲٫۵', stock:'۰', price:'۲٬۴۵۰٬۰۰۰', fabric:['پلی‌آمید','پلی‌آمید'] }, empty);
  assert.equal(result.waist,'42.5');
  assert.equal(result.waistCircumference,'');
  assert.equal(result.stock,'0');
  assert.equal(result.price,'2450000');
  assert.deepEqual(result.fabric,['پلی‌آمید']);
  assert.throws(() => V.draftFields({ phase:'approved' },empty), { code:'INVALID_INPUT' });
  assert.throws(() => V.draftFields({ stock:'-1' },empty), { code:'INVALID_INPUT' });
});

test('gallery allows one private file in multiple groups and rejects external ownership', () => {
  const gallery=[{id:'a',groups:['product','label','defect']}];
  assert.deepEqual(V.galleryFields({gallery,mainImage:'a'},[{id:'a'}]),{gallery,mainImage:'a'});
  assert.throws(() => V.galleryFields({gallery,mainImage:'a'},[{id:'b'}]),{code:'INVALID_INPUT'});
  assert.throws(() => V.galleryFields({gallery,mainImage:'b'},[{id:'a'}]),{code:'INVALID_INPUT'});
});

test('editing text removes independent approval, and checked grades require applicable defect data', () => {
  const payload=V.emptyPayload();
  payload.content[0]={text:'قدیمی',approved:true};
  const result=V.draftFields({content:[{text:'جدید',approved:true},{text:''},{text:''}]},payload);
  assert.equal(result.content[0].approved,false);
  assert.equal(V.normalizeCode(' motif-۰١۶ '),'MOTIF-016');
  assert.equal(V.approvalIssues({...result,grade:'A+'},'MOTIF-016').includes('defectImage'),false);
  assert.equal(V.approvalIssues({...result,grade:'B',defect:'لکه'},'MOTIF-016').includes('defectImage'),true);
  assert.equal(V.approvalIssues({...result,grade:'C'},'MOTIF-016').includes('defectImage'),true);
});
