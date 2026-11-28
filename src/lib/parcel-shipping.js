const { createHash } = require('node:crypto');
const fail = (statusCode, message) => Object.assign(new Error(message), {statusCode});
const required = () => process.env.NODE_ENV === 'production' || process.env.MOTIF_PARCEL_SHIPPING === 'true';
// JSONB may reorder object keys. Compare semantic content, preserving array order.
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function integer(n, min=1, max=2147483647) {
  if (!Number.isSafeInteger(n) || n<min || n>max) throw fail(400,'وزن، ابعاد یا زمان نامعتبر است');
  return n;
}
function contents(items) {
  return [...items].map(x=>({variantId:String(x.variantId),quantity:integer(x.quantity,1,100)})).sort((a,b)=>a.variantId.localeCompare(b.variantId));
}
function signature(items) { return hash(contents(items)); }
const defaults = {supportPhone:'',requestMinutes:120,offerMinutes:30,reservationMinutes:30,courierEnabled:false,courierCutoff:'20:00'};
const validCutoff=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const tehranClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function deliverySchedule(cutoff,now=new Date()){
  const {year,month,day,hour,minute}=Object.fromEntries(tehranClock.formatToParts(now).map(({type,value})=>[type,value]));
  const next=new Date(Date.UTC(+year,+month-1,+day+1)).toISOString().slice(0,10);
  return {today:year+'-'+month+'-'+day,tomorrow:next,todayAvailable:hour+':'+minute<=cutoff};
}
function requestedDeliveryDate(choice,cutoff,now){
  const s=deliverySchedule(cutoff,now);
  if(choice===undefined)choice=s.todayAvailable?'today':'tomorrow';
  if(choice==='tomorrow')return s.tomorrow;
  if(choice==='today'&&s.todayAvailable)return s.today;
  throw fail(409,'مهلت امروز گذشته است؛ ارسال فوری روز بعد را انتخاب کنید.');
}
function ensureDeliveryDate(date,cutoff,now){
  // Existing requests predate scheduled delivery. Their agreed offer is preserved.
  if(!date)return;
  const s=deliverySchedule(cutoff,now);
  if(date===s.tomorrow||(date===s.today&&s.todayAvailable))return;
  throw fail(409,'مهلت روز انتخاب‌شده گذشته است؛ درخواست تازه برای روز بعد ثبت کنید.');
}
function settingsInput(b) {
  if(typeof b?.supportPhone!=='string' || (b.supportPhone && !/^0\d{10}$/.test(b.supportPhone)) || typeof b.courierEnabled!=='boolean') throw fail(400,'شماره پشتیبانی معتبر لازم است');
  if(b.courierEnabled && !b.supportPhone) throw fail(400,'پشتیبانی ارسال فوری را تنظیم کنید');
  const courierCutoff=b.courierCutoff??defaults.courierCutoff;
  if(!validCutoff(courierCutoff))throw fail(400,'ساعت پایان پذیرش باید با قالب ساعت و دقیقه وارد شود.');
  return {supportPhone:b.supportPhone,courierEnabled:b.courierEnabled,courierCutoff,
    requestMinutes:integer(b.requestMinutes,1,1440),offerMinutes:integer(b.offerMinutes,1,30),reservationMinutes:integer(b.reservationMinutes,30,30)};
}
async function settings(db) {
  const saved=(await db.shippingOperations.findUnique({where:{id:'default'}}))?.settings;
  return {...defaults,...saved,reservationMinutes:30,courierCutoff:validCutoff(saved?.courierCutoff)?saved.courierCutoff:defaults.courierCutoff};
}
function weightInput(b) {if(b?.approved!==true)throw fail(400,'اندازه‌گیری واقعی را تأیید کنید');return {grams:integer(b.grams,1,100000),approvedAt:new Date()};}
function planInput(b) {
  if(b?.approved!==true || !Array.isArray(b.items)||!b.items.length||b.items.length>100)throw fail(400,'بسته‌بندی واقعی این ترکیب کالا را تأیید کنید');
  const items=contents(b.items);
  if(new Set(items.map(x=>x.variantId)).size!==items.length)throw fail(400,'کالای تکراری در بسته‌بندی');
  return {id:signature(items),items,tareGrams:integer(b.tareGrams,1,10000),lengthMm:integer(b.lengthMm,1,2000),widthMm:integer(b.widthMm,1,2000),heightMm:integer(b.heightMm,1,2000),approvedAt:new Date()};
}
async function parcel(db, items) {
  const plan=await db.shippingPackingPlan.findUnique({where:{id:signature(items)}});
  if(!plan)throw fail(409,'بسته‌بندی واقعی این ترکیب سفارش هنوز تأیید نشده است؛ با پشتیبانی تماس بگیرید');
  const measures=await db.shippingMeasurement.findMany({where:{variantId:{in:items.map(x=>x.variantId)}}});
  const weights=new Map(measures.map(m=>[m.variantId,m]));
  let grams=plan.tareGrams;
  const measured=items.map(x=>{const m=weights.get(x.variantId);if(!m?.approvedAt)throw fail(409,'وزن واقعی کالا هنوز تأیید نشده است');grams+=integer(m.grams)*x.quantity;return {variantId:x.variantId,quantity:x.quantity,grams:m.grams,approvedAt:m.approvedAt};});
  integer(grams,1,100000);
  return {grams,tareGrams:plan.tareGrams,lengthMm:plan.lengthMm,widthMm:plan.widthMm,heightMm:plan.heightMm,planId:plan.id,approvedAt:plan.approvedAt,items:measured};
}
function eligible(c) {
  const normal=s=>typeof s==='string'?s.trim().replace(/[يى]/g,'ی').replace(/ك/g,'ک'):'';
  return (normal(c.province)==='تهران'&&normal(c.city)==='تهران') || (normal(c.province)==='البرز'&&normal(c.city)==='کرج');
}
function bounds(row) {
  const out={};
  for(const k of ['minGrams','maxGrams','maxLengthMm','maxWidthMm','maxHeightMm'])out[k]=integer(row[k]);
  if(out.minGrams>out.maxGrams)throw fail(400,'بازه وزن تعرفه نامعتبر است');
  return out;
}
function fits(row,p) {
  return p.grams>=row.minGrams && p.grams<=row.maxGrams && p.lengthMm<=row.maxLengthMm && p.widthMm<=row.maxWidthMm && p.heightMm<=row.maxHeightMm;
}
module.exports={fail,required,integer,hash,signature,contents,settingsInput,settings,defaults,weightInput,planInput,parcel,eligible,bounds,fits,deliverySchedule,requestedDeliveryDate,ensureDeliveryDate};
