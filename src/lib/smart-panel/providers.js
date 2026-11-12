'use strict';

const { fail } = require('./validation');

const mock = {
  async analyze({ images, simulateFailure }) {
    if (simulateFailure) throw fail(503, 'AI_UNAVAILABLE', 'تحلیل آزمایشی قطع شد. پرونده و تصاویر حفظ شدند.');
    const evidence = images[0];
    const labelKind = evidence.groups.includes('label') ? 'label' : 'image';
    return [
      { key: 'labelSize', value: 'L', kind: labelKind, imageId: evidence.id },
      { key: 'name', value: 'بادگیر مدل تِرِیل', kind: 'image', imageId: evidence.id },
      { key: 'type', value: 'بادگیر', kind: 'image', imageId: evidence.id },
      { key: 'fabric', value: 'پلی‌آمید', kind: labelKind, imageId: evidence.id },
    ];
  },
  async research({ fields, simulateFailure }) {
    if (simulateFailure) throw fail(503, 'AI_UNAVAILABLE', 'تحقیق آزمایشی قطع شد. اطلاعات دستی حفظ شدند.');
    const { depth, scope, brand } = fields;
    return {
      depth, scope, at: new Date().toISOString(), lines: [
        'پاسخ ثابت آزمایشی. برای این اجرا هیچ جست‌وجوی وبی انجام نشده است.',
        brand ? 'شواهد درباره برند: نامشخص.' : 'تاریخچه برند برای محصول فاقد برند بررسی نمی‌شود.',
      ],
      suggestedContent: [
        brand ? 'اطلاعات مستند درباره هویت برند نامشخص است.' : '',
        'نمونه آزمایشی برای توضیح طراحی محصول.',
        'نمونه آزمایشی برای پیشنهاد استفاده روزمره.',
      ],
    };
  },
};
const disabled = {
  async analyze() { throw fail(503, 'AI_UNAVAILABLE', 'تحلیل در دسترس نیست. ثبت دستی فعال است.'); },
  async research() { throw fail(503, 'AI_UNAVAILABLE', 'تحقیق در دسترس نیست. ثبت دستی فعال است.'); },
};

// Adapters return suggestions and provenance. They have no database writer.
function providerFor(name) {
  if (name === 'mock') return mock;
  if (name === 'disabled') return disabled;
  throw fail(400, 'INVALID_PROVIDER', 'این ارائه‌دهنده در محیط آزمایشی فعال نیست.');
}
module.exports = { providerFor };
