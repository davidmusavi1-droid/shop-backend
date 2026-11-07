const express = require('express');
const prisma = require('../lib/prisma');
const requireAdmin = require('../middleware/requireAdmin');
const catalog = require('../../public/catalog');
const fabricOptions = require('../lib/fabric-options');
const router = express.Router();

// Administrative reads include inactive and sold-out products.
router.get('/admin/list', requireAdmin, async (req, res, next) => {
  try {
    res.json(await prisma.product.findMany({ include: { variants: true }, orderBy: { createdAt: 'desc' } }));
  } catch (err) { next(err); }
});

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
router.get('/admin/fabrics', requireAdmin, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store').json(await fabricOptions.options(prisma));
  } catch (err) { next(err); }
});

router.post('/admin/fabrics', requireAdmin, async (req, res, next) => {
  const label = fabricOptions.labelFor(req.body?.label);
  const key = fabricOptions.keyFor(label);
  if (!key || label.length > 80 || fabricOptions.isClaim(label)) {
    return next(invalid('نام جنس باید حداکثر ۸۰ نویسه باشد. ادعای فنی را در بخش فناوری مستند ثبت کنید.'));
  }
  if (fabricOptions.builtIn.has(key)) {
    return res.status(409).json({ error: 'این جنس قبلاً در فهرست ثبت شده است' });
  }
  try {
    const option = await prisma.fabricOption.create({ data: { key, label } });
    res.status(201).json(option.label);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'این جنس قبلاً در فهرست ثبت شده است' });
    next(err);
  }
});

const conflict = () => Object.assign(new Error('محصول یا موجودی تغییر کرده؛ دوباره بارگذاری کنید'), { statusCode: 409 });
const measures = ['chestWidthCm', 'lengthCm', 'sleeveFromNeckCm', 'waistCm', 'waistWidthCm', 'riseCm', 'totalLengthCm', 'thighWidthCm', 'hemWidthCm'];
const texts = ['description', 'brand', 'modelName', 'productType', 'condition', 'defect', 'identityOrigin', 'identityHistory', 'identityPurpose', 'identityUseCases', 'identityDesign', 'identityTechnical', 'identitySources', 'mainFabric', 'garmentDesign', 'fabricTechnology', 'technologyEvidence', 'fabricNote'];
const grades = ['N', 'A_PLUS', 'A', 'B', 'C'];
function normalize(body, current = null) {
  if (!body || !Array.isArray(body.variants)) throw invalid('فهرست سایزها نامعتبر است');
  const input = body;
  const suppliedCode = body.productCode;
  // Merge omitted fields so older clients cannot erase grades, photos or metadata.
  if (current) body = { ...current, ...body, variants: body.variants?.map(v => ({ ...current.variants.find(old => old.id === v.id), ...v })) };
  if (!body || typeof body.title !== 'string' || (!body.title.trim() && body.isActive !== false)) throw invalid('نام محصول الزامی است');
  const integer = (n, min = 0) => Number.isInteger(n) && n >= min && n <= 2147483647;
  if (!integer(body.basePrice)) throw invalid('قیمت نامعتبر است');
  if (!['SINGLE', 'MULTI'].includes(body.inventoryMode || 'MULTI')) throw invalid('نوع موجودی نامعتبر است');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw invalid('وضعیت محصول نامعتبر است');
  const data = { title: body.title.trim(), basePrice: body.basePrice, inventoryMode: body.inventoryMode || 'MULTI', isActive: body.isActive ?? true };
  // Older clients may omit this field; PATCH must preserve the existing code.
  if (body.productCode != null) {
    if (typeof body.productCode !== 'string' || !/^[A-Z0-9][A-Z0-9-]{0,63}$/i.test(body.productCode.trim())) throw invalid('کد محصول باید شامل حروف انگلیسی، عدد و خط تیره باشد (حداکثر ۶۴ کاراکتر)');
    data.productCode = body.productCode.trim().toUpperCase();
  }
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
  data.defectImages = array(body.defectImages, true);
  data.complementaryFabrics = array(body.complementaryFabrics);
  data.seasons = array(body.seasons);
  data.uses = array(body.uses);
  if (data.seasons.some(s => !['بهار','تابستان','پاییز','زمستان'].includes(s))) throw invalid('فصل نامعتبر است');
  if (body.hasHood != null && typeof body.hasHood !== 'boolean') throw invalid('وضعیت کلاه نامعتبر است');
  data.hasHood = body.hasHood ?? null;
  if (body.technologyVerified != null && typeof body.technologyVerified !== 'boolean') throw invalid('تأیید فناوری نامعتبر است');
  data.technologyVerified = body.technologyVerified ?? false;
  if (data.fabricTechnology && (!data.technologyVerified || !data.technologyEvidence?.trim())) throw invalid('ثبت فناوری واقعی پارچه نیازمند تأیید مدیر و مستندات است؛ توضیح غیرقطعی را در یادداشت جنس وارد کنید');
  const legacyFabrics = catalog.fabricsOf({ mainFabric: data.mainFabric, complementaryFabrics: data.complementaryFabrics });
  const previousLegacy = catalog.fabricsOf({ mainFabric: current?.mainFabric, complementaryFabrics: current?.complementaryFabrics });
  if (legacyFabrics.some(label => !previousLegacy.includes(label) && fabricOptions.isClaim(label))) {
    throw invalid('فناوری واقعی پارچه را در بخش فناوری مستند ثبت کنید');
  }
  const previousFabrics = current ? catalog.fabricsOf(current) : [];
  if (Object.hasOwn(input, 'fabrics')) {
    if (!Array.isArray(input.fabrics) || input.fabrics.length > 50) throw invalid('فهرست جنس پارچه نامعتبر است');
    data.fabrics = [...new Set(array(input.fabrics))];
    if (data.fabrics.some(label => !fabricOptions.keyFor(label) || (label.length > 80 && !previousFabrics.includes(label)))) {
      throw invalid('نام جنس پارچه نامعتبر است');
    }
  } else if (current) {
    data.fabrics = [
      ...previousFabrics.filter(label => !previousLegacy.includes(label) || legacyFabrics.includes(label)),
      ...legacyFabrics.filter(label => !previousLegacy.includes(label)),
    ];
    data.fabrics = [...new Set(data.fabrics)];
  } else data.fabrics = legacyFabrics;

  data.fabricBasis = body.fabricBasis === undefined ? 'UNKNOWN' : body.fabricBasis;
  if (!catalog.fabricBases.some(([key]) => key === data.fabricBasis)) throw invalid('مبنای اعلام جنس نامعتبر است');

  const previousCategories = current ? catalog.categoriesOf(current) : [];
  if (Object.hasOwn(input, 'mainCategories')) {
    if (!Array.isArray(input.mainCategories) || input.mainCategories.length > 50) throw invalid('فهرست دسته‌های اصلی نامعتبر است');
    data.mainCategories = [...new Set(array(input.mainCategories).map(label => previousCategories.includes(label) ? label : label.trim()))];
    if (data.mainCategories.some(label => !label || (label.length > 100 && !previousCategories.includes(label)))) {
      throw invalid('نام دسته اصلی نامعتبر است');
    }
    if (!Object.hasOwn(input, 'productType') || (data.mainCategories.length
      ? !data.mainCategories.includes(data.productType)
      : !!data.productType || (data.isActive && !current?.isActive) || previousCategories.length > 0)) {
      throw invalid('یک دسته از میان دسته‌های انتخاب‌شده را به‌عنوان دسته اصلی اولویت‌دار تعیین کنید');
    }
  } else {
    // An old editor can still change the priority without discarding extra memberships.
    data.productType = data.productType?.trim() ? data.productType : current?.productType || null;
    data.mainCategories = [...new Set([...previousCategories, ...(data.productType?.trim() ? [data.productType] : [])])];
  }
  if (data.isActive && !current?.isActive && !data.mainCategories.length) {
    throw invalid('برای انتشار، دسته اصلی اولویت‌دار را تعیین کنید');
  }
  data.qualityGrade = body.qualityGrade || null;
  if (data.qualityGrade && !grades.includes(data.qualityGrade)) throw invalid('گرید نامعتبر است');
  if (!Array.isArray(body.variants) || !body.variants.length || body.variants.length > 100) throw invalid('حداقل یک ردیف سایز و موجودی لازم است؛ برای کالای تک‌آیتمی هم یک ردیف ثبت کنید');
  const skus = new Set(), combinations = new Set();
  const variants = body.variants.map(v => {
    if (!v || typeof v.sku !== 'string' || !v.sku.trim() || !integer(v.stock ?? 0) || !integer(v.priceDelta ?? 0, -2147483648) || !integer(data.basePrice + (v.priceDelta ?? 0))) throw invalid('قیمت، موجودی یا SKU سایز نامعتبر است');
    const size = data.inventoryMode === 'SINGLE' && (v.size == null || v.size === '') ? 'نامشخص' : v.size;
    const color = !data.isActive && v.color == null ? '' : v.color;
    if (typeof size !== 'string' || !size.trim() || typeof color !== 'string' || (!color.trim() && data.isActive)) throw invalid('سایز و رنگ الزامی است');
    const out = { sku: v.sku.trim(), size: size.trim(), color: color.trim(), stock: v.stock ?? 0, priceDelta: v.priceDelta ?? 0 };
    const combination = JSON.stringify([out.size, out.color]);
    if (skus.has(out.sku) || combinations.has(combination)) throw invalid('SKU یا ترکیب سایز و رنگ تکراری است');
    skus.add(out.sku); combinations.add(combination);
    for (const key of measures) {
      // Older editors do not know this field; preserve it on updates.
      if (['waistWidthCm', 'sleeveFromNeckCm'].includes(key) && v[key] === undefined) continue;
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
    out.itemDefectImages = array(v.itemDefectImages, true);
    return out;
  });
  if (data.inventoryMode === 'SINGLE' && (variants.length !== 1 || variants[0].stock > 1)) throw invalid('کالای تک‌آیتمی فقط یک سایز و حداکثر یک موجودی دارد');
  if (data.isActive && (body.publicationIntent === true || current?.isActive === false)) {
    const missing = require('../../public/admin-readiness').issues({ ...data, variants });
    if (missing.length) throw invalid('اطلاعات لازم برای انتشار ناقص است: ' + missing.map(x => x.label).join('، '));
  }
  if (data.isActive) {
    if (data.defect?.trim() && !data.defectImages.length) throw invalid('انتشار محصول دارای ایراد ثبت‌شده نیازمند حداقل یک عکس اختصاصی ایراد است');
    for (const v of variants) if (v.itemDefect?.trim() && !v.itemDefectImages.length) throw invalid('انتشار سایز دارای ایراد ثبت‌شده نیازمند عکس اختصاصی ایراد همان سایز است');
  }
  if (current && suppliedCode == null) delete data.productCode;
  return { data, variants };
}
async function resolveFabrics(db, data, previous, input) {
  if (!Object.hasOwn(input, 'fabrics')) return;
  const old = previous ? catalog.fabricsOf(previous) : [];
  const selected = new Map(fabricOptions.builtIn);
  const keys = data.fabrics.filter(label => !old.includes(label)).map(fabricOptions.keyFor);
  const customKeys = [...new Set(keys.filter(key => !selected.has(key)))];
  if (customKeys.length) {
    const custom = await db.fabricOption.findMany({ where: { key: { in: customKeys } } });
    for (const { key, label } of custom) selected.set(key, label);
  }
  const fabrics = new Map();
  for (const inputLabel of data.fabrics) {
    const key = fabricOptions.keyFor(inputLabel);
    const label = old.includes(inputLabel) ? inputLabel : selected.get(key);
    if (!label) throw invalid('جنس پارچه باید از فهرست انتخاب شود');
    if (!fabrics.has(key)) fabrics.set(key, label);
  }
  data.fabrics = [...fabrics.values()];
}

function productError(err, next) {
  if (err.code === 'P2002') return next(Object.assign(new Error(err.meta?.target?.includes('productCode') ? 'کد یکتای محصول قبلاً ثبت شده است' : 'SKU یا سایز و رنگ تکراری است'), { statusCode: 409 }));
  if (err.code === 'P2034') return next(conflict());
  next(err);
}
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const current = await tx.product.findUnique({ where: { id: req.params.id }, include: { variants: true } });
      if (!current) throw Object.assign(new Error('محصول پیدا نشد'), { statusCode: 404 });
      if (req.body.updatedAt !== current.updatedAt.toISOString()) throw conflict();
      const { data, variants } = normalize(req.body, current);
      await resolveFabrics(tx, data, current, req.body);
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
    await resolveFabrics(prisma, data, null, req.body);
    res.status(201).json(await prisma.product.create({ data: { ...data, variants: { create: variants } }, include: { variants: true } }));
  } catch (err) { productError(err, next); }
});
module.exports = router;

