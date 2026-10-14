const express = require('express');
const prisma = require('../lib/prisma');
const requireAdmin = require('../middleware/requireAdmin');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const router = express.Router();

// Payment is unavailable: do not let public requests reserve stock indefinitely.
// Remove this gate only with verified payments and reservation expiry in place.
function checkoutUnavailable(req, res) {
  return res.status(503).json({
    error: 'خرید آنلاین هنوز فعال نشده است', code: 'CHECKOUT_NOT_CONFIGURED',
  });
}

router.post('/', checkoutUnavailable, async (req, res, next) => {
  const { customer, source, items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'سبد خرید خالی است' });
  }

  if (!customer || typeof customer.fullName !== 'string' || !customer.fullName.trim() ||
      typeof customer.phone !== 'string' || !customer.phone.trim() ||
      (customer.address != null && typeof customer.address !== 'string') ||
      (source != null && source !== 'WEB') || items.length > 100 ||
      items.some(item => !item || typeof item.variantId !== 'string' || !item.variantId.trim() ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647)) {
    return res.status(400).json({ error: 'اطلاعات مشتری یا اقلام سفارش نامعتبر است' });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const dbCustomer = await tx.customer.upsert({
        where: { phone: customer.phone },
        update: { fullName: customer.fullName, address: customer.address },
        create: {
          fullName: customer.fullName,
          phone: customer.phone,
          address: customer.address,
        },
      });

      let totalPrice = 0;
      const orderItemsData = [];

      for (const item of items) {
        const variant = await tx.variant.findUnique({
          where: { id: item.variantId },
          include: { product: true },
        });

        if (!variant) {
          throw fail(404, 'کالا پیدا نشد');
        }
        if (!variant.product.isActive) throw fail(409, 'کالا غیرفعال است');
        const reserved = await tx.variant.updateMany({
          where: { id: variant.id, stock: { gte: item.quantity }, product: { isActive: true } },
          data: { stock: { decrement: item.quantity } },
        });
        if (reserved.count !== 1) throw fail(409, 'موجودی کافی نیست');

        const unitPrice = variant.product.basePrice + variant.priceDelta;
        totalPrice += unitPrice * item.quantity;
        if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 || unitPrice > 2147483647 ||
            !Number.isSafeInteger(totalPrice) || totalPrice > 2147483647) {
          throw fail(400, 'مبلغ سفارش نامعتبر است');
        }

        orderItemsData.push({
          productId: variant.productId,
          variantId: variant.id,
          quantity: item.quantity,
          unitPrice,
        });
      }

      return tx.order.create({
        data: {
          customerId: dbCustomer.id,
          source: source || 'WEB',
          totalPrice,
          items: { create: orderItemsData },
        },
        include: { items: true, customer: true },
      });
    });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAdmin, async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, customer: true, payment: true },
    });
    if (!order) return res.status(404).json({ error: 'سفارش پیدا نشد' });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// PAID is reserved for a verified gateway callback.
const transitions = {
  PENDING: ['CANCELED'], PAID: ['PROCESSING'],
  PROCESSING: ['SHIPPED'], SHIPPED: ['DELIVERED'],
};
router.patch('/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['CANCELED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(status)) {
      throw fail(400, 'وضعیت نامعتبر است');
    }
    const order = await prisma.$transaction(async tx => {
      const current = await tx.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!current) throw fail(404, 'سفارش پیدا نشد');
      if (current.status === status) return current;
      if (!(transitions[current.status] || []).includes(status)) throw fail(409, 'تغییر وضعیت مجاز نیست');
      const changed = await tx.order.updateMany({
        where: { id: current.id, status: current.status }, data: { status },
      });
      if (changed.count !== 1) throw fail(409, 'وضعیت سفارش تغییر کرده است؛ دوباره تلاش کنید');
      if (status === 'CANCELED') {
        for (const item of current.items) {
          await tx.variant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
        }
      }
      return tx.order.findUnique({ where: { id: current.id } });
    });
    res.json(order);
  } catch (err) { next(err); }
});

module.exports = router;
