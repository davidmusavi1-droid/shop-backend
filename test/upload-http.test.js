const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const { createRouter } = require('../src/routes/uploads');
const { prepareImage, MAX_IMAGE_BYTES } = require('../src/lib/product-image');

test('HTTP upload enforces authentication, formats, limits, missing config and safe provider failures', async () => {
  const previous = process.env.ADMIN_TOKEN; process.env.ADMIN_TOKEN = 'upload-test-only';
  const received = []; let failure = false, hold = false, release;
  const provider = { configured: true, async upload(buffer) {
    if (hold) await new Promise(resolve => { release = resolve; });
    if (failure) throw Error('SECRET');
    received.push(buffer); return { url: 'https://images.example.test/photo.webp' };
  }};
  const app = express(); app.use('/api/uploads', createRouter({ provider }));
  app.use('/missing', createRouter({ env: {} }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function upload(buffer, token = 'upload-test-only', path = '/api/uploads/images') {
    const form = new FormData(); if (buffer) form.append('image', new Blob([buffer]), 'photo.jpg');
    return fetch(base + path, { method: 'POST', headers: { 'X-Admin-Token': token }, body: form });
  }
  try {
    const photo = await sharp({ create: { width: 4000, height: 100, channels: 3, background: 'red' } }).jpeg().withMetadata().toBuffer();
    assert.equal((await upload(photo, 'wrong')).status, 403);
    assert.equal((await upload(photo, 'upload-test-only', '/missing/images')).status, 503);
    assert.equal((await upload(null)).status, 400);
    assert.equal((await upload(Buffer.from('<svg></svg>'))).status, 400);
    assert.equal((await upload(Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
    const result = await upload(photo); assert.equal(result.status, 201); assert.equal(received.length, 1);
    const metadata = await sharp(received[0]).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 3200); assert.equal(metadata.exif, undefined);
    assert.ok(received[0].length <= MAX_IMAGE_BYTES);
    assert.equal((await result.json()).width, metadata.width);
    failure = true;
    const failed = await upload(photo); assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes('SECRET'));
    failure = false; assert.equal((await upload(photo)).status, 201);
    hold = true; const first = upload(photo);
    while (!release) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await upload(photo)).status, 429);
    hold = false; release(); assert.equal((await first).status, 201);
  } finally {
    if (release) release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = previous;
  }
});

test('small images retain dimensions; EXIF rotation is applied without keeping metadata', async () => {
  const small = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'blue' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await prepareImage(small); const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.width, 80); assert.equal(metadata.height, 120);
  assert.equal(metadata.orientation, undefined); assert.equal(metadata.exif, undefined);
});
