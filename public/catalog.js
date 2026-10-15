(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotifCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const needs = ['روزمره', 'ورزشی', 'پاییزه', 'مناسب سرما', 'مناسب کار'];
  function number(value) {
    const s = String(value ?? '').trim().replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
      .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/٫/g, '.');
    if (!s) return null;
    return /^\d+(\.\d+)?$/.test(s) && Number(s) > 0 ? Number(s) : NaN;
  }
  function range(min, max) {
    const lo = number(min), hi = number(max);
    return { min: lo, max: hi, valid: !Number.isNaN(lo) && !Number.isNaN(hi) && (lo === null || hi === null || lo <= hi) };
  }
  function within(value, bounds) {
    if (!bounds.valid) return false;
    if (bounds.min === null && bounds.max === null) return true;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 &&
      (bounds.min === null || value >= bounds.min) && (bounds.max === null || value <= bounds.max);
  }
  function variants(product, filter) {
    const widthKey = filter.kind === 'pants' ? 'waistWidthCm' : 'chestWidthCm';
    const lengthKey = filter.kind === 'pants' ? 'totalLengthCm' : 'lengthCm';
    return (product.variants || []).filter(v => v.stock > 0 &&
      (!filter.size || v.size === filter.size) && within(v[widthKey], filter.width) && within(v[lengthKey], filter.length));
  }
  return { needs, range, within, variants };
});
