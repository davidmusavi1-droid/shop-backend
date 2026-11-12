'use strict';

const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const invalid = message => fail(400, 'INVALID_INPUT', message);
const conflict = () => fail(409, 'VERSION_CONFLICT', 'نسخهٔ پرونده تغییر کرده است. نسخهٔ سرور و تغییرات این تب را بررسی کنید.');
const duplicate = () => fail(409, 'CODE_TAKEN', 'این کد قبلاً رزرو شده یا در فهرست محصولات موجود است.');
const groups = ['product', 'label', 'defect'];
const depths = ['سریع', 'استاندارد', 'عمیق'];
const scopes = ['تمام محصول', 'هویت برند', 'طراحی محصول', 'جنس پارچه', 'فناوری پارچه', 'کاربردها', 'لیبل محصول'];
const strings = ['name', 'brand', 'styleNumber', 'type', 'color', 'labelSize', 'country', 'neck', 'closure', 'observed', 'technology', 'defect'];
const arrays = ['fabric', 'design', 'season', 'uses'];
const numbers = ['chest', 'length', 'sleeve', 'waist', 'waistCircumference', 'rise', 'total', 'thigh', 'hem', 'price', 'stock'];
const grades = ['N', 'A+', 'A', 'B', 'C'];
const normalDigits = value => value.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
const normalizeCode = value => normalDigits(value).trim().toUpperCase();
const codePattern = /^MOTIF-[0-9]{3}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function emptyPayload() {
  return {
    ...Object.fromEntries([...strings, ...numbers].map(key => [key, ''])),
    ...Object.fromEntries(arrays.map(key => [key, []])),
    grade: '', depth: 'استاندارد', scope: 'تمام محصول', sources: {},
    content: Array.from({ length: 3 }, () => ({ text: '', approved: false })),
    gallery: [], mainImage: '', analysis: null, labelObservations: [], research: null,
    styleConfirmed: false, researchSubjectRevision: null,
  };
}
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function string(value, max) {
  if (typeof value !== 'string' || value.length > max || value.includes('\u0000')) throw invalid('مقدار متنی نامعتبر است.');
  return value.trim();
}
function fieldNumber(value, key) {
  const input = normalDigits(string(value, 35)).replace(/[٬,\s]/g, '').replace('٫', '.');
  if (!input) return '';
  const integer = key === 'price' || key === 'stock';
  if (!(integer ? /^\d+$/ : /^\d+(?:\.\d{1,3})?$/).test(input) ||
      Number(input) > (integer ? 2147483647 : 1000)) {
    throw invalid('مقدار قیمت، موجودی یا اندازه نامعتبر است.');
  }
  return String(Number(input));
}
function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2147483647) throw invalid('نسخهٔ پرونده نامعتبر است.');
  return value;
}

function draftFields(raw, current) {
  if (!object(raw)) throw invalid('اطلاعات پرونده نامعتبر است.');
  const payload = { ...current };
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (key === 'styleNumber') {
      const style = normalDigits(string(value, 64));
      if (style && !/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(style)) throw invalid('شمارهٔ استایل نامعتبر است.');
      payload.styleNumber = style;
    } else if (strings.includes(key)) payload[key] = string(value, ['observed', 'defect'].includes(key) ? 3000 : 240);
    else if (numbers.includes(key)) payload[key] = fieldNumber(value, key);
    else if (arrays.includes(key)) {
      if (!Array.isArray(value) || value.length > 30) throw invalid('تعداد گزینه‌ها نامعتبر است.');
      payload[key] = [...new Set(value.map(option => string(option, 80)).filter(Boolean))];
    } else if (key === 'grade' || key === 'depth' || key === 'scope') {
      const options = key === 'grade' ? ['', ...grades] : key === 'depth' ? depths : scopes;
      if (!options.includes(value)) throw invalid('گزینهٔ فرم نامعتبر است.');
      payload[key] = value;
    } else if (key === 'content') {
      if (!Array.isArray(value) || value.length !== 3) throw invalid('متن فروشگاهی سه بخش دارد.');
      payload.content = value.map((item, index) => {
        if (!object(item)) throw invalid('متن فروشگاهی نامعتبر است.');
        const text = string(item.text, 4000);
        return { text, approved: current.content[index].approved && text === current.content[index].text };
      });
    } else throw invalid('فیلد قابل ویرایش نیست.');
  }
  if (payload.brand !== current.brand || (payload.styleNumber || '') !== (current.styleNumber || '')) {
    payload.styleConfirmed = false;
    payload.researchSubjectRevision = randomUUID();
  }
  // Provenance from a mock survives only while the suggested value is intact.
  payload.sources = Object.fromEntries(Object.entries(current.sources).filter(([key]) =>
    isDeepStrictEqual(current[key], payload[key])));
  return payload;
}

function galleryFields(raw, images) {
  if (!object(raw) || !Array.isArray(raw.gallery) || raw.gallery.length > 24) throw invalid('گالری نامعتبر است.');
  const seen = new Set();
  const gallery = raw.gallery.map(item => {
    if (!object(item) || !images.some(image => image.id === item.id) || seen.has(item.id) ||
      !Array.isArray(item.groups) || item.groups.length < 1 || item.groups.length > groups.length ||
      new Set(item.groups).size !== item.groups.length || !item.groups.every(group => groups.includes(group))) {
      throw invalid('فایل باید متعلق به پرونده باشد و حداقل یک گروه معتبر داشته باشد.');
    }
    seen.add(item.id);
    return { id: item.id, groups: item.groups };
  });
  const products = gallery.filter(item => item.groups.includes('product'));
  const mainImage = raw.mainImage || '';
  if (products.length ? !products.some(item => item.id === mainImage) : Boolean(mainImage)) {
    throw invalid('تصویر اصلی باید از گروه محصول باشد.');
  }
  return { gallery, mainImage };
}

function approvalIssues(payload, code) {
  const required = ['name', 'type', 'color', 'grade'];
  const measures = payload.type === 'شلوار'
    ? ['waist', 'rise', 'total', 'thigh', 'hem']
    : ['chest', 'length', 'sleeve'];
  const missing = required.filter(key => !payload[key]);
  missing.push(...measures.filter(key => !(Number(payload[key]) > 0)));
  if (!codePattern.test(code || '')) missing.push('code');
  if (!payload.fabric.length) missing.push('fabric');
  if (!(Number(payload.price) > 0)) missing.push('price');
  if (payload.stock === '') missing.push('stock');
  if (!payload.mainImage) missing.push('mainImage');
  if (payload.grade === 'C' && !payload.defect) missing.push('defect');
  if ((payload.grade === 'C' || payload.grade === 'B' && payload.defect) &&
    !payload.gallery.some(item => item.groups.includes('defect'))) missing.push('defectImage');
  return missing;
}

module.exports = {
  fail, invalid, conflict, duplicate, emptyPayload, draftFields, galleryFields,
  normalizeCode, codePattern, uuid, expectedVersion, approvalIssues, depths, scopes,
};
