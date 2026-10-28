const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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
      if (!['liara.cloud', 'liara.space', 'liara.ir'].some(domain => target.hostname.endsWith('.' + domain))) continue;
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
  return {
    configured: true,
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
