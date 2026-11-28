(() => {
'use strict';
const form=document.getElementById('guestCheckout'),E=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const box=E('section');box.className='panel';form.after(box);box.hidden=true;
const select=E('select');select.setAttribute('aria-label','روش ارسال');
for(const [v,t]of [['POST_PISHTAZ','پست پیشتاز'],['COORDINATED_COURIER','ارسال فوری با هماهنگی پشتیبانی']]){const o=E('option',t);o.value=v;select.append(o);}
const label=E('label','روش ارسال');label.className='shipping-method';
for(const name of ['truck','bike']){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');
 for(const [key,value]of Object.entries({class:'shipping-icon method-'+name,width:'24',height:'24',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
 use.setAttribute('href','/shipping-icons.svg#'+name);svg.append(use);label.prepend(svg);
}
label.append(select);form.querySelector('.two-fields').after(label);
const note=E('p'),request=E('button','درخواست هماهنگی ارسال فوری'),check=E('button','بررسی پاسخ پشتیبانی'),result=E('div'),status=E('p');
status.setAttribute('role','status');request.type=check.type='button';box.append(note,request,check,result,status);
let config=null,saved=null,offer=null;
try{saved=JSON.parse(sessionStorage.getItem('motif-courier-request'));}catch{}
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
function eligible(){const f=form.elements,n=s=>s.trim().replace(/[يى]/g,'ی').replace(/ك/g,'ک');return (n(f.province.value)==='تهران'&&n(f.city.value)==='تهران')||(n(f.province.value)==='البرز'&&n(f.city.value)==='کرج');}
function sync(){
 const available=config?.courierEnabled&&eligible();
 select.options[1].disabled=!available;select.options[1].hidden=!available;
 if(!available&&select.value==='COORDINATED_COURIER'){select.value='POST_PISHTAZ';updateShippingEstimate();}
 const courier=select.value==='COORDINATED_COURIER';
 document.getElementById('postpaidAgreement').hidden=courier||!postpaidCheckout;
 document.getElementById('postpaidAgreement').querySelector('input').required=!courier&&postpaidCheckout;
 box.hidden=form.hidden||(!courier&&!saved?.id);
 request.hidden=!courier;
 document.getElementById('quoteShipping').hidden=courier;
 form.querySelector('button.primary').hidden=courier;
 note.textContent='درخواست اولیه کالا را رزرو نمی‌کند. امکان ارسال، زمان تحویل و هزینه با پشتیبانی هماهنگ می‌شود؛ تحویل همان‌روز تضمین‌شده نیست.'+(config?.supportPhone?' پشتیبانی: '+config.supportPhone:'');
}
select.onchange=()=>{sync();invalidateShipping();};form.addEventListener('input',sync);form.addEventListener('change',sync);
new MutationObserver(sync).observe(form,{attributes:true,attributeFilter:['hidden']});
async function api(url,options={}){const r=await checkoutWrite('/api/checkout/logistics'+url,{...options,headers:{'Content-Type':'application/json','X-Courier-Token':saved?.token||'',...options.headers}});const d=await r.json();if(!r.ok)throw Error(d.error||'خطای ارسال فوری');return d;}
request.onclick=async()=>{
 if(!form.reportValidity())return;request.disabled=true;
 try{
 const body=shippingPayload();
 const state=await MotifCheckoutState.request(body,sessionStorage);
 if(!saved||saved.fingerprint!==state.key){saved={fingerprint:state.key,key:state.key,token:token()};sessionStorage.setItem('motif-courier-request',JSON.stringify(saved));}
 const r=await api('/courier',{method:'POST',headers:{'Idempotency-Key':saved.key},body});saved.id=r.id;sessionStorage.setItem('motif-courier-request',JSON.stringify(saved));
 status.textContent='درخواست '+r.id+' در انتظار هماهنگی؛ مهلت '+new Date(r.expiresAt).toLocaleString('fa-IR');sync();
 }catch(e){status.textContent=e.message;}finally{request.disabled=false;}
};
check.onclick=async()=>{
 if(!saved?.id){status.textContent='ابتدا درخواست ثبت کنید';return;}check.disabled=true;
 try{
 offer=await api('/courier/'+encodeURIComponent(saved.id));result.replaceChildren();
 if(offer.orderNumber){status.textContent='این درخواست قبلاً به سفارش '+offer.orderNumber+' تبدیل شده است؛ پرداخت جدید نسازید.';return;}
 if(Date.parse(offer.expiresAt)<=Date.now()){status.textContent='درخواست منقضی شده است؛ درخواست تازه لازم است.';return;}
 if(!offer.offer){status.textContent='در انتظار هماهنگی پشتیبانی';return;}
 const q=offer.offer;
 if(select.value==='COORDINATED_COURIER')updateShippingEstimate(q);
 result.append(E('p',offer.customer.city+' · '+offer.customer.address),E('p','کالا / پرداخت آنلاین '+money(q.goodsTotal)+' · '+(q.freeShipping?'ارسال رایگان؛ کرایه بر عهده MOTIF است':'کرایه جداگانه هنگام تحویل '+money(q.courierDueAtDelivery))),E('p',q.eta+' · اعتبار تا '+new Date(q.expiresAt).toLocaleString('fa-IR')));
 const accept=E('button','تأیید مبلغ قطعی و ثبت سفارش');accept.type='button';accept.disabled=Date.parse(q.expiresAt)<=Date.now();result.append(accept);
 accept.onclick=async()=>{
 accept.disabled=true;
 try{
 const body=JSON.stringify({accepted:true,revision:offer.revision,shippingFee:q.shippingFee,totalPrice:q.totalPrice});
 const state=await MotifCheckoutState.request(body+saved.id,sessionStorage);
 const order=await api('/courier/'+encodeURIComponent(saved.id)+'/accept',{method:'POST',headers:{'Idempotency-Key':state.key},body});
 const paidOrder={number:order.orderNumber,key:state.key,total:order.totalPrice,expiry:order.expiresAt};
 sessionStorage.setItem('motif-card-order',JSON.stringify(paidOrder));await showOnlinePayment(paidOrder);await showCardReceipt(paidOrder);
 const ordered=new Map(offer.items.map(x=>[x.variantId,x.quantity]));cart=cart.map(x=>({...x,quantity:x.quantity-(ordered.get(x.variantId)||0)})).filter(x=>x.quantity>0);saveCart();
 status.textContent='شماره سفارش '+order.orderNumber+' · مبلغ '+money(order.totalPrice);result.replaceChildren();MotifCheckoutState.complete(sessionStorage);
 }catch(e){status.textContent=e.message;accept.disabled=false;}
 };
 }catch(e){status.textContent=e.message;}finally{check.disabled=false;}
};
fetch('/api/checkout/logistics/settings',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(s=>{config=s;sync();}).catch(()=>{});
})();