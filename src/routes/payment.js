const express = require('express');
const { randomInt } = require('node:crypto');
const prisma = require('../lib/prisma');
const { createOnlinePayment } = require('../lib/online-payment');
const { createRetryPayment } = require('../lib/online-payment-retry');
const { configureLiveZibal } = require('../lib/zibal-live');
const { configureSandboxZibal } = require('../lib/zibal-sandbox');
const { trackId, createZibalGateway } = require('../lib/zibal');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const previewAdmin = (req, res, next) => process.env.NODE_ENV === 'test'
  ? next() : requireAdmin(req, res, next);

const gateway = createZibalGateway({
  merchant: 'mock',
  callbackUrl: '/api/payment/verify',
  async transport(url, payload) {
    if (url.endsWith('/request')) return { result: 100, trackId: randomInt(100000000000, 999999999999) };
    let attempt = await prisma.zibalAttempt.findUnique({
      where: { trackId: String(payload.trackId) }, include: { payment: true },
    });
    if (!attempt && process.env.MOTIF_ZIBAL_RETRY_ENABLED === 'true') {
      attempt = await prisma.zibalPaymentAttempt.findUnique({
        where: { trackId: String(payload.trackId) }, include: { payment: true },
      });
    }
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
  const sandbox = mock || live ? null : configureSandboxZibal(process.env);
  if (!mock && !live && !sandbox) {
    return res.status(503).json({ error: 'درگاه پرداخت هنوز فعال نشده است', code: 'PAYMENT_NOT_CONFIGURED' });
  }
  res.locals.live = live;
  res.locals.sandbox = sandbox;
  res.locals.retryEnabled = process.env.MOTIF_ZIBAL_RETRY_ENABLED === 'true';
  res.locals.payment = res.locals.retryEnabled
    ? createRetryPayment(prisma, mock ? gateway : (live || sandbox).gateway)
    : mock ? mockPayment : createOnlinePayment(prisma, (live || sandbox).gateway);
  next();
});
const handle = action => async (req, res) => {
  try { await action(req, res); }
  catch (error) {
    res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'پرداخت نیاز به بررسی دارد' });
  }
};
router.post('/request/:orderId', previewAdmin, handle(async (req, res) => {
  if (process.env.MOTIF_ZIBAL_REQUESTS_DISABLED === 'true') {
    return res.status(503).json({ code: 'NEW_PAYMENT_REQUESTS_DISABLED' });
  }
  const key = req.get('Idempotency-Key');
  if (!key || !/^[0-9a-f-]{36}$/.test(key)) return res.sendStatus(404);
  const pilot = res.locals.live || res.locals.sandbox;
  if (pilot && !(await pilotOrder(req.params.orderId, key, pilot))) return res.sendStatus(404);
  res.json(await res.locals.payment.start(req.params.orderId, key));
}));
const verifyPayment = handle(async (req, res) => {
  const live = res.locals.live;
  const sandbox = res.locals.sandbox;
  if (Boolean(sandbox) !== (req.path === '/sandbox/verify')) return res.sendStatus(404);
  if (live || sandbox) {
    const id = trackId(req.query.trackId);
    const legacy = id && await prisma.zibalAttempt.findFirst({
      where: { trackId: id, ...(live ? { payment: { orderId: live.orderId } } : {}) }, select: { paymentId: true },
    });
    const retry = !legacy && id && res.locals.retryEnabled && await prisma.zibalPaymentAttempt.findFirst({
      where: { trackId: id, ...(live ? { payment: { orderId: live.orderId } } : {}) }, select: { paymentId: true },
    });
    if (!legacy && !retry) return res.sendStatus(404);
  }
  const result = await res.locals.payment.verify(req.query.trackId);
  if (result.status === 'EXPIRED') {
    return res.type('html').send('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>پرداخت منقضی</title><h1>پرداخت منقضی و رزرو آزاد شد</h1><a href="/collection">برای تلاش مجدد سفارش تازه ثبت کنید</a>');
  }
  const label = live ? 'پرداخت' : sandbox ? 'پرداخت آزمایشی زیبال' : 'پرداخت آزمایشی';
  const message = result.status === 'PAID' ? label + ' تأیید شد' : label + ' تأیید نشده است';
  res.type('html').send('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>نتیجه پرداخت</title><h1>' + message + '</h1><a href="/cart">بازگشت به سبد</a>');
});
router.get('/verify', verifyPayment);
router.get('/sandbox/verify', verifyPayment);
router.post('/reconcile/:orderId', previewAdmin, handle(async (req, res) => {
  if (!res.locals.retryEnabled) return res.sendStatus(404);
  const key = req.get('Idempotency-Key');
  const pilot = res.locals.live || res.locals.sandbox;
  if (!key || !/^[0-9a-f-]{36}$/.test(key) ||
      pilot && !(await pilotOrder(req.params.orderId, key, pilot))) return res.sendStatus(404);
  res.json(await res.locals.payment.expire(req.params.orderId, key));
}));
async function pilotOrder(orderId, key, live) {
  if ((live.orderId && orderId !== live.orderId) || typeof key !== 'string' || !/^[0-9a-f-]{36}$/.test(key)) return false;
  const order = await prisma.checkoutReservation.findFirst({
    where: { orderId, requestKey: key, order: { totalPrice: { gt: 0, lte: live.maxTomans } } },
    select: { orderId: true },
  });
  return Boolean(order);
}

router.get('/availability', previewAdmin, handle(async (req, res) => {
  if (process.env.MOTIF_ZIBAL_REQUESTS_DISABLED === 'true') {
    return res.json({ live: false, sandbox: false, mock: false });
  }
  const live = res.locals.live;
  if (res.locals.sandbox) {
    return res.json({ sandbox: await pilotOrder(req.query.orderId, req.get('Idempotency-Key'), res.locals.sandbox) });
  }
  if (!live) return res.json({ mock: true });
  res.json({ live: await pilotOrder(req.query.orderId, req.get('Idempotency-Key'), live) });
}));

module.exports = router;
