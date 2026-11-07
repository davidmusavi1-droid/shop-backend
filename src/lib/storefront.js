const fs = require('node:fs');
const path = require('node:path');
const template = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const ORIGIN = 'https://motifdress.com';
const HOME_TITLE = 'MOTIF | پوشاک برای هر روز';
const HOME_DESCRIPTION = 'پوشاک مردانه روزمره، ورزشی، پاییزه، مناسب سرما و مناسب کار؛ انتخاب با اندازه واقعی و مشاهده وضعیت هر آیتم در MOTIF.';
const site=require('../../public/site-content');
const catalog=require('../../public/catalog');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categoryLinks = products => [...new Set(products.flatMap(catalog.categoriesOf))]
  .map(name => `<a href="${escape(catalog.categoryPath(name))}">${escape(name)}</a>`).join(' · ');
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
function page({title = HOME_TITLE, summary = HOME_DESCRIPTION, pathname = '/', body = '', structuredData = null, settings=site.defaults}) {
  return template.replace('<html lang="fa" dir="rtl">', () => `<html lang="fa" dir="rtl" data-font="${site.fontKey(settings.font)}" style="${site.themeStyle(settings)}">`)
    .replace('<title>MOTIF | پوشاک برای هر روز</title>', () => `<title>${escape(title)}</title>`)
    .replace('<!--SEO_HEAD-->', () => `<meta name="description" content="${escape(summary)}"><link rel="canonical" href="${escape(ORIGIN + pathname)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(summary)}"><meta property="og:url" content="${escape(ORIGIN + pathname)}"><meta property="og:type" content="website">${structuredData ? `<script type="application/ld+json" id="productBreadcrumbData">${JSON.stringify(structuredData).replace(/</g,'\\u003c')}</script>` : ''}`)
    .replace('<!--SITE_CONTENT-->', () => '<script type="application/json" id="publishedSiteContent">'+JSON.stringify(settings).replace(/</g,'\\u003c')+'</script>')
    .replace('<!--SERVER_CONTENT-->', () => `<section id="serverContent">${body}</section>`)
    .replace('<div id="socials" class="socials" aria-label="شبکه‌های اجتماعی"></div>',()=>`<div id="socials" class="socials" aria-label="شبکه‌های اجتماعی">${socials(settings)}</div>`);
}
function socials(settings){return settings.socials.filter(s=>s.enabled).map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)}</a>`).join('');}
const measures = [['chestWidthCm','عرض زیربغل'],['lengthCm','قد لباس'],['sleeveFromNeckCm','طول آستین از کنار گردن با احتساب شانه'],['waistCm','دور کمر'],['waistWidthCm','عرض کمر روی سطح صاف'],['riseCm','فاق'],['totalLengthCm','قد شلوار'],['thighWidthCm','عرض ران'],['hemWidthCm','عرض دمپا']];
function gradeGuide(grade){return `<p>گرید ${escape(catalog.gradeLetter(grade)||'ثبت نشده')}</p><details class="quality-guide"><summary>برای آشنایی با گریدهای کیفیت، راهنما را باز کنید.</summary>${catalog.qualityGrades.map(([g,title,text])=>`<h4>${escape(catalog.gradeLetter(g))} — ${escape(title)}</h4><p>${escape(text)}</p>`).join('')}</details>`;}
function conditionDetails(p,v){const urls=[...(p.defectImages||[]),...(v.itemDefectImages||[])].filter(src=>{try{return new URL(src).protocol==='https:';}catch{return false;}});return `<section class="condition-details"><h3>جزئیات وضعیت محصول</h3>${[...new Set([p.condition,v.itemCondition,p.defect,v.itemDefect].filter(Boolean))].map(t=>`<p class="copy">${escape(t)}</p>`).join('')}<div class="defect-gallery">${urls.map(src=>`<a href="${escape(src)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${escape(src)}" alt="جزئیات ایراد ${escape(p.title)}"></a>`).join('')}</div></section>`;}
function attributes(p){return [['دسته‌بندی اصلی',catalog.categoriesOf(p).join('، ')],['جنس پارچه',catalog.fabricsOf(p).join('، ')],['مدل و طراحی',p.garmentDesign],['کلاه',p.hasHood==null?'نامشخص':p.hasHood?'دارد':'ندارد'],['فصل',(p.seasons||[]).join('، ')],['کاربرد',(p.uses||[]).join('، ')],['فناوری مستند',p.technologyVerified?p.fabricTechnology:null],['توضیح جنس',p.fabricNote]].filter(([,v])=>v).map(([k,v])=>`<p>${escape(k)}: ${escape(v)}</p>`).join('');}
function renderProduct(p, settings=site.defaults) {
  const rows = p.variants.map(v => {
    const sizes = measures.filter(([key]) => Number.isFinite(v[key]) && v[key] > 0)
      .map(([key,label]) => `${label}: ${v[key].toLocaleString('fa-IR')} سانتی‌متر`).join('؛ ');
    return `<li><strong>${escape(v.size)} · ${escape(v.color)}</strong><p>${escape(money(p.basePrice + v.priceDelta))} · ${v.stock > 0 ? 'موجود' : 'ناموجود'}</p><p>${escape(sizes || 'اندازه ثبت نشده')}</p>${gradeGuide(v.itemGrade || p.qualityGrade)}${conditionDetails(p,v)}</li>`;
  }).join('');
  const identity = [['identityOrigin','خاستگاه'],['identityHistory','تاریخچه'],['identityPurpose','هدف طراحی'],['identityUseCases','کاربردها'],['identityDesign','طراحی'],['identityTechnical','ویژگی‌های فنی'],['identitySources','منابع']]
    .filter(([key]) => p[key]).map(([key,label]) => `<h2>${label}</h2><p class="copy">${escape(p[key])}</p>`).join('');
  const pictures = images(p).map(src => `<div class="photo"><img loading="lazy" src="${escape(src)}" alt="${escape(p.title)}"></div>`).join('');
  const trail = catalog.breadcrumbs(p);
  const breadcrumb = `<nav class="breadcrumb" aria-label="مسیر صفحه">${trail.map(([name, href], i) =>
    i === trail.length - 1 ? `<span aria-current="page">${escape(name)}</span>` : `<a href="${escape(href)}">${escape(name)}</a>`).join(' / ')}</nav>`;
  return page({title:p.title+' | MOTIF',summary:description(p),pathname:productPath(p.id),settings,
    structuredData: catalog.breadcrumbData(p, ORIGIN),
    body:`${breadcrumb}<a class="back" href="/collection">بازگشت به مجموعه</a><div class="detail"><div>${pictures}</div><div><p dir="ltr">${escape([p.brand,'MOTIF SELECTION'].filter(Boolean).join(' / '))}</p><h1>${escape(p.title)}</h1><p class="copy">${escape(p.description || '')}</p>${attributes(p)}<h2>اندازه و وضعیت آیتم‌ها</h2><ul>${rows}</ul>${identity}<p>برای انتخاب آیتم و سبد، جاوااسکریپت را فعال کنید. پرداخت آنلاین هنوز فعال نشده است.</p></div></div>`});
}
function cards(products){return products.map(p=>`<a class="card" href="${escape(productPath(p.id))}"><div class="photo">${images(p)[0]?`<img loading="lazy" src="${escape(images(p)[0])}" alt="${escape(p.title)}">`:''}</div><h3>${escape(p.title)}</h3>${(p.variants.find(v=>v.stock>0)?.itemGrade||p.qualityGrade)?`<span>گرید ${escape(catalog.gradeLetter(p.variants.find(v=>v.stock>0)?.itemGrade||p.qualityGrade))}</span>`:''}<p>${escape(money(Math.min(...p.variants.filter(v=>v.stock>0).map(v=>p.basePrice+v.priceDelta))))}</p></a>`).join('');}
function renderHome(products,settings=site.defaults) {
  const list=products.filter(inStock),selected=settings.featuredIds.length?settings.featuredIds.map(id=>list.find(p=>p.id===id)).filter(Boolean):list.slice(0,8);
  const s=settings.slides.find(s=>s.enabled)||{title:settings.text.heroTitle,subtitle:settings.text.heroSubtitle,button:settings.text.heroButton,image:list[0]?images(list[0])[0]:'',target:{kind:'need',value:'پاییزه'}};
  return page({settings,body:`<section class="hero"><div class="slide">${s.image?`<img src="${escape(s.image)}" alt="${escape(s.alt||'انتخاب‌های MOTIF')}">`:''}<div class="hero-copy"><h1>${escape(s.title)}</h1><p>${escape(s.subtitle)}</p><a class="primary" href="${escape(site.targetHref(s.target))}">${escape(s.button)}</a></div></div></section><section class="section quick-measure"><h2 class="warm">${escape(settings.text.measureTitle)}</h2><form action="/collection"><div class="two-fields"><label>عرض سینهٔ لباس (سانتی‌متر)<input name="width" required inputmode="decimal"></label><label>قد لباس (سانتی‌متر)<input name="length" inputmode="decimal"></label></div><button class="primary">${escape(settings.text.measureButton)}</button></form></section><section class="section"><h2>${escape(settings.text.featuredTitle)}</h2><div class="grid featured">${cards(selected)}</div><nav class="breadcrumb" aria-label="دسته‌بندی اصلی">${categoryLinks(list)}</nav></section><section class="need-block"><h2>${escape(settings.text.categoriesTitle)}</h2><div class="category-grid">${settings.categories.map(c=>`<a href="${escape(site.targetHref(c.target))}">${escape(c.label)}</a>`).join('')}</div></section><section class="about"><h2>${escape(settings.text.aboutTitle)}</h2><p>${escape(settings.text.aboutBody)}</p></section>`});
}
function renderCollection(products,params=new URLSearchParams(),settings=site.defaults) {
  const type = catalog.collectionCategory(products, params);
  const list = catalog.filterProducts(products,params).map(p=>({...p,variants:catalog.variants(p,catalog.queryFilter(params))}));
  const title = type || 'انتخاب‌های MOTIF';
  return page({settings,title:catalog.categoryTitle(type),pathname:catalog.categoryPath(type),
    summary:type ? 'پوشاک دستهٔ '+type+' در MOTIF، همراه با اندازه‌های واقعی و وضعیت هر آیتم.' : HOME_DESCRIPTION,
    body:`<section class="section"><h1>${escape(title)}</h1><nav class="breadcrumb" aria-label="دسته‌بندی اصلی">${categoryLinks(products)}</nav><p>${list.length.toLocaleString('fa-IR')} محصول</p><div class="grid">${cards(list)}</div>${list.length?'':'<p>محصولی با این انتخاب پیدا نشد.</p>'}</section>`});
}
function renderUtility(kind,settings=site.defaults){return page({settings,pathname:'/'+kind,title:(kind==='contact'?'ارتباط با MOTIF':'سبد انتخاب‌ها')+' | MOTIF',body:kind==='contact'?`<h1>ارتباط با MOTIF</h1><div class="socials">${socials(settings)||'راه‌های ارتباطی هنوز ثبت نشده‌اند.'}</div>`:'<h1>سبد انتخاب‌ها</h1><p>برای نمایش سبد انتخاب‌ها، جاوااسکریپت را فعال کنید. پرداخت آنلاین هنوز فعال نشده است.</p>'});}
function sitemap(products) {
  const stocked = products.filter(inStock);
  const categories = [...new Set(stocked.flatMap(catalog.categoriesOf))];
  const urls = ['/', '/collection', ...categories.map(catalog.categoryPath), ...stocked.map(p => productPath(p.id))];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${escape(ORIGIN+url)}</loc></url>`).join('')+'</urlset>';
}
function errorPage(message) {
  return '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+escape(message)+' | MOTIF</title><h1>'+escape(message)+'</h1><a href="/">بازگشت به فروشگاه</a></html>';
}
module.exports = { ORIGIN, productPath, inStock, renderProduct, renderHome, renderCollection, renderUtility, sitemap, errorPage };
