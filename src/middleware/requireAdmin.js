const crypto = require('crypto');

function requireAdmin(req, res, next) {
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

  next();
}

module.exports = requireAdmin;
