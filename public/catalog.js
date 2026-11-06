(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotifCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const productTypes = ['کاپشن','شلوار','سویشرت'];
  const fabrics = ['شمعی','کتان','دورس','نایلون'];
  const seasons = ['بهار','تابستان','پاییز','زمستان'];
  const uses = ['روزمره','ورزشی','مناسب کار','کوهنوردی'];
  const qualityGrades = [
    ['N','نو / آکبند','آکبند یا استفاده‌نشده'],
    ['A_PLUS','در حد نو','ظاهر بسیار نزدیک به نو؛ بدون نشانه‌های محسوس استفاده یا آسیب قابل توجه'],
    ['A','تمیز','وضعیت ظاهری خوب، با احتمال نشانه‌های بسیار جزئی استفاده'],
    ['B','استفاده‌شده، قابل قبول','آثار قابل مشاهده استفاده، مانند تغییرات جزئی در ظاهر یا بافت'],
    ['C','دارای ایراد','دارای ایراد مشخص، مانند لکه، ساییدگی یا آسیب پارچه']
  ];
  const gradeLetter = g => g === 'A_PLUS' ? 'A+' : g || '';
  function priceNumber(value) {
    const s=String(value??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[,٬\s]/g,'');
    return /^-?\d+$/.test(s) ? Number(s) : NaN;
  }
  const formatPriceInput = value => {const n=priceNumber(value);return Number.isSafeInteger(n)?n.toLocaleString('en-US'):String(value??'');};
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
      (!filter.size || v.size === filter.size) && within(v[widthKey], filter.width) && within(v[lengthKey], filter.length) && Object.entries(filter.extra||{}).every(([key,bounds])=>within(v[key],bounds)));
  }
  function queryFilter(params) {
    const exact=(key,tolerance)=>{const n=number(params.get(key));return n===null?null:Number.isNaN(n)?{min:NaN,max:NaN,valid:false}:{min:Math.max(0.1,n-tolerance),max:n+tolerance,valid:true};};
    const extra={};if(params.get('kind')==='pants')for(const [key,field] of [['rise','riseCm'],['thigh','thighWidthCm'],['hem','hemWidthCm']])extra[field]=exact(key,2)||range(null,null);
    return {extra,kind:params.get('kind')==='pants'?'pants':'garment',size:params.get('size')||'',width:exact('width',2)||range(params.get('wmin'),params.get('wmax')),length:exact('length',3)||range(params.get('lmin'),params.get('lmax'))};
  }
  const normalize=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').toLocaleLowerCase().trim();
  function filterProducts(products,params) {
    const f=queryFilter(params),q=normalize(params.get('q')),need=params.get('need'),type=params.get('type');
    return products.filter(p=>p.isActive&&(!params.has('kind')||(f.kind==='pants'?p.productType==='شلوار':p.productType!=='شلوار'))&&(!need||((p.customerNeeds||[]).includes(need)||(p.uses||[]).includes(need)||(need==='پاییزه'&&(p.seasons||[]).includes('پاییز'))||(need==='مناسب سرما'&&(p.seasons||[]).includes('زمستان'))))&&(!type||p.productType===type)&&['season','use','fabric','design','hood'].every(key=>{const values=params.getAll(key);return !values.length||values.every(value=>key==='season'?(p.seasons||[]).includes(value):key==='use'?(p.uses||[]).includes(value):key==='fabric'?[p.mainFabric,...(p.complementaryFabrics||[])].includes(value):key==='hood'?String(p.hasHood)===value:p.garmentDesign===value);})&&normalize([p.title,p.brand,p.modelName].join(' ')).includes(q)&&variants(p,f).length);
  }
  return { productTypes, fabrics, seasons, uses, qualityGrades, gradeLetter, priceNumber, formatPriceInput, needs, range, within, variants, queryFilter, filterProducts, number };
});
