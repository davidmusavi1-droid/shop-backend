const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const prisma = require('../lib/prisma');
const admin = require('../middleware/requireAdmin');
const { fail } = require('../lib/checkout');

const router = express.Router();
const accountId = 'default';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0, parts: 2 } });

function handle(action) {
  return async (req, res, next) => {
    try { await action(req, res, next); }
    catch (error) {
      const status = error.statusCode || 500;
      if (status === 500) console.error('Order management failed', error.code || 'UNKNOWN');
      res.status(status).json({ error: status === 500 ? 'خطای موقت سفارش' : error.message });
    }
  };
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.MOTIF_CHECKOUT_PREVIEW !== 'true') return res.sendStatus(404);
  next();
});

router.get('/account', handle(async (req, res) => {
  const account = await prisma.cardTransferSettings.findUnique({ where: { id: accountId } });
  res.json(account?.enabled ? { cardNumber: account.cardNumber, accountHolder: account.accountHolder } : null);
}));

router.get('/settings', admin, handle(async (req, res) => {
  const account = await prisma.cardTransferSettings.findUnique({ where: { id: accountId } });
  res.json(account || { cardNumber: '', accountHolder: '', enabled: false });
}));

router.put('/settings', admin, handle(async (req, res) => {
  const { cardNumber, accountHolder, enabled } = req.body || {};
  if (typeof cardNumber !== 'string' || !/^\d{16}$/.test(cardNumber) ||
      typeof accountHolder !== 'string' || !accountHolder.trim() || accountHolder.length > 120 ||
      typeof enabled !== 'boolean') throw fail(400, 'اطلاعات حساب مقصد نامعتبر است');
  const data = { cardNumber, accountHolder: accountHolder.trim(), enabled };
  await prisma.cardTransferSettings.upsert({ where: { id: accountId }, create: { id: accountId, ...data }, update: data });
  res.json(data);
}));

function readUpload(req, res, next) {
  upload.single('receipt')(req, res, error => {
    if (error) return res.status(400).json({ error: 'یک تصویر رسید حداکثر ۳ مگابایتی بفرستید' });
    next();
  });
}

router.post('/orders/:id/receipt', handle(async (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key || !/^[0-9a-f-]{36}$/.test(key)) throw fail(404, 'سفارش پیدا نشد');
  const match = await prisma.checkoutReservation.findFirst({ where: { orderId: req.params.id, requestKey: key }, select: { orderId: true } });
  if (!match) throw fail(404, 'سفارش پیدا نشد');
  if (!(await prisma.cardTransferSettings.findUnique({ where: { id: accountId } }))?.enabled) {
    throw fail(409, 'کارت‌به‌کارت فعال نیست');
  }
  res.locals.orderId = match.orderId;
  next();
}), readUpload, handle(async (req, res) => {
  if (!req.file) throw fail(400, 'تصویر رسید لازم است');
  let receipt;
  try {
    const image = sharp(req.file.buffer, { limitInputPixels: 12_000_000 });
    const { format } = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(format)) throw Error('unsupported image');
    receipt = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch { throw fail(400, 'تصویر رسید نامعتبر است'); }

  await prisma.$transaction(async tx => {
    const id = res.locals.orderId;
    const claimed = await tx.order.updateMany({
      where: { id, status: 'PENDING', payment: null, checkout: { expiresAt: { gt: new Date() } } },
      data: { status: 'PENDING' },
    });
    if (claimed.count !== 1) {
      const previous = await tx.payment.findUnique({ where: { orderId: id }, include: { cardTransfer: true } });
      if (previous?.cardTransfer && !previous.cardTransfer.reviewedAt) return;
      throw fail(409, 'رزرو منقضی شده یا سفارش در انتظار پرداخت نیست');
    }
    // Recheck after taking the order lock. A concurrent upload may have added a payment.
    const existing = await tx.payment.findUnique({ where: { orderId: id }, include: { cardTransfer: true } });
    if (existing?.cardTransfer && !existing.cardTransfer.reviewedAt) return;
    if (existing) throw fail(409, 'پرداخت قبلاً آغاز شده است');
    const order = await tx.order.findUnique({ where: { id }, select: { totalPrice: true } });
    await tx.payment.create({ data: { orderId: id, amount: order.totalPrice, cardTransfer: { create: { receipt } } } });
  });
  res.status(202).json({ status: 'AWAITING_REVIEW' });
}));

router.get('/orders', admin, handle(async (req, res) => {
  const cursor = typeof req.query.after === 'string' ? req.query.after : undefined;
  const orders = await prisma.order.findMany({
    where: { checkout: { isNot: null } },
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 31,
    select: {
      id: true, totalPrice: true, status: true, shipmentTrackingCode: true, createdAt: true,
      checkout: { select: { fullName: true, phone: true, address: true, province: true, city: true, postalCode: true, shippingFee: true, expiresAt: true } },
      payment: { select: { isSuccessful: true, cardTransfer: { select: { reviewedAt: true, rejected: true } } } },
    },
  });
  res.json({ orders: orders.slice(0, 30), next: orders.length > 30 ? orders[29].id : null });
}));

router.get('/orders/:id/receipt', admin, handle(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { orderId: req.params.id }, include: { cardTransfer: true } });
  if (!payment?.cardTransfer) throw fail(404, 'رسید پیدا نشد');
  res.set('X-Content-Type-Options', 'nosniff').attachment('receipt.jpg').type('jpeg').send(Buffer.from(payment.cardTransfer.receipt));
}));

router.post('/orders/:id/review', admin, handle(async (req, res) => {
  const approved = req.body?.approved;
  if (typeof approved !== 'boolean') throw fail(400, 'نتیجه بررسی نامعتبر است');
  const orderId = req.params.id;
  await prisma.$transaction(async tx => {
    const payment = await tx.payment.findUnique({
      where: { orderId }, select: {
        id: true, amount: true, order: { select: { totalPrice: true } },
        cardTransfer: { select: { reviewedAt: true, rejected: true } },
      },
    });
    if (!payment?.cardTransfer) throw fail(404, 'رسید پیدا نشد');
    if (payment.cardTransfer.reviewedAt && payment.cardTransfer.rejected === !approved) return;
    if (payment.amount !== payment.order.totalPrice) throw fail(409, 'مبلغ پرداخت با سفارش مطابقت ندارد');
    const claimed = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: approved ? 'PAID' : 'CANCELED' } });
    if (claimed.count !== 1) {
      const review = await tx.cardTransfer.findUnique({ where: { paymentId: payment.id }, select: { reviewedAt: true, rejected: true } });
      if (review?.reviewedAt && review.rejected === !approved) return;
      throw fail(409, 'سفارش قبلاً بررسی شده است');
    }
    await tx.cardTransfer.update({ where: { paymentId: payment.id }, data: { reviewedAt: new Date(), rejected: !approved } });
    if (approved) {
      await tx.payment.update({ where: { id: payment.id }, data: { isSuccessful: true } });
    } else {
      const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { variantId: 'asc' } });
      for (const item of items) {
        await tx.variant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
      }
    }
  });
  res.json({ status: approved ? 'PAID' : 'CANCELED' });
}));

router.patch('/orders/:id/shipment', admin, handle(async (req, res) => {
  const shipmentTrackingCode = req.body?.shipmentTrackingCode?.trim?.();
  if (typeof shipmentTrackingCode !== 'string' || !/^[\p{L}\d -]{4,80}$/u.test(shipmentTrackingCode)) throw fail(400, 'کد رهگیری نامعتبر است');
  const changed = await prisma.order.updateMany({
    where: { id: req.params.id, status: 'SHIPPED', checkout: { isNot: null } },
    data: { shipmentTrackingCode },
  });
  if (!changed.count) throw fail(409, 'ابتدا وضعیت سفارش را به ارسال‌شده تغییر دهید');
  res.json({ shipmentTrackingCode });
}));

module.exports = router;
