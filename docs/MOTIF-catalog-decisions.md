# MOTIF — دسته‌بندی و اندازه واقعی

تصمیم‌های تأییدشدهٔ ۱۴ اکتبر ۲۰۲۶:

- دو مسیر کشف محصول: نیاز مشتری و نوع کالا. لایهٔ احساس/سبک از رابط حذف شد.
- ترتیب و واژه‌های دقیق نیازها: روزمره، ورزشی، پاییزه، مناسب سرما، مناسب کار.
- نوع کالا در منوی سه‌خط سمت راست و انتخاب‌گر مجموعه در دسترس است.
- اندازهٔ واقعی هر آیتم مبنای فیلتر است؛ سایز لیبل اختیاری باقی می‌ماند.
- بازهٔ عرض زیربغل و قد لباس، یا عرض کمرِ صاف و قد شلوار؛ مرزهای بازه شامل می‌شوند.
- موجودی و تمام اندازه‌ها باید در یک آیتم منطبق باشند. اندازهٔ خالی یا صفر در فیلتر فعال پذیرفته نمی‌شود.
- قیمت کارت از آیتم‌های منطبق محاسبه می‌شود و همان آیتم هنگام ورود انتخاب می‌شود.
- پنل امکان انتخاب چند نیاز دارد. برچسب‌های قبلی با علامت بازبینی باقی می‌مانند؛ هیچ دسته‌ای از روی متن آزاد حدس زده نمی‌شود.
- اطلاعات styles قدیمی حفظ می‌شوند ولی در رابط کاربر و فرم مدیریت نمایش داده نمی‌شوند.

## اندازه‌گیری و سازگاری داده

chestWidthCm عرض مستقیم زیربغل تا زیربغلِ لباس روی سطح صاف است.
waistWidthCm فیلد جدید و اختیاری برای عرض کمر شلوارِ بسته، بدون کشش، روی سطح صاف است.
waistCm همان دادهٔ قدیمی باقی می‌ماند و به عرض تبدیل نمی‌شود. پنل آن را فقط برای بازبینی نشان می‌دهد.
عرض کمر قدیمی باید با اندازه‌گیری مجدد در فیلد جدید ثبت شود. دادهٔ ثبت‌نشده از نتایج بازهٔ کمر حذف می‌شود.

## پیش‌نیاز استقرار — هنوز اجرا نشده

این مخزن تاریخچهٔ migration ندارد؛ برای یک ستون جدید نباید migrate dev یا reset روی دیتابیس عملیاتی اجرا شود.
پیش از اجرای نسخه جدید سرور، مدیر استقرار باید SQL افزایشی db/add-waist-width.sql را با مجوز مربوط اجرا کند، سپس Prisma Client را از schema جدید بسازد.
اجرای کد جدید پیش از افزودن ستون می‌تواند خواندن محصولات را مختل کند. این PR تا انجام آماده‌سازی دیتابیس نباید روی Railway مستقر شود.
SQL داده‌ای پاک یا تبدیل نمی‌کند. بازگشت کد به نسخه قبل نیازمند حذف ستون نیست.
تنظیمات Railway/DNS یا دیتابیس واقعی در این کار تغییر نکرده‌اند.

## اعتبارسنجی

- آزمون‌های واحد: node --test test/*.test.js
- آزمون ویترین با API شبیه‌سازی‌شده: node test/storefront.cjs و node test/measurement-browser.cjs
- پنل و PostgreSQL موقت: workflow Product management checks
- تغییر موجودی با سفارش در PR مستقل #4 پیگیری می‌شود؛ این تغییر ادعای فعال‌بودن خرید ندارد.

## ادامهٔ سئوی فنی

- صفحه هر محصول در /products/:id مستقیماً از سرور با HTML قابل‌خواندن، عنوان، توضیح، canonical و Open Graph پاسخ می‌دهد.
- لینک‌های قبلی #product/... در مرورگر به مسیر جدید تبدیل می‌شوند؛ انتخاب آیتم در query می‌ماند و canonical بدون query است.
- صفحه اصلی لینک معمولی به محصولات دارد. sitemap.xml فقط کالاهای فعال و موجود را فهرست می‌کند.
- ناموجود/غیرفعال طبق سیاست فعلی 404 است؛ خطای دیتابیس 503 می‌دهد، نه صفحه خالی با وضعیت 200.
- robots.txt برنامه مسیر sitemap را معرفی می‌کند. Cloudflare ممکن است پاسخ robots را در لبه تغییر دهد؛ پس از استقرار باید پاسخ زنده بررسی شود. هیچ تنظیم Cloudflare تغییر نکرده است.
- canonical روی https://motifdress.com ثابت است و از Host درخواست ساخته نمی‌شود. تغییر مسیر دامنه Railway یا www در این تغییر انجام نشده است.
- Search Console، داده ساختاریافته Product/Offer و ارزیابی سرعت با عکس واقعی هنوز کارهای بعدی‌اند. قیمت فعلی به تومان است؛ برای هر Offer آینده تبدیل صحیح به واحد پشتیبانی‌شده باید بررسی شود.

## Direct photo uploads
- Admin can upload multiple product photos or photos belonging to one variant, preview them, remove a reference, and choose the cover (first photo). Product Save persists the URLs through the existing product API.
- `/api/uploads/images` requires the existing admin token before multipart parsing. One file/request, 10 MiB, JPEG/PNG/WebP, maximum 50 million decoded pixels; animated images and unsupported formats (including HEIC/SVG) are rejected with guidance. Sharp auto-orients, strips metadata/GPS and emits WebP up to 2000px. One upload at a time per server process bounds memory.
- Storage: Cloudinary (already present dependency). The existing Railway variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are supported as a complete set and take precedence. Alternatively use `CLOUDINARY_URL`. The owner confirmed all three existing values match the Cloudinary account; no credential changes are needed. Never put this secret in browser code, git or chat. No production variables or accounts have been changed by this PR. Missing configuration yields 503; manual HTTPS image links still work.
- Images are public product assets. Uploaded files survive Railway deployments. Removing a photo from a form only removes its product reference; it does not delete a potentially shared Cloudinary asset. Unused/cancelled uploads remain in `motif/products` for later manual cleanup after checking references.
- Uploads are sequential and partial successes remain in the form. Save/switch/close/delete actions are guarded while upload is pending; final product Save remains required. No database migration is needed for images. The earlier additive waist-width SQL prerequisite still applies to the complete PR.
- Validation: real HTTP multipart + Sharp decoding tests use an injected fake storage provider (no external account billed); browser test checks mobile upload, partial failure, cover selection, per-variant isolation and save payload. A live Cloudinary round trip still needs deployment credentials.
