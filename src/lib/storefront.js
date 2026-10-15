const fs = require('node:fs');
const path = require('node:path');
const template = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const ORIGIN = 'https://motifdress.com';
const HOME_TITLE = 'MOTIF | پوشاک برای هر روز';
const HOME_DESCRIPTION = 'پوشاک مردانه روزمره، ورزشی، پاییزه، مناسب سرما و مناسب کار؛ انتخاب با اندازه واقعی و مشاهده وضعیت هر آیتم در MOTIF.';
const site=require('../../public/site-content');
const catalog=require('../../public/catalog');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const productPath = id => '/products/' + encodeURIComponent(id);
const inStock = p => p.isActive && p.variants.some(v => v.stock > 0);
const money = value => Number(value).toLocaleString('fa-IR') + ' تومان';
function description(p) {
  const text = [p.title, p.brand, p.description || p.identityPurpose, 'اندازه واقعی، وضعیت و جزئیات هر آیتم در MOTIF'].filter(Boolean).join('؛ ');
  return text.replace(/\s+/g, ' ').trim().slice(0, 180);
}
function images(p) {
  return [...new Set([...(p.images || []), ...p.variants.flatMap(v => v.itemImages || [])])].filter(src => {
    try { return new URL(src).protocol === 'https:'; } catch { return false; }
  });
}
function page({title = HOME_TITLE, summary = HOME_DESCRIPTION, pathname = '/', body = '', product = false, settings=site.defaults}) {
  return template.replace('<html lang="fa" dir="rtl">', () => `<html lang="fa" dir="rtl" data-font="${site.fontKey(settings.font)}">`)
    .replace('<title>MOTIF | پوشاک برای هر روز</title>', () => `<title>${escape(title)}</title>`)
    .replace('<!--SEO_HEAD-->', () => `<meta name="description" content="${escape(summary)}"><link rel="canonical" href="${escape(ORIGIN + pathname)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(summary)}"><meta property="og:url" content="${escape(ORIGIN + pathname)}"><meta property="og:type" content="website">`)
    .replace('<!--SERVER_CONTENT-->', () => `<section id="serverContent">${body}</section>`)
    .replace('<div id="socials" class="socials" aria-label="شبکه‌های اجتماعی"></div>',()=>`<div id="socials" class="socials" aria-label="شبکه‌های اجتماعی">${socials(settings)}</div>`);
}
function socials(settings){return settings.socials.filter(s=>s.enabled).map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)}</a>`).join('');}
const measures = [['chestWidthCm','عرض زیربغل'],['lengthCm','قد لباس'],['waistWidthCm','عرض کمر روی سطح صاف'],['riseCm','فاق'],['totalLengthCm','قد شلوار'],['thighWidthCm','عرض ران'],['hemWidthCm','عرض دمپا']];
function renderProduct(p, settings=site.defaults) {
  const rows = p.variants.map(v => {
    const sizes = measures.filter(([key]) => Number.isFinite(v[key]) && v[key] > 0)
      .map(([key,label]) => `${label}: ${v[key].toLocaleString('fa-IR')} سانتی‌متر`).join('؛ ');
    return `<li><strong>${escape(v.size)} · ${escape(v.color)}</strong><p>${escape(money(p.basePrice + v.priceDelta))} · ${v.stock > 0 ? 'موجود' : 'ناموجود'}</p><p>${escape(sizes || 'اندازه ثبت نشده')}</p><p>${escape(v.itemCondition || p.condition || '')}</p><p>${escape(v.itemDefect || p.defect || '')}</p></li>`;
  }).join('');
  const identity = [['identityOrigin','خاستگاه'],['identityHistory','تاریخچه'],['identityPurpose','هدف طراحی'],['identityUseCases','کاربردها'],['identityDesign','طراحی'],['identityTechnical','ویژگی‌های فنی'],['identitySources','منابع']]
    .filter(([key]) => p[key]).map(([key,label]) => `<h2>${label}</h2><p class="copy">${escape(p[key])}</p>`).join('');
  const pictures = images(p).map(src => `<div class="photo"><img loading="lazy" src="${escape(src)}" alt="${escape(p.title)}"></div>`).join('');
  return page({title:p.title+' | MOTIF',summary:description(p),pathname:productPath(p.id),product:true,settings,
    body:`<a class="back" href="/collection">بازگشت به مجموعه</a><div class="detail"><div>${pictures}</div><div><p dir="ltr">${escape([p.brand,'MOTIF SELECTION'].filter(Boolean).join(' / '))}</p><h1>${escape(p.title)}</h1><p class="copy">${escape(p.description || '')}</p><h2>اندازه و وضعیت آیتم‌ها</h2><ul>${rows}</ul>${identity}<p>برای انتخاب آیتم و سبد، جاوااسکریپت را فعال کنید. پرداخت آنلاین هنوز فعال نشده است.</p></div></div>`});
}
function cards(products){return products.map(p=>`<a class="card" href="${escape(productPath(p.id))}"><div class="photo">${images(p)[0]?`<img loading="lazy" src="${escape(images(p)[0])}" alt="${escape(p.title)}">`:''}</div><h3>${escape(p.title)}</h3><p>${escape(money(Math.min(...p.variants.filter(v=>v.stock>0).map(v=>p.basePrice+v.priceDelta))))}</p></a>`).join('');}
function renderHome(products,settings=site.defaults) {
  const list=products.filter(inStock),selected=settings.featuredIds.length?settings.featuredIds.map(id=>list.find(p=>p.id===id)).filter(Boolean):list.slice(0,8);
  const s=settings.slides.find(s=>s.enabled)||{title:settings.text.heroTitle,subtitle:settings.text.heroSubtitle,button:settings.text.heroButton,image:list[0]?images(list[0])[0]:'',target:{kind:'need',value:'پاییزه'}};
  return page({settings,body:`<section class="hero"><div class="slide">${s.image?`<img src="${escape(s.image)}" alt="${escape(s.alt||'انتخاب‌های MOTIF')}">`:''}<div class="hero-copy"><h1>${escape(s.title)}</h1><p>${escape(s.subtitle)}</p><a class="primary" href="${escape(site.targetHref(s.target))}">${escape(s.button)}</a></div></div></section><section class="section quick-measure"><h2 class="warm">${escape(settings.text.measureTitle)}</h2><form action="/collection"><div class="two-fields"><label>عرض سینهٔ لباس (سانتی‌متر)<input name="width" required inputmode="decimal"></label><label>قد لباس (سانتی‌متر)<input name="length" inputmode="decimal"></label></div><button class="primary">${escape(settings.text.measureButton)}</button></form></section><section class="section"><h2>${escape(settings.text.featuredTitle)}</h2><div class="grid featured">${cards(selected)}</div></section><section class="need-block"><h2>${escape(settings.text.categoriesTitle)}</h2><div class="category-grid">${settings.categories.map(c=>`<a href="${escape(site.targetHref(c.target))}">${escape(c.label)}</a>`).join('')}</div></section><section class="about"><h2>${escape(settings.text.aboutTitle)}</h2><p>${escape(settings.text.aboutBody)}</p></section>`});
}
function renderCollection(products,params=new URLSearchParams(),settings=site.defaults){const list=catalog.filterProducts(products,params).map(p=>({...p,variants:catalog.variants(p,catalog.queryFilter(params))}));return page({settings,title:'انتخاب‌های MOTIF | جست‌وجوی اندازه',pathname:'/collection',body:`<section class="section"><h1>انتخاب‌های MOTIF</h1><p>${list.length.toLocaleString('fa-IR')} محصول</p><div class="grid">${cards(list)}</div>${list.length?'':'<p>محصولی با این اندازه پیدا نشد.</p>'}</section>`});}
function renderUtility(kind,settings=site.defaults){return page({settings,pathname:'/'+kind,title:(kind==='contact'?'ارتباط با MOTIF':'سبد انتخاب‌ها')+' | MOTIF',body:kind==='contact'?`<h1>ارتباط با MOTIF</h1><div class="socials">${socials(settings)||'راه‌های ارتباطی هنوز ثبت نشده‌اند.'}</div>`:'<h1>سبد انتخاب‌ها</h1><p>برای نمایش سبد انتخاب‌ها، جاوااسکریپت را فعال کنید. پرداخت آنلاین هنوز فعال نشده است.</p>'});}
function sitemap(products) {
  const urls = ['/', ...products.filter(inStock).map(p => productPath(p.id))];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${escape(ORIGIN+url)}</loc></url>`).join('')+'</urlset>';
}
function errorPage(message) {
  return '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+escape(message)+' | MOTIF</title><h1>'+escape(message)+'</h1><a href="/">بازگشت به فروشگاه</a></html>';
}
module.exports = { ORIGIN, productPath, inStock, renderProduct, renderHome, renderCollection, renderUtility, sitemap, errorPage };
