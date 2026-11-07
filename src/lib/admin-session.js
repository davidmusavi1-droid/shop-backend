const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const idleMs = 60 * 60 * 1000;
const lifetimeMs = 12 * idleMs;
const expiredMessage = 'نشست مدیریت شما به پایان رسیده است. لطفاً دوباره وارد شوید.';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const writeMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const equal = (left, right) => timingSafeEqual(
  createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest(),
);
const sign = (secret, purpose, value) =>
  createHmac('sha256', secret).update(purpose + ':' + value).digest('base64url');

function settings(env) {
  const origins = env.ADMIN_ORIGIN ? [new URL(env.ADMIN_ORIGIN)] :
    ['https://motifdress.com', 'https://www.motifdress.com'].map(url => new URL(url));
  for (const url of origins) {
    const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.href !== url.origin + '/' || (url.protocol !== 'https:' && !(local && env.NODE_ENV !== 'production'))) {
      throw new Error('Invalid admin origin');
    }
  }
  const secure = origins[0].protocol === 'https:';
  return {
    secret: env.ADMIN_TOKEN,
    origins: origins.map(url => url.origin),
    cookie: secure ? '__Host-motif-admin' : 'motif-admin-dev',
    cookieOptions: { httpOnly: true, secure, sameSite: 'strict', path: '/' },
  };
}

function createAdminSessions({ prisma, env = process.env, clock = Date.now }) {
  const db = prisma.adminSession;
  let failures = 0, resetAt = 0;

  function configured(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const config = settings(env);
    if (!config.secret) return res.status(503).json({ error: 'احراز هویت مدیر تنظیم نشده است' });
    req.adminConfig = config;
    next();
  }

  function cookieToken(req) {
    const prefix = req.adminConfig.cookie + '=';
    const cookies = (req.get('Cookie') || '').split(';').map(value => value.trim());
    const matches = cookies.filter(value => value.startsWith(prefix));
    const token = matches.length === 1 ? matches[0].slice(prefix.length) : '';
    return tokenPattern.test(token) ? token : null;
  }

  function rejectSession(req, res) {
    return res.status(401).json(cookieToken(req)
      ? { code: 'SESSION_EXPIRED', error: expiredMessage }
      : { code: 'SESSION_REQUIRED', error: 'دسترسی غیرمجاز' });
  }

  function sameOrigin(req, res, next) {
    if (!req.adminConfig.origins.includes(req.get('Origin')) || req.get('Sec-Fetch-Site') === 'cross-site') {
      return res.status(403).json({ error: 'مبدأ درخواست مدیریت نامعتبر است' });
    }
    next();
  }

  function payload(req, record, token, now) {
    const { secret } = req.adminConfig;
    return {
      csrf: sign(secret, 'csrf', token),
      recoveryKey: 'motif-admin-recovery-v2-' + sign(secret, 'recovery', 'product-form'),
      remainingMs: Math.max(0, record.expiresAt.getTime() - now),
    };
  }

  function authenticate({ extend = false } = {}) {
    return async (req, res, next) => {
      const token = cookieToken(req);
      if (!token) return rejectSession(req, res);
      const { secret } = req.adminConfig;
      const unsafe = writeMethods.has(req.method);
      if (unsafe && (!req.adminConfig.origins.includes(req.get('Origin')) || req.get('Sec-Fetch-Site') === 'cross-site')) {
        return res.status(403).json({ error: 'مبدأ درخواست مدیریت نامعتبر است' });
      }
      try {
        const tokenHash = sign(secret, 'session', token);
        const now = clock();
        const valid = { tokenHash, expiresAt: { gt: new Date(now) }, absoluteExpiresAt: { gt: new Date(now) } };
        let record = await db.findFirst({ where: valid });
        if (!record) return rejectSession(req, res);
        if (unsafe && !equal(req.get('X-Admin-CSRF') || '', sign(secret, 'csrf', token))) {
          return res.status(403).json({ error: 'اعتبار درخواست مدیریت تأیید نشد. صفحه را تازه کنید.' });
        }
        if (extend && unsafe) {
          const expiresAt = new Date(Math.min(now + idleMs, record.absoluteExpiresAt.getTime()));
          const updated = await db.updateMany({
            where: { ...valid, expiresAt: { ...valid.expiresAt, lt: expiresAt } }, data: { expiresAt },
          });
          if (updated.count) record = { ...record, expiresAt };
          else {
            // Another request may have extended the session, or logout may have deleted it.
            record = await db.findFirst({ where: valid });
            if (!record) return rejectSession(req, res);
          }
        }
        req.adminSession = { tokenHash, state: payload(req, record, token, now) };
        next();
      } catch (err) { next(err); }
    };
  }

  async function login(req, res, next) {
    const { secret, cookie, cookieOptions } = req.adminConfig;
    const now = clock();
    if (!req.is('application/json')) return res.status(415).json({ error: 'درخواست ورود نامعتبر است' });
    if (now >= resetAt) {
      failures = 0;
      resetAt = now + 15 * 60 * 1000;
    }
    if (failures >= 20) {
      res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
      return res.status(429).json({ error: 'تلاش‌های ورود زیاد است. کمی بعد دوباره تلاش کنید.' });
    }
    const password = req.body?.password;
    if (typeof password !== 'string' || !equal(password, secret)) {
      failures++;
      return res.status(403).json({ error: 'رمز مدیریت نامعتبر است' });
    }
    try {
      const previous = cookieToken(req);
      const token = randomBytes(32).toString('base64url');
      const record = {
        tokenHash: sign(secret, 'session', token),
        expiresAt: new Date(now + idleMs),
        absoluteExpiresAt: new Date(now + lifetimeMs),
      };
      await prisma.$transaction([
        db.deleteMany({ where: { OR: [
          { expiresAt: { lte: new Date(now) } },
          ...(previous ? [{ tokenHash: sign(secret, 'session', previous) }] : []),
        ] } }),
        db.create({ data: record }),
      ]);
      res.cookie(cookie, token, { ...cookieOptions, maxAge: lifetimeMs });
      res.json(payload(req, record, token, now));
    } catch (err) { next(err); }
  }

  async function logout(req, res, next) {
    try {
      await db.deleteMany({ where: { tokenHash: req.adminSession.tokenHash } });
      res.clearCookie(req.adminConfig.cookie, req.adminConfig.cookieOptions).status(204).end();
    } catch (err) { next(err); }
  }

  return { configured, sameOrigin, authenticate, login, logout };
}

module.exports = { createAdminSessions, settings };
