const {test}=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate,targetHref}=require('../public/site-content');
const {queryFilter,filterProducts}=require('../public/catalog');
const view=require('../src/lib/storefront');
const copy=()=>structuredClone(defaults);
const slide=id=>({id,enabled:true,image:'https://images.example/a.jpg',mobileImage:'',alt:'لباس',title:'پاییزه',subtitle:'',button:'دیدن',target:{kind:'need',value:'پاییزه'},mobileX:50,mobileY:50,desktopX:50,desktopY:50});
test('content accepts five active slides and rejects unsafe URLs, crops and overflow',()=>{
 const c=copy();c.slides=Array.from({length:5},(_,i)=>slide(String(i)));assert.equal(validate(c).slides.length,5);
 c.slides.push(slide('six'));assert.throws(()=>validate(c));c.slides.pop();
 for(const patch of [{image:'javascript:alert(1)'},{image:'https://user:secret@host/x'},{mobileX:-1},{desktopY:101},{enabled:'true'}]){const bad=copy();bad.slides=[{...slide('a'),...patch}];assert.throws(()=>validate(bad));}
});

test('image-only slides can be saved without copy or a button',()=>{
 const c=copy();c.slides=[{...slide('image-only'),alt:'',title:'',subtitle:'',button:'',target:{kind:'newest',value:''}}];
 const saved=validate(c);assert.equal(saved.slides[0].image,'https://images.example/a.jpg');assert.equal(saved.slides[0].alt,'');assert.equal(saved.slides[0].title,'');assert.equal(saved.slides[0].button,'');assert.deepEqual(saved.slides[0].target,{kind:'newest',value:''});
});
test('blank global copy falls back to defaults so an image-only slide can be saved',()=>{
 const c=copy();for(const key of Object.keys(c.text))c.text[key]='';
 c.slides=[{...slide('image-only'),alt:'',title:'',subtitle:'',button:'',target:{kind:'newest',value:''}}];
 const saved=validate(c);assert.equal(saved.slides[0].image,'https://images.example/a.jpg');
 for(const [key,value] of Object.entries(defaults.text))assert.equal(saved.text[key],value);
});
test('social network hosts, blank configured links, duplicates and malicious destinations reject',()=>{
 for(const url of ['javascript:x','https://instagram.com.evil.test/x','https://evil.test']){const c=copy();c.socials=[{platform:'instagram',enabled:true,label:'اینستاگرام',url}];assert.throws(()=>validate(c));}
 const c=copy();c.socials=[{platform:'whatsapp',enabled:true,label:'واتساپ',url:'https://wa.me/989120000000'}];assert.equal(validate(c).socials.length,1);
 c.categories[0].target={kind:'url',value:'javascript:alert(1)'};assert.throws(()=>validate(c));
 assert.equal(targetHref({kind:'product',value:'a/b'}),'/products/a%2Fb');
});
test('exact garment dimensions become inclusive tolerance ranges and preserve same-variant stock matching',()=>{
 const params=new URLSearchParams('width=۵۶&length=۷۰');const f=queryFilter(params);assert.equal(f.width.min,54);assert.equal(f.length.max,73);
 const p={isActive:true,variants:[{stock:0,chestWidthCm:56,lengthCm:70},{stock:1,chestWidthCm:54,lengthCm:73},{stock:1,chestWidthCm:null,lengthCm:70}]};assert.equal(filterProducts([p],params).length,1);
 assert.equal(filterProducts([p],new URLSearchParams('width=bad')).length,0);
 const pants={isActive:true,variants:[{stock:1,waistCm:84}]};assert.equal(filterProducts([pants],new URLSearchParams('kind=pants&width=42')).length,0);
});
test('published copy is escaped in crawlable home and all product brands are dynamic',()=>{
 const c=copy();c.text.aboutTitle='<script>x</script>';
 const p={id:'one',title:'لباس',isActive:true,basePrice:100,brand:'THE NORTH FACE',images:[],variants:[{stock:1,size:'L',color:'مشکی',priceDelta:0}]};
 const html=view.renderHome([p],c);assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>x</script>'));
 assert(view.renderProduct(p,c).includes('THE NORTH FACE / MOTIF SELECTION'));
});
test('crawlable result prices come only from matching in-stock items',()=>{
 const p={id:'one',title:'لباس',isActive:true,basePrice:100,images:[],variants:[{stock:1,chestWidthCm:40,priceDelta:0},{stock:1,chestWidthCm:56,priceDelta:80}]};
 const html=view.renderCollection([p],new URLSearchParams('width=56'));
 assert(html.includes('۱۸۰ تومان'));assert(!html.includes('۱۰۰ تومان'));
});

test('font choices are safe, old revisions keep default and every server page uses the published font',()=>{
 const c=copy();delete c.font;assert.equal(validate(c).font,'vazirmatn');
 for(const font of ['estedad','tahoma','vazirmatn']){
  c.font=font;assert.equal(validate(c).font,font);
  for(const html of [view.renderHome([],c),view.renderCollection([],new URLSearchParams(),c),view.renderUtility('contact',c),view.renderProduct({id:'x',title:'لباس',images:[],variants:[]},c)])assert(html.includes(`data-font="${font}"`));
 }
 for(const font of ['__proto__','constructor','x" onload="alert(1)',null,{}]){c.font=font;assert.throws(()=>validate(c));assert(view.renderHome([],c).includes('data-font="vazirmatn"'));}
});
