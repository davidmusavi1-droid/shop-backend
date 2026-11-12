const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('node:crypto');

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid storage URL');
  return url;
}

// Select a complete configuration family; never combine keys from different accounts.
function readConfig(env) {
  for (const prefix of ['LIARA', 'S3']) {
    const accessKeyId = env[`${prefix}_ACCESS_KEY_ID`] || env[`${prefix}_ACCESS_KEY`];
    const secretAccessKey = env[`${prefix}_SECRET_ACCESS_KEY`] || env[`${prefix}_SECRET_KEY`];
    const endpoint = env[`${prefix}_ENDPOINT`];
    const bucket = env[`${prefix}_BUCKET`] || env[`${prefix}_BUCKET_NAME`];
    const publicUrl = env[`${prefix}_PUBLIC_URL`] || env[`${prefix}_PUBLIC_BASE_URL`];
    if (![accessKeyId, secretAccessKey, endpoint, bucket, publicUrl].every(Boolean)) continue;
    try {
      const target = httpsUrl(endpoint);
      // Explicit Liara endpoint only: no implicit AWS or Cloudinary fallback.
      if (!['liara.cloud', 'liara.space', 'liara.ir', 'liara.site'].some(domain => target.hostname.endsWith('.' + domain))) continue;
      if (target.pathname !== '/' || target.port) continue;
      httpsUrl(publicUrl);
      if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) continue;
      return { endpoint: target.origin, bucket, publicUrl: publicUrl.replace(/\/+$/, ''),
        region: env[`${prefix}_REGION`] || 'us-east-1', credentials: { accessKeyId, secretAccessKey } };
    } catch { /* Fail closed without printing credentials. */ }
  }
  return null;
}

function createStorage(env = process.env, makeClient = options => new S3Client(options)) {
  const config = readConfig(env);
  if (!config) return { configured: false };
  const client = makeClient({ endpoint: config.endpoint, region: config.region, credentials: config.credentials,
    forcePathStyle: true, maxAttempts: 2, requestChecksumCalculation: 'WHEN_REQUIRED' });
  const keyFor = url => {
    if (typeof url !== 'string' || !url.startsWith(config.publicUrl + '/')) return null;
    const key = url.slice(config.publicUrl.length + 1);
    return /^motif\/products\/[0-9a-f-]{36}\.webp$/.test(key) ? key : null;
  };
  return {
    configured: true,
    canRead: url => Boolean(keyFor(url)),
    async read(url, maxBytes) {
      const key = keyFor(url);
      if (!key) throw new Error('Invalid product image');
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) });
      const chunks = [];
      let size = 0;
      for await (const chunk of result.Body) {
        size += chunk.length;
        if (size > maxBytes) throw new Error('Product image exceeds the limit');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, size);
    },
    async upload(buffer) {
      const key = `motif/products/${randomUUID()}.webp`;
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: buffer,
        ContentType: 'image/webp', ContentLength: buffer.length, CacheControl: 'public, max-age=31536000, immutable' }),
      { abortSignal: AbortSignal.timeout(60000) });
      return { url: `${config.publicUrl}/${key}` };
    }
  };
}
module.exports = { createStorage, readConfig };
