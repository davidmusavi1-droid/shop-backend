'use strict';

const express = require('express');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { mkdir, writeFile, unlink, lstat } = require('node:fs/promises');
const { isDeepStrictEqual } = require('node:util');
const sharp = require('sharp');
const V = require('../lib/smart-panel/validation');
const { providerFor } = require('../lib/smart-panel/providers');

const base = '/api/admin/smart-panel';
const limit = 3_000_000;
const include = { images: true, reservation: true };
const notFound = () => V.fail(404, 'NOT_FOUND', 'پرونده یا فایل پیدا نشد.');

function serialize(row) {
  const { gallery, ...fields } = row.payload;
  const images = new Map(row.images.map(image => [image.id, image]));
  return {
    ...fields, id: row.id, version: row.version, updated: row.updatedAt,
    phase: row.phase, approvedVersion: row.approvedVersion, archivedAt: row.archivedAt,
    code: row.proposedCode || '', reserved: row.reservation?.code || '',
    publication: 'none', sale: 'نامشخص',
    images: gallery.map(item => {
      const { id, name, size } = images.get(item.id);
      return { id, name, size, groups: item.groups, valid: true, format: 'JPG', url: base + '/dossiers/' + row.id + '/images/' + id };
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

function createRouter(db, { storageDir }) {
  const router = express.Router();
  let uploadsInFlight = 0;
  let mockInFlight = 0;
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
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
      where: { id: row.id, version, archivedAt: null }, data: { ...data, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw V.conflict();
    if (after) await after(tx);
    await event(tx, req, row, action, version + 1);
    return tx.smartDossier.findUniqueOrThrow({ where: { id: row.id }, include });
  });

  const resetReview = { phase: 'draft', approvedVersion: null };

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
      const payload = V.draftFields(fields, currentRow.payload);
      if (code !== undefined && (typeof code !== 'string' || code.length > 32 || code.includes('\u0000'))) {
        throw V.invalid('کد پیشنهادی نامعتبر است.');
      }
      const proposedCode = code === undefined ? currentRow.proposedCode : V.normalizeCode(code) || null;
      if (currentRow.reservation && proposedCode !== currentRow.reservation.code) {
        throw V.fail(409, 'CODE_RESERVED', 'کد رزروشدهٔ این پرونده قابل تغییر نیست.');
      }
      if (isDeepStrictEqual(payload, currentRow.payload) && proposedCode === currentRow.proposedCode) return null;
      const { depth, scope, ...effective } = payload;
      const { depth: previousDepth, scope: previousScope, ...previous } = currentRow.payload;
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
    const row = await mutate(req, req.body?.version, reason, () => ({
      data: { archivedAt: new Date(), retiredReason: reason },
    }));
    res.json({ id: row.id, retired: true, reason });
  });
  router.post('/dossiers/:id/archive', retire('archived'));
  router.delete('/dossiers/:id', retire('deleted'));

  router.post('/dossiers/:id/images',
    (req, res, next) => {
      if (!req.is('image/jpeg')) return next(V.fail(415, 'INVALID_IMAGE', 'فایل نهایی باید JPG باشد.'));
      if (uploadsInFlight >= 2) return next(V.fail(429, 'UPLOAD_BUSY', 'بارگذاری دیگری در جریان است.'));
      uploadsInFlight++;
      let released = false;
      const release = () => { if (!released) { released = true; uploadsInFlight--; } };
      express.raw({ type: 'image/jpeg', limit, inflate: false })(req, res, err => {
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
          /[\x00-\x1f\\/]/.test(name) || !/\.jpe?g$/i.test(name)) throw V.invalid('نام یا شناسهٔ JPG معتبر نیست.');
        if (!Buffer.isBuffer(req.body) || !req.body.length) throw V.invalid('فایل JPG خالی است.');
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
          if ((await image.metadata()).format !== 'jpeg') throw new Error('format');
          await image.stats();
        } catch { throw V.fail(415, 'INVALID_IMAGE', 'محتوای فایل JPG معتبر نیست.'); }

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
          const updated = await mutate(req, version, 'image_added', currentRow => {
            if (currentRow.payload.gallery.length >= 24) throw V.invalid('حداکثر ۲۴ عکس در هر پرونده مجاز است.');
            const payload = {
              ...currentRow.payload,
              gallery: [...currentRow.payload.gallery, { id, groups: ['product'] }],
              mainImage: currentRow.payload.mainImage || id,
            };
            return {
              data: { payload, ...resetReview },
              after: tx => tx.smartImage.create({ data: { id, dossierId: currentRow.id, name, size: req.body.length, digest: hash } }),
            };
          });
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
    if (!V.uuid.test(id) || !row.images.some(item => item.id === id) ||
      !row.payload.gallery.some(item => item.id === id)) throw notFound();
    res.type('jpeg').sendFile(filePath(id), { dotfiles: 'allow', cacheControl: false }, error => {
      if (error && !res.headersSent) res.status(404).json({ code: 'NOT_FOUND', error: 'فایل پیدا نشد.' });
    });
  }));
  router.patch('/dossiers/:id/images', wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, 'gallery_changed', currentRow => {
      const allowed = currentRow.images.filter(img => currentRow.payload.gallery.some(item => item.id === img.id));
      const gallery = V.galleryFields(req.body, allowed);
      const payload = { ...currentRow.payload, ...gallery };
      if (isDeepStrictEqual(payload, currentRow.payload)) return null;
      return { data: { payload, ...resetReview } };
    });
    res.json(serialize(row));
  }));

  router.post('/dossiers/:id/ai/:operation(analyze|research)', wrap(async (req, res) => {
    const operation = req.params.operation;
    if (!['analyze', 'research'].includes(operation)) throw notFound();
    const provider = providerFor(req.body?.provider ?? 'mock');
    if (mockInFlight >= 2) throw V.fail(429, 'AI_BUSY', 'درخواست آزمایشی دیگری در جریان است.');
    mockInFlight++;
    try {
      const row = await current(db, req.params.id);
      if (row.version !== V.expectedVersion(req.body?.version)) throw V.conflict();
      const images = [...row.payload.gallery].sort((a, b) => Number(b.groups.includes('label')) - Number(a.groups.includes('label')))
        .map(item => ({ ...row.images.find(image => image.id === item.id), groups: item.groups }));
      if (operation === 'analyze' && !images.length) throw V.invalid('برای تحلیل، ابتدا یک JPG ثبت کنید.');
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

  router.post('/dossiers/:id/ai/accept', wrap(async (req, res) => {
    const row = await mutate(req, req.body?.version, 'suggestion_accepted', currentRow => {
      const suggestion = currentRow.payload.analysis?.find(item => item.key === req.body.key);
      if (!suggestion || !currentRow.payload.gallery.some(item => item.id === suggestion.imageId)) {
        throw V.invalid('پیشنهاد معتبر و دارای تصویر لازم است.');
      }
      const { key, value, kind } = suggestion;
      const original = currentRow.payload[key];
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
    if (status >= 500 && status !== 503) {
      console.error('Smart panel operation failed', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNKNOWN');
      return res.status(500).json({ code: 'INTERNAL', error: 'خطا در پردازش درخواست پنل آزمایشی.' });
    }
    res.status(status).json({ code: error.code || 'INVALID_INPUT', error: error.message, issues: error.issues });
  });
  return router;
}

function assets() {
  return express.static(path.resolve(__dirname, '../../private/smart-panel'), {
    setHeaders(res) {
      res.set({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
    },
  });
}
module.exports = { createRouter, assets };
