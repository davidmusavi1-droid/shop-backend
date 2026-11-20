'use strict';

const express = require('express');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { mkdir, writeFile, unlink, lstat, open } = require('node:fs/promises');
const { O_NOFOLLOW, O_NONBLOCK, O_RDONLY } = require('node:fs').constants;
const { isDeepStrictEqual } = require('node:util');
const sharp = require('sharp');
const V = require('../lib/smart-panel/validation');
const { approvedSections, reviewedFabric } = require('../lib/smart-panel/store');
const { mapType, mapFabric } = require('../lib/smart-panel/suggestion-options');
const { checkCode } = require('../lib/motif-code');
const budget = require('../lib/smart-panel/ai-budget');
const { lifecycle, releaseStaleUnsent } = require('../lib/smart-panel/ai-lifecycle');
const { providerFor } = require('../lib/smart-panel/providers');
const { checkResearchSubject, mockFinding, brandResearchState, sameSubject,
  displayResearch, researchAction, changeDraft } = require('../lib/smart-panel/brand-research');

const base = '/api/admin/smart-panel';
const limit = 3_000_000;
const include = { images: { select: { id: true, name: true, size: true, digest: true } }, reservation: true };
const suggestionFields = ['brand', 'labelSize', 'fabric', 'type', 'name'];
const pilotDigests = [
  '7f0713a68fd6cd89cdee22195247ea2eada8eccbb60e549eb334f4c8237d6a84',
  '7014b55fbdc9caaccd20f4ec8a296e913f9efaf705d71bf219d43cb5a91b6ca0',
  '1a92ea43b7c1676e906497cc527a764bade9f73329628b4570549b92091eae67',
];
const notFound = () => V.fail(404, 'NOT_FOUND', 'پرونده یا فایل پیدا نشد.');

const imageTypes = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const imageFormat = name => /\.png$/i.test(name) ? 'png' : /\.webp$/i.test(name) ? 'webp' : 'jpeg';

function serializeDossier(row) {
  const { gallery, ...fields } = row.payload;
  const research = displayResearch(fields);
  const draft = research?.draft;
  const images = new Map(row.images.map(image => [image.id, image]));
  return {
    ...fields, styleNumber: fields.styleNumber || '', research,
    researchDraft: research?.draftCurrent && draft.status === 'pending' ? { id: draft.id, sections: draft.sections } : null,
    id: row.id, productId: row.productId ?? null, version: row.version, updated: row.updatedAt,
    phase: row.phase, approvedVersion: row.approvedVersion, archivedAt: row.archivedAt,
    code: row.proposedCode || '', reserved: row.reservation?.code || '',
    publication: 'none', sale: 'نامشخص',
    images: gallery.map(item => {
      const { id, name, size } = images.get(item.id);
      return { id, name, size, groups: item.groups, valid: true, format: { png: 'PNG', jpeg: 'JPG', webp: 'WebP' }[imageFormat(name)], url: base + '/dossiers/' + row.id + '/images/' + id };
    }),
  };
}

async function current(db, id) {
  if (!V.uuid.test(id)) throw notFound();
  const row = await db.smartDossier.findUnique({ where: { id }, include });
  if (!row || row.archivedAt) throw notFound();
  return row;
}

async function legacyHasCode(db, code) {
  const rows = await db.$queryRaw`
    SELECT 1 FROM "Product" WHERE
      upper(translate(btrim("productCode"), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')) = ${code}
    LIMIT 1`;
  return rows.length > 0;
}

function createRouter(db, { storageDir, c2, store = false, storage }) {
  const router = express.Router();
  let uploadsInFlight = 0;
  let mockInFlight = 0;
  const liveResearch = c2?.operations.includes('research') === true;
  const researchMode = liveResearch ? 'live' : store ? 'off' : 'mock';
  const imageDigests = c2?.imageDigests || pilotDigests;
  const activeImage = (row, hash) => row.images.find(image => image.digest === hash &&
    row.payload.gallery.some(item => item.id === image.id && !item.groups.includes('defect')));
  const storeImages = row => row.payload.gallery.filter(item => !item.groups.includes('defect'))
    .slice(0, 4).map(item => row.images.find(image => image.id === item.id));
  const canAnalyze = row => c2?.operations.includes('analyze') === true && (store
    ? storeImages(row).length > 0
    : Date.now() < c2.expiresAt && imageDigests.every(hash => activeImage(row, hash)));
  const serialize = row => ({ ...serializeDossier(row), store, researchMode, canAnalyze: canAnalyze(row),
    analysis: row.payload.analysis?.map(item => ({ ...item, ...(store && ['type', 'fabric'].includes(item.key)
      ? { mappedValue: item.key === 'type' ? mapType(item.value) : mapFabric(item.value) } : {}) })) || null });
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const analysisScope = row => row.id + ':' +
    digest(JSON.stringify([...new Set(storeImages(row).map(image => image.digest))].sort()));
  const filePath = id => path.join(storageDir, id + '.jpg');
  const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });

  const event = (tx, req, row, action, version = row.version) => tx.smartEvent.create({
    data: { dossierId: row.id, action, version, actor: digest(req.adminSession.tokenHash).slice(0, 16) },
  });
  // The conditional UPDATE locks the matching revision before side effects in
  // the transaction. Another tab can never commit with the same version.
  const mutate = async (req, version, action, plan) => db.$transaction(async tx => {
    const row = await current(tx, req.params.id);
    if (row.version !== V.expectedVersion(version)) throw V.conflict();
    const changes = await plan(row);
    if (!changes) return row;
    const { data, after } = changes;
    const changed = await tx.smartDossier.updateMany({
      where: { id: row.id, version, archivedAt: null },
      data: { ...(store && row.phase === 'approved' ? resetReview : {}), ...data, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw V.conflict();
    if (after) await after(tx);
    await event(tx, req, row, action, version + 1);
    return tx.smartDossier.findUniqueOrThrow({ where: { id: row.id }, include });
  });

  const resetReview = { phase: 'draft', approvedVersion: null };

  router.get('/store/status', (req, res, next) => store ? res.json({ enabled: true }) : next(notFound()));
  const usageToday = async tx => budget.summarize(await tx.smartAiRun.findMany({
    where: { at: { gte: budget.utcDay() } }, select: { operation: true, usage: true, status: true },
  }), c2 || { dailyLimit: Math.min(Number(process.env.MOTIF_C22_DAILY_LIMIT) || 0, 20), ...budget.budgetConfig(process.env) });
  router.get('/ai/usage', wrap(async (req, res) => res.json(await usageToday(db))));
  router.get('/dossiers/:id/ai/quote', wrap(async (req, res) => {
    if (!store || !['analyze', 'research'].includes(req.query.operation)) throw notFound();
    const row = await current(db, req.params.id);
    res.json(budget.quote(row, req.query.operation, c2, await usageToday(db)));
  }));
  router.post('/store/products/:productId/dossier', wrap(async (req, res) => {
    const { productId } = req.params;
    if (!store || !V.uuid.test(productId)) throw notFound();
    const row = await db.$transaction(async tx => {
      const product = await tx.product.findUnique({ where: { id: productId },
        select: { title: true, brand: true, productType: true } });
      if (!product) throw notFound();
      const payload = V.draftFields({ name: product.title.slice(0, 240), brand: (product.brand || '').slice(0, 240),
        type: (product.productType || '').slice(0, 240) }, V.emptyPayload());
      const { count } = await tx.smartDossier.createMany({ data: { productId, payload }, skipDuplicates: true });
      const dossier = await tx.smartDossier.findUniqueOrThrow({ where: { productId }, include });
      if (dossier.archivedAt) throw notFound();
      if (count) await event(tx, req, dossier, 'created');
      return dossier;
    });
    res.json(serialize(row));
  }));

  router.get('/dossiers/:id/store-transfer', wrap(async (req, res) => {
    if (!store) throw notFound();
    const row = await current(db, req.params.id);
    if (!row.productId) throw notFound();
    const product = await db.product.findUnique({ where: { id: row.productId },
      select: { updatedAt: true, brand: true, productType: true, mainCategories: true, fabrics: true, mainFabric: true, complementaryFabrics: true, fabricBasis: true, fabricNote: true, identityHistory: true, identityDesign: true, identityUseCases: true } });
    if (!product) throw notFound();
    const sections = Object.fromEntries(Object.entries(approvedSections(row.payload)).filter(([key]) => !product[key]?.trim()));
    const { brand, type, sources, analysis, gallery } = row.payload;
    const accepted = (key, value, kind) => sources[key] === kind &&
      analysis?.some(item => item.key === key && (key === 'type'
        ? mapType(item.value) === mapType(value) : item.value.trim() === value?.trim()) &&
        gallery.some(image => image.id === item.imageId));
    const suggestions = {};
    if (!product.brand?.trim() && brand?.trim() && accepted('brand', brand, 'label')) suggestions.brand = brand;
    if (!product.productType && !product.mainCategories.length && mapType(type) &&
        accepted('type', type, 'image')) suggestions.productType = mapType(type);
    const fabric = reviewedFabric(product, row.payload);
    if (fabric) suggestions.fabric = fabric;
    res.json({ id: row.id, version: row.version, productId: row.productId, updatedAt: product.updatedAt,
      brand, sections, suggestions, gallery: row.payload.gallery
        .filter(item => item.groups.includes('product') && !item.groups.includes('defect'))
        .map(item => row.payload.imageLinks?.[item.id]).filter(Boolean) });
  }));

  router.get('/dossiers/:id/store-images', wrap(async (req, res) => {
    if (!store) throw notFound();
    const row = await current(db, req.params.id);
    const product = row.productId && await db.product.findUnique({ where: { id: row.productId },
      select: { images: true, updatedAt: true } });
    res.json({ updatedAt: product?.updatedAt, images: product?.images.flatMap((url, index) =>
      storage?.canRead(url) ? [{ index }] : []) || [] });
  }));

  router.get('/dossiers', wrap(async (req, res) => {
    const after = req.query.after;
    if (after !== undefined && (typeof after !== 'string' || !V.uuid.test(after))) throw V.invalid('نشانگر فهرست نامعتبر است.');
    const rows = await db.smartDossier.findMany({
      where: { archivedAt: null, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: 'asc' }, take: 51, include,
    });
    res.json({ items: rows.slice(0, 50).map(serialize), next: rows.length > 50 ? rows[49].id : null });
  }));
  router.post('/dossiers', wrap(async (req, res) => {
    if (store) throw notFound();
    const { id } = req.body ?? {};
    if (!V.uuid.test(id || '')) throw V.invalid('شناسهٔ داخلی نامعتبر است.');
    // Client-generated UUID also serves as the retry key for lost responses.
    const row = await db.$transaction(async tx => {
      const inserted = await tx.smartDossier.createMany({
        data: { id, payload: V.emptyPayload() }, skipDuplicates: true,
      });
      const dossier = await current(tx, id);
      if (inserted.count) await event(tx, req, dossier, 'created');
      return dossier;
    });
    res.status(201).json(serialize(row));
  }));
  router.get('/dossiers/:id', wrap(async (req, res) => res.json(serialize(await current(db, req.params.id)))));

  router.patch('/dossiers/:id', wrap(async (req, res) => {
    const { version, fields, code } = req.body ?? {};
    const row = await mutate(req, version, 'saved', currentRow => {
      const { researchDraft, ...editable } = fields ?? {};
      const previousPayload = researchDraft === undefined ? currentRow.payload : changeDraft(currentRow.payload, researchDraft);
      const payload = V.draftFields(fields && typeof fields === 'object' && !Array.isArray(fields) ? editable : fields, previousPayload);
      if (code !== undefined && (typeof code !== 'string' || code.length > 32 || code.includes('\u0000'))) {
        throw V.invalid('کد پیشنهادی نامعتبر است.');
      }
      const proposedCode = code === undefined ? currentRow.proposedCode : V.normalizeCode(code) || null;
      if (currentRow.reservation && proposedCode !== currentRow.reservation.code) {
        throw V.fail(409, 'CODE_RESERVED', 'کد رزروشدهٔ این پرونده قابل تغییر نیست.');
      }
      if (isDeepStrictEqual(payload, currentRow.payload) && proposedCode === currentRow.proposedCode) return null;
      const { depth, scope, research, ...effective } = payload;
      const { depth: previousDepth, scope: previousScope, research: previousResearch, ...previous } = currentRow.payload;
      const changed = !isDeepStrictEqual(effective, previous) || proposedCode !== currentRow.proposedCode;
      return { data: { payload, proposedCode, ...(changed ? resetReview : {}) } };
    });
    res.json(serialize(row));
  }));

  router.get('/codes', wrap(async (req, res) => {
    const [registry, catalog] = await Promise.all([
      db.smartCode.findMany({ orderBy: { code: 'asc' }, include: { dossier: { select: { archivedAt: true, retiredReason: true, phase: true, payload: true } } } }),
      db.product.findMany({ where: { productCode: { not: null } }, select: { id: true, productCode: true, title: true } }),
    ]);
    res.json({
      reserved: registry.map(row => ({
        code: row.code, dossierId: row.dossierId, name: row.dossier?.payload.name || '',
        archived: !row.dossier || Boolean(row.dossier.archivedAt), reason: row.dossier?.retiredReason || null, phase: row.dossier?.phase ?? null,
      })),
      legacy: catalog.map(item => ({ ...item, normalized: V.normalizeCode(item.productCode) })),
    });
  }));

  router.post('/dossiers/:id/review', wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, 'review_requested', currentRow =>
      currentRow.phase === 'draft' ? { data: { phase: 'review' } } : null);
    res.json(serialize(row));
  }));

  router.post('/dossiers/:id/approve', wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, 'approved', currentRow => {
      if (currentRow.phase === 'approved') return null;
      if (store) {
        if (!currentRow.productId || !currentRow.payload.name?.trim()) {
          throw V.invalid('برای تأیید، نام پرونده و اتصال به محصول لازم است.');
        }
        const version = currentRow.version + 1;
        return {
          data: { phase: 'approved', approvedVersion: version },
          after: async tx => {
            const product = await tx.product.findUnique({
              where: { id: currentRow.productId }, select: { productCode: true },
            });
            if (!product) throw notFound();
            await checkCode(tx, product.productCode, { productId: currentRow.productId, dossierId: currentRow.id, final: true });
            await tx.smartApproval.create({
              data: { dossierId: currentRow.id, version, snapshot: { code: product.productCode, fields: currentRow.payload } },
            });
          },
        };
      }
      const code = currentRow.proposedCode;
      const issues = V.approvalIssues(currentRow.payload, code);
      if (issues.length) throw Object.assign(V.fail(422, 'INCOMPLETE', 'موارد ضروری بازبینی کامل نشده‌اند.'), { issues });
      const version = currentRow.version + 1;
      return {
        data: { phase: 'approved', approvedVersion: version },
        after: async tx => {
          if (!currentRow.reservation) {
            if (await legacyHasCode(tx, code)) throw V.duplicate();
            const result = await tx.smartCode.createMany({ data: { code, dossierId: currentRow.id }, skipDuplicates: true });
            if (!result.count) throw V.duplicate();
          }
          await tx.smartApproval.create({
            data: { dossierId: currentRow.id, version, snapshot: { code, fields: currentRow.payload } },
          });
        },
      };
    });
    res.json(serialize(row));
  }));

  const retire = reason => wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, reason, currentRow => {
      if (store && currentRow.productId) throw V.invalid('این پرونده به محصول متصل است.');
      return { data: { archivedAt: new Date(), retiredReason: reason } };
    });
    res.json({ id: row.id, retired: true, reason });
  });
  router.post('/dossiers/:id/archive', retire('archived'));
  router.delete('/dossiers/:id', retire('deleted'));

  const addImage = (req, version, image, bytes, sourceUrl) => mutate(req, version, 'image_added', row => {
    if (row.payload.gallery.length >= 24) throw V.invalid('حداکثر ۲۴ عکس در هر پرونده مجاز است.');
    const payload = { ...row.payload, ...(store && { analysis: null, labelObservations: [] }), gallery: [...row.payload.gallery, { id: image.id, groups: ['product'] }],
      mainImage: row.payload.mainImage || image.id,
      ...(sourceUrl && { imageLinks: { ...row.payload.imageLinks, [image.id]: sourceUrl } }) };
    return { data: { payload, ...resetReview },
      after: tx => tx.smartImage.create({ data: { ...image, dossierId: row.id, ...(store && { bytes }) } }) };
  });

  router.post('/dossiers/:id/store-images', wrap(async (req, res) => {
    if (!store) throw notFound();
    if (uploadsInFlight >= 2) throw V.fail(429, 'UPLOAD_BUSY', 'بارگذاری دیگری در جریان است.');
    uploadsInFlight++;
    try {
      const row = await current(db, req.params.id);
      const { index, version, updatedAt } = req.body ?? {};
      if (row.version !== V.expectedVersion(version)) throw V.conflict();
      if (!row.productId || !Number.isSafeInteger(index) || index < 0 || row.payload.gallery.length >= 24) {
        throw V.invalid('عکس انتخاب‌شده یا ظرفیت گالری معتبر نیست.');
      }
      const product = await db.product.findUnique({ where: { id: row.productId }, select: { images: true, updatedAt: true } });
      if (!product || product.updatedAt.toISOString() !== updatedAt) throw V.conflict();
      const url = product?.images[index];
      if (!storage?.canRead(url)) throw notFound();
      let bytes, format;
      try {
        bytes = await storage.read(url, limit);
        const picture = sharp(bytes, { limitInputPixels: 50_000_000, failOn: 'warning' });
        const meta = await picture.metadata();
        format = meta.format;
        if (!imageTypes[format] || (meta.pages || 1) > 1) throw new Error('format');
        await picture.stats();
      } catch {
        throw V.fail(503, 'IMAGE_UNAVAILABLE', 'خواندن عکس محصول ممکن نشد.');
      }
      if (bytes.length > limit) throw V.invalid('حجم عکس بیش از ۳ مگابایت است.');
      const hash = digest(bytes);
      if (row.payload.gallery.some(item => row.images.some(image => image.id === item.id && image.digest === hash))) {
        return res.json(serialize(row));
      }
      const updated = await addImage(req, version, { id: randomUUID(), name: 'product-' + (index + 1) + '.' + (format === 'jpeg' ? 'jpg' : format),
        size: bytes.length, digest: hash }, bytes, url);
      res.status(201).json(serialize(updated));
    } finally { uploadsInFlight--; }
  }));

  // Stage public gallery URLs only after the manager reviews the selected photos.
  // Product data is unchanged until the manager explicitly saves the parent form.
  router.post('/dossiers/:id/store-gallery-export', wrap(async (req, res) => {
    if (!store || !storage?.upload) throw V.fail(503, 'STORAGE_UNAVAILABLE', 'فضای تصاویر آماده نیست.');
    const row = await current(db, req.params.id);
    if (row.version !== V.expectedVersion(req.body?.version)) throw V.conflict();
    const product = row.productId && await db.product.findUnique({ where: { id: row.productId }, select: { updatedAt: true } });
    if (!product || req.body.updatedAt !== product.updatedAt.toISOString()) throw V.conflict();
    const selected = row.payload.gallery.filter(item => item.groups.includes('product') && !item.groups.includes('defect'));
    if (!selected.length) throw V.invalid('ابتدا عکس‌های گروه محصول را انتخاب کنید.');
    const links = { ...row.payload.imageLinks };
    for (const item of selected) {
      if (links[item.id]) continue;
      const image = await db.smartImage.findUnique({ where: { id: item.id }, select: { bytes: true, name: true, digest: true } });
      if (!image?.bytes || image.bytes.length > limit) throw notFound();
      const uploaded = await storage.upload(Buffer.from(image.bytes), { format: imageFormat(image.name), digest: image.digest });
      if (!uploaded?.url || !storage.canRead(uploaded.url)) throw V.fail(503, 'STORAGE_UNAVAILABLE', 'ذخیرهٔ تصویر تکمیل نشد.');
      links[item.id] = uploaded.url;
    }
    if (isDeepStrictEqual(links, row.payload.imageLinks || {})) return res.json({ dossier: serialize(row) });
    const updated = await mutate(req, row.version, 'gallery_export_prepared', currentRow => ({
      data: { payload: { ...currentRow.payload, imageLinks: links } },
    }));
    res.json({ dossier: serialize(updated) });
  }));

  router.post('/dossiers/:id/images',
    (req, res, next) => {
      if (!req.is(Object.values(imageTypes))) return next(V.fail(415, 'INVALID_IMAGE', 'فایل نهایی باید JPG یا PNG باشد.'));
      if (uploadsInFlight >= 2) return next(V.fail(429, 'UPLOAD_BUSY', 'بارگذاری دیگری در جریان است.'));
      uploadsInFlight++;
      let released = false;
      const release = () => { if (!released) { released = true; uploadsInFlight--; } };
      express.raw({ type: Object.values(imageTypes), limit, inflate: false })(req, res, err => {
        if (err) { release(); return next(err); }
        req.releaseUpload = release;
        next();
      });
    },
    wrap(async (req, res) => {
      try {
        const id = req.query.imageId;
        const name = req.query.name;
        const version = /^\d+$/.test(req.query.version || '') ? Number(req.query.version) : -1;
        if (!V.uuid.test(id || '') || typeof name !== 'string' || name.length > 200 ||
          /[\x00-\x1f\\/]/.test(name) || !/\.(?:jpe?g|png)$/i.test(name) || !req.is(imageTypes[imageFormat(name)])) throw V.invalid('نام یا شناسهٔ تصویر معتبر نیست.');
        if (!Buffer.isBuffer(req.body) || !req.body.length) throw V.invalid('فایل تصویر خالی است.');
        const row = await current(db, req.params.id);
        const hash = digest(req.body);
        const prior = row.images.find(image => image.id === id);
        if (prior) {
          if (prior.digest !== hash || !row.payload.gallery.some(item => item.id === id)) throw V.conflict();
          return res.status(200).json(serialize(row));
        }
        if (row.version !== V.expectedVersion(version)) throw V.conflict();
        let image;
        try {
          image = sharp(req.body, { limitInputPixels: 50_000_000, failOn: 'warning' });
          const metadata = await image.metadata();
          if (metadata.format !== imageFormat(name) || (metadata.pages || 1) > 1) throw new Error('format');
          await image.stats();
        } catch { throw V.fail(415, 'INVALID_IMAGE', 'محتوای فایل تصویر معتبر نیست.'); }

        const record = { id, name, size: req.body.length, digest: hash };
        if (store) {
          if (row.payload.gallery.some(item => row.images.some(image => image.id === item.id && image.digest === hash))) {
            return res.json(serialize(row));
          }
          const updated = await addImage(req, version, record, req.body);
          return res.status(201).json(serialize(updated));
        }

        await mkdir(storageDir, { recursive: true, mode: 0o700 });
        const dir = await lstat(storageDir);
        if (!dir.isDirectory() || (dir.mode & 0o077)) throw V.fail(500, 'UNSAFE_STORAGE', 'فضای خصوصی عکس آماده نیست.');
        const filename = filePath(id);
        try { await writeFile(filename, req.body, { flag: 'wx', mode: 0o600 }); }
        catch (error) {
          if (error.code === 'EEXIST') throw V.fail(409, 'UPLOAD_RETRY', 'درخواست فایل قبلاً شروع شده است. پرونده را دوباره بررسی کنید.');
          throw error;
        }
        try {
          const updated = await addImage(req, version, record);
          res.status(201).json(serialize(updated));
        } catch (error) {
          // Keep a possible committed file on unknown database/network failures.
          // Orphans are private and can be inspected during test cleanup.
          if (error.status && error.status < 500) await unlink(filename).catch(() => {});
          throw error;
        }
      } finally { req.releaseUpload(); }
    }),
  );
  router.get('/dossiers/:id/images/:imageId', wrap(async (req, res) => {
    const row = await current(db, req.params.id);
    const id = req.params.imageId;
    const record = row.images.find(item => item.id === id);
    if (!V.uuid.test(id) || !record ||
      !row.payload.gallery.some(item => item.id === id)) throw notFound();
    if (store) {
      const image = await db.smartImage.findUnique({ where: { id }, select: { bytes: true } });
      if (!image?.bytes) throw notFound();
      return res.type(imageTypes[imageFormat(record.name)]).send(Buffer.from(image.bytes));
    }
    res.type(imageTypes[imageFormat(record.name)]).sendFile(filePath(id), { dotfiles: 'allow', cacheControl: false }, error => {
      if (error && !res.headersSent) res.status(404).json({ code: 'NOT_FOUND', error: 'فایل پیدا نشد.' });
    });
  }));
  router.patch('/dossiers/:id/images', wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, 'gallery_changed', currentRow => {
      const allowed = currentRow.images.filter(img => currentRow.payload.gallery.some(item => item.id === img.id));
      const gallery = V.galleryFields(req.body, allowed);
      const payload = { ...currentRow.payload, ...gallery };
      if (isDeepStrictEqual(payload, currentRow.payload)) return null;
      if (store && analysisScope(currentRow) !== analysisScope({ ...currentRow, payload })) {
        payload.analysis = null;
        payload.labelObservations = [];
      }
      // Removing a gallery reference hides it; original bytes remain for recovery/history.
      return { data: { payload, ...resetReview } };
    });
    res.json(serialize(row));
  }));

  router.post('/dossiers/:id/ai/:operation(analyze|research)', wrap(async (req, res) => {
    if (store) throw notFound();
    const operation = req.params.operation;
    if (!['analyze', 'research'].includes(operation)) throw notFound();
    const provider = providerFor(req.body?.provider ?? 'mock');
    if (mockInFlight >= 2) throw V.fail(429, 'AI_BUSY', 'درخواست آزمایشی دیگری در جریان است.');
    mockInFlight++;
    try {
      const row = await current(db, req.params.id);
      if (row.version !== V.expectedVersion(req.body?.version)) throw V.conflict();
      if (operation === 'research' && (liveResearch || row.payload.research?.kind === 'brand')) {
        throw V.fail(409, 'BRAND_RESEARCH_REQUIRED', 'برای بررسی منبع از مسیر تحقیق برند استفاده کنید.');
      }
      const images = [...row.payload.gallery].sort((a, b) => Number(b.groups.includes('label')) - Number(a.groups.includes('label')))
        .map(item => ({ ...row.images.find(image => image.id === item.id), groups: item.groups }));
      if (operation === 'analyze' && !images.length) throw V.invalid('برای تحلیل، ابتدا یک تصویر ثبت کنید.');
      let result;
      try {
        result = await provider[operation]({ images, fields: row.payload, simulateFailure: req.body?.simulateFailure === true });
      } catch (error) {
        await event(db, req, row, 'ai_unavailable');
        throw error;
      }
      const updated = await mutate(req, req.body.version, 'ai_mock_completed', currentRow => ({
        data: { payload: { ...currentRow.payload, [operation === 'analyze' ? 'analysis' : 'research']: result } },
      }));
      res.json(serialize(updated));
    } finally { mockInFlight--; }
  }));

  const c2RunSelect = {
    id: true, operation: true, version: true, status: true, model: true,
    at: true, usage: true, result: true, errorCode: true,
  };

  async function pilotImages(row) {
    const selected = store ? storeImages(row) : imageDigests.map(hash => activeImage(row, hash));
    if (!selected.length || selected.some(image => !image)) throw V.invalid('فایل‌های تأییدشدهٔ این آزمون باید در گالری فعال پرونده باشند.');
    return Promise.all(selected.map(async image => {
      try {
        if (store) {
          const data = await db.smartImage.findUnique({ where: { id: image.id }, select: { bytes: true } });
          const bytes = data?.bytes && Buffer.from(data.bytes);
          if (!bytes || bytes.length !== image.size || bytes.length > limit || digest(bytes) !== image.digest) throw notFound();
          return { id: image.id, bytes, mime: imageTypes[imageFormat(image.name)] };
        }
        const file = await open(filePath(image.id), O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
        try {
          const stat = await file.stat();
          if (!stat.isFile() || (stat.mode & 0o077) || stat.size !== image.size || stat.size > limit) throw notFound();
          const bytes = Buffer.alloc(stat.size);
          const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
          if (bytesRead !== bytes.length || digest(bytes) !== image.digest) throw notFound();
          return { id: image.id, bytes, mime: imageTypes[imageFormat(image.name)] };
        } finally { await file.close(); }
      } catch { throw V.fail(422, 'AI_IMAGE_MISMATCH', 'فایل خصوصی با مرجع آزمون تطبیق ندارد.'); }
    }));
  }

  async function lockRevision(tx, id, version) {
    const [locked] = await tx.$queryRaw`
      SELECT "version" FROM "SmartDossier"
      WHERE "id" = ${id} AND "archivedAt" IS NULL FOR UPDATE`;
    if (locked?.version !== version) throw V.conflict();
  }

  router.get('/dossiers/:id/ai/c2', wrap(async (req, res) => {
    const row = await current(db, req.params.id);
    res.json({ runs: await db.smartAiRun.findMany({
      where: { dossierId: row.id }, orderBy: { at: 'asc' }, select: c2RunSelect,
    }) });
  }));

  function checkPilotWindow() {
    if (!store && Date.now() >= c2.expiresAt) throw V.fail(503, 'AI_WINDOW_CLOSED', 'مهلت اجرای آزمایشی به پایان رسیده است.');
  }

  router.post('/dossiers/:id/ai/c2/:operation(analyze|research)', wrap(async (req, res) => {
    const operation = req.params.operation;
    const research = operation === 'research';
    if ((store || !research) && !c2?.operations.includes(operation)) {
      throw V.fail(503, 'AI_UNAVAILABLE', 'اجرای واقعی این عملیات فعال نیست.');
    }
    const version = V.expectedVersion(req.body?.version);
    const allowed = research ? ['version', 'mode', 'labelConfirmed', 'simulateFailure', 'quote'] : ['version', 'quote'];
    if (Object.keys(req.body).some(key => !allowed.includes(key))) throw V.invalid('ورودی اجرای AI نامعتبر است.');
    if (research && (req.body.mode !== researchMode ||
        (req.body.simulateFailure !== undefined && (liveResearch || typeof req.body.simulateFailure !== 'boolean')))) {
      throw V.invalid('حالت اجرای تحقیق با تنظیمات سرور سازگار نیست.');
    }
    const row = await current(db, req.params.id);
    if (row.version !== version) throw V.conflict();
    const estimate = store ? budget.verifyQuote(req.body.quote, row, operation, c2) : null;
    if (store && !row.productId) throw notFound();
    const id = randomUUID();
    if (research) {
      checkResearchSubject(row.payload, req.body.labelConfirmed, liveResearch);
      if (store && !await db.smartAiRun.findFirst({
        where: { operation: 'analyze', scope: analysisScope(row), status: 'completed' }, select: { id: true },
      })) throw V.fail(422, 'AI_ANALYSIS_REQUIRED', 'ابتدا تحلیل عکس‌های فعلی را کامل کنید.');
      if (sameSubject(row.payload.research, row.payload) && row.payload.research.mode === researchMode) {
        return res.json({ dossier: serialize(row) });
      }
      if (!liveResearch) {
        if (req.body.simulateFailure) {
          await event(db, req, row, 'ai_unavailable');
          throw V.fail(503, 'AI_UNAVAILABLE', 'تحقیق آزمایشی قطع شد. اطلاعات دستی حفظ شدند.');
        }
        const updated = await mutate(req, version, 'brand_research_mocked', currentRow => ({
          data: { payload: { ...currentRow.payload,
            research: brandResearchState(currentRow.payload, mockFinding(currentRow.payload.brand), researchMode, id) } },
        }));
        return res.json({ dossier: serialize(updated) });
      }
    }
    checkPilotWindow();
    const images = research ? [] : await pilotImages(row);
    const model = research ? c2.researchModel : c2.model;
    const scope = !store ? 'pilot' : research
      ? row.id + ':' + digest(JSON.stringify([row.payload.brand, row.payload.styleNumber || '', row.payload.researchSubjectRevision]))
      : analysisScope(row);

    const reservationUsage = estimate ? { estimateUsd: estimate.estimateUsd, estimateToman: estimate.estimateToman } : {};
    const tracked = lifecycle(db, id, scope, reservationUsage);
    let cancelled = req.aborted || res.destroyed;
    const cancel = () => { cancelled = true; };
    const closed = () => { if (!res.writableEnded) cancel(); };
    req.once('aborted', cancel); res.once('close', closed);
    const cleanup = () => { req.off('aborted', cancel); res.off('close', closed); };
    let outcome, providerInvoked = false;
    if (cancelled) { cleanup(); throw V.fail(409, 'AI_CANCELLED_BEFORE_SEND', 'درخواست پیش از رزرو لغو شد.'); }
    try {

      await db.$transaction(async tx => {
        if (store) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(22022)::text AS locked`;
          await releaseStaleUnsent(tx);
        budget.verifyQuote(req.body.quote, row, operation, c2);
          budget.checkCapacity(await usageToday(tx), c2, operation);
        }
        await lockRevision(tx, row.id, version);
        // Reserve before sending. A restart, timeout or duplicate cannot repeat the paid operation.
        const inserted = await tx.smartAiRun.createMany({
          data: { id, operation, scope, model, dossierId: row.id, version, status: 'pending',
            usage: tracked.reservationUsage }, skipDuplicates: true,
        });
        if (!inserted.count) throw V.fail(409, 'AI_ALREADY_ATTEMPTED', 'سهم این عملیات قبلاً استفاده شده است. گزارش اجرا را بررسی کنید.');
      });

      checkPilotWindow();
      const recordResponse = store ? undefined : rawResponse => db.smartAiRun.update({
        where: { id }, data: { rawResponse }, select: { id: true },
      });
      const hooks = { beforeSend: tracked.beforeSend, isCancelled: () => cancelled };
      if (cancelled) throw V.fail(409, 'AI_CANCELLED_BEFORE_SEND', 'درخواست پیش از ارسال لغو شد.');
      providerInvoked = true;
      outcome = research ? await c2.provider.research({
        brand: row.payload.brand, styleNumber: row.payload.styleNumber || '',
      }, recordResponse, hooks) : await c2.provider.analyze(images, recordResponse, hooks);
      await mutate(req, version, research ? 'brand_research_completed' : 'ai_c2_analyzed', currentRow => {
        const field = research
          ? { research: { ...brandResearchState(currentRow.payload, outcome.result, researchMode, id), usage: outcome.usage } }
          : { analysis: outcome.result.analysis, labelObservations: outcome.result.labelObservations || [] };
        return {
          data: { payload: { ...currentRow.payload, ...field } },
          after: tx => tx.smartAiRun.update({ where: { id }, data: {
            status: 'completed', result: outcome.result, usage: tracked.completed(outcome.usage),
          } }),
        };
      });
      res.json({ run: await db.smartAiRun.findUniqueOrThrow({ where: { id }, select: c2RunSelect }),
        dossier: serialize(await current(db, row.id)) });
    } catch (error) {
      // Never free a possibly sent request, including timeout/network/persistence failures.
      await tracked.failed(error, { providerInvoked, outcome });
      throw error;
    } finally { cleanup(); }
  }));

  router.post('/dossiers/:id/style-confirmation', wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, 'style_confirmed', ({ payload }) => {
      if (!payload.styleNumber || req.body.styleNumber !== payload.styleNumber) {
        throw V.invalid('ابتدا شمارهٔ استایل مورد تأیید را ذخیره کنید.');
      }
      if (payload.styleConfirmed === true) return null;
      return { data: { payload: { ...payload, styleConfirmed: true }, ...resetReview } };
    });
    res.json(serialize(row));
  }));

  router.post('/dossiers/:id/brand-research/:action', wrap(async (req, res) => {
    const { action } = req.params;
    if (!['verify-source', 'reject-source', 'generate', 'apply-draft', 'reject-draft', 'review-draft'].includes(action)) throw notFound();
    const row = await mutate(req, req.body?.version, 'brand_research_' + action.replace('-', '_'), currentRow => {
      const payload = researchAction(currentRow.payload, action, req.body);
      return payload === currentRow.payload ? null : { data: {
        payload, ...(action === 'apply-draft' ? resetReview : {}),
      } };
    });
    res.json(serialize(row));
  }));

  router.post('/dossiers/:id/ai/accept', wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, 'suggestion_accepted', currentRow => {
      const suggestion = currentRow.payload.analysis?.find(item => item.key === req.body.key);
      if (!suggestion || !suggestionFields.includes(suggestion.key) ||
          !currentRow.payload.gallery.some(item => item.id === suggestion.imageId)) {
        throw V.invalid('پیشنهاد معتبر و دارای تصویر لازم است.');
      }
      const { key, kind } = suggestion;
      const value = store && key === 'type' ? mapType(suggestion.value)
        : store && key === 'fabric' ? mapFabric(suggestion.value) : suggestion.value;
      if (!value) throw V.invalid('این پیشنهاد با گزینه‌های فروشگاه تطبیق قطعی ندارد. گزینهٔ مناسب را دستی انتخاب کنید.');
      const original = currentRow.payload[key];
      if (store && (Array.isArray(original) ? original.length : original?.trim())) {
        throw V.conflict();
      }
      const replacement = Array.isArray(original) ? [...new Set([...original, value])] : value;
      const payload = V.draftFields({ [key]: replacement }, currentRow.payload);
      payload.sources[key] = kind;
      return { data: { payload, ...resetReview } };
    });
    res.json(serialize(row));
  }));

  router.post('/dossiers/:id/content/:index', wrap(async (req, res) => {
    const index = Number(req.params.index);
    if (![0, 1, 2].includes(index) || !/^[0-2]$/.test(req.params.index) ||
      typeof req.body?.approve !== 'boolean') throw V.invalid('درخواست تأیید متن نامعتبر است.');
    const row = await mutate(req, req.body.version, 'content_reviewed', currentRow => {
      const content = structuredClone(currentRow.payload.content);
      if (req.body.approve && !content[index].text) throw V.invalid('ابتدا متن این بخش را وارد کنید.');
      if (content[index].approved === req.body.approve) return null;
      content[index].approved = req.body.approve;
      return { data: { payload: { ...currentRow.payload, content }, ...resetReview } };
    });
    res.json(serialize(row));
  }));

  router.get('/events', wrap(async (req, res) => {
    const events = await db.smartEvent.findMany({
      take: 100, orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { dossierId: true, action: true, version: true, at: true },
    });
    res.json(events);
  }));

  // The phase D interface is fail-closed in the phase B runtime.
  router.post(['/dossiers/:id/queue', '/dossiers/:id/publish-test'], (req, res) => {
    res.status(409).json({ code: 'PHASE_D_REQUIRED', error: 'صف و ارسال آزمایشی در فاز D فعال می‌شوند.' });
  });

  router.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', error: 'مسیر پیدا نشد.' }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ code: 'IMAGE_TOO_LARGE', error: 'حداکثر حجم فایل ۳٬۰۰۰٬۰۰۰ بایت است.' });
    if (error.code === 'P2034') error = V.conflict();
    const status = error.status ?? 500;
    if (status >= 500 && status !== 503 && !['AI_INVALID_RESPONSE', 'AI_TIMEOUT'].includes(error.code)) {
      console.error('Smart panel operation failed', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNKNOWN');
      return res.status(500).json({ code: 'INTERNAL', error: 'خطا در پردازش درخواست پنل آزمایشی.' });
    }
    res.status(status).json({ code: error.code || 'INVALID_INPUT', error: error.message, issues: error.issues });
  });
  return router;
}

function assets(store = false) {
  return express.static(path.resolve(__dirname, '../../private/smart-panel'), {
    setHeaders(res) {
      res.set({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors " + (store ? "'self'" : "'none'") + "; base-uri 'none'",
      });
    },
  });
}
module.exports = { createRouter, assets };
