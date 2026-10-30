const {test}=require('node:test'),assert=require('node:assert/strict');
const site=require('../public/site-content'),catalog=require('../public/catalog'),view=require('../src/lib/storefront');
test('all presets publish, round-trip and render on the server with readable text',()=>{
 for(const colors of Object.values(site.palettes)){
  const input={...structuredClone(site.defaults),theme:colors,palettes:[{name:'دلخواه',colors}]};
  const saved=site.validate(site.validateDraft(input));assert.deepEqual(site.colorWarnings(saved.theme),[]);
  assert.equal(saved.palettes[0].colors.accent,colors.accent);assert(view.renderHome([],saved).includes('--accent:'+colors.accent));
 }
});
test('legacy revisions keep orange and rust; unsafe CSS and unreadable colors cannot publish',()=>{
 assert.equal(site.validate({...structuredClone(site.defaults),accent:'orange'}).theme.accent,'#a54b22');
 for(const value of ['red','url(https://evil.test)', '#fff;display:none','</style>',null])assert.throws(()=>site.validate({...structuredClone(site.defaults),theme:{...site.palettes.rust,accent:value}}));
 const bad={...structuredClone(site.defaults),theme:{...site.palettes.rust,ink:'#f7f3eb'}};
 const draft=site.validateDraft(bad);assert.equal(draft.theme.ink,'#f7f3eb');assert.throws(()=>site.validate(draft),/خوانایی/);
 assert.throws(()=>site.validate({...structuredClone(site.defaults),palettes:Array(13).fill({name:'x',colors:site.palettes.rust})}));
});
test('optional pants dimensions match the same stocked variant, including Persian numbers',()=>{
 const params=new URLSearchParams('kind=pants&width=۴۲&rise=۳۰&thigh=۳۲&hem=۲۰');
 const base={isActive:true,productType:'شلوار'},v={stock:1,waistWidthCm:42,riseCm:30,thighWidthCm:32,hemWidthCm:20};
 assert.equal(catalog.filterProducts([{...base,variants:[v]}],params).length,1);
 for(const variants of [[{...v,stock:0}],[{...v,hemWidthCm:null}],[{...v,riseCm:40},{...v,thighWidthCm:40}]])assert.equal(catalog.filterProducts([{...base,variants}],params).length,0);
 assert.equal(catalog.filterProducts([{...base,variants:[v]}],new URLSearchParams('kind=pants&rise=bad')).length,0);
});
