const express = require('express');
const prisma = require('../lib/prisma');
const { createMockProvider, createTracking, uuid } = require('../lib/order-tracking');

const router = express.Router();
const { liveTrackingReady, createKavenegarProvider } = require('../lib/kavenegar');
router.get('/availability', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ available: liveTrackingReady() });
});
function handle(action) {
  return async (req, res) => {
    try { await action(req, res); }
    catch {
      res.status(503).json({ error: 'پیگیری سفارش فعلاً در دسترس نیست' });
    }
  };
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const secret = process.env.MOTIF_TRACKING_OTP_SECRET;
  const testPhone = process.env.MOTIF_TRACKING_MOCK_PHONE;
  const mock = process.env.NODE_ENV === 'test' && process.env.MOTIF_TRACKING_PROVIDER === 'mock' &&
    secret && secret.length >= 32 && /^09\d{9}$/.test(testPhone || '');
  const provider = mock ? createMockProvider() : createKavenegarProvider();
  if (!provider) return res.sendStatus(404);
  res.locals.testPhone = mock ? testPhone : null;
  res.locals.tracking = createTracking({ prisma, provider, secret });
  next();
});

router.post('/challenge', handle(async (req, res) => {
  const { orderNumber, phone } = req.body || {};
  if (typeof orderNumber !== 'string' || !uuid.test(orderNumber) ||
      typeof phone !== 'string' || !/^09\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'شماره سفارش یا موبایل نامعتبر است' });
  }
  const { randomUUID } = require('node:crypto');
  const reply = (!res.locals.testPhone || phone === res.locals.testPhone)
    ? await res.locals.tracking.issue(orderNumber.toLowerCase(), phone)
    : { challengeId: randomUUID() };
  res.status(202).json(reply);
}));

router.post('/verify', handle(async (req, res) => {
  const { challengeId, code } = req.body || {};
  if (typeof challengeId !== 'string' || !uuid.test(challengeId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'کد نامعتبر یا منقضی است' });
  }
  const result = await res.locals.tracking.verify(challengeId, code);
  if (!result) return res.status(400).json({ error: 'کد نامعتبر یا منقضی است' });
  res.json(result);
}));

module.exports = router;
