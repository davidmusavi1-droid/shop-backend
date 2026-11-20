const parcelShipping = require('./parcel-shipping');
const { randomUUID } = require('node:crypto');
const MAX = 2147483647;
const provinces = ['آذربایجان شرقی','آذربایجان غربی','اردبیل','اصفهان','البرز','ایلام','بوشهر','تهران','چهارمحال و بختیاری','خراسان جنوبی','خراسان رضوی','خراسان شمالی','خوزستان','زنجان','سمنان','سیستان و بلوچستان','فارس','قزوین','قم','کردستان','کرمان','کرمانشاه','کهگیلویه و بویراحمد','گلستان','گیلان','لرستان','مازندران','مرکزی','هرمزگان','همدان','یزد'];
const fail = (code, message) => Object.assign(new Error(message), { statusCode: code });
const normalize = value => typeof value === 'string' ? value.trim().replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ') : '';
const required = () => process.env.NODE_ENV === 'production' || process.env.MOTIF_DESTINATION_SHIPPING === 'true';
function destination(customer) {
  const province = normalize(customer?.province), city = normalize(customer?.city);
  if (!provinces.includes(province) || !/^[\p{Script=Arabic}\d -]{2,80}$/u.test(city) || city === '*') throw fail(400,'استان و شهر مقصد را درست انتخاب کنید');
  if (!/^\d{10}$/.test(customer?.postalCode || '')) throw fail(400,'کد پستی ده‌رقمی لازم است');
  return { province, city };
}
function tariffInput(body) {
  const source = typeof body?.source === 'string' ? body.source.trim() : '';
  const carrier = typeof body?.carrier === 'string' ? body.carrier.trim() : '';
  const originProvince = normalize(body?.originProvince), originCity = normalize(body?.originCity);
  const validFrom = new Date(body?.validFrom), validUntil = new Date(body?.validUntil);
  if (source.length < 8 || source.length > 500 || carrier.length < 2 || carrier.length > 80 ||
      !provinces.includes(originProvince) || !/^[\p{Script=Arabic}\d -]{2,80}$/u.test(originCity) ||
      !Number.isFinite(+validFrom) || !Number.isFinite(+validUntil) || +validFrom >= +validUntil ||
      +validUntil <= Date.now() || +validUntil - +validFrom > 90 * 86400000 ||
      body?.allInclusive !== true || body?.merchantCoversDifference !== true) throw fail(400,'منبع، مبدأ، اعتبار و قطعی‌بودن هزینه ارسال را تأیید کنید');
  if (!Array.isArray(body.rules) || !body.rules.length || body.rules.length > 1500) throw fail(400,'ردیف‌های تعرفه نامعتبرند');
  const seen = new Set();
  const rules = body.rules.map(row => {
    const province = normalize(row.province), city = normalize(row.city);
    const { fee, maxItems, maxGoodsTomans } = row;
    const key = province + ':' + city;
    if (!provinces.includes(province) || !(city === '*' || /^[\p{Script=Arabic}\d -]{2,80}$/u.test(city)) ||
        !Number.isInteger(fee) || fee < 1 || fee > MAX || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100 ||
        !Number.isInteger(maxGoodsTomans) || maxGoodsTomans < 1 || maxGoodsTomans > MAX || (!parcelShipping.required() && seen.has(key))) throw fail(400,'تعرفه تکراری، صفر یا نامعتبر است');
    const limits=parcelShipping.required()?parcelShipping.bounds(row):{};
    if(parcelShipping.required() && rulesOverlap(body.rules,row))throw fail(400,'بازه‌های تعرفه یک مقصد هم‌پوشانی دارند');
    seen.add(key);
    return { province, city, fee, maxItems, maxGoodsTomans, ...limits };
  });
  if (provinces.some(p => !seen.has(p + ':*'))) throw fail(400,'برای پوشش سراسر ایران، تعرفه پایه تمام ۳۱ استان لازم است');
  if(parcelShipping.required() && (originProvince!=='البرز'||originCity!=='کرج'||carrier!=='POST_PISHTAZ'))throw fail(400,'مبدأ کرج و روش پست پیشتاز لازم است');
  return { source, carrier, originProvince, originCity, validFrom, validUntil, rules };
}
async function active(prisma, now = new Date()) {
  let state;
  try { state = await prisma.shippingTariffState.findUnique({ where: { id: 'default' }, include: { activeTariff: true } }); }
  catch (error) { if (['P2021','P2022'].includes(error.code)) throw fail(503,'تنظیمات ارسال هنوز آماده نیست'); throw error; }
  const tariff = state?.activeTariff;
  if (!tariff || +tariff.validFrom > +now || +tariff.validUntil <= +now) throw fail(503,'تعرفه معتبر ارسال هنوز تأیید نشده است؛ پرداخت ممکن نیست');
  return tariff;
}
function rulesOverlap(rows,row){return rows.some(r=>r!==row&&normalize(r.province)===normalize(row.province)&&normalize(r.city)===normalize(row.city)&&r.minGrams<=row.maxGrams&&row.minGrams<=r.maxGrams);}
function calculate(tariff, customer, items, parcel) {
  const dest = destination(customer);
  const count = items.reduce((n,x)=>n+x.quantity,0);
  const goodsTotal = items.reduce((n,x)=>n+x.unitPrice*x.quantity,0);
  if (!Number.isSafeInteger(goodsTotal) || goodsTotal < 0 || goodsTotal > MAX) throw fail(400,'مبلغ کالا نامعتبر است');
  if(parcelShipping.required() && (!parcel || tariff.carrier!=='POST_PISHTAZ'||tariff.originCity!=='کرج'||tariff.originProvince!=='البرز'))throw fail(409,'نرخ معتبر برای مرسوله تأیید نشده است');
  const candidates=tariff.rules.filter(r=>r.province===dest.province&&(!parcelShipping.required()||parcelShipping.fits(r,parcel)));
  const row = candidates.find(r=>r.city===dest.city) || candidates.find(r=>r.city==='*');
  if (!row || count > row.maxItems || goodsTotal > row.maxGoodsTomans) throw fail(409,'هزینه ارسال این مقصد یا اندازه سفارش قابل محاسبه نیست؛ با فروشگاه تماس بگیرید');
  const totalPrice = goodsTotal + row.fee;
  if (!Number.isSafeInteger(totalPrice) || totalPrice > MAX || row.fee < 1) throw fail(400,'مبلغ نهایی سفارش نامعتبر است');
  return { tariffId: tariff.id, shippingFee: row.fee, goodsTotal, totalPrice,
    details: { tariffId: tariff.id, goodsTotal, totalPrice, shippingFee: row.fee, carrier: tariff.carrier, source: tariff.source, originProvince: tariff.originProvince, originCity: tariff.originCity,
      destination: dest, rule: row, validFrom: tariff.validFrom.toISOString(), validUntil: tariff.validUntil.toISOString(),
      allInclusive: true, merchantCoversDifference: true, method:'POST_PISHTAZ', ...(parcel?{parcel}:{}) } };
}
async function quote(prisma, customer, items) { const parcel=parcelShipping.required()?await parcelShipping.parcel(prisma,items):null; return calculate(await active(prisma), customer, items,parcel); }
function accepted(input, q) {
  const a = input.shippingAcceptance;
  if (!a || a.tariffId !== q.tariffId || a.shippingFee !== q.shippingFee || a.totalPrice !== q.totalPrice) throw fail(409,'مبلغ ارسال یا سفارش تغییر کرده است؛ دوباره هزینه را محاسبه و تأیید کنید');
}
async function publish(prisma, body) {
  const data = tariffInput(body);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(143755315)`;
    const state = await tx.shippingTariffState.findUnique({ where: { id: 'default' } });
    if ((state?.activeTariffId || null) !== (body.expectedTariffId || null)) throw fail(409,'تعرفه توسط مدیر دیگری تغییر کرده است؛ صفحه را تازه کنید');
    const tariff = await tx.shippingTariff.create({ data: { id: randomUUID(), ...data } });
    await tx.shippingTariffState.upsert({ where: { id: 'default' }, create: { id: 'default', activeTariffId: tariff.id }, update: { activeTariffId: tariff.id } });
    return tariff;
  });
}
module.exports = { provinces, normalize, required, destination, tariffInput, active, calculate, quote, accepted, publish };
