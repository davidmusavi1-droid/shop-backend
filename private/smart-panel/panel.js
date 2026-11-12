"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const main = $("#main");
const icons = {
  logo: '<path d="M3 18V7l5 5 4-6 4 6 5-5v11M3 18h18"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10M7.5 5l9 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7 0v4m-2-2h4"/>',
  hash: '<path d="M10 3 6 21m12-18-4 18M4 9h17M3 15h17"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z"/>',
  shield: '<path d="m12 3 8 3v5c0 4-3 8-8 10-5-2-8-6-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M12 3 2 20h20L12 3Zm0 6v4m0 3h.01"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  upload: '<path d="M12 16V3M7 8l5-5 5 5M4 15v5h16v-5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  save: '<path d="M4 3h13l3 3v15H4zM8 3v6h8V3m-8 18v-7h8v7"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>'
};
const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
$$("[data-icon]").forEach(el => el.innerHTML = icon(el.dataset.icon));

const pages = {
  dashboard: ["داشبورد", "home"], products: ["محصولات و پرونده‌ها", "box"],
  new: ["افزودن محصول جدید", "plus"], research: ["تحقیقات هوشمند", "spark"],
  codes: ["دفتر کدهای یکتا", "hash"], queue: ["محصولات آماده انتشار", "send"],
  history: ["تاریخچه و وضعیت انتشار", "clock"], settings: ["تنظیمات", "settings"]
};
const flow = [["تصاویر","انتخاب عکس اصلی و گروه‌بندی"],["تحلیل لیبل","پیشنهاد مشخصات با بررسی مدیر"],["مشخصات","اندازه، قیمت، موجودی و گرید"],["تحقیق و متن","منابع و محتوای سه‌بخشی"],["بازبینی","کنترل پرونده پیش از تأیید"]];
const phases = {
  draft:["پیش‌نویس","amber","file"], review:["آماده بررسی","blue","clock"], approved:["تأییدشده","green","check"],
  ready:["آماده انتشار","green","send"], sending:["در حال انتشار","blue","clock"],
  published:["منتشرشده","green","shield"], failed:["خطای انتشار","red","alert"], none:["در صف نیست","","file"]
};
const materials = ["پلی‌استر","پلی‌آمید","نایلون","شمعی","کتان","پنبه","جین","فلیس","پلار","ترکیبی","کورتکس (اصطلاح رایج بازار)"];
const types = ["بادگیر","کاپشن","شلوار","سویشرت","پیراهن","تی‌شرت"];
const contentTitles = ["هویت برند","فلسفه طراحی محصول","کاربردهای پیشنهادی"];
const groupNames = {product:"محصول",label:"لیبل",defect:"ایراد"};
const palettes = {olive:["#6d7556","#48543a"],clay:["#b97a54","#84482f"],blue:["#6a8790","#3c5c66"],cream:["#b7aa8e","#7a705c"],dark:["#59635e","#39433e"]};
const nf = new Intl.NumberFormat("fa-IR");
const sf = new Intl.NumberFormat("fa-IR", {useGrouping:false});
const time = new Intl.DateTimeFormat("fa-IR", {timeZone:"Asia/Tehran",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"});
const number = x => nf.format(x);
const date = x => x ? time.format(new Date(x)) : "—";
const esc = (x = "") => String(x ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const ascii = x => String(x).replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0) & 15));
const numeric = x => ascii(x).replace(/[٬,\s]/g,"").replace("٫",".");
const titleOf = p => p.name || "پرونده بدون نام";
const codeOf = p => p.code || p.id;
const badge = (key) => { const [label,tone] = phases[key]; return '<span class="badge '+tone+'"><i class="status-dot"></i>'+label+'</span>'; };
const metaBadge = (t,tone="") => '<span class="badge '+tone+'">'+esc(t)+'</span>';
const btn = (label,action,style="",ico="",data="",disabled=false) => '<button type="button" class="btn '+style+'" data-act="'+action+'" '+data+(disabled?" disabled":"")+'>'+(ico?icon(ico):"")+label+'</button>';
const navbtn = (key,label,ico,style="",data="") => btn(label,"nav",style,ico,'data-page="'+key+'" '+data);
const idAttr = p => 'data-id="'+esc(p.id)+'"';
const notice = (body,tone="") => '<div class="notice '+tone+'">'+icon(tone?"alert":"info")+'<div>'+body+'</div></div>';
function garment(p, group = "product") {
  const [fill,stroke] = palettes[p.tone] || palettes.olive;
  const template = {
    label: '<rect x="13" y="20" width="46" height="33" rx="4" fill="#fcf7e9" stroke="#8d856e"/><path d="M19 26h34v20H19z" fill="none" stroke="#a39a82" stroke-dasharray="2 2"/><path d="M24 39V32l4 3 4-3v7m6-7h9m-9 4h9m-9 4h6" stroke="#706651" fill="none"/>',
    defect: '<rect x="7" y="11" width="58" height="50" rx="9" fill="'+fill+'"/><path d="m10 47 50-24" stroke="#fff7e6" stroke-width="1.2" stroke-dasharray="2 3"/><circle cx="35" cy="36" r="10" fill="none" stroke="#fbddb0"/><path d="m31 39 6-7" stroke="'+stroke+'" stroke-width="2"/>',
    pants: '<path d="M19 13h34l6 50H41l-5-33-5 33H13z" fill="'+fill+'" stroke="'+stroke+'"/><path d="M18 20h36M26 21l-5 9m25-9 5 9m-15-10v10" fill="none" stroke="'+stroke+'"/>',
    product: '<path d="M26 13q10-13 20 0l9 5 11 31-11 4-5-13v22H22V40l-5 13-11-4 11-31z" fill="'+fill+'" stroke="'+stroke+'"/><path d="m26 13 10 9 10-9m-10 9v40M22 53l8-9m20 9-8-9" fill="none" stroke="'+stroke+'"/><path d="M23 59h26" stroke="#e1d3b3" stroke-dasharray="2 2" opacity=".7"/>'
  };
  const key = group === "product" && p.type === "شلوار" ? "pants" : group;
  return '<svg viewBox="0 0 72 72" aria-hidden="true"><ellipse cx="36" cy="63" rx="28" ry="5" fill="#142a2415"/>'+template[key]+'</svg>';
}

let state = { products: [], registry: { reserved: [], legacy: [] }, events: [], auto: true };
let writeTimer, toastTimer, menuReturn, confirmAction;
let view = {page:"dashboard",id:"",step:0,mode:"edit",section:"",filter:"all",q:""};

function updateEditorStatus(p) {
  if(current()?.id!==p.id) return;
  const spot=$("#editor-status");
  if(spot) spot.innerHTML=badge(p.phase)+(p.publication!=="none"?badge(p.publication):"");
}
function toast(message) {
  $("#toast").textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$("#toast").textContent="",3600);
}
function dialog(title, body, action, confirmLabel="تأیید", cancelLabel="بستن") {
  const el=$("#dialog");
  confirmAction=action;
  menuReturn=document.activeElement;
  el.innerHTML='<h2 id="dialog-title">'+esc(title)+'</h2><div class="stack" style="margin-top:10px">'+body+'</div><div class="dialog-actions">'+btn(cancelLabel,"close-dialog")+(action?btn(confirmLabel,"confirm-dialog","primary"):"")+'</div>';
  if(!el.open) el.showModal();
}
$("#dialog").addEventListener("close",()=>menuReturn?.isConnected && menuReturn.focus());
function navMarkup(entries, mobile=false) {
  const short={dashboard:"داشبورد",products:"پرونده‌ها",new:"افزودن",queue:"صف انتشار",more:"بیشتر"};
  return entries.map(key=>{
    const [label,ico] = pages[key] || ["بیشتر","more"];
    const active = view.page===key || key==="products" && view.page==="editor" && view.mode==="edit"
      || key==="new" && view.page==="editor" && view.mode==="wizard"
      || key==="more" && ["research","codes","history","settings"].includes(view.page);
    return '<button type="button" data-act="'+(key==="more"?"more":"nav")+'" data-page="'+key+'" '+(active?'aria-current="page"':'')+'>'+icon(ico)+'<span>'+(mobile?short[key]:label)+'</span></button>';
  }).join("");
}
function heading(title, subtitle, buttons="", over="میز کار MOTIF") {
  return '<div class="page-heading"><div><div class="eyebrow">'+esc(over)+'</div><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div><div class="actions">'+buttons+'</div></div>';
}
function openPage(page, extra={}) {
  if(page==="new") {
    withAction(async () => {
      const p=await requestPanel('/dossiers','POST',{id:crypto.randomUUID()});
      state.products.unshift(p);
      baseline.set(p.id,structuredClone(p));
      openPage("editor",{id:p.id,mode:"wizard"});
    });
    return;
  }
  view={page,id:"",step:0,mode:"edit",section:"",filter:"all",q:"",...extra};
  const fragment=page==="editor"?'#dossier='+view.id:location.pathname;
  history.replaceState(null,'',fragment);
  render();
  main.focus({preventScroll:true});
  window.scrollTo(0,0);
  if(view.section) jump(view.section);
}
function current() { return state.products.find(p=>p.id===view.id); }
function render() {
  const page=view.page;
  $("#nav").innerHTML=navMarkup(Object.keys(pages));
  $("#mobile").innerHTML=navMarkup(["dashboard","products","new","queue","more"],true);
  $("#crumb").innerHTML='میز کار '+icon("left")+' '+(pages[page]?.[0] || "ویرایش پرونده");
  const renderer={dashboard,products:productPage,editor:editorPage,research:researchPage,codes:codesPage,queue:queuePage,history:historyPage,settings:settingsPage};
  main.innerHTML=renderer[page]();
}
const heroArt = '<svg class="hero-art" viewBox="0 0 450 200" preserveAspectRatio="xMinYMid slice" aria-hidden="true"><defs><pattern id="stitches" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M10 7v6m-3-3h6" stroke="#d6be93" stroke-opacity=".18"/></pattern></defs><path fill="url(#stitches)" d="M0 0h430v200H0z"/><g fill="none" stroke-linejoin="round"><path d="M-19 175 91 42l69 59 80-119h26L162 136 92 75-19 211" stroke="#588471" stroke-width="2"/><path d="M-25 189 91 56l70 61 92-137m-5 252 95-145 83 56m-206 95 122-171 103 72" stroke="#9ab19b" stroke-dasharray="3 6"/><path d="M6 215 93 112l69 60 87-131 72 61 69-104m-348 217 51-62 75 61L254 80l65 60L424-10" stroke="#c49662" stroke-width="1.2"/><circle cx="249" cy="41" r="5" fill="#d9aa72" stroke="#213c31"/><circle cx="93" cy="112" r="4" fill="#d9aa72" stroke="#213c31"/><path d="M15 18h34m-34 0v22m399 144h-34m34 0v-22" stroke="#d4bb93"/></g></svg>';

function dashboard() {
  const stats = ["draft","review","approved","ready","published","failed"].map(key=>{
    const [label,tone,ico]=phases[key];
    const count=state.products.filter(p=>["draft","review","approved"].includes(key)?p.phase===key:p.publication===key).length;
    const target=key==="ready"?"queue":key==="failed"||key==="published"?"history":"products";
    return '<button type="button" class="stat" data-tone="'+tone+'" data-act="nav" data-page="'+target+'" data-filter="'+key+'"><span class="stat-icon">'+icon(ico)+'</span><strong>'+number(count)+'</strong><span>'+label+'</span></button>';
  }).join("");
  const recent=[...state.products].sort((a,b)=>b.updated.localeCompare(a.updated)).slice(0,4);
  return '<section class="hero">'+heroArt+'<span class="hero-mark">MOTIF / PRODUCT STUDIO</span><div class="hero-inner"><div class="eyebrow">میز کار محصولات MOTIF</div><h1>داشبورد</h1><p>پرونده‌ها و وضعیت انتشار محصولات را از یک‌جا دنبال کنید.</p>'+navbtn("new","افزودن محصول جدید","plus","warm")+'</div></section>'+
    '<section aria-labelledby="daily"><div class="section-title"><h2 id="daily">نمای کلی کار</h2><span class="muted">پایگاه دادهٔ آزمایشی</span></div><div class="stats">'+stats+'</div></section>'+
    '<div class="dashboard-grid"><section class="card recent"><div class="card-head"><div><h2>آخرین پرونده‌ها</h2><p>به‌ترتیب آخرین ویرایش</p></div>'+navbtn("products","همه پرونده‌ها","left","link compact")+'</div>'+productTable(recent,true)+'</section>'+
    '<section class="card pad workflow-card"><div class="section-title"><h2>مسیر ثبت محصول</h2>'+metaBadge("۵ مرحله","amber")+'</div><ol class="flow">'+flow.map(([label,hint],i)=>'<li><b>'+number(i+1)+'</b><div><strong>'+label+'</strong><small>'+hint+'</small></div></li>').join("")+'</ol>'+navbtn("new","شروع ثبت محصول","plus")+'</section></div>';
}
function previewImage(p,image) {
  if(image?.url) return '<img src="'+esc(image.url)+'" alt="'+esc(image.name)+'">';
  return garment(p);
}
function productCell(p) {
  return '<div class="product-cell"><span class="thumb">'+previewImage(p,p.images.find(a=>a.id===p.mainImage))+'</span><div><span class="product-name">'+esc(titleOf(p))+'</span><span class="mono muted">'+esc(codeOf(p))+'</span></div></div>';
}
function productTable(rows,recent=false) {
  if(!rows.length) return '<div class="empty">پرونده‌ای برای نمایش وجود ندارد.</div>';
  return '<div class="table-wrap"><table aria-label="فهرست پرونده‌ها"><thead><tr><th>محصول</th><th>پرونده</th>'+(recent?"":"<th>انتشار</th><th>گرید</th>")+'<th class="date-col">آخرین ویرایش</th><th>اقدام</th></tr></thead><tbody>'+
    rows.map(p=>'<tr><td>'+productCell(p)+'</td><td>'+badge(p.phase)+'</td>'+(recent?"":"<td>"+badge(p.publication)+"</td><td dir=\"ltr\">"+esc(p.grade||"—")+"</td>")+'<td class="date-col">'+date(p.updated)+'</td><td>'+btn("بازکردن","edit","compact","",idAttr(p))+'</td></tr>').join("")+'</tbody></table></div>';
}
function matching(rows) {
  const query=ascii(view.q.trim()).toLowerCase();
  return rows.filter(p=>(view.filter==="all" || p.phase===view.filter || p.publication===view.filter) &&
    (!query || [titleOf(p),p.brand,codeOf(p)].some(t=>t.toLowerCase().includes(query))));
}
function filterBar(keys, search=true) {
  return '<div class="filters">'+(search?'<input id="search" type="search" autocomplete="off" aria-label="جست‌وجوی پرونده" placeholder="جست‌وجوی نام، برند یا کد…" value="'+esc(view.q)+'">':"")+
    '<select id="filter" aria-label="فیلتر وضعیت"><option value="all">همه وضعیت‌ها</option>'+keys.map(key=>'<option value="'+key+'" '+(view.filter===key?"selected":"")+'>'+phases[key][0]+'</option>').join("")+'</select></div>';
}
function productPage() {
  const sorted=[...state.products].sort((a,b)=>b.updated.localeCompare(a.updated));
  return heading("محصولات و پرونده‌ها","پیش‌نویس‌ها و پرونده‌های آمادهٔ کار را پیدا کنید.",navbtn("new","افزودن محصول جدید","plus","primary"))+
    '<section class="card"><div class="card-head"><h2>فهرست پرونده‌ها</h2>'+metaBadge(number(state.products.length)+" پرونده")+'</div>'+filterBar(["draft","review","approved","ready","published","failed"])+'<div id="list-results">'+productTable(matching(sorted))+'</div></section>';
}

const sections=[["images","تصاویر و گالری","image"],["analysis","تحلیل تصاویر و لیبل","spark"],["identity","اطلاعات شناسایی","file"],["usage","اطلاعات کاربردی","settings"],["measure","اندازه‌های واقعی","hash"],["sales","اطلاعات فروش","box"],["research","تحقیق و محتوای فروشگاهی","spark"],["review","بازبینی و تأیید نهایی","check"]];
const labels = {
  code:"کد یکتای MOTIF", brand:"برند", styleNumber:"شمارهٔ استایل", name:"نام محصول", type:"نوع محصول", color:"رنگ",labelSize:"سایز لیبل",
  country:"کشور سازنده",fabric:"جنس پارچه",design:"ویژگی‌های طراحی",season:"فصل استفاده",uses:"کاربرد پیشنهادی",
  neck:"مدل یقه",closure:"نوع بسته‌شدن",observed:"ویژگی‌های قابل مشاهده",technology:"فناوری پارچه",
  chest:"عرض سینه",length:"قد لباس",sleeve:"طول آستین",waist:"عرض کمر در حالت تخت",waistCircumference:"دور کمر (اختیاری)",rise:"فاق",total:"قد کل",thigh:"عرض ران",hem:"عرض دمپا",
  price:"قیمت به تومان",stock:"موجودی",grade:"گرید کیفیت",defect:"شرح ایراد",defectImages:"تصاویر ایراد"
};
const measurements = p => p.type==="شلوار"?["waist","rise","total","thigh","hem"]:["chest","length","sleeve"];
const sources = {manual:"ثبت مدیر",label:"لیبل محصول",image:"تحلیل تصویر",web:"منبع اینترنتی",unknown:"نامشخص"};
const sourceOf = (p,k) => p.sources[k] || (hasValue(p[k]) || (k==="defectImages" && p.images.some(i=>i.groups.includes("defect")))?"manual":"unknown");
const hasValue = value => Array.isArray(value) ? value.length>0 : Boolean(String(value??"").trim());
function sourceBtn(p,k) {
  return '<button type="button" class="source" data-act="source" data-key="'+k+'" aria-label="منبع '+esc(labels[k])+'">'+icon("info")+'<span>'+sources[sourceOf(p,k)]+'</span></button>';
}
function valueString(p,k) {
  const value=p[k];
  if (Array.isArray(value)) return value.join("، ");
  if (["stock","price"].includes(k) && value!=="" && Number.isFinite(Number(numeric(value)))) return number(Number(numeric(value)));
  if (measurements(p).includes(k) && /^\d+(\.\d+)?$/.test(numeric(value))) return sf.format(Number(numeric(value)));
  return value || "—";
}
function field(p,k,opts={}) {
  const tag=opts.choices?"select":opts.area?"textarea":"input";
  const extra='id="f-'+k+'" data-field="'+k+'" '+(opts.lock?"disabled ":"")+(opts.inputmode?'inputmode="'+opts.inputmode+'" ':"");
  const control = tag==="select"
    ? '<select '+extra+(opts.ltr?'dir="ltr" ':'')+'><option value="">انتخاب کنید</option>'+opts.choices.map(x=>'<option '+(p[k]===x?"selected ":"")+'value="'+esc(x)+'">'+esc(x)+'</option>').join("")+'</select>'
    : tag==="textarea" ? '<textarea '+extra+'placeholder="'+esc(opts.placeholder)+'">'+esc(p[k])+'</textarea>'
    : '<input '+extra+(opts.ltr?'dir="ltr" ':'')+'type="text" value="'+esc(["price","stock"].includes(k) && p[k]!==""?valueString(p,k):p[k])+'" placeholder="'+esc(opts.placeholder)+'" autocomplete="off">';
  return '<div class="field '+(opts.full?"full":"")+'"><div class="field-top"><label for="f-'+k+'">'+labels[k]+'</label>'+sourceBtn(p,k)+'</div>'+control+(opts.hint?'<small>'+opts.hint+'</small>':"")+'</div>';
}
function choices(p,k,options,locked=false) {
  return '<div class="field full"><div class="field-top"><strong id="label-'+k+'">'+labels[k]+'</strong>'+sourceBtn(p,k)+'</div><div class="choices" role="group" aria-labelledby="label-'+k+'">'+options.map(x=>'<label class="choice"><input type="checkbox" data-choice="'+k+'" value="'+esc(x)+'" '+(p[k].includes(x)?"checked ":"")+(locked?"disabled":"")+'>'+esc(x)+'</label>').join("")+'</div></div>';
}
function readOnly(p) {return Boolean(p.archivedAt);}
function statusForCode(p) {
  const code=normalizedCode(p.code);
  if (!code) return {text:"کد رسمی تعیین نشده است",tone:"amber",ok:false};
  if (!/^MOTIF-\d{3}$/.test(code)) return {text:"فرمت کد باید MOTIF-NNN باشد.",tone:"red",ok:false};
  const taken=state.registry.legacy.some(row=>row.normalized===code) ||
    state.registry.reserved.some(row=>row.dossierId!==p.id && row.code===code);
  if (taken) return {text:"این کد در محیط تست قبلاً رزرو شده یا متعلق به یک محصول قدیمی است.",tone:"red",ok:false};
  if (p.reserved===code) return {text:"رزرو شده در دفتر کدهای آزمایشی",tone:"green",ok:true};
  return {text:"در دفتر محیط تست آزاد به نظر می‌رسد. رزرو هنگام تأیید نهایی انجام می‌شود.",tone:"amber",ok:true};
}
const normalizedCode = value => ascii(value).trim().toUpperCase();
function codeStatus(p) {const s=statusForCode(p);return metaBadge(s.text,s.tone);}
function suggestCode(p) {
  for (let i=1;i<=999;i++) {
    const code="MOTIF-"+String(i).padStart(3,"0");
    if(statusForCode({...p,code}).ok) return code;
  }
  return "";
}
function identity(p) {
  const lock=readOnly(p);
  return '<div class="form-grid">'+field(p,"code",{lock:lock||Boolean(p.reserved),ltr:true,placeholder:"MOTIF-110",hint:"پیش‌نویس با شناسهٔ داخلی مستقل ذخیره می‌شود."})+
    '<div class="stack" style="align-content:center;justify-items:start"><span id="code-state">'+codeStatus(p)+'</span>'+(!lock&&!p.reserved?btn("پیشنهاد کد آزمایشی","suggest-code","compact","hash"):"")+'</div>'+
    field(p,"name",{lock})+field(p,"brand",{lock,placeholder:"خالی = فاقد برند مشخص"})+
    field(p,"type",{lock,choices:types})+field(p,"color",{lock,hint:"فقط ثبت مدیر"})+field(p,"labelSize",{lock})+field(p,"country",{lock})+
    choices(p,"fabric",[...new Set([...materials,...state.products.flatMap(row=>row.fabric)])],lock)+(!lock?'<div class="full">'+btn("افزودن گزینهٔ جنس پارچه","custom-fabric","compact","plus")+'</div>':"")+
    '<div class="full">'+notice("«کورتکس» اصطلاح رایج بازار است. تأیید فناوری GORE-TEX به شواهد معتبر نیاز دارد.")+'</div>'+
    choices(p,"design",["زیپ‌دار","نیم‌زیپ","کلاه‌دار","یقه‌گرد","جیب‌دار"],lock)+'</div>';
}
function usage(p) {
  const lock=readOnly(p);
  return '<div class="form-grid">'+choices(p,"season",["بهار","تابستان","پاییز","زمستان"],lock)+choices(p,"uses",["روزمره","ورزشی","مناسب کار","مناسب سرما","سفر"],lock)+
    field(p,"neck",{lock,choices:["گرد","ایستاده","برگردان","کلاه‌دار","سایر"]})+field(p,"closure",{lock,choices:["زیپ کامل","نیم‌زیپ","دکمه","جلو بسته","بندی","سایر"]})+
    field(p,"observed",{lock,area:true,full:true,placeholder:"مثلاً جیب زیپ‌دار یا آستر قابل مشاهده"})+
    field(p,"technology",{lock,full:true,hint:"فقط در صورت وجود شواهد معتبر وارد کنید."})+'</div>';
}
function measure(p) {
  return '<div class="form-grid">'+(p.type==="شلوار"?[...measurements(p),"waistCircumference"]:measurements(p)).map(k=>field(p,k,{lock:readOnly(p),inputmode:"decimal",hint:"سانتی‌متر",placeholder:"—"})).join("")+'</div>';
}
function sales(p) {
  const lock=readOnly(p);
  return '<div class="form-grid">'+field(p,"price",{lock,inputmode:"numeric",placeholder:"۲٬۴۵۰٬۰۰۰"})+field(p,"stock",{lock,inputmode:"numeric",placeholder:"۱"})+
    field(p,"grade",{lock,ltr:true,choices:["N","A+","A","B","C"],hint:"گرید را مدیر انتخاب می‌کند."})+field(p,"defect",{lock,area:true,full:true,placeholder:"محل، نوع و اندازهٔ ایراد را بنویسید."})+
    '<div class="field full"><div class="field-top"><strong>تصاویر ایراد</strong>'+sourceBtn(p,"defectImages")+'</div><div>'+metaBadge(number(p.images.filter(a=>a.groups.includes("defect")).length)+" تصویر")+' '+btn("مدیریت تصاویر ایراد","jump","compact","image",'data-key="images"')+'</div></div>'+
    '<div class="full">'+notice("گرید C به عکس ایراد نیاز دارد. برای گرید B، اگر ایراد مشخصی ثبت شود، عکس همان ایراد لازم است.")+'</div></div>';
}
function imageGallery(p) {
  if(!p.images.length) return '<div class="empty">گالری این پرونده خالی است.</div>';
  return '<div class="gallery">'+p.images.map((a,i)=>{
    const data='data-image="'+esc(a.id)+'"';
    return '<article class="image-card"><div class="image-preview">'+previewImage(p,a)+'</div><strong>'+esc(a.name)+'</strong><small>'+esc(a.demo?"تصویر آزمایشی · JPG":a.format||"نامشخص")+' · '+number(Math.round(a.size/1024))+' کیلوبایت</small><div>'+
    (p.mainImage===a.id?metaBadge("تصویر اصلی","green"):"")+(a.valid?"":metaBadge("خارج از ضوابط JPG / ۳ مگابایت","red"))+'</div>'+
    '<div class="choices" role="group" aria-label="گروه‌های تصویر">'+Object.entries(groupNames).map(([key,t])=>'<label class="choice"><input type="checkbox" data-image-group="'+key+'" '+data+' '+(a.groups.includes(key)?"checked ":"")+(readOnly(p)?"disabled":"")+'>'+t+'</label>').join("")+'</div>'+
    (!readOnly(p)?'<div class="actions">'+btn("اصلی","main-image","compact","star",data,p.mainImage===a.id || !a.groups.includes("product") || !a.valid)+
    btn("","move-image","compact","up",data+' data-shift="-1" aria-label="جابه‌جایی به عقب"',i===0)+
    btn("","move-image","compact","down",data+' data-shift="1" aria-label="جابه‌جایی به جلو"',i===p.images.length-1)+
    btn("","remove-image","compact danger","trash",data+' aria-label="حذف تصویر"')+'</div>':"")+'</article>';
  }).join("")+'</div>';
}
function images(p) {
  return '<div class="stack"><label class="drop">'+icon("upload")+'<strong>انتخاب عکس‌های محصول</strong><small>چند عکس JPG انتخاب کنید. سقف هر عکس ۳٬۰۰۰٬۰۰۰ بایت است.</small><span class="btn primary">انتخاب فایل</span><input id="files" type="file" accept="image/jpeg,.jpg,.jpeg" multiple aria-label="انتخاب فایل‌های تصویر"></label>'+
    (p.store?btn("انتخاب از تصاویر ذخیره‌شده محصول","store-images","compact","image","",p.images.length>=4):"")+
    imageGallery(p)+notice(p.store?"حداکثر چهار تصویر برای تحلیل انتخاب کنید. گالری اصلی محصول در اینجا قابل تغییر نیست.":"هر عکس می‌تواند هم‌زمان عضو چند گروه باشد. فایل اصلی در فضای خصوصی محیط تست نگه‌داری می‌شود.")+'</div>';
}
function labelReview(p) {
  const observations=p.labelObservations||[];
  const origins={sewn:"لیبل دوخته‌شده",hangtag:"تگ آویز · تعلق به لباس نیازمند بررسی",unknown:"نوع لیبل نامشخص"};
  const lock=readOnly(p);
  return '<div class="stack label-observations"><h4>بازبینی لیبل</h4>'+
    ["styleNumber","country"].map(key=>{
      const items=observations.filter(item=>item.key===key);
      if(!items.length) return "";
      const conflict=new Set(items.map(item=>item.value.toLowerCase())).size>1;
      return '<div class="content-box stack"><strong>'+labels[key]+'</strong>'+
        (conflict?notice("مشاهده‌های متعارض · هر شاهد را جداگانه بررسی کنید.","amber"):"")+
        items.map(item=>{
          const image=p.images.find(image=>image.id===item.imageId);
          return '<div><bdi>'+esc(item.value)+'</bdi> · '+esc(origins[item.origin])+
            (image?' · <a class="research-source" href="'+esc(image.url)+'" target="_blank" rel="noopener noreferrer">'+esc(image.name)+'</a>':
              ' · تصویر در گالری فعال نیست')+'<blockquote>'+esc(item.evidence)+'</blockquote></div>';
        }).join("")+'</div>';
    }).join("")+
    field(p,"styleNumber",{lock,ltr:true,placeholder:"اختیاری"})+
    '<div class="actions">'+btn("تأیید شمارهٔ استایل","confirm-style","compact","check","",lock||!p.styleNumber||p.styleConfirmed)+
    '<small id="style-status">'+(p.styleConfirmed?"تأیید مدیر":"")+'</small></div></div>';
}
function analysis(p) {
  const lock=readOnly(p);
  return '<div class="stack">'+notice(p.store?(p.canAnalyze?"تصاویر انتخاب‌شده برای تحلیل ارسال می‌شوند.":"تحلیل زنده برای این پرونده در دسترس نیست."):p.canAnalyze?"تحلیل لیبل فقط برای عکس‌های تأییدشدهٔ این آزمون در دسترس است.":"تحلیل شبیه‌سازی‌شده از پاسخ ثابت استفاده می‌کند.","amber")+
    '<div class="actions">'+btn(p.canAnalyze?"تحلیل تصاویر تأییدشده":p.analysis?"تکرار تحلیل آزمایشی":"شبیه‌سازی تحلیل تصاویر",
      "run-analysis","primary","spark","",lock||!p.images.length||(p.store&&!p.canAnalyze))+(p.images.length?"":'<small>برای شروع، یک عکس به پرونده اضافه کنید.</small>')+'</div>'+
    (p.analysis?.length?'<div class="stack">'+p.analysis.map(({key,value,kind,evidence,imageId})=>{
      const image=p.images.find(image=>image.id===imageId);
      return '<div class="result-item"><div><strong>'+labels[key]+'</strong> <span>'+esc(value)+'</span> '+metaBadge(sources[kind])+
        (evidence?'<blockquote>'+esc(evidence)+'</blockquote>':'')+
        (image&&evidence?'<a class="research-source" href="'+esc(image.url)+'" target="_blank" rel="noopener noreferrer">'+esc(image.name)+'</a>':'')+
        '</div>'+btn("پذیرش پیشنهاد","accept-proposal","compact","check",'data-key="'+key+'"',lock || (Array.isArray(p[key])?p[key].includes(value):p[key]===value))+'</div>';
    }).join("")+'</div>':"")+labelReview(p)+'</div>';
}
const sourceStatus = {
  pending_source_review: "در انتظار بررسی منبع", manager_verified: "تأیید مدیر",
  rejected: "ادعا رد شد", no_source: "منبع معتبر یافت نشد", invalid_source: "منبع یا شاهد نامعتبر است",
};
const draftStatus = {pending:"در انتظار تصمیم", approved:"تأیید مدیر", rejected:"رد شد"};
const normalizedBrand = brand => brand.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
const unknownBrand = brand => /^(?:(?:برند[\s‌]+)?نامشخص|(?:فاقد|بدون)[\s‌]*(?:برند(?: مشخص)?|لیبل).*|unknown|unbranded|no (?:brand|label)|[-—]+)?$/iu.test(normalizedBrand(brand));
function researchSummary(p) {
  const r=p.research;
  if(r?.kind!=="brand") return r?"گزارش شبیه‌سازی قدیمی":"تحقیق برند اجرا نشده است.";
  if(!r.current) return "مبنای تحقیق تغییر کرده است.";
  return [r.finding.status,r.finding.design?.status].includes("pending_source_review")
    ?sourceStatus.pending_source_review:sourceStatus[r.finding.status];
}
function canTransferDraft(p) {
  const draft=p.research?.draft;
  return p.researchDraft?.id===draft?.id && draft?.decisions.some((decision,i)=>
    decision==="approved"&&!draft.transferred[i]&&(p.store||!p.content[i].text.trim())&&
    p.researchDraft.sections[i].trim()===draft.sections[i]);
}
function syncDraftTransfer(p) {
  const button=$('[data-key="apply-draft"]');
  if(button) button.disabled=!canTransferDraft(p)||(p.store&&!embedded);
}
function research(p) {
  const lock=readOnly(p);
  const r=p.research;
  const live=p.researchMode==="live";
  const current=r?.kind==="brand" && r.current && normalizedBrand(r.brand)===normalizedBrand(p.brand) && (r.styleNumber||"")===(p.styleNumber||"");
  const finding=current?r.finding:null;
  const draft=current&&r.draftCurrent?r.draft:null;
  const action=(label,key,data="",disabled=false,style="compact")=>
    btn(label,"research-action",style,"",'data-key="'+key+'" '+data,lock||disabled);
  const sourceReview=[finding?.status,finding?.design?.status,finding?.style?.status].includes("pending_source_review");
  const canResearch=!unknownBrand(p.brand)&&(!p.styleNumber||p.styleConfirmed);
  const claimCard=(claim,key,title)=>{
    if(!claim?.claim) return "";
    return '<article class="content-box stack research-claim"><div class="field-top"><h4>'+title+'</h4>'+
      metaBadge(sourceStatus[claim.status],claim.status==="manager_verified"?"green":"amber")+'</div>'+
      '<p>'+esc(claim.claim)+'</p>'+
      (claim.url?'<a class="research-source" href="'+esc(claim.url)+'" target="_blank" rel="noopener noreferrer">'+
        esc(claim.title)+'<bdi dir="ltr">'+esc(claim.url)+'</bdi></a>':'')+
      '<blockquote>'+esc(claim.evidence||"شاهد قابل بررسی در دسترس نیست.")+'</blockquote>'+
      (claim.status==="pending_source_review"?'<div class="actions">'+
        action("تأیید این ادعا","verify-source",'data-claim="'+key+'"')+
        action("رد این ادعا","reject-source",'data-claim="'+key+'"')+'</div>':'')+
      (claim.checkedAt?'<small>بررسی '+date(claim.checkedAt)+'</small>':'')+'</article>';
  };
  const report=finding?'<div class="review-box stack"><div class="row"><h3>نتیجهٔ تحقیق برند</h3>'+
    metaBadge(r.mode==="mock"?"پاسخ شبیه‌سازی‌شده":"جست‌وجوی لیارا",r.mode==="mock"?"amber":"blue")+'</div>'+
    (sourceReview?'<p>صفحهٔ منبع را باز کنید و دربارهٔ هر ادعا جداگانه تصمیم بگیرید.</p>':'')+
    (finding.claim?claimCard(finding,"identity","هویت برند")+
      claimCard(finding.design,"design","رویکرد طراحی برند"):
      '<p>'+esc(sourceStatus[finding.status])+'؛ بخش هویت برند خالی می‌ماند.</p>')+
    (p.store&&r.styleNumber?(finding.style?claimCard(finding.style,"style","شاهد اختصاصی استایل"):
      '<p>برای استایل <bdi>'+esc(r.styleNumber)+'</bdi> شاهد اختصاصی ثبت نشده است.</p>'):"")+
    '<small>دریافت '+date(finding.retrievedAt)+'</small>'+
    (r.usage?'<small>شناسهٔ درخواست <bdi>'+esc(r.usage.requestId||"—")+'</bdi> · '+
      esc(r.usage.totalTokens??"—")+' توکن'+(r.usage.costToman===null?'':' · '+esc(r.usage.costToman)+' تومان')+'</small>':'')+
    (!sourceReview&&(!draft||draft.status==="rejected")?'<div class="actions">'+
      action("ساخت پیش‌نویس سه‌بخشی","generate","",false,"compact primary")+'</div>':'')+'</div>':'';
  const editableDraft=draft?.status==="pending";
  const preview=draft?'<div class="review-box stack"><div class="row"><h3>پیش‌نویس سه‌بخشی</h3>'+
    metaBadge({pending:"قابل بازبینی",applied:"قبلاً در فرم درج شده",rejected:"رد شده"}[draft.status],"amber")+'</div>'+
    '<p>هر بخش را جداگانه بررسی کنید. انتقال فقط به فیلدهای خالی '+(p.store?"محصول":"پرونده")+' انجام می‌شود.</p>'+
    draft.sections.map((saved,i)=>{
      const value=p.researchDraft?.id===draft.id?p.researchDraft.sections[i]:saved;
      const decision=value===saved?draft.decisions[i]:"pending";
      const sourceMissing=i===0&&finding.status!=="manager_verified";
      const edit=editableDraft&&!draft.transferred[i]&&!sourceMissing;
      return '<article class="content-box stack research-claim" data-draft-section="'+i+'"><div class="field-top">'+
        '<label for="draft-section-'+i+'"><strong>'+contentTitles[i]+'</strong></label>'+
        metaBadge(draft.transferred[i]?"منتقل شد":sourceMissing?"بدون منبع تأییدشده":draftStatus[decision],
          draft.transferred[i]||decision==="approved"?"green":"amber")+'</div>'+
        (edit?'<textarea id="draft-section-'+i+'" maxlength="4000" data-draft-index="'+i+'" '+(lock?"disabled":"")+'>'+esc(value)+'</textarea>':
          '<p>'+esc(value||"منبع تأییدشده برای این بخش در دسترس نیست.")+'</p>')+
        (edit?'<div class="actions">'+action("تأیید این بخش","approve-section",'data-index="'+i+'"',!value.trim()||decision==="approved")+
          action("رد این بخش","reject-section",'data-index="'+i+'"',decision==="rejected")+'</div>':'')+
        (p.content[i].text.trim()&&!draft.transferred[i]?'<small>این فیلد در پرونده متن دارد و محفوظ می‌ماند.</small>':'')+'</article>';
    }).join("")+
    (editableDraft?'<div class="actions">'+action(p.store?"پیش‌نمایش انتقال به فرم محصول":"انتقال بخش‌های تأییدشده به فیلدهای خالی","apply-draft","",!canTransferDraft(p)||(p.store&&!embedded),"primary")+
      (!draft.transferred.some(Boolean)?action("رد پیش‌نویس","reject-draft"):'')+'</div>':'')+'</div>':'';
  return '<div class="stack research-panel">'+notice(live?"نام برند و شمارهٔ استایل تأییدشده، در صورت ثبت، ارسال می‌شوند.":p.store?"تحقیق زنده غیرفعال است.":"محیط آزمایشی · نتیجهٔ تحقیق از دادهٔ شبیه‌سازی‌شده است.","amber")+
    (!canResearch?'<small>برند مشخص نیست. برای تحقیق، نام برند روی لیبل را ثبت کنید.</small>':"")+
    (r?.kind==="brand"&&!current?'<small>مبنای تحقیق تغییر کرده است. نتیجهٔ قبلی قابل استفاده نیست.</small>':"")+
    (current&&r.draft&&!draft?'<small>مشخصات محصول تغییر کرده‌اند. پیش‌نویس تازه بسازید.</small>':"")+
    (p.styleNumber&&!p.styleConfirmed?'<small>برای تحقیق، شمارهٔ استایل را در بخش تحلیل لیبل تأیید کنید یا آن را خالی بگذارید.</small>':"")+
    '<div class="actions">'+btn(live?"اجرای تحقیق برند در لیارا":"اجرای تحقیق آزمایشی","run-research","primary","spark","",
      lock||!canResearch||p.researchMode==="off"||Boolean(current&&r.mode===p.researchMode))+'</div>'+
    '<p id="brand-research-progress" role="status" hidden></p>'+report+preview+
    '<h3>متن فروشگاهی پرونده</h3>'+p.content.map((c,i)=>'<article class="content-box stack"><div class="field-top"><label for="text-'+i+'"><strong>'+contentTitles[i]+'</strong></label>'+metaBadge(c.approved?"تأیید مدیر":"در انتظار تأیید",c.approved?"green":"amber")+'</div><textarea id="text-'+i+'" data-content="'+i+'" placeholder="متن این بخش…" '+(lock?"disabled":"")+'>'+esc(c.text)+'</textarea><div class="actions">'+btn(c.approved?"لغو تأیید این متن":"تأیید این متن","approve-text","compact","check",'data-index="'+i+'"',lock)+'</div></article>').join("")+'</div>';
}
function productChecks(p) {
  const out=[];
  const check=(condition,label,section)=>{if(!condition) out.push({label,section});};
  const int=x=>/^\d+$/.test(numeric(x)) && Number.isSafeInteger(Number(numeric(x)));
  const measureOk=x=>/^\d+(\.\d+)?$/.test(numeric(x)) && Number(numeric(x))>0;
  check(p.name.trim() && p.type && p.color.trim(),"نام، نوع و رنگ محصول را تکمیل کنید.","identity");
  check(p.fabric.length,"حداقل یک جنس پارچه را ثبت کنید.","identity");
  const codeCheck=statusForCode(p);
  check(codeCheck.ok,codeCheck.text,"identity");
  check(measurements(p).every(k=>measureOk(p[k])),"همهٔ اندازه‌های مربوط به نوع محصول را وارد کنید.","measure");
  check(int(p.price) && Number(numeric(p.price))>0 && Number(numeric(p.price))<=2147483647,"قیمت معتبر وارد کنید.","sales");
  check(int(p.stock) && Number(numeric(p.stock))<=2147483647,"موجودی معتبر وارد کنید.","sales");
  check(["N","A+","A","B","C"].includes(p.grade),"گرید را انتخاب کنید.","sales");
  check(p.images.some(a=>a.id===p.mainImage && a.valid && a.groups.includes("product")),"یک تصویر اصلی JPG معتبر انتخاب کنید.","images");
  check(p.images.every(a=>a.valid && a.groups.length),"عکس‌های نامعتبر یا بدون گروه را بررسی کنید.","images");
  const defectRequired=p.grade==="C" || (p.grade==="B" && p.defect.trim());
  if(p.grade==="C") check(p.defect.trim(),"شرح ایراد گرید C را بنویسید.","sales");
  if(defectRequired) check(p.images.some(a=>a.valid && a.groups.includes("defect")),"تصویر ایراد معتبر لازم است.","images");
  return out;
}
function softChecks(p) {
  const out=[];
  if(p.analysis) p.analysis.forEach(({key,value})=>{
    if(key!=="fabric" && hasValue(p[key]) && p[key]!==value) out.push({label:labels[key]+" با پیشنهاد آزمایشی تفاوت دارد؛ مقدار مدیر ملاک است.",section:"analysis"});
  });
  if(p.content.some(c=>c.text.trim()&&!c.approved)) out.push({label:"بخشی از متن هنوز تأیید مستقل ندارد و در انتشار آزمایشی لحاظ نمی‌شود.",section:"research"});
  return out;
}
const warnings = rows => '<ul class="warning-list">'+rows.map(({label,section})=>'<li>'+esc(label)+' '+btn("اصلاح","jump","link compact","",'data-key="'+section+'"')+'</li>').join("")+'</ul>';
function review(p) {
  const hard=productChecks(p), soft=softChecks(p);
  const values=keys=>'<ul>'+keys.map(k=>'<li>'+labels[k]+' · <strong><bdi>'+esc(valueString(p,k))+'</bdi></strong> '+sourceBtn(p,k)+'</li>').join("")+'</ul>';
  return '<div class="stack"><div class="row">'+productCell(p)+' '+codeStatus(p)+'</div>'+
    (hard.length?notice("<strong>موارد لازم برای تأیید</strong>"+warnings(hard),"amber"):notice("کنترل‌های ضروری پرونده کامل است."))+
    (soft.length?notice("<strong>موارد قابل بررسی</strong>"+warnings(soft),"amber"):"")+
    '<div class="review-grid"><div class="review-box"><h3>اطلاعات شناسایی و فروش</h3>'+values(["brand","type","color","labelSize","country","fabric","design","price","stock","grade","defect"])+btn("ویرایش مشخصات","jump","link compact","left",'data-key="identity"')+btn("ویرایش فروش","jump","link compact","left",'data-key="sales"')+'</div>'+
    '<div class="review-box"><h3>اندازه‌ها · سانتی‌متر</h3>'+values(measurements(p))+btn("ویرایش اندازه‌ها","jump","link compact","left",'data-key="measure"')+'</div>'+
    '<div class="review-box"><h3>کاربرد و طراحی</h3>'+values(["season","uses","neck","closure","observed","technology"])+btn("ویرایش اطلاعات کاربردی","jump","link compact","left",'data-key="usage"')+'</div>'+
    '<div class="review-box"><h3>تصویر اصلی و ایراد</h3><div class="row">'+p.images.filter(a=>a.id===p.mainImage || a.groups.includes("defect")).map(a=>'<span class="thumb">'+previewImage(p,a)+'</span>').join("")+'</div>'+btn("بازگشت به گالری","jump","link compact","left",'data-key="images"')+'</div>'+
    '<div class="review-box"><h3>تحلیل و تحقیق</h3><p>'+esc(p.analysis?p.analysis.map(x=>labels[x.key]+" · "+x.value).join("، "):"تحلیل آزمایشی اجرا نشده.")+'</p><p>'+esc(researchSummary(p))+'</p>'+btn("بازبینی تحقیق","jump","link compact","left",'data-key="research"')+'</div>'+
    '<div class="review-box full"><h3>متن فروشگاهی</h3>'+p.content.map((c,i)=>'<p><strong>'+contentTitles[i]+'</strong> '+metaBadge(c.approved?"تأییدشده":"در انتظار تأیید",c.approved?"green":"amber")+'<br>'+esc(c.text || "—")+'</p>').join("")+btn("ویرایش متن‌ها","jump","link compact","left",'data-key="research"')+'</div></div>'+
    '<div class="actions">'+(!readOnly(p)&&p.phase==="draft"?btn("آمادهٔ بررسی کردن","mark-review","","clock"):"")+
    (!readOnly(p)&&p.phase!=="approved"?btn("تأیید نهایی پرونده","approve","primary","check"):"")+
    (p.phase==="approved" && p.publication==="none"?navbtn("queue","مشاهدهٔ صف انتشار","send"):"")+
    (p.publication!=="none"?navbtn("queue","مشاهدهٔ صف انتشار","left"):"")+'</div></div>';
}
const builders={images,analysis,identity,usage,measure,sales,research,review};
function accordion(p,key,open) {
  const [,label,ico]=sections.find(s=>s[0]===key);
  return '<details id="section-'+key+'" class="card accordion section-anchor" '+(open?"open":"")+'><summary><span>'+icon(ico)+' '+label+'</span>'+icon("down")+'</summary><div class="pad">'+builders[key](p)+'</div></details>';
}
const stepKeys=[["images"],["analysis"],["identity","usage","measure","sales"],["research"],["review"]];
function editorPage() {
  const p=current();
  if(!p) return heading("پرونده در دسترس نیست","به فهرست پرونده‌ها برگردید.",navbtn("products","فهرست پرونده‌ها","left"));
  const wizard=view.mode==="wizard";
  const stepBar=wizard?'<nav class="card steps" aria-label="مراحل ثبت محصول">'+flow.map(([label],i)=>'<button class="step" type="button" data-act="step" data-index="'+i+'" '+(i===view.step?'aria-current="step"':"")+'><b>'+number(i+1)+'</b><span>'+label+'</span></button>').join("")+'</nav>':"";
  const keys=wizard?stepKeys[view.step]:sections.map(s=>s[0]);
  return heading(wizard?"ثبت محصول جدید":titleOf(p),wizard?"از تصویر تا بازبینی در پنج مرحله.":"همهٔ بخش‌های پرونده در یک صفحه قابل مشاهده‌اند.",navbtn("products","فهرست پرونده‌ها","right","compact")+(!wizard?btn("بایگانی پرونده","archive","compact danger","box"):""))+
    '<div class="editor-tools"><div class="row"><span id="editor-status">'+badge(p.phase)+(p.publication!=="none"?badge(p.publication):"")+'</span><span class="mono muted">'+esc(p.id)+'</span></div><div class="row"><small id="save-label" aria-live="polite">'+esc(notices.get(p.id) ?? "ذخیره‌شده در سرور آزمایشی")+'</small>'+
    btn("ذخیره پیش‌نویس","save","","save")+btn("بررسی تعارض","resolve-conflict","compact","alert",conflicts.has(p.id)?"":"hidden")+(wizard?btn("نمای یک‌صفحه‌ای","edit","","file",idAttr(p)):"")+'</div></div>'+stepBar+
    '<div class="stack">'+keys.map((key,i)=>accordion(p,key,key===view.section || !view.section && i===0)).join("")+'</div>'+
    (wizard?'<div class="editor-foot">'+btn("مرحلهٔ قبل","step","","right",'data-index="'+(view.step-1)+'"',view.step===0)+
    (view.step<4?btn("مرحلهٔ بعد","step","primary","left",'data-index="'+(view.step+1)+'"'):btn("نمای یک‌صفحه‌ای","edit","primary","file",idAttr(p)))+'</div>':"");
}
function jump(key) {
  if(view.page!=="editor") return;
  view.section=key;
  if(view.mode==="wizard" && !stepKeys[view.step].includes(key)) {
    view.step=stepKeys.findIndex(arr=>arr.includes(key));
    render();
  }
  const el=$("#section-"+key);
  if(!el) return;
  el.open=true;
  el.scrollIntoView({block:"start"});
  $("summary",el).focus({preventScroll:true});
}
function refreshEditor(preserve=true) {
  const open=preserve?$$("details[open]",main).map(e=>e.id):[];
  const scroll=window.scrollY;
  render();
  open.forEach(id=>{const el=document.getElementById(id);if(el)el.open=true;});
  window.scrollTo(0,scroll);
}

function researchPage() {
  return heading("تحقیقات هوشمند","برای هر پرونده، ادعای مربوط به برند و پیشنهاد متن را بررسی کنید.")+
    '<div class="stack">'+notice("حالت واقعی یا شبیه‌سازی‌شده در هر پرونده مشخص است.","amber")+
    '<div class="list-grid">'+state.products.map(p=>'<article class="card pad stack"><div class="row">'+productCell(p)+'</div><div class="row">'+metaBadge(researchSummary(p),p.research?.finding?.status==="manager_verified"?"green":"amber")+'</div>'+btn("بازکردن بخش تحقیق","edit","compact","spark",idAttr(p)+' data-section="research"')+'</article>').join("")+'</div></div>';
}
function codesPage() {
  const rows=state.products.filter(p=>p.code).sort((a,b)=>a.code.localeCompare(b.code));
  const noCode=state.products.filter(p=>!p.code);
  return heading("دفتر کدهای یکتا","کدهای رسمی، شناسه‌های پیش‌نویس و وضعیت مستقل فروش و انتشار.")+
    '<div class="stack">'+notice("تطبیق با فروشگاه در این نمونه بررسی نمی‌شود. کد رزروشده برای همان محصول نگه داشته می‌شود.","amber")+
    '<section class="card"><div class="card-head"><h2>کدهای MOTIF</h2>'+metaBadge("MOTIF-NNN")+'</div><div class="table-wrap"><table aria-label="دفتر کدهای یکتا"><thead><tr><th>کد</th><th>محصول و اعتبار کد</th><th>پرونده</th><th>انتشار</th><th>موجودی</th><th>فروش</th><th>تطبیق با سایت</th></tr></thead><tbody>'+
    rows.map(p=>'<tr><td class="mono">'+esc(p.code)+'</td><td>'+btn(esc(titleOf(p)),"edit","link compact","",idAttr(p))+'<br>'+codeStatus(p)+'</td><td>'+badge(p.phase)+'</td><td>'+badge(p.publication)+'</td><td>'+esc(valueString(p,"stock"))+'</td><td>'+esc(p.sale)+'</td><td>بررسی نشده</td></tr>').join("")+
    state.registry.reserved.filter(r=>r.archived).map(r=>'<tr><td class="mono">'+esc(r.code)+'</td><td>'+esc(r.name||"رزرو حفظ‌شده")+'</td><td>'+metaBadge(r.reason==="deleted"?"حذف‌شده":"بایگانی‌شده")+'</td><td>—</td><td>—</td><td>—</td><td>بررسی نشده</td></tr>').join("")+
    state.registry.legacy.map(r=>'<tr><td class="mono">'+esc(r.productCode)+'</td><td>'+esc(r.title)+'</td><td>'+metaBadge("محصول قدیمی محیط تست")+'</td><td>—</td><td>—</td><td>—</td><td>بررسی نشده</td></tr>').join("")+
    '</tbody></table></div></section><section class="card pad"><div class="section-title"><h2>پرونده‌های بدون کد رسمی</h2></div><div class="actions">'+(noCode.map(p=>btn(esc(codeOf(p)),"edit","compact","file",idAttr(p)+' data-section="identity"')).join("") || "پرونده‌ای در این گروه وجود ندارد.")+'</div></section></div>';
}
function queuePage() {
  const rows=state.products.filter(p=>p.phase==="approved");
  return heading("محصولات آماده انتشار","تأیید پرونده مستقل از انتشار است.",navbtn("history","تاریخچه","clock"))+
    '<div class="stack">'+notice("صف و ارسال آزمایشی در فاز D فعال می‌شوند. پرونده‌های تأییدشدهٔ فاز B در زیر قابل بازبینی‌اند.","amber")+
    (rows.length?'<div class="list-grid">'+rows.map(p=>'<article class="card pad stack">'+productCell(p)+
      '<div class="row">'+badge(p.phase)+metaBadge("موجودی "+valueString(p,"stock"))+'</div>'+
      btn("بازبینی پرونده","edit","compact","file",idAttr(p)+' data-section="review"')+'</article>').join("")+'</div>':
      '<div class="card empty">پروندهٔ تأییدشده‌ای وجود ندارد.</div>')+'</div>';
}
const eventNames={
  created:"ایجاد پرونده", saved:"ذخیرهٔ پرونده", review_requested:"ارسال به بازبینی", approved:"تأیید نهایی",
  image_added:"افزودن تصویر", gallery_changed:"تغییر گالری", ai_unavailable:"خطای آزمایشی AI",
  style_confirmed:"تأیید شمارهٔ استایل",
  brand_research_mocked:"تحقیق شبیه‌سازی‌شدهٔ برند", brand_research_completed:"تحقیق برند در لیارا",
  brand_research_verify_source:"تأیید شاهد منبع", brand_research_reject_source:"رد ادعای برند",
  brand_research_generate:"ساخت پیش‌نویس محتوا", brand_research_apply_draft:"درج پیش‌نویس در فرم",
  brand_research_review_draft:"بازبینی بخش پیش‌نویس",
  brand_research_reject_draft:"رد پیش‌نویس محتوا",
  ai_mock_completed:"پاسخ آزمایشی AI", suggestion_accepted:"پذیرش پیشنهاد", content_reviewed:"بازبینی متن", archived:"بایگانی", deleted:"حذف منطقی",
};
function historyPage() {
  return heading("تاریخچه و وضعیت انتشار","رویدادهای ثبت‌شده در محیط آزمایش.",navbtn("queue","صف انتشار","send"))+
    '<section class="card"><div class="card-head"><h2>رویدادهای پرونده‌ها</h2>'+metaBadge("محیط آزمایشی","amber")+'</div>'+
    (state.events.length?'<div class="table-wrap"><table><thead><tr><th>پرونده</th><th>زمان</th><th>رویداد</th><th>نسخه</th></tr></thead><tbody>'+
      state.events.map(row=>{
        const p=state.products.find(item=>item.id===row.dossierId);
        return '<tr><td>'+esc(p?titleOf(p):row.dossierId)+'</td><td>'+date(row.at)+'</td><td>'+esc(eventNames[row.action]||row.action)+'</td><td>'+number(row.version)+'</td></tr>';
      }).join("")+'</tbody></table></div>':'<div class="empty">رویدادی ثبت نشده است.</div>')+'</section>';
}
function settingsPage() {
  const rows=recoveryEntries();
  return heading("تنظیمات","ذخیره، بازیابی تغییرات و رفتار آزمایشی AI.")+
    '<div class="stack doc"><section class="card pad stack"><h2>ذخیره و نشست</h2>'+
    '<label class="choice" style="justify-self:start"><input type="checkbox" id="auto-save" '+(state.auto?"checked":"")+'> ذخیرهٔ خودکار پرونده‌ها</label>'+
    '<div>'+btn("خروج از نشست","logout","","shield")+'</div></section>'+
    '<section class="card pad stack"><h2>بازیابی پیش‌نویس‌های محلی</h2><p>پیش از بازگردانی، نسخهٔ سرور و فیلدهای بازیابی‌شده کنار هم نمایش داده می‌شوند.</p>'+
    (rows.length?rows.map(row=>'<div class="row"><span>'+esc(row.name)+' · '+date(row.at)+'</span>'+
      btn("مقایسه و بازیابی","recover","compact","clock",'data-recovery="'+esc(row.key)+'"')+
      btn("پاک‌کردن نسخهٔ محلی","forget-recovery","compact danger","trash",'data-recovery="'+esc(row.key)+'"')+'</div>').join(""):'<small>نسخه‌ای برای بازیابی وجود ندارد.</small>')+
    '</section><section class="card pad stack"><h2>آزمون اختلال AI</h2><label class="choice"><input id="mock-failure" type="checkbox" '+
    (state.mockFailure?"checked":"")+'> شبیه‌سازی خطا برای درخواست بعدی AI</label></section></div>';
}

function syncReview(p) {
  const box=$("#section-review");
  if(box) $(".pad",box).innerHTML=review(p);
}
function refreshSources(p,k) {
  $$('[data-act="source"][data-key="'+k+'"]',main).forEach(b=>$("span",b).textContent=sources[sourceOf(p,k)]);
}

function navigate(page, extra={}) {
  if(page==="codes" || page==="history"){
    withAction(async()=>{
      if(page==="codes") await refreshRegistry();
      else state.events=await requestPanel("/events");
      openPage(page,extra);
    });
  } else openPage(page,extra);
}

function editGallery(p, images, mainImage=p.mainImage) {
  const gallery=images.map(a=>({id:a.id,groups:a.groups}));
  const products=images.filter(a=>a.groups.includes("product"));
  const selected=products.some(a=>a.id===mainImage)?mainImage:products[0]?.id||"";
  return changeDossier(p,"/images","PATCH",{gallery,mainImage:selected},"گالری در سرور ذخیره شد.");
}

function uploadImages(p, files) {
  return withAction(async()=>{
    const failures=[];
    for(const file of files){
      const query=new URLSearchParams({imageId:crypto.randomUUID(),name:file.name,version:String(p.version)});
      try {
        const row=await requestPanel(dossierPath(p)+"/images?"+query,"POST",file,{"Content-Type":"image/jpeg"});
        useServer(p,row);
      } catch(error){
        failures.push(file.name+" · "+(error.status?error.message:"ارتباط قطع شد؛ وضعیت گالری را بررسی و دوباره تلاش کنید."));
        if(!error.status || error.code==="VERSION_CONFLICT"){
          if(error.code==="VERSION_CONFLICT"){
            conflicts.add(p.id);
            notices.set(p.id,"تعارض نسخه؛ گالری این تب بازنویسی نشد.");
          }
          break;
        }
      }
    }
    if(current()===p) refreshEditor();
    if(failures.length) dialog("نتیجهٔ بارگذاری","<ul>"+failures.map(message=>"<li>"+esc(message)+"</li>").join("")+"</ul>");
    else toast("عکس‌های JPG در فضای خصوصی سرور ذخیره شدند.");
  },p);
}

document.addEventListener("click",e=>{
  const b=e.target.closest("button[data-act]");
  if(!b || b.disabled || !loggedIn || busy) return;
  const {act,page,filter,id,key,index,image,shift,recovery}=b.dataset;
  const p=id ? state.products.find(x=>x.id===id) : current();
  if(act==="nav"){if($("#dialog").open) $("#dialog").close();navigate(page,{filter:filter||"all"});return;}
  if(act==="edit" && p){openPage("editor",{id:p.id,section:b.dataset.section||""});return;}
  if(act==="more"){
    dialog("بخش‌های بیشتر",'<div class="nav-more stack">'+["research","codes","history","settings"].map(k=>navbtn(k,...pages[k])).join("")+'</div>');
    return;
  }
  if(act==="close-dialog"){ $("#dialog").close();return;}
  if(act==="confirm-dialog"){
    const fn=confirmAction;
    $("#dialog").close();
    fn?.();
    return;
  }
  if(act==="logout"){
    withAction(async()=>{await admin.logout();lockPanel();});
    return;
  }
  if(act==="recover" || act==="forget-recovery"){
    const entry=recoveryEntries().find(row=>row.key===recovery);
    if(!entry) return;
    if(act==="recover") recoverEntry(entry);
    else dialog("پاک‌کردن نسخهٔ محلی","<p>این اقدام فقط نسخهٔ بازیابی انتخاب‌شده در این مرورگر را پاک می‌کند.</p>",()=>{
      try { localStorage.removeItem(entry.key); render(); }
      catch { toast("پاک‌کردن نسخهٔ محلی ممکن نشد."); }
    },"پاک‌کردن","انصراف");
    return;
  }
  if(!p) return;
  if(act==="source"){
    const kind=sourceOf(p,key);
    const suggestion=p.analysis?.find(item=>item.key===key);
    const file=suggestion && p.images.find(item=>item.id===suggestion.imageId);
    const mock=["label","image","web"].includes(kind);
    const description=mock?"پیشنهاد از آداپتور آزمایشی آمده است.":"منشأ این فیلد مطابق اطلاعات ثبت‌شده در پرونده است.";
    dialog("منبع "+labels[key],'<div class="row">'+metaBadge(sources[kind])+(mock?metaBadge("منبع آزمایشی","amber"):"")+'</div><p>'+description+'</p>'+
      '<p>آخرین ذخیرهٔ سرور: '+date(p.updated)+'</p>'+
      (mock && file?'<p>فایل مرتبط: <a href="'+esc(file.url)+'">'+esc(file.name)+'</a></p>':""));
    return;
  }
  if(act==="jump"){jump(key);return;}
  if(act==="step"){
    if(Number(index)>=0 && Number(index)<=4) openPage("editor",{id:p.id,mode:"wizard",step:Number(index)});
    return;
  }
  if(act==="save"){saveDraft(p,true);return;}
  if(act==="resolve-conflict"){resolveConflict(p);return;}
  if(act==="suggest-code"){
    withAction(async()=>{
      await refreshRegistry();
      const code=suggestCode(p);
      if(!code){toast("کد آزاد آزمایشی پیدا نشد.");return;}
      p.code=code;amend(p);refreshEditor();
    });
    return;
  }
  if(act==="custom-fabric"){
    dialog("افزودن جنس پارچه",'<label for="new-fabric">نام جنس پارچه</label><input id="new-fabric" type="text" maxlength="80">',()=>{
      const value=$("#new-fabric").value.trim();
      if(!value || p.fabric.includes(value)){toast("یک نام تازه برای جنس پارچه وارد کنید.");return;}
      p.fabric.push(value);amend(p);refreshEditor();
    },"افزودن","انصراف");
    return;
  }
  if(act==="confirm-style"){
    withAction(async()=>{
      const updated=await requestPanel(dossierPath(p)+"/style-confirmation","POST",
        {version:p.version,styleNumber:p.styleNumber});
      useServer(p,updated);
      refreshEditor();
      toast("شمارهٔ استایل تأیید شد.");
    },p);
    return;
  }
  if(act==="store-images"){
    withAction(async()=>{
      const {images,updatedAt}=await requestPanel(dossierPath(p)+"/store-images");
      if(!images.length){toast("عکس قابل خواندن در فضای محصول پیدا نشد. فایل JPG را انتخاب کنید.");return;}
      dialog("انتخاب عکس محصول",'<label for="c22-image">شماره عکس در گالری محصول</label><select id="c22-image">'+
        images.map(({index})=>'<option value="'+index+'">'+number(index+1)+'</option>').join("")+'</select>',
        ()=>{
          const index=Number($("#c22-image").value);
          changeDossier(p,"/store-images","POST",{index,updatedAt},"عکس به پرونده اضافه شد.");
        },"افزودن عکس","انصراف");
    },p);
    return;
  }
  if(act==="run-analysis"){
    if(p.canAnalyze){
      dialog("تحلیل عکس‌های تأییدشده",'<p>این اجرا عکس‌های انتخاب‌شده را برای تحلیل ارسال می‌کند.</p>',
        ()=>withAction(async()=>{
          const {dossier}=await requestPanel(dossierPath(p)+"/ai/c2/analyze","POST",{version:p.version});
          useServer(p,dossier);
          refreshEditor();
        },p),"اجرای تحلیل","انصراف");
      return;
    }
    if(p.store) return;
    const simulateFailure=Boolean(state.mockFailure);
    state.mockFailure=false;
    changeDossier(p,"/ai/analyze","POST",{provider:"mock",simulateFailure},"پاسخ آزمایشی در پرونده ثبت شد.");
    return;
  }
  if(act==="run-research"){
    const mode=p.researchMode;
    dialog("تأیید مبنای تحقیق برند",
      '<p>نام <bdi>'+esc(p.brand)+'</bdi> را با لیبل بررسی کرده‌اید؟ برای محصول فاقد لیبل تحقیق اجرا نمی‌شود.</p>'+
      (p.styleNumber?'<p>شمارهٔ استایل تأییدشده <bdi>'+esc(p.styleNumber)+'</bdi></p>':'')+
      (mode==="live"?'<p>این اقدام جست‌وجوی لیارا را اجرا می‌کند.</p>':''),
      ()=>withAction(async()=>{
        const progress=$("#brand-research-progress");
        if(progress){progress.hidden=false;progress.textContent="در حال دریافت نتیجهٔ تحقیق…";}
        const simulateFailure=mode==="mock"&&Boolean(state.mockFailure);
        if(mode==="mock") state.mockFailure=false;
        try {
          const updated=await requestPanel(dossierPath(p)+"/ai/c2/research","POST",
            {version:p.version,mode,labelConfirmed:true,...(simulateFailure?{simulateFailure:true}:{})});
          useServer(p,updated.dossier);
          if(current()===p) refreshEditor();
          toast("نتیجهٔ تحقیق برای بررسی ثبت شد.");
        } catch(error) {
          if(progress) progress.textContent=error.status?error.message:"ارتباط قطع شد. می‌توانید ثبت پرونده را ادامه دهید.";
          throw error;
        }
      },p),"تأیید نام روی لیبل و شروع تحقیق","انصراف");
    return;
  }
  if(act==="research-action"){
    const claim=b.dataset.claim;
    if(key==="apply-draft"&&p.store){
      if(!embedded) return;
      withAction(async()=>{
        const transfer=await requestPanel(dossierPath(p)+"/store-transfer");
        if(transfer.version!==p.version){toast("نسخه پرونده تغییر کرده است.");return;}
        const titles={identityHistory:contentTitles[0],identityDesign:contentTitles[1],identityUseCases:contentTitles[2]};
        const preview=Object.entries(transfer.sections).map(([field,text])=>
          '<div class="content-box"><strong>'+esc(titles[field])+'</strong><p>'+esc(text)+'</p></div>').join("");
        if(!preview){toast("متن تأییدشده‌ای برای فیلدهای خالی محصول وجود ندارد.");return;}
        dialog("پیش‌نمایش انتقال",preview,()=>window.parent.postMessage({
          type:"motif-c22-transfer",id:p.id,version:p.version
        },location.origin),"درج در فرم محصول","انصراف");
      },p);
      return;
    }
    if(key==="approve-section"||key==="reject-section") {
      changeDossier(p,"/brand-research/review-draft","POST",
        {index:Number(index),decision:key==="approve-section"?"approved":"rejected"});
      return;
    }
    const apply=()=>changeDossier(p,"/brand-research/"+key,"POST",claim?{claim}:{});
    if(key==="verify-source") {
      dialog("تأیید شاهد",
        "<p>تأیید کنید صفحهٔ اصلی را خوانده‌اید و شاهد از همین ادعا پشتیبانی می‌کند.</p>",
        apply,"تأیید مطابقت شاهد و ادعا","انصراف");
    } else apply();
    return;
  }
  if(act==="accept-proposal"){
    const proposal=p.analysis?.find(a=>a.key===key);
    if(!proposal) return;
    const apply=()=>changeDossier(p,"/ai/accept","POST",{key},"پیشنهاد با اقدام مدیر ثبت شد.");
    if(hasValue(p[key]) && !Array.isArray(p[key])) {
      dialog("جایگزینی با پیشنهاد آزمایشی",'<p>'+esc(labels[key])+' از «'+esc(p[key])+'» به «'+esc(proposal.value)+'» تغییر کند؟</p>',apply,"پذیرش و جایگزینی","انصراف");
    } else apply();
    return;
  }
  if(act==="approve-text"){
    const c=p.content[Number(index)];
    if(!c.text.trim()){toast("ابتدا متن این بخش را وارد کنید.");return;}
    changeDossier(p,"/content/"+index,"POST",{approve:!c.approved});
    return;
  }
  if(act==="mark-review"){changeDossier(p,"/review","POST",{},"پرونده آمادهٔ بررسی است.");return;}
  if(act==="approve"){
    if(productChecks(p).length){syncReview(p);toast("موارد ضروری را در بازبینی تکمیل کنید.");return;}
    dialog("تأیید نهایی پرونده",'<p>با تأیید، کد <bdi>'+esc(normalizedCode(p.code))+'</bdi> برای همین پرونده رزرو و نسخهٔ پرونده تثبیت می‌شود.</p>',
      ()=>changeDossier(p,"/approve","POST",{},"پرونده تأیید شد."),"تأیید نهایی","انصراف");
    return;
  }
  if(act==="archive"){
    dialog("بایگانی پرونده","<p>این پرونده از فهرست فعال خارج می‌شود. کد رزروشده برای آن محفوظ می‌ماند.</p>",()=>withAction(async()=>{
      await requestPanel(dossierPath(p)+"/archive","POST",{version:p.version});
      state.products=state.products.filter(item=>item.id!==p.id);
      baseline.delete(p.id);
      await refreshRegistry().catch(()=>{});
      openPage("products");
      toast("پرونده بایگانی شد.");
    },p),"بایگانی","انصراف");
    return;
  }
  const imageIndex=p.images.findIndex(a=>a.id===image);
  if(imageIndex<0) return;
  const images=[...p.images];
  if(act==="remove-image"){
    dialog("حذف تصویر از پرونده",'<p>تصویر «'+esc(images[imageIndex].name)+'» از همهٔ گروه‌های این پرونده برداشته می‌شود.</p>',
      ()=>editGallery(p,images.filter(a=>a.id!==image)),"حذف تصویر","انصراف");
  } else if(act==="main-image"){
    editGallery(p,images,image);
  } else if(act==="move-image"){
    const target=imageIndex+Number(shift);
    if(target<0 || target>=images.length) return;
    [images[imageIndex],images[target]]=[images[target],images[imageIndex]];
    editGallery(p,images);
  }
});

document.addEventListener("input",e=>{
  const t=e.target;
  if(t.id==="search"){
    view.q=t.value;
    const sorted=[...state.products].sort((a,b)=>b.updated.localeCompare(a.updated));
    $("#list-results").innerHTML=productTable(matching(sorted));
    return;
  }
  const p=current();
  if(!p || readOnly(p) || busy) return;
  if(t.dataset.field){
    const key=t.dataset.field;
    p[key]=["price","stock","code","waistCircumference",...measurements(p)].includes(key)?ascii(t.value):t.value;
    p.sources[key]=hasValue(p[key])?"manual":"unknown";
    if(key==="brand"||key==="styleNumber"){
      p.styleConfirmed=false;
      if(p.research?.kind==="brand") p.research.current=false;
      const confirm=$('[data-act="confirm-style"]');
      if(confirm) confirm.disabled=!p.styleNumber;
      if($("#style-status")) $("#style-status").textContent="";
    }
    amend(p);
    refreshSources(p,key);
    if(key==="code" && $("#code-state")) $("#code-state").innerHTML=codeStatus(p);
    if(key==="type" && $("#section-measure")) $(".pad",$("#section-measure")).innerHTML=measure(p);
    if((key==="brand"||key==="styleNumber") && $("#section-research")) $(".pad",$("#section-research")).innerHTML=research(p);
    syncReview(p);
  } else if(t.dataset.draftIndex!==undefined&&p.researchDraft){
    const i=Number(t.dataset.draftIndex);
    p.researchDraft.sections[i]=t.value;
    const card=t.closest("[data-draft-section]");
    const draft=p.research.draft;
    const decision=t.value.trim()===draft.sections[i]?draft.decisions[i]:"pending";
    $(".badge",card).outerHTML=metaBadge(draftStatus[decision],decision==="approved"?"green":"amber");
    $('[data-key="approve-section"]',card).disabled=!t.value.trim()||decision==="approved";
    $('[data-key="reject-section"]',card).disabled=decision==="rejected";
    syncDraftTransfer(p);
    changed(p,false);
  } else if(t.dataset.content!==undefined){
    const c=p.content[Number(t.dataset.content)];
    c.text=t.value;
    if(c.approved) {
      c.approved=false;
      $(".badge",t.closest(".content-box")).outerHTML=metaBadge("در انتظار تأیید","amber");
      $("button[data-act='approve-text']",t.closest(".content-box")).innerHTML=icon("check")+"تأیید این متن";
    }
    syncDraftTransfer(p);
    amend(p);
    syncReview(p);
  }
});
document.addEventListener("focusout",e=>{
  const p=current();
  const key=e.target.dataset.field;
  if(p && ["price","stock"].includes(key) && /^\d+$/.test(numeric(p[key]))) e.target.value=valueString(p,key);
});
document.addEventListener("change",e=>{
  const t=e.target;
  if(t.id==="filter"){view.filter=t.value;render();$("#filter")?.focus();return;}
  if(t.id==="auto-save"){state.auto=t.checked;return;}
  if(t.id==="mock-failure"){state.mockFailure=t.checked;return;}
  const p=current();
  if(!p || readOnly(p) || busy) return;
  if(t.dataset.choice){
    const key=t.dataset.choice;
    p[key]=t.checked?[...p[key],t.value]:p[key].filter(x=>x!==t.value);
    p.sources[key]=hasValue(p[key])?"manual":"unknown";
    amend(p);refreshSources(p,key);syncReview(p);
  } else if(t.dataset.imageGroup){
    const a=p.images.find(img=>img.id===t.dataset.image);
    if(!a) return;
    const group=t.dataset.imageGroup;
    const groups=t.checked?[...a.groups,group]:a.groups.filter(g=>g!==group);
    if(!groups.length){
      t.checked=true;
      toast("هر عکس باید دست‌کم یک گروه داشته باشد.");
      return;
    }
    editGallery(p,p.images.map(item=>item===a?{...item,groups}:item)).finally(()=>{
      if(t.isConnected) t.checked=a.groups.includes(group);
    });
  } else if(t.id==="files" && t.files.length){
    const files=[...t.files];
    t.value="";
    dialog("افزودن تصاویر به پرونده",'<p>'+number(files.length)+' فایل برای بررسی و ذخیرهٔ خصوصی انتخاب شده است.</p>',
      ()=>uploadImages(p,files),"افزودن به گالری","انصراف");
  }
});

initPanel();
