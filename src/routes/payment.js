const express = require('express');
const { randomInt } = require('node:crypto');
const prisma = require('../lib/prisma');
const { createOnlinePayment } = require('../lib/online-payment');
const { configureLiveZibal } = require('../lib/zibal-live');
const { trackId, createZibalGateway } = require('../lib/zibal');
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
const mockPayment = createOnlinePayment(prisma, gateway);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const mock = process.env.NODE_ENV === 'test' && process.env.MOTIF_CHECKOUT_PREVIEW === 'true' &&
    process.env.MOTIF_ZIBAL_PROVIDER === 'mock';
  const live = mock ? null : configureLiveZibal(process.env);
  if (!mock && !live) {
    return res.status(503).json({ error: 'درگاه پرداخت هنوز فعال نشده است', code: 'PAYMENT_NOT_CONFIGURED' });
  }
  res.locals.live = live;
  res.locals.payment = mock ? mockPayment : createOnlinePayment(prisma, live.gateway);
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
  const live = res.locals.live;
  if (live && !(await pilotOrder(req.params.orderId, key, live))) return res.sendStatus(404);
  res.json(await res.locals.payment.start(req.params.orderId, key));
}));
router.get('/verify', handle(async (req, res) => {
  const live = res.locals.live;
  if (live) {
    const id = trackId(req.query.trackId);
    if (!id || !(await prisma.zibalAttempt.findFirst({
      where: { trackId: id, payment: { orderId: live.orderId } }, select: { paymentId: true },
    }))) return res.sendStatus(404);
  }
  const result = await res.locals.payment.verify(req.query.trackId);
  if (result.status === 'EXPIRED') {
    return res.type('html').send('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>پرداخت منقضی</title><h1>پرداخت منقضی و رزرو آزاد شد</h1><a href="/collection">برای تلاش مجدد سفارش تازه ثبت کنید</a>');
  }
  const label = live ? 'پرداخت' : 'پرداخت آزمایشی';
  const message = result.status === 'PAID' ? label + ' تأیید شد' : label + ' تأیید نشده است';
  res.type('html').send('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>نتیجه پرداخت</title><h1>' + message + '</h1><a href="/cart">بازگشت به سبد</a>');
}));
async function pilotOrder(orderId, key, live) {
  if (orderId !== live.orderId || typeof key !== 'string' || !/^[0-9a-f-]{36}$/.test(key)) return false;
  const order = await prisma.checkoutReservation.findFirst({
    where: { orderId, requestKey: key, order: { totalPrice: { gt: 0, lte: live.maxTomans } } },
    select: { orderId: true },
  });
  return Boolean(order);
}

router.get('/availability', handle(async (req, res) => {
  const live = res.locals.live;
  if (!live) return res.json({ mock: true });
  res.json({ live: await pilotOrder(req.query.orderId, req.get('Idempotency-Key'), live) });
}));

module.exports = router;
