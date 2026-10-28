const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStorage, readConfig } = require('../src/lib/image-storage');
const { prepareImage, MAX_IMAGE_BYTES } = require('../src/lib/product-image');

const env = { LIARA_ENDPOINT: 'https://storage.example.liara.cloud', LIARA_BUCKET: 'motif-images',
  LIARA_ACCESS_KEY: 'test-key', LIARA_SECRET_KEY: 'test-secret', LIARA_PUBLIC_URL: 'https://photos.example.test/motif-images' };

test('storage fails closed for missing or foreign configuration; never uses Cloudinary or AWS defaults', () => {
  for (const invalid of [{}, { CLOUDINARY_URL: 'secret' }, { ...env, LIARA_SECRET_KEY: '' },
    { ...env, LIARA_ENDPOINT: 'https://s3.amazonaws.com' }, { ...env, LIARA_ENDPOINT: 'http://storage.example.liara.cloud' },
    { ...env, LIARA_PUBLIC_URL: 'https://user:secret@example.test' }, { ...env, LIARA_PUBLIC_URL: 'https://example.test?key=secret' },
    { ...env, LIARA_ENDPOINT: 'https://storage.liara.cloud.evil.test' }]) {
    assert.equal(createStorage(invalid, () => { throw Error('Must not create client'); }).configured, false);
  }
});
test('configuration families do not mix account credentials', () => {
  assert.equal(readConfig({ ...env, LIARA_SECRET_KEY: '', S3_SECRET_KEY: 'other-account' }), null);
  assert.equal(readConfig(env).bucket, 'motif-images');
});
test('S3 writes sanitized bytes with unique names, content type and a persistent public URL', async () => {
  let options; const sent = [];
  const provider = createStorage(env, config => { options = config; return { async send(command, request) { sent.push(command.input); assert.ok(request.abortSignal); } }; });
  const buffer = Buffer.from('sanitized-webp');
  const first = await provider.upload(buffer), second = await provider.upload(buffer);
  assert.equal(options.endpoint, env.LIARA_ENDPOINT);
  assert.equal(options.forcePathStyle, true);
  assert.deepEqual(options.credentials, { accessKeyId: 'test-key', secretAccessKey: 'test-secret' });
  assert.equal(sent[0].Bucket, 'motif-images'); assert.equal(sent[0].Body, buffer);
  assert.equal(sent[0].ContentType, 'image/webp'); assert.equal(sent[0].ContentLength, buffer.length);
  assert.notEqual(first.url, second.url);
  assert.equal(first.url, `${env.LIARA_PUBLIC_URL}/${sent[0].Key}`);
  assert.ok(!first.url.includes('test-secret'));
});

test('image budget lowers quality only as needed and accepts photos larger than 1 MB', async () => {
  const qualities = [];
  const picture = { metadata: async () => ({ format: 'jpeg' }), clone() { return this; }, rotate() { return this; },
    resize() { return this; }, webp({ quality }) { qualities.push(quality); return this; },
    async toBuffer() { return { data: Buffer.alloc(qualities.length === 1 ? MAX_IMAGE_BYTES + 1 : 2500000), info: { width: 3200, height: 2400 } }; } };
  const result = await prepareImage(Buffer.from('source'), () => picture);
  assert.deepEqual(qualities, [95, 92]); assert.equal(result.buffer.length, 2500000);
});
test('oversized detailed photos are rejected instead of silently compressing at very low quality', async () => {
  const picture = { metadata: async () => ({ format: 'jpeg' }), clone() { return this; }, rotate() { return this; },
    resize() { return this; }, webp() { return this; }, async toBuffer() { return { data: Buffer.alloc(MAX_IMAGE_BYTES + 1), info: {} }; } };
  await assert.rejects(prepareImage(Buffer.from('source'), () => picture), { code: 'IMAGE_TOO_LARGE' });
});
