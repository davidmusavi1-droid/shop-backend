const express = require('express');
const prisma = require('../lib/prisma');
const requireAdmin = require('../middleware/requireAdmin');
const router = express.Router();

// لیست محصولات فعال
router.get('/', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, variants: { some: { stock: { gt: 0 } } } },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(products);
  } catch (err) {
    next(err);
  }
});

// جزئیات یک محصول
router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });

    if (!product || !product.isActive || !product.variants.some(v => v.stock > 0)) {
      return res.status(404).json({ error: 'محصول پیدا نشد' });
    }

    res.json(product);
  } catch (err) {
    next(err);
  }
});

// افزودن محصول
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const {
      title,
      description,
      basePrice,
      images,

      // اطلاعات پایه
      brand,
      modelName,
      productType,

      // دسته‌بندی سه‌لایه‌ای
      customerNeeds,
      styles,

      // موجودی
      inventoryMode,

      // کیفیت و وضعیت
      qualityGrade,
      condition,
      defect,

      // هویت محصول
      identityOrigin,
      identityHistory,
      identityPurpose,
      identityUseCases,
      identityDesign,
      identityTechnical,
      identitySources,

      variants,
    } = req.body;

    if (!title || basePrice === undefined || basePrice === null) {
      return res.status(400).json({
        error: 'نام محصول و قیمت الزامی هستند',
      });
    }

    const product = await prisma.product.create({
      data: {
        title,
        description: description || null,
        basePrice: Number(basePrice),
        images: images || [],

        brand: brand || null,
        modelName: modelName || null,
        productType: productType || null,

        customerNeeds: customerNeeds || [],
        styles: styles || [],

        inventoryMode: inventoryMode || 'MULTI',

        qualityGrade: qualityGrade || null,
        condition: condition || null,
        defect: defect || null,

        identityOrigin: identityOrigin || null,
        identityHistory: identityHistory || null,
        identityPurpose: identityPurpose || null,
        identityUseCases: identityUseCases || null,
        identityDesign: identityDesign || null,
        identityTechnical: identityTechnical || null,
        identitySources: identitySources || null,

        variants: {
          create: (variants || []).map((v) => ({
            size: v.size || '',
            color: v.color || '',
            sku: v.sku,
            stock: Number(v.stock || 0),
            priceDelta: Number(v.priceDelta || 0),

            chestWidthCm:
              v.chestWidthCm != null && v.chestWidthCm !== ''
                ? Number(v.chestWidthCm)
                : null,

            lengthCm:
              v.lengthCm != null && v.lengthCm !== ''
                ? Number(v.lengthCm)
                : null,

            waistCm:
              v.waistCm != null && v.waistCm !== ''
                ? Number(v.waistCm)
                : null,

            riseCm:
              v.riseCm != null && v.riseCm !== ''
                ? Number(v.riseCm)
                : null,

            totalLengthCm:
              v.totalLengthCm != null && v.totalLengthCm !== ''
                ? Number(v.totalLengthCm)
                : null,

            thighWidthCm:
              v.thighWidthCm != null && v.thighWidthCm !== ''
                ? Number(v.thighWidthCm)
                : null,

            hemWidthCm:
              v.hemWidthCm != null && v.hemWidthCm !== ''
                ? Number(v.hemWidthCm)
                : null,

            itemGrade: v.itemGrade || null,
            itemCondition: v.itemCondition || null,
            itemDefect: v.itemDefect || null,
            itemImages: v.itemImages || [],
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
