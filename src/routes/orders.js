const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.post('/', async (req, res, next) => {
  const { customer, source, items } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'سبد خرید خالی است' });
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
          throw new Error(`واریانت ${item.variantId} پیدا نشد`);
        }
        if (variant.stock < item.quantity) {
          throw new Error(`موجودی کافی نیست: ${variant.product.title} (${variant.size}/${variant.color})`);
        }

        await tx.variant.update({
          where: { id: variant.id },
          data: { stock: { decrement: item.quantity } },
        });

        const unitPrice = variant.product.basePrice + variant.priceDelta;
        totalPrice += unitPrice * item.quantity;

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

router.get('/:id', async (req, res, next) => {
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

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
