const express = require('express');
const prisma = require('../lib/prisma');
const requireAdmin = require('../middleware/requireAdmin');
const router = express.Router();

// Administrative reads include inactive and sold-out products.
router.get('/admin/list', requireAdmin, async (req, res, next) => {
  try {
    res.json(await prisma.product.findMany({ include: { variants: true }, orderBy: { createdAt: 'desc' } }));
  } catch (err) { next(err); }
});

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
const conflict = () => Object.assign(new Error('محصول یا موجودی تغییر کرده؛ دوباره بارگذاری کنید'), { statusCode: 409 });
const measures = ['chestWidthCm', 'lengthCm', 'waistCm', 'riseCm', 'totalLengthCm', 'thighWidthCm', 'hemWidthCm'];
const texts = ['description', 'brand', 'modelName', 'productType', 'condition', 'defect', 'identityOrigin', 'identityHistory', 'identityPurpose', 'identityUseCases', 'identityDesign', 'identityTechnical', 'identitySources'];
const grades = ['N', 'A_PLUS', 'A', 'B', 'C'];
function normalize(body) {
  if (!body || typeof body.title !== 'string' || !body.title.trim()) throw invalid('نام محصول الزامی است');
  const integer = (n, min = 0) => Number.isInteger(n) && n >= min && n <= 2147483647;
  if (!integer(body.basePrice)) throw invalid('قیمت نامعتبر است');
  if (!['SINGLE', 'MULTI'].includes(body.inventoryMode || 'MULTI')) throw invalid('نوع موجودی نامعتبر است');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw invalid('وضعیت محصول نامعتبر است');
  const data = { title: body.title.trim(), basePrice: body.basePrice, inventoryMode: body.inventoryMode || 'MULTI', isActive: body.isActive ?? true };
  for (const key of texts) {
    if (body[key] != null && typeof body[key] !== 'string') throw invalid('متن نامعتبر است');
    data[key] = body[key] || null;
  }
  const array = (value, images = false) => {
    if (value == null) return [];
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || (images && !/^https:\/\/[^\s]+$/i.test(v)))) throw invalid('فهرست یا لینک تصویر نامعتبر است');
    return value;
  };
  data.images = array(body.images, true);
  data.customerNeeds = array(body.customerNeeds);
  data.styles = array(body.styles);
  data.qualityGrade = body.qualityGrade || null;
  if (data.qualityGrade && !grades.includes(data.qualityGrade)) throw invalid('گرید نامعتبر است');
  if (!Array.isArray(body.variants) || !body.variants.length || body.variants.length > 100) throw invalid('حداقل یک سایز لازم است');
  const skus = new Set(), combinations = new Set();
  const variants = body.variants.map(v => {
    if (!v || typeof v.sku !== 'string' || !v.sku.trim() || !integer(v.stock ?? 0) || !integer(v.priceDelta ?? 0, -2147483648) || !integer(data.basePrice + (v.priceDelta ?? 0))) throw invalid('قیمت، موجودی یا SKU سایز نامعتبر است');
    if (typeof v.size !== 'string' || !v.size.trim() || typeof v.color !== 'string' || !v.color.trim()) throw invalid('سایز و رنگ الزامی است');
    const out = { sku: v.sku.trim(), size: v.size.trim(), color: v.color.trim(), stock: v.stock ?? 0, priceDelta: v.priceDelta ?? 0 };
    const combination = JSON.stringify([out.size, out.color]);
    if (skus.has(out.sku) || combinations.has(combination)) throw invalid('SKU یا ترکیب سایز و رنگ تکراری است');
    skus.add(out.sku); combinations.add(combination);
    for (const key of measures) {
      out[key] = v[key] == null || v[key] === '' ? null : v[key];
      if (out[key] !== null && (typeof out[key] !== 'number' || !Number.isFinite(out[key]) || out[key] <= 0)) throw invalid('اندازه نامعتبر است');
    }
    out.itemGrade = v.itemGrade || null;
    if (out.itemGrade && !grades.includes(out.itemGrade)) throw invalid('گرید سایز نامعتبر است');
    for (const key of ['itemCondition', 'itemDefect']) {
      if (v[key] != null && typeof v[key] !== 'string') throw invalid('وضعیت سایز نامعتبر است');
      out[key] = v[key] || null;
    }
    out.itemImages = array(v.itemImages, true);
    return out;
  });
  if (data.inventoryMode === 'SINGLE' && (variants.length !== 1 || variants[0].stock > 1)) throw invalid('کالای تک‌آیتمی فقط یک سایز و حداکثر یک موجودی دارد');
  return { data, variants };
}
function productError(err, next) {
  if (err.code === 'P2002') return next(Object.assign(new Error('SKU یا سایز و رنگ تکراری است'), { statusCode: 409 }));
  if (err.code === 'P2034') return next(conflict());
  next(err);
}
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, variants } = normalize(req.body);
    const result = await prisma.$transaction(async tx => {
      const current = await tx.product.findUnique({ where: { id: req.params.id }, include: { variants: true } });
      if (!current) throw Object.assign(new Error('محصول پیدا نشد'), { statusCode: 404 });
      if (req.body.updatedAt !== current.updatedAt.toISOString()) throw conflict();
      const ids = req.body.variants.filter(v => v.id).map(v => v.id);
      if (new Set(ids).size !== ids.length || ids.some(id => !current.variants.some(v => v.id === id)) || current.variants.some(v => !ids.includes(v.id))) throw invalid('حذف یا جایگزینی سایز موجود مجاز نیست؛ موجودی آن را صفر کنید');
      const changed = await tx.product.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data });
      if (changed.count !== 1) throw conflict();
      for (let i = 0; i < variants.length; i++) {
        const input = req.body.variants[i];
        if (input.id) {
          if (!Number.isInteger(input.expectedStock) || input.expectedStock < 0) throw invalid('موجودی قبلی نامعتبر است');
          const updated = await tx.variant.updateMany({ where: { id: input.id, productId: current.id, stock: input.expectedStock }, data: variants[i] });
          if (updated.count !== 1) throw conflict();
        } else await tx.variant.create({ data: { ...variants[i], productId: current.id } });
      }
      return tx.product.findUnique({ where: { id: current.id }, include: { variants: true } });
    }, { isolationLevel: 'Serializable' });
    res.json(result);
  } catch (err) { productError(err, next); }
});

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

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { data, variants } = normalize(req.body);
    res.status(201).json(await prisma.product.create({ data: { ...data, variants: { create: variants } }, include: { variants: true } }));
  } catch (err) { productError(err, next); }
});
module.exports = router;
