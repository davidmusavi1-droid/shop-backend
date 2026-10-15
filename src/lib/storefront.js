const fs = require('node:fs');
const path = require('node:path');
const template = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const ORIGIN = 'https://motifdress.com';
const HOME_TITLE = 'MOTIF | پوشاک برای هر روز';
const HOME_DESCRIPTION = 'پوشاک مردانه روزمره، ورزشی، پاییزه، مناسب سرما و مناسب کار؛ انتخاب با اندازه واقعی و مشاهده وضعیت هر آیتم در MOTIF.';
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
function page({title = HOME_TITLE, summary = HOME_DESCRIPTION, pathname = '/', body = '', product = false}) {
  return template.replace('<title>MOTIF | پوشاک برای هر روز</title>', () => `<title>${escape(title)}</title>`)
    .replace('<!--SEO_HEAD-->', () => `<meta name="description" content="${escape(summary)}"><link rel="canonical" href="${escape(ORIGIN + pathname)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(summary)}"><meta property="og:url" content="${escape(ORIGIN + pathname)}"><meta property="og:type" content="website">`)
    .replace('<!--SERVER_CONTENT-->', () => `<section id="serverContent">${body}</section>`)
    .replace('<section id="catalog">', product ? '<section id="catalog" hidden>' : '<section id="catalog">');
}
const measures = [['chestWidthCm','عرض زیربغل'],['lengthCm','قد لباس'],['waistWidthCm','عرض کمر روی سطح صاف'],['riseCm','فاق'],['totalLengthCm','قد شلوار'],['thighWidthCm','عرض ران'],['hemWidthCm','عرض دمپا']];
function renderProduct(p) {
  const rows = p.variants.map(v => {
    const sizes = measures.filter(([key]) => Number.isFinite(v[key]) && v[key] > 0)
      .map(([key,label]) => `${label}: ${v[key].toLocaleString('fa-IR')} سانتی‌متر`).join('؛ ');
    return `<li><strong>${escape(v.size)} · ${escape(v.color)}</strong><p>${escape(money(p.basePrice + v.priceDelta))} · ${v.stock > 0 ? 'موجود' : 'ناموجود'}</p><p>${escape(sizes || 'اندازه ثبت نشده')}</p><p>${escape(v.itemCondition || p.condition || '')}</p><p>${escape(v.itemDefect || p.defect || '')}</p></li>`;
  }).join('');
  const identity = [['identityOrigin','خاستگاه'],['identityHistory','تاریخچه'],['identityPurpose','هدف طراحی'],['identityUseCases','کاربردها'],['identityDesign','طراحی'],['identityTechnical','ویژگی‌های فنی'],['identitySources','منابع']]
    .filter(([key]) => p[key]).map(([key,label]) => `<h2>${label}</h2><p class="copy">${escape(p[key])}</p>`).join('');
  const pictures = images(p).map(src => `<img loading="lazy" src="${escape(src)}" alt="${escape(p.title)}" style="max-width:240px;height:auto">`).join('');
  return page({title:p.title+' | MOTIF',summary:description(p),pathname:productPath(p.id),product:true,
    body:`<a href="/#collection">بازگشت به مجموعه</a><h1>${escape(p.title)}</h1><p>${escape([p.brand,p.modelName].filter(Boolean).join(' / '))}</p><p class="copy">${escape(p.description || '')}</p>${pictures}<h2>اندازه و وضعیت آیتم‌ها</h2><ul>${rows}</ul>${identity}<p>خرید آنلاین هنوز فعال نشده است.</p>`});
}
function renderHome(products) {
  return page({body:`<h2>محصولات موجود</h2><ul>${products.filter(inStock).map(p=>`<li><a href="${escape(productPath(p.id))}">${escape(p.title)}</a></li>`).join('')}</ul>`});
}
function sitemap(products) {
  const urls = ['/', ...products.filter(inStock).map(p => productPath(p.id))];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${escape(ORIGIN+url)}</loc></url>`).join('')+'</urlset>';
}
function errorPage(message) {
  return '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+escape(message)+' | MOTIF</title><h1>'+escape(message)+'</h1><a href="/">بازگشت به فروشگاه</a></html>';
}
module.exports = { ORIGIN, productPath, inStock, renderProduct, renderHome, sitemap, errorPage };
