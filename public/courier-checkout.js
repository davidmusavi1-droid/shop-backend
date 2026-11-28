(() => {
'use strict';
const form=document.getElementById('guestCheckout'),E=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const box=E('div');box.id='courierCoordination';document.getElementById('shippingDetails').append(box);box.hidden=true;
const select=E('select');select.setAttribute('aria-label','روش ارسال');
for(const [v,t]of [['POST_PISHTAZ','پست پیشتاز'],['COORDINATED_COURIER','ارسال فوری']]){const o=E('option',t);o.value=v;select.append(o);}
const label=E('label','روش ارسال');label.className='shipping-method';
for(const name of ['truck','bike']){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');
 for(const [key,value]of Object.entries({class:'shipping-icon method-'+name,width:'24',height:'24',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
 use.setAttribute('href','/shipping-icons.svg#'+name);svg.append(use);label.prepend(svg);
}
label.append(select);document.getElementById('shippingDetails').prepend(label);
const note=E('p'),request=E('button','درخواست هماهنگی ارسال فوری'),check=E('button','بررسی پاسخ پشتیبانی'),result=E('div'),status=E('p');
const day=E('select');day.setAttribute('aria-label','روز ارسال فوری');const dayLabel=E('label','روز درخواستی');dayLabel.append(day);
status.setAttribute('role','status');request.type=check.type='button';box.append(note,dayLabel,request,check,result,status);
let config=null,saved=null,offer=null;
try{saved=JSON.parse(sessionStorage.getItem('motif-courier-request'));}catch{}
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
function eligible(){const f=form.elements,n=s=>s.trim().replace(/[يى]/g,'ی').replace(/ك/g,'ک');return (n(f.province.value)==='تهران'&&n(f.city.value)==='تهران')||(n(f.province.value)==='البرز'&&n(f.city.value)==='کرج');}
function sync(){
 const available=config?.courierEnabled&&eligible();
 select.options[1].disabled=!available;select.options[1].hidden=!available;
 if(!available&&select.value==='COORDINATED_COURIER'){select.value='POST_PISHTAZ';updateShippingEstimate();}
 const courier=select.value==='COORDINATED_COURIER';
 if(courier)document.getElementById('postpaidAgreement').hidden=true;
 box.hidden=form.hidden||!courier;
 request.hidden=!courier;
 document.getElementById('quoteShipping').hidden=courier;
 form.querySelector(':scope > button.primary').hidden=courier;
 const cutoff=(config?.courierCutoff||'20:00').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
 note.textContent='تا ساعت '+cutoff+' به وقت تهران، هدف تحویل همان روز است. بعد از این ساعت ارسال روز بعد را درخواست کنید. امکان ارسال و کرایه را پشتیبانی تأیید می‌کند.'+(config?.supportPhone?' پشتیبانی: '+config.supportPhone:'');
 if(courier&&!result.childElementCount)document.getElementById('checkoutShipping').textContent='کرایه در پاسخ پشتیبانی مشخص می‌شود.';
}
select.onchange=()=>{invalidateShipping();sync();if(select.value==='COORDINATED_COURIER')void refreshSettings();};
form.addEventListener('input',event=>{
 if(!box.contains(event.target)&&event.target!==select&&result.childElementCount){result.replaceChildren();sync();}
});
form.addEventListener('input',sync);form.addEventListener('change',sync);
day.addEventListener('change',()=>{result.replaceChildren();updateShippingEstimate();sync();});
new MutationObserver(sync).observe(form,{attributes:true,attributeFilter:['hidden']});
async function api(url,options={}){const r=await checkoutWrite('/api/checkout/logistics'+url,{...options,headers:{'Content-Type':'application/json','X-Courier-Token':saved?.token||'',...options.headers}});const d=await r.json();if(!r.ok)throw Error(d.error||'خطای ارسال فوری');return d;}
request.onclick=async()=>{
 if(!form.reportValidity())return;request.disabled=true;
 try{
 const selected=day.value;
 await refreshSettings();
 if(!selected||selected!==day.value)throw Error('روز درخواستی تغییر کرده است؛ پس از انتخاب روز، دوباره درخواست کنید.');
 const deliveryDate=config?.deliverySchedule?.[day.value];
 const body=JSON.stringify({...JSON.parse(shippingPayload()),deliveryDay:day.value,deliveryDate});
 const state=await MotifCheckoutState.request(body,sessionStorage);
 if(!saved||saved.fingerprint!==state.key){saved={fingerprint:state.key,key:state.key,token:token(),deliveryDay:day.value};sessionStorage.setItem('motif-courier-request',JSON.stringify(saved));}
 const r=await api('/courier',{method:'POST',headers:{'Idempotency-Key':saved.key},body});saved.id=r.id;sessionStorage.setItem('motif-courier-request',JSON.stringify(saved));
 status.textContent='درخواست '+r.id+' در انتظار هماهنگی؛ مهلت '+new Date(r.expiresAt).toLocaleString('fa-IR');sync();
 }catch(e){status.textContent=e.message;}finally{request.disabled=false;}
};
check.onclick=async()=>{
 if(!saved?.id||(saved.deliveryDay&&saved.deliveryDay!==day.value)){status.textContent='ابتدا برای روز انتخاب‌شده درخواست ثبت کنید.';return;}check.disabled=true;
 try{
 offer=await api('/courier/'+encodeURIComponent(saved.id));result.replaceChildren();
 if(offer.orderNumber){status.textContent='این درخواست قبلاً به سفارش '+offer.orderNumber+' تبدیل شده است؛ پرداخت جدید نسازید.';return;}
 if(Date.parse(offer.expiresAt)<=Date.now()){status.textContent='درخواست منقضی شده است؛ درخواست تازه لازم است.';return;}
 if(!offer.offer){status.textContent='در انتظار هماهنگی پشتیبانی';return;}
 const q=offer.offer;
 if(select.value==='COORDINATED_COURIER')updateShippingEstimate(q);
 document.getElementById('checkoutShipping').textContent=(q.freeShipping?'ارسال رایگان؛ کرایه با MOTIF است':'کرایه هنگام تحویل '+money(q.courierDueAtDelivery))+' · مبلغ کالا '+money(q.goodsTotal);
 const deliveryDate=q.deliveryDate?new Date(q.deliveryDate+'T12:00:00Z').toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'}):'';
 if(deliveryDate)result.append(E('p','روز تحویل هماهنگ‌شده: '+deliveryDate));
 result.append(E('p','اعتبار پیشنهاد تا '+new Date(q.expiresAt).toLocaleString('fa-IR')));
 const agreement=E('input');agreement.type='checkbox';agreement.required=true;
 const agreementLabel=E('label','شرایط ارسال و مبلغ کالا را تأیید می‌کنم.');agreementLabel.prepend(agreement);
 const accept=E('button','تأیید شرایط ارسال و مبلغ کالا');accept.type='button';accept.className='primary';accept.disabled=true;
 agreement.addEventListener('change',()=>{accept.disabled=!agreement.checked||Date.parse(q.expiresAt)<=Date.now();});
 result.append(agreementLabel,accept);
 accept.onclick=async()=>{
 if(!agreement.checked||Date.parse(q.expiresAt)<=Date.now())return;
 accept.disabled=true;
 try{
 const body=JSON.stringify({accepted:true,revision:offer.revision,shippingFee:q.shippingFee,totalPrice:q.totalPrice});
 const state=await MotifCheckoutState.request(body+saved.id,sessionStorage);
 const order=await api('/courier/'+encodeURIComponent(saved.id)+'/accept',{method:'POST',headers:{'Idempotency-Key':state.key},body});
 const paidOrder={number:order.orderNumber,key:state.key,total:order.totalPrice,expiry:order.expiresAt};
 sessionStorage.setItem('motif-card-order',JSON.stringify(paidOrder));void presentPaymentOptions(paidOrder);
 const ordered=new Map(offer.items.map(x=>[x.variantId,x.quantity]));cart=cart.map(x=>({...x,quantity:x.quantity-(ordered.get(x.variantId)||0)})).filter(x=>x.quantity>0);saveCart();
 status.textContent='شماره سفارش '+order.orderNumber+' · مبلغ '+money(order.totalPrice);result.replaceChildren();MotifCheckoutState.complete(sessionStorage);
 }catch(e){status.textContent=e.message;accept.disabled=false;}
 };
 }catch(e){status.textContent=e.message;}finally{check.disabled=false;}
};
async function refreshSettings(){
 try{
  const r=await fetch('/api/checkout/logistics/settings',{cache:'no-store'});
  if(!r.ok)return;
  config=await r.json();
  const selected=day.value;
  const options=config.deliverySchedule?.todayAvailable===false?[['tomorrow','روز بعد']]:[['today','امروز'],['tomorrow','روز بعد']];
  day.replaceChildren(...options.map(([value,label])=>{const o=E('option',label);o.value=value;return o;}));
  if(options.some(([value])=>value===selected))day.value=selected;
  sync();
 }catch{}
}
void refreshSettings();
})();