const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const requireAdmin = require('../middleware/requireAdmin');

// Dependencies can be replaced in HTTP tests; production always uses the real provider.
function createRouter({ provider = cloudinary, decode = sharp, env = process.env } = {}) {
  // Prefer one complete credential set; never mix credentials from two accounts.
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    provider.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  }
  const router = express.Router();
  const parse = multer({ storage: multer.memoryStorage(), limits: {
    fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1
  }}).single('image');
  let busy = false;
  router.post('/images', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const config = provider.config();
    if (!config.cloud_name || !config.api_key || !config.api_secret) {
      return res.status(503).json({ error: 'فضای ذخیرهٔ عکس هنوز به سایت متصل نشده است.' });
    }
    if (busy) return res.status(429).json({ error: 'آپلود دیگری در حال انجام است؛ کمی بعد دوباره تلاش کنید.' });
    busy = true;
    // Release only when processing ends, including when the browser disconnects.
    parse(req, res, async err => {
      try {
        if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
          error: err.code === 'LIMIT_FILE_SIZE' ? 'حجم هر عکس باید حداکثر ۱۰ مگابایت باشد.' : 'هر بار فقط یک فایل عکس ارسال کنید.'
        });
        if (!req.file) return res.status(400).json({ error: 'یک عکس انتخاب کنید.' });
        let buffer;
        try {
          const picture = decode(req.file.buffer, { limitInputPixels: 50000000, failOn: 'warning' });
          const metadata = await picture.metadata();
          if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('format');
          // Decode and re-encode instead of trusting MIME/extension. No EXIF/GPS retained.
          buffer = await picture.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        } catch (_) {
          return res.status(400).json({ error: 'عکس معتبر JPG، PNG یا WebP انتخاب کنید (حداکثر ۵۰ مگاپیکسل).' });
        }
        if (res.destroyed) return;
        const result = await new Promise((resolve, reject) => {
          const stream = provider.uploader.upload_stream({ resource_type: 'image', folder: 'motif/products', format: 'webp', timeout: 60000 }, (error, result) => error ? reject(error) : resolve(result));
          stream.on('error', reject);
          stream.end(buffer);
        });
        if (!result || !/^https:\/\//.test(result.secure_url || '')) throw new Error('upload result');
        res.status(201).json({ url: result.secure_url, width: result.width, height: result.height });
      } catch (_) {
        res.status(502).json({ error: 'ذخیرهٔ عکس انجام نشد؛ دوباره تلاش کنید.' });
      } finally { busy = false; }
    });
  });
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
