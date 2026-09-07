const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.post('/request/:orderId', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) return res.status(404).json({ error: 'سفارش پیدا نشد' });

    const fakeAuthority = `AUTH-${order.id.slice(0, 8)}`;

    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: { authority: fakeAuthority, amount: order.totalPrice },
      create: { orderId: order.id, authority: fakeAuthority, amount: order.totalPrice },
    });

    res.json({
      paymentUrl: `https://sandbox-gateway.example.com/pay/${fakeAuthority}`,
      authority: fakeAuthority,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/verify', async (req, res, next) => {
  try {
    const { Authority, Status } = req.query;

    const payment = await prisma.payment.findFirst({ where: { authority: Authority } });
    if (!payment) return res.status(404).json({ error: 'تراکنش پیدا نشد' });

    if (Status === 'OK') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { isSuccessful: true, refId: `REF-${Date.now()}` },
      });
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'PAID' },
      });
      return res.json({ success: true });
    }

    res.json({ success: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
