'use strict';

const normalize = value => String(value || '').normalize('NFKC').trim().toUpperCase()
  .replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
const codeKey = value => {
  const match = /^MOTIF-(\d{1,12})$/.exec(normalize(value));
  return match ? 'MOTIF-' + (match[1].replace(/^0+/, '') || '0') : null;
};
const valid = value => /^MOTIF-\d{3,9}$/.test(value || '') && codeKey(value) !== 'MOTIF-0' &&
  value === 'MOTIF-' + codeKey(value).slice(6).padStart(3, '0');
const error = (code, message, status = 409) => Object.assign(new Error(message), { code, status, statusCode: status });

async function checkCode(tx, code, { productId = '', dossierId = '', final = false } = {}) {
  if (final && !valid(code)) throw error('MOTIF_CODE_INVALID',
    'برای تأیید نهایی یا انتشار، کد را با قالب MOTIF-001 و حداقل سه رقم وارد کنید. کد قبلی خودکار تغییر نمی‌کند.', 422);
  const key = codeKey(code);
  if (!key) return;
  // Every writer uses the same lock, including aliases such as MOTIF-13 / MOTIF-013.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ 'motif-code:' + key }))::text AS locked`;
  const rows = await tx.$queryRaw`
    SELECT "id", "productCode" FROM "Product" WHERE "id" <> ${productId}
    AND upper(translate(btrim("productCode"), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')) ~ '^MOTIF-[0-9]+$'
    AND coalesce(nullif(ltrim(split_part(translate(btrim("productCode"), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '-', 2), '0'), ''), '0') = ${key.slice(6)}`;
  const registry = await tx.smartCode.findMany({ select: { code: true, dossierId: true } });
  if (rows.length || registry.some(row => codeKey(row.code) === key && row.dossierId !== dossierId)) {
    throw error('MOTIF_CODE_TAKEN', 'کد یکتای محصول قبلاً استفاده یا رزرو شده است؛ تفاوت صفرهای اول، کد تازه ایجاد نمی‌کند.');
  }
}
module.exports = { normalize, codeKey, valid, checkCode };
