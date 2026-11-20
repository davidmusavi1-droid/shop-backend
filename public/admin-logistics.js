(() => {
'use strict';
const root=document.getElementById('logisticsAdmin');
const E=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const status=E('p');status.setAttribute('role','status');root.append(status);
const base='/api/checkout/logistics';
async function api(url,options={}){const r=await MotifAdminSession.request(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});const d=await r.json();if(!r.ok)throw Error(d.error||'خطای تنظیمات ارسال');return d;}
function field(form,name,label,value,type='text'){const l=E('label',label),i=E('input');i.name=name;i.type=type;i.required=true;if(type==='number'){i.min='1';i.step='1';}i.value=value??'';l.append(i);form.append(l);return i;}
function action(form,title,callback){const b=E('button',title);b.type='submit';form.append(b);form.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{await callback();status.textContent='ذخیره شد';}catch(err){status.textContent=err.message;}finally{b.disabled=false;}};}
async function load(){
 const data=await api(base+'/admin');root.replaceChildren(status);
 const refresh=E('button','تازه‌سازی تنظیمات و درخواست‌ها');refresh.type='button';refresh.onclick=()=>load().catch(e=>status.textContent=e.message);root.append(refresh);
 const settings=E('form');settings.append(E('h3','پیک فوری و زمان‌ها'));
 field(settings,'supportPhone','شماره عمومی پشتیبانی',data.settings.supportPhone).required=false;
 for(const [n,t]of [['requestMinutes','انقضای درخواست، دقیقه (۱ تا ۱۴۴۰)'],['offerMinutes','اعتبار پیشنهاد، دقیقه (حداکثر ۳۰)'],['reservationMinutes','رزرو پس از پذیرش، دقیقه (حداکثر ۳۰)']])field(settings,n,t,data.settings[n],'number');
 const enabled=field(settings,'courierEnabled','ارسال فوری برای شهر تهران و شهر کرج','','checkbox');enabled.required=false;enabled.checked=data.settings.courierEnabled;
 action(settings,'ذخیره تنظیمات',async()=>{const f=settings.elements;await api(base+'/settings',{method:'PUT',body:JSON.stringify({supportPhone:f.supportPhone.value.trim(),courierEnabled:f.courierEnabled.checked,requestMinutes:f.requestMinutes.valueAsNumber,offerMinutes:f.offerMinutes.valueAsNumber,reservationMinutes:f.reservationMinutes.valueAsNumber})});});
 root.append(settings);
 const weights=E('form');weights.append(E('h3','وزن واقعی محصول / تنوع'));
 const label=E('label','انتخاب کالا'),select=E('select');select.name='variantId';select.required=true;
 for(const product of products)for(const v of product.variants||[]){const o=E('option',product.title+' · '+v.size+' · '+v.sku);o.value=v.id;select.append(o);}
 label.append(select);weights.append(label);
 const grams=field(weights,'grams','وزن اندازه‌گیری‌شده کالا بدون بسته‌بندی، گرم','','number');
 select.onchange=()=>{grams.value=data.measurements.find(x=>x.variantId===select.value)?.grams??'';};select.onchange();
 const confirmWeight=field(weights,'approved','این وزن را واقعاً اندازه‌گیری کرده‌ام','','checkbox');confirmWeight.checked=false;
 action(weights,'تأیید و ذخیره وزن',async()=>{await api(base+'/measurements/'+encodeURIComponent(select.value),{method:'PUT',body:JSON.stringify({grams:grams.valueAsNumber,approved:confirmWeight.checked})});await load();});
 root.append(weights);
 const packing=E('form');packing.append(E('h3','بسته‌بندی اندازه‌گیری‌شده برای ترکیب سفارش'));
 packing.append(E('p','ابعاد بیرونی بسته نهایی به میلی‌متر است. برای چند کالا، همان ترکیب را بسته‌بندی و اندازه‌گیری کنید؛ ابعاد به‌صورت حدسی جمع نمی‌شوند.'));
 const lines=E('div'),rows=[];
 function line(){const box=E('div');box.className='two-fields';const choice=select.cloneNode(true);choice.removeAttribute('name');const qty=E('input');qty.type='number';qty.min='1';qty.max='100';qty.value='1';qty.required=true;qty.setAttribute('aria-label','تعداد در بسته');const del=E('button','حذف');del.type='button';del.onclick=()=>{box.remove();rows.splice(rows.indexOf(row),1);};const row={choice,qty};rows.push(row);box.append(choice,qty,del);lines.append(box);}
 line();packing.append(lines);const more=E('button','افزودن کالای دیگر به بسته');more.type='button';more.onclick=line;packing.append(more);
 for(const[n,t]of [['tareGrams','وزن بسته‌بندی خالی، گرم'],['lengthMm','طول بسته نهایی، میلی‌متر'],['widthMm','عرض بسته نهایی، میلی‌متر'],['heightMm','ارتفاع بسته نهایی، میلی‌متر']])field(packing,n,t,'','number');
 const approved=field(packing,'approved','این ترکیب را واقعاً بسته‌بندی و اندازه‌گیری کرده‌ام','','checkbox');approved.checked=false;
 action(packing,'ذخیره بسته‌بندی',async()=>{const body={items:rows.map(r=>({variantId:r.choice.value,quantity:r.qty.valueAsNumber})),approved:approved.checked};for(const n of ['tareGrams','lengthMm','widthMm','heightMm'])body[n]=packing.elements[n].valueAsNumber;await api(base+'/packing-plans',{method:'POST',body:JSON.stringify(body)});await load();});
 root.append(packing,E('p',data.plans.length+' ترکیب بسته‌بندی تأییدشده ثبت است.'));
 root.append(E('h3','درخواست‌های ارسال فوری'));
 for(const r of data.requests){const box=E('article');box.append(E('p',r.id+' · '+r.state+' · مهلت '+new Date(r.expiresAt).toLocaleString('fa-IR')));const c=r.payload.customer;box.append(E('p',[c.fullName,c.phone,c.city,c.address].join(' · ')));box.append(E('p','اقلام: '+r.payload.items.map(x=>x.variantId+' × '+x.quantity).join('، ')));
 if(r.offer)box.append(E('p','پیشنهاد فعلی '+r.offer.totalPrice.toLocaleString('fa-IR')+' تومان · '+r.offer.eta));
 if(!r.orderId&&Date.parse(r.expiresAt)>Date.now()){const form=E('form');const fee=field(form,'fee','هزینه قطعی پیک، تومان','','number');const eta=field(form,'eta','بازه تحویل تأییدشده');const ok=field(form,'confirmed','امکان ارسال را بررسی کرده‌ام','','checkbox');ok.checked=false;
 action(form,'اعلام پیشنهاد به مشتری',async()=>{await api(base+'/courier/'+encodeURIComponent(r.id)+'/offer',{method:'POST',body:JSON.stringify({fee:fee.valueAsNumber,eta:eta.value.trim(),availabilityConfirmed:ok.checked,expectedRevision:r.revision})});await load();});box.append(form);}
 if(r.orderId)box.append(E('p','شماره سفارش '+r.orderId));root.append(box);}
}
const start=E('button','مدیریت وزن، بسته‌بندی و پیک فوری');start.type='button';start.onclick=()=>load().catch(e=>status.textContent=e.message);root.append(start);
})();