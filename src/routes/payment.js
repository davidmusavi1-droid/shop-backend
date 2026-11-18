const express = require('express');
const { randomInt } = require('node:crypto');
const prisma = require('../lib/prisma');
const { createOnlinePayment } = require('../lib/online-payment');
const { createZibalGateway } = require('../lib/zibal');
const router = express.Router();

const gateway = createZibalGateway({
  merchant: 'mock',
  callbackUrl: '/api/payment/verify',
  async transport(url, payload) {
    if (url.endsWith('/request')) return { result: 100, trackId: randomInt(100000000000, 999999999999) };
    const attempt = await prisma.zibalAttempt.findUnique({
      where: { trackId: String(payload.trackId) }, include: { payment: true },
    });
    if (url.endsWith('/inquiry') && attempt) {
      return { result: 100, status: attempt.payment.isSuccessful ? 1 : -1, amount: attempt.payment.amount * 10 };
    }
    return attempt ? { result: 100, status: 1, amount: attempt.payment.amount * 10 } : { result: 203 };
  },
});
gateway.redirect = id => '/api/payment/verify?trackId=' + id;
const payment = createOnlinePayment(prisma, gateway);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.NODE_ENV !== 'test' || process.env.MOTIF_CHECKOUT_PREVIEW !== 'true' ||
      process.env.MOTIF_ZIBAL_PROVIDER !== 'mock') {
    return res.status(503).json({ error: 'درگاه پرداخت هنوز فعال نشده است', code: 'PAYMENT_NOT_CONFIGURED' });
  }
  next();
});
const handle = action => async (req, res) => {
  try { await action(req, res); }
  catch (error) {
    res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'پرداخت نیاز به بررسی دارد' });
  }
};
router.post('/request/:orderId', handle(async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key || !/^[0-9a-f-]{36}$/.test(key)) return res.sendStatus(404);
  res.json(await payment.start(req.params.orderId, key));
}));
router.get('/verify', handle(async (req, res) => {
  const result = await payment.verify(req.query.trackId);
  if (result.status === 'EXPIRED') {
    return res.type('html').send('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>پرداخت منقضی</title><h1>پرداخت منقضی و رزرو آزاد شد</h1><a href="/collection">برای تلاش مجدد سفارش تازه ثبت کنید</a>');
  }
  const message = result.status === 'PAID' ? 'پرداخت آزمایشی تأیید شد' : 'پرداخت آزمایشی تأیید نشده است';
  res.type('html').send('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>نتیجه پرداخت</title><h1>' + message + '</h1><a href="/cart">بازگشت به سبد</a>');
}));
router.get('/availability', (req, res) => res.json({ mock: true }));

module.exports = router;
