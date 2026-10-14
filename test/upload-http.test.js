const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const { createRouter } = require('../src/routes/uploads');
test('real multipart and image decoder enforce authentication, limits and photo formats', async () => {
  process.env.ADMIN_TOKEN = 'upload-test-only';
  const received = [];
  const provider = { config: () => ({ cloud_name: 'test', api_key: 'test', api_secret: 'test' }), uploader: {
    upload_stream(opts, cb) { return { on() {}, end(buffer) { received.push(buffer); cb(null, { secure_url: 'https://example.test/photo.webp' }); } }; }
  }};
  const app = express(); app.use('/api/uploads', createRouter({ provider }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/uploads/images`;
  async function upload(buffer, token = 'upload-test-only') {
    const form = new FormData(); form.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'photo.jpg');
    return fetch(url, { method: 'POST', headers: { 'X-Admin-Token': token }, body: form });
  }
  try {
    const photo = await sharp({ create: { width: 2200, height: 100, channels: 3, background: 'red' } }).jpeg().withMetadata().toBuffer();
    assert.equal((await upload(photo, 'wrong')).status, 403);
    assert.equal((await upload(Buffer.from('<svg></svg>'))).status, 400);
    assert.equal((await upload(Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
    const result = await upload(photo); assert.equal(result.status, 201); assert.equal(received.length, 1);
    const metadata = await sharp(received[0]).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 2000); assert.equal(metadata.exif, undefined);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); delete process.env.ADMIN_TOKEN; }
});
