const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ configured = true, parseError, invalid = false, failure = false } = {}) {
  let handlers, decoded = false, sent = false, options;
  const provider = { config: () => configured ? { cloud_name: 'test', api_key: 'test', api_secret: 'test' } : {}, uploader: {
    upload_stream(opts, cb) { options = opts; return { on() {}, end(buffer) { sent = true; assert.equal(buffer.toString(), 'safe'); cb(failure ? new Error('SECRET') : null, { secure_url: 'https://images.test/photo.webp', width: 10, height: 10 }); } }; }
  }};
  const picture = { metadata: async () => ({ format: invalid ? 'svg' : 'jpeg' }), rotate() { return this; }, resize() { return this; }, webp() { return this; }, async toBuffer() { return Buffer.from('safe'); } };
  const admin = () => {};
  const multer = () => ({ single: () => (req, res, cb) => cb(parseError) }); multer.memoryStorage = () => ({});
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('src/routes/uploads.js', 'utf8'), { module, require(name) {
    return ({ express: { Router: () => ({ post(path, ...args) { handlers = args; } }) }, multer, sharp: () => { decoded = true; return picture; }, cloudinary: { v2: provider }, '../middleware/requireAdmin': admin })[name];
  }});
  assert.equal(handlers[0], admin, 'admin guard precedes multipart parsing');
  const res = { statusCode: 200, set() {}, status(n) { this.statusCode = n; return this; }, json(data) { this.data = data; return this; } };
  return { run: async (file = { buffer: Buffer.from('untrusted') }) => { handlers[1]({ file }, res); await new Promise(resolve => setImmediate(resolve)); return res; }, state: () => ({ decoded, sent, options }) };
}
test('upload fails closed until storage is configured', async () => {
  const t = setup({ configured: false }); assert.equal((await t.run()).statusCode, 503); assert.equal(t.state().decoded, false);
});
test('size limit is a clear 413 response', async () => {
  const t = setup({ parseError: { code: 'LIMIT_FILE_SIZE' } }); assert.equal((await t.run()).statusCode, 413); assert.equal(t.state().sent, false);
});
test('decoded non-photo content is rejected before cloud upload', async () => {
  const t = setup({ invalid: true }); assert.equal((await t.run()).statusCode, 400); assert.equal(t.state().sent, false);
});
test('only sanitized image bytes reach provider and HTTPS URL is returned', async () => {
  const t = setup(); const res = await t.run(); assert.equal(res.statusCode, 201); assert.equal(res.data.url, 'https://images.test/photo.webp'); assert.equal(t.state().options.folder, 'motif/products');
});
test('provider error does not expose credentials and next request can retry', async () => {
  const t = setup({ failure: true }); const res = await t.run(); assert.equal(res.statusCode, 502); assert.ok(!JSON.stringify(res.data).includes('SECRET')); assert.equal((await t.run()).statusCode, 502);
});
