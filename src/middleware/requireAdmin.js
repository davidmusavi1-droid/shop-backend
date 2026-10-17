const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20,
  standardHeaders: 'draft-8', legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: req => req.adminAuthenticated === true,
  message: { error: 'تلاش‌های ورود زیاد است؛ ۱۵ دقیقه بعد دوباره تلاش کنید' },
});

function authenticate(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  const provided = req.get('X-Admin-Token');

  if (!expected) {
    return res.status(503).json({
      error: 'احراز هویت مدیر تنظیم نشده است'
    });
  }

  if (!provided) {
    return res.status(401).json({
      error: 'دسترسی غیرمجاز'
    });
  }

  const expectedHash = crypto
    .createHash('sha256')
    .update(expected)
    .digest();

  const providedHash = crypto
    .createHash('sha256')
    .update(provided)
    .digest();

  if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
    return res.status(403).json({
      error: 'توکن مدیریت نامعتبر است'
    });
  }

  req.adminAuthenticated = true;
  next();
}

module.exports = (req, res, next) => loginLimiter(req, res, () => authenticate(req, res, next));
