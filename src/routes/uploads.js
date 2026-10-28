const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { createStorage } = require('../lib/image-storage');
const { prepareImage } = require('../lib/product-image');
const requireAdmin = require('../middleware/requireAdmin');

// Dependencies can be replaced in HTTP tests; production always uses the real provider.
function createRouter({ provider, decode = sharp, env = process.env } = {}) {
  provider = provider || createStorage(env);
  const router = express.Router();
  const parse = multer({ storage: multer.memoryStorage(), limits: {
    fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1
  }}).single('image');
  let busy = false;
  router.post('/images', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!provider.configured) {
      return res.status(503).json({ error: 'اتصال فضای عکس لیارا تنظیم نشده است؛ تنظیمات ذخیره‌سازی را بررسی کنید.' });
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
        let photo;
        try {
          photo = await prepareImage(req.file.buffer, decode);
        } catch (error) {
          if (error.code === 'IMAGE_TOO_LARGE') return res.status(413).json({ error: 'حجم عکس با حفظ کیفیت از ۳ مگابایت بیشتر است؛ عکس را کمی کوچک‌تر کنید.' });
          return res.status(400).json({ error: 'عکس معتبر JPG، PNG یا WebP انتخاب کنید (حداکثر ۵۰ مگاپیکسل).' });
        }
        if (res.destroyed) return;
        const result = await provider.upload(photo.buffer);
        if (!result || !/^https:\/\//.test(result.url || '')) throw new Error('upload result');
        res.status(201).json({ url: result.url, width: photo.width, height: photo.height });
      } catch (_) {
        res.status(502).json({ error: 'ذخیرهٔ عکس در لیارا انجام نشد؛ دوباره تلاش کنید.' });
      } finally { busy = false; }
    });
  });
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
