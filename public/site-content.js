(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotifSite = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function() {
  'use strict';
  const fonts = Object.freeze({
    vazirmatn: {label:'وزیرمتن',family:'"Vazirmatn Variable", Tahoma, sans-serif'},
    estedad: {label:'استعداد',family:'"Estedad Variable", Tahoma, sans-serif'},
    tahoma: {label:'تاهوما (فونت دستگاه)',family:'Tahoma, sans-serif'}
  });
  const fontKey = key => Object.hasOwn(fonts,key) ? key : 'vazirmatn';
  const defaults = {
    logo: '', accent: 'rust', font: 'vazirmatn', slides: [], featuredIds: [],
    text: {
      heroTitle: 'برای روزهایی که در جریانی.', heroSubtitle: 'انتخاب‌هایی برای پوشیدن و زندگی کردن.',
      heroButton: 'دیدن انتخاب‌های پاییزه', measureTitle: 'اندازهٔ خودت، انتخابِ خودت.',
      measureSubtitle: 'لباس‌های نزدیک به اندازه‌ات را پیدا کن.', measureButton: 'پیدا کردن لباس‌های اندازهٔ من',
      featuredTitle: 'منتخب MOTIF', categoriesTitle: 'برای چه روزی می‌پوشی؟',
      aboutTitle: 'تکرار، با شخصیت.', aboutBody: 'MOTIF انتخابی از پوشاک روزمره است؛ با توجه به جنس، کاربرد و جزئیاتی که به هر لباس شخصیت می‌دهند.'
    },
    categories: [
      {label:'روزهای خنک',target:{kind:'need',value:'پاییزه'}},
      {label:'لباس گرم',target:{kind:'need',value:'مناسب سرما'}},
      {label:'پوشاک کاربردی',target:{kind:'need',value:'مناسب کار'}},
      {label:'انتخاب‌های وینتیج',target:{kind:'need',value:'وینتیج'}}
    ],
    socials: []
  };
  function fail(message) { throw Object.assign(new Error(message), {statusCode:400}); }
  function text(value, max, required=false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('متن خالی یا بیش از حد بلند است');
    return value.trim();
  }
  function https(value, required=false) {
    const s=text(value,2048,required);
    if (!s && !required) return '';
    try { const u=new URL(s); if (u.protocol==='https:' && !u.username && !u.password) return u.href; } catch {}
    fail('لینک باید HTTPS و معتبر باشد');
  }
  function target(t) {
    if (!t || !['newest','need','type','product'].includes(t.kind)) fail('مقصد دکمه را انتخاب کنید');
    if(t.kind==='newest')return {kind:'newest',value:''};
    const value=typeof t.value==='string'?text(t.value,100):'';
    return value?{kind:t.kind,value}:{kind:'newest',value:''};
  }
  function targetHref(t) {
    if (t.kind==='product') return '/products/'+encodeURIComponent(t.value);
    const q=new URLSearchParams();
    if (t.kind==='need') q.set('need',t.value);
    if (t.kind==='type') q.set('type',t.value);
    return '/collection'+(q.size?'?'+q:'');
  }
  function array(value, max) { if (!Array.isArray(value) || value.length>max) fail('تعداد گزینه‌ها بیش از حد مجاز است'); return value; }
  function focus(value) { if (!Number.isFinite(value)||value<0||value>100) fail('محل برش عکس باید بین صفر و صد باشد'); return value; }
  function draftText(value,max) { return typeof value==='string'?value.slice(0,max).trim():''; }
  function draftHttps(value) {
    const s=draftText(value,2048);if(!s)return '';
    try { const u=new URL(s);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href; } catch {}
    return '';
  }
  function draftTarget(value) {
    if(!value||!['newest','need','type','product'].includes(value.kind)||value.kind==='newest')return {kind:'newest',value:''};
    const targetValue=draftText(value.value,100);return targetValue?{kind:value.kind,value:targetValue}:{kind:'newest',value:''};
  }
  function draftFocus(value) { return Number.isFinite(value)&&value>=0&&value<=100?value:50; }
  function validateDraft(input) {
    if(!input||typeof input!=='object'||Array.isArray(input))fail('تنظیمات نامعتبر است');
    const inputText=input.text&&typeof input.text==='object'&&!Array.isArray(input.text)?input.text:{};
    const text={};for(const key of Object.keys(defaults.text))text[key]=draftText(inputText[key],key==='aboutBody'?1200:160);
    const ids=new Set();
    const slides=(Array.isArray(input.slides)?input.slides:[]).slice(0,20).map((s,i)=>{
      s=s&&typeof s==='object'?s:{};let id=draftText(s.id,80)||'draft-slide-'+(i+1);if(ids.has(id))id+='-'+(i+1);ids.add(id);
      return {id,enabled:s.enabled===true,image:draftHttps(s.image),mobileImage:draftHttps(s.mobileImage),alt:draftText(s.alt,200),title:draftText(s.title,160),subtitle:draftText(s.subtitle,240),button:draftText(s.button,80),target:draftTarget(s.target),mobileX:draftFocus(s.mobileX),mobileY:draftFocus(s.mobileY),desktopX:draftFocus(s.desktopX),desktopY:draftFocus(s.desktopY)};
    });
    const categories=(Array.isArray(input.categories)?input.categories:[]).slice(0,8).map(c=>{c=c&&typeof c==='object'?c:{};return {label:draftText(c.label,80),target:draftTarget(c.target)};});
    const featuredIds=[...new Set((Array.isArray(input.featuredIds)?input.featuredIds:[]).slice(0,12).map(id=>draftText(id,100)).filter(Boolean))];
    const socials=(Array.isArray(input.socials)?input.socials:[]).slice(0,6).map(s=>{s=s&&typeof s==='object'?s:{};const label=draftText(s.label,80),url=draftHttps(s.url);return {platform:['instagram','telegram','whatsapp','other'].includes(s.platform)?s.platform:'other',label,url,enabled:s.enabled===true&&!!label&&!!url};});
    return {logo:draftHttps(input.logo),accent:['rust','orange'].includes(input.accent)?input.accent:defaults.accent,font:fontKey(input.font),text,slides,categories,featuredIds,socials};
  }
  function validate(input) {
    if (!input || typeof input!=='object' || Array.isArray(input)) fail('تنظیمات نامعتبر است');
    if (!['rust','orange'].includes(input.accent)) fail('رنگ نامعتبر است');
    if (input.font !== undefined && (typeof input.font !== 'string' || !Object.hasOwn(fonts,input.font))) fail('فونت نامعتبر است');
    const out={logo:https(input.logo),accent:input.accent,font:fontKey(input.font),text:{},slides:[],categories:[],featuredIds:[],socials:[]};
    for (const key of Object.keys(defaults.text)) { const value=text(input.text?.[key],key==='aboutBody'?1200:160); out.text[key]=value||defaults.text[key]; }
    const ids=new Set();
    out.slides=array(input.slides,20).map(s=>{
      if (!s || typeof s.enabled!=='boolean') fail('وضعیت اسلاید نامعتبر است');
      const id=text(s.id,80,true);if(ids.has(id))fail('شناسهٔ اسلاید تکراری است');ids.add(id);
      return {id,enabled:s.enabled,image:https(s.image,true),mobileImage:https(s.mobileImage||''),alt:text(s.alt||'',200),
        title:text(s.title||'',160),subtitle:text(s.subtitle||'',240),button:text(s.button||'',80),target:s.button?.trim()?target(s.target):{kind:'newest',value:''},
        mobileX:focus(s.mobileX),mobileY:focus(s.mobileY),desktopX:focus(s.desktopX),desktopY:focus(s.desktopY)};
    });
    if (out.slides.filter(s=>s.enabled).length>5) fail('حداکثر پنج اسلاید فعال مجاز است');
    out.categories=array(input.categories,8).filter(c=>typeof c?.label==='string'&&c.label.trim()).map(c=>({label:text(c.label,80),target:target(c.target)}));
    out.featuredIds=[...new Set(array(input.featuredIds,12).map(id=>text(id,100)).filter(Boolean))];
    const platforms=new Set();
    out.socials=array(input.socials,6).map(s=>{
      if (!s || !['instagram','telegram','whatsapp','other'].includes(s.platform) || typeof s.enabled!=='boolean') fail('شبکهٔ اجتماعی نامعتبر است');
      if(s.platform!=='other'&&platforms.has(s.platform))fail('شبکهٔ اجتماعی تکراری است');platforms.add(s.platform);
      const label=text(s.label||'',80),url=https(s.url||'');
      if(s.enabled&&(!label||!url))fail('برای شبکهٔ اجتماعی فعال، نام و لینک را وارد کنید');
      if(url){const host=new URL(url).hostname.toLowerCase();
        const hosts={instagram:['instagram.com','www.instagram.com'],telegram:['t.me','telegram.me'],whatsapp:['wa.me','api.whatsapp.com','www.whatsapp.com','whatsapp.com']};
        if(hosts[s.platform]&&!hosts[s.platform].includes(host))fail('آدرس با شبکهٔ اجتماعی انتخاب‌شده سازگار نیست');}
      return {platform:s.platform,label,url,enabled:s.enabled};
    }).filter(s=>s.enabled||s.label||s.url);
    return out;
  }
  return {defaults,fonts,fontKey,validate,targetHref};
});
