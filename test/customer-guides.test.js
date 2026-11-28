const test=require('node:test'),assert=require('node:assert/strict');
const {sections}=require('../src/lib/customer-guides');
const policy=require('../src/lib/shipping-policy');
const baseline={...policy.defaults,...policy.thresholds,revision:'guide-fixture'};
test('shipping guide explains the agreed customer policy without internal instructions',()=>{
 const g=sections('shipping-guide',baseline);
 assert.equal(g.title,'راهنمای ارسال سفارش‌ها');
 assert.deepEqual(g.groups.map(x=>x.title),['ارسال با پست پیشتاز','ارسال با پیک در تهران و کرج','شرایط ارسال رایگان','پرداخت هزینه ارسال','نشانی و زمان تحویل']);
 const text=g.groups.flatMap(x=>x.paragraphs).join('\n');
 assert.match(text,/۵٬۰۰۰٬۰۰۰ تومان و بیشتر/);
 assert.match(text,/شهر کرج از ۵٬۰۰۰٬۰۰۰ تومان و در شهر تهران از ۷٬۰۰۰٬۰۰۰ تومان/);
 for(const phrase of ['پس از اعمال تخفیف','فقط مبلغ کالاها','جداگانه و هنگام تحویل','تیپاکس غیرفعال است.','تأیید امکان ارسال و هماهنگی با پشتیبانی'])assert(text.includes(phrase));
 assert.doesNotMatch(text,/ثبت شود|تنظیمات فروشگاه|تأییدیه|نگه‌داری|مبدأ کرج/);
 assert.deepEqual(g.groups.flatMap(x=>x.times||[]),['استان البرز: '+policy.defaults.postalLocalEta,'سایر استان‌ها: '+policy.defaults.postalEta,'شهر کرج: '+policy.defaults.karajEta,'شهر تهران: '+policy.defaults.tehranEta]);
});
test('guide amounts and delivery times still follow editable policy',()=>{
 const custom={...policy.defaults,...policy.thresholds,postalFreeThreshold:6000000,karajFreeThreshold:6500000,tehranFreeThreshold:8000000,postalEta:'زمان ثبت‌شدهٔ فروشگاه'};
 const g=sections('shipping-guide',custom),text=g.groups.flatMap(x=>x.paragraphs).join(' ');
 assert(text.includes('۶٬۰۰۰٬۰۰۰ تومان و بیشتر'));assert(text.includes('۶٬۵۰۰٬۰۰۰ تومان'));assert(text.includes('۸٬۰۰۰٬۰۰۰ تومان'));
 assert(g.groups[0].times.includes('سایر استان‌ها: زمان ثبت‌شدهٔ فروشگاه'));
});
test('tracking guide keeps live SMS availability conditional',()=>{
 assert(sections('tracking-guide',baseline,false).paragraphs.some(p=>p.includes('پیگیری پیامکی هنوز فعال نشده است')));
 assert(sections('tracking-guide',baseline,true).paragraphs.some(p=>p.includes('پیگیری پیامکی در دسترس است')));
});
