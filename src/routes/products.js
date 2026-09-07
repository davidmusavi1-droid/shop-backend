const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });
    if (!product) return res.status(404).json({ error: 'محصول پیدا نشد' });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, description, basePrice, images, variants } = req.body;
    const product = await prisma.product.create({
      data: {
        title,
        description,
        basePrice,
        images: images || [],
        variants: {
          create: (variants || []).map((v) => ({
            size: v.size,
            color: v.color,
            sku: v.sku,
            stock: v.stock || 0,
            priceDelta: v.priceDelta || 0,
          })),
        },
      },
      include: { variants: true },
    });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
