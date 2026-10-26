const { randomUUID } = require('node:crypto');

// Never log bodies, query strings, headers, error messages or stacks: these may
// contain customer details, tokens, database URLs or provider credentials.
function logEvent(event, fields = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}

function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.set({
    'X-Request-Id': req.requestId,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN', // The content editor uses a same-origin iframe.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  const started = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) logEvent('http_failure', {
      requestId: req.requestId, method: req.method,
      status: res.statusCode, durationMs: Date.now() - started,
    });
  });
  next();
}

function errorHandler(err, req, res, next) {
  const proposed = err.statusCode || err.status;
  const status = Number.isInteger(proposed) && proposed >= 400 && proposed <= 599 ? proposed : 500;
  logEvent('request_error', {
    requestId: req.requestId, status,
    // Allow only known identifiers; arbitrary exception fields are not safe.
    code: /^P\d{4}$/.test(err.code || '') ? err.code : 'REQUEST_ERROR',
  });
  if (res.headersSent) return next(err);
  // Only application-authored validation messages may be returned to clients.
  const message = status < 500 && err.statusCode && !err.type
    ? err.message : status === 413 ? 'حجم درخواست بیش از حد مجاز است'
      : status === 400 ? 'درخواست نامعتبر است' : 'خطای موقت سرور؛ دوباره تلاش کنید';
  res.status(status).json({ error: message, requestId: req.requestId });
}

module.exports = { requestContext, errorHandler, logEvent };
