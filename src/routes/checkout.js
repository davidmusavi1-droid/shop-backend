const express = require('express');
const prisma = require('../lib/prisma');
const requireAdmin = require('../middleware/requireAdmin');
const checkout = require('../lib/checkout');
const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.MOTIF_CHECKOUT_PREVIEW !== 'true') return res.sendStatus(404);
  next();
});

function handle(action) {
  return async (req, res) => {
    try {
      await action(req, res);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status === 500) console.error('Checkout failed', error.code || 'UNKNOWN');
      res.status(status).json({ error: status === 500 ? 'خطای موقت ثبت سفارش' : error.message });
    }
  };
}

router.get('/shipping', handle(async (req, res) => {
  const settings = await prisma.shippingSettings.findUnique({ where: { id: checkout.SHIPPING_ID } });
  res.json({ shippingFee: settings?.fee ?? null });
}));

router.put('/shipping', requireAdmin, handle(async (req, res) => {
  const fee = req.body?.shippingFee;
  if (!Number.isInteger(fee) || fee < 0 || fee > checkout.MAX_AMOUNT) {
    throw checkout.fail(400, 'تعرفه ارسال نامعتبر است');
  }
  await prisma.shippingSettings.upsert({
    where: { id: checkout.SHIPPING_ID },
    create: { id: checkout.SHIPPING_ID, fee },
    update: { fee },
  });
  res.json({ shippingFee: fee });
}));

router.post('/orders', handle(async (req, res) => {
  const input = checkout.checkoutInput(req.body, req.get('Idempotency-Key'));
  await checkout.releaseExpired(prisma);
  res.status(201).json(await checkout.reserve(prisma, input));
}));

module.exports = router;
