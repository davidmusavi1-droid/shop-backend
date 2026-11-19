# پایلوت Sandbox زیبال

## قرارداد رسمی

بازبینی در ۱۸ نوامبر ۲۰۲۶ انجام شد. صفحهٔ `help.zibal.ir` در این بررسی پاسخ نداد. مبنای حالت تست، کد افزونهٔ رسمی زیبال در مخزن `zibalco/zibal-drupalcommerce` و کامیت `4788231301320da4970293ca735512ad3d3d8f4d` است.

- [انتخاب پذیرندهٔ ثابت `zibal` در حالت `test`، درخواست پرداخت، Callback و انتقال به `/start/{trackId}`](https://github.com/zibalco/zibal-drupalcommerce/blob/4788231301320da4970293ca735512ad3d3d8f4d/src/PluginForm/OffsiteRedirect/PaymentOffsiteForm.php)
- [انتخاب پذیرندهٔ تست در verify و اعتبارسنجی سمت سرور](https://github.com/zibalco/zibal-drupalcommerce/blob/4788231301320da4970293ca735512ad3d3d8f4d/src/Plugin/Commerce/PaymentGateway/OffsiteRedirect.php)
- [API رسمی Node.js، مسیرهای request/verify و Callback با http/https](https://github.com/zibalco/gateway-nodejs/blob/d486a98b2a10de8dc2838cc1ac2ef8f4959d96fd/src/index.js)
- [مسیر رسمی صفحهٔ پرداخت در افزونهٔ ClassiPress](https://github.com/zibalco/wordpress-zibal-ClassiPress/blob/main/README.md)

حالت تست از `https://gateway.zibal.ir/v1/request` و `verify` و صفحهٔ `https://gateway.zibal.ir/start/{trackId}` با پذیرندهٔ `zibal` استفاده می‌کند. دامنهٔ جداگانه‌ای برای Sandbox در این منابع معرفی نشده است. تبدیل تومان به ریال و کنترل مبلغ، منطق موجود برنامه است.

## تنظیمات مستقل

```dotenv
NODE_ENV=test
PORT=3000
MOTIF_CHECKOUT_PREVIEW=true
MOTIF_ZIBAL_PROVIDER=sandbox
MOTIF_ZIBAL_SANDBOX_ORIGIN=https://motif-checkout-test.liara.run
MOTIF_ZIBAL_SANDBOX_MAX_TOMANS=200000
ADMIN_ORIGIN=https://motif-checkout-test.liara.run
```

`DATABASE_URL` فقط به سرویس مستقل `motif-checkout-test-db:5432/postgres` با رمز مستقل اشاره کند. برای آزمون محلی، `localhost` یا `127.0.0.1` و دیتابیس `motif_sandbox` مجاز است. پارامترهای اضافی URL دیتابیس پذیرفته نمی‌شوند. `ADMIN_TOKEN` تصادفی و مستقل در متغیر محیطی سرویس تنظیم شود. مقادیر محرمانه در بسته یا مخزن قرار نگیرند.

متغیرهای `ZIBAL_MERCHANT` و `ZIBAL_CALLBACK_URL` در محیط Sandbox تنظیم نشوند. پذیرندهٔ تست در کد ثابت است. تنظیم ناقص یا اتصال به دیتابیس خارج از فهرست مجاز، پیش از بارگذاری Prisma مانع شروع سرور می‌شود. تنظیم Production با تابع موجود `configureLiveZibal` ادامه دارد.

Callback اختصاصی برابر `https://motif-checkout-test.liara.run/api/payment/sandbox/verify` است. ریشهٔ HTTPS باید صریحاً با `ADMIN_ORIGIN` یکسان باشد و از دامنهٔ تولید مستقل باشد. مسیر عمومی `/api/payment/verify` در حالت Sandbox پاسخ 404 می‌دهد. شناسهٔ ناشناخته یا پارامتر تکراری `trackId` پذیرفته نمی‌شود. پارامترهای `success`، `status` و `amount` مرورگر مرجع تأیید پرداخت نیستند. تأیید معتبر سمت سرور و تطبیق ریالی الزامی است.

## آزمون هدفمند

`node --test test/zibal-sandbox.test.js test/zibal-live.test.js`

آزمون جدید Express واقعی را با Prisma جایگزین‌شده در حافظه و پاسخ‌های قراردادی سرویس اجرا می‌کند. درخواست، مبلغ ریالی، پذیرنده و Callback، درخواست تکراری، بازگشت، Callback جعلی، اختلاف مبلغ، قطعی verify، ثبت یک‌باره و محدودکردن مقصد انتقال در frontend پوشش داده می‌شوند. آزمون‌های قبلی PostgreSQL تکرار نمی‌شوند.

## اجرای بعدی روی لیارا

۱. بعد از تأیید هزینه، دو سرویس آزمایشی روی شبکهٔ مستقل ساخته شوند. دیتابیس خالی با داده‌های ساختگی آماده شود. شناسهٔ مقصد بستهٔ استقرار صریحاً `motif-checkout-test` باشد.

۲. تنظیمات بالا قبل از اولین استقرار ثبت شوند. Node.js 22، پورت 3000 و Callback HTTPS محیط آزمایشی بررسی شوند.

۳. سفارش ساختگی زیر سقف مبلغ ثبت شود. دکمهٔ «ورود به درگاه آزمایشی زیبال» باید صفحهٔ رسمی زیبال را باز کند. از کنترل‌های شبیه‌سازی همان صفحه برای بازگشت استفاده شود. از ورود اطلاعات کارت واقعی خودداری شود.

۴. وضعیت پرداخت و مبلغ سفارش در دیتابیس مستقل و تکرار Callback بررسی شود. شواهد ثبت شوند. حذف دو سرویس و داده‌های ساختگی پس از تأیید مالک، سپس نبود منابع آزمایشی در فهرست لیارا کنترل شود.

نرخ آخرین پایلوت برنامه ۱٬۴۵۱ و دیتابیس ۱٬۱۴۶ تومان در ساعت با مالیات بود. مجموع تقریبی برای ۳۰ دقیقه ۱٬۲۹۹ و برای دو ساعت ۵٬۱۹۴ تومان است. این ارقام برآورد هستند. تعرفهٔ نهایی، نحوهٔ گردکردن مصرف، ترافیک و هر هزینهٔ جانبی در پنل پیش از ساخت دوباره بررسی و تأیید جداگانه دریافت شود.

## محدودیت‌ها

اتصال بیرونی و صفحهٔ واقعی Sandbox در این مرحله اجرا نشده‌اند. پذیرش Callback دامنهٔ موقت، محدودیت IP، رفتار inquiry در پذیرندهٔ تست و کنترل‌های دقیق صفحهٔ شبیه‌سازی باید در اجرای مجاز بعدی مشاهده شوند. آزمون‌های قراردادی محلی اثبات دسترس‌پذیری API بیرونی نیستند. هزینه یا تغییر سرویس اصلی برای رفع این ابهام‌ها مجاز نیست.
