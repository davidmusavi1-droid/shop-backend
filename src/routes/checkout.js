const express = require('express');
const prisma = require('../lib/prisma');
const requireAdmin = require('../middleware/requireAdmin');
const checkout = require('../lib/checkout');
const { liveTrackingReady } = require('../lib/kavenegar');
const { publicCheckout } = require('../lib/checkout-access');
const shipping = require('../lib/destination-shipping');
const shippingPolicy = require('../lib/shipping-policy');
const postpaid = require('../lib/postpaid-shipping');
const { randomUUID } = require('node:crypto');
const router = express.Router();

// Tracking remains available for existing orders when new checkout is paused.
router.use('/tracking', require('./order-tracking'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (publicCheckout()) return next();
  if (process.env.MOTIF_CHECKOUT_PREVIEW !== 'true') return res.sendStatus(404);
  if (process.env.NODE_ENV !== 'test') return requireAdmin(req, res, next);
  next();
});

function handle(action) {
  return async (req, res) => {
    try {
      await action(req, res);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status === 500) console.error('Checkout failed', error.code || 'UNKNOWN');
      res.status(status).json({ error: status === 500 ? 'خطای موقت ثبت سفارش' : error.message });
    }
  };
}

router.use('/logistics', require('./logistics'));
router.use('/card-transfer', require('./card-transfer'));

router.get('/shipping', handle(async (req, res) => {
  if(postpaid.required()){
    let policy;try{policy=await postpaid.active(prisma);}catch(e){if(e.statusCode!==503)throw e;}
    return res.json({mode:'postpaid',shippingFee:0,ready:Boolean(policy),provinces:shipping.provinces,cities:{},terms:postpaid.terms,public:publicCheckout(),trackingAvailable:liveTrackingReady(),policy:shippingPolicy.publicView(await shippingPolicy.read(prisma))});
  }
  if (shipping.required()) {
    let tariff;
    try { tariff = await shipping.active(prisma); } catch (e) { if (e.statusCode !== 503) throw e; }
    const cities = Object.fromEntries(shipping.provinces.map(p=>[p, tariff ? tariff.rules.filter(x=>x.province===p&&x.city!=='*').map(x=>x.city) : []]));
    return res.json({ mode: 'destination', shippingFee: null, ready: Boolean(tariff), provinces: shipping.provinces, cities,
      public: publicCheckout(), trackingAvailable: liveTrackingReady() });
  }
  const settings = await prisma.shippingSettings.findUnique({ where: { id: checkout.SHIPPING_ID } });
  res.json({ shippingFee: settings?.fee ?? null, public: publicCheckout(), trackingAvailable: liveTrackingReady() });
}));

router.put('/shipping', requireAdmin, handle(async (req, res) => {
  if (shipping.required() || postpaid.required()) throw checkout.fail(409,'تعرفه ثابت برای ارسال عمومی معتبر نیست؛ تعرفه مقصد را تنظیم کنید');
  const fee = req.body?.shippingFee;
  if (!Number.isInteger(fee) || fee < 0 || fee > checkout.MAX_AMOUNT) {
    throw checkout.fail(400, 'تعرفه ارسال نامعتبر است');
  }
  await prisma.shippingSettings.upsert({
    where: { id: checkout.SHIPPING_ID },
    create: { id: checkout.SHIPPING_ID, fee },
    update: { fee },
  });
  res.json({ shippingFee: fee });
}));

router.get('/shipping/tariff', requireAdmin, handle(async (req, res) => {
  const state = await prisma.shippingTariffState.findUnique({ where: { id: 'default' }, include: { activeTariff: true } });
  res.json({ tariff: state?.activeTariff || null, provinces: shipping.provinces });
}));
router.post('/shipping/tariff', requireAdmin, handle(async (req, res) => {
  res.json(await shipping.publish(prisma, req.body));
}));
router.post('/shipping/quote', handle(async (req, res) => {
  const input = checkout.checkoutInput(req.body, randomUUID());
  const lines = [];
  for (const item of input.items) {
    const v = await prisma.variant.findUnique({ where: { id: item.variantId }, include: { product: true } });
    if (!v?.product.isActive || v.stock < item.quantity) throw checkout.fail(409,'موجودی کالا قابل تأیید نیست');
    lines.push({ ...item, unitPrice: v.product.basePrice + v.priceDelta });
  }
  const q=await (postpaid.required()?postpaid:shipping).quote(prisma,input.customer,lines);
  res.json({tariffId:q.tariffId,shippingFee:q.shippingFee,goodsTotal:q.goodsTotal,totalPrice:q.totalPrice,carrier:q.details.carrier,...(q.shippingChargeMode?{shippingChargeMode:q.shippingChargeMode,terms:q.terms,eta:q.eta}:{})});
}));

router.post('/orders', handle(async (req, res) => {
  const input = checkout.checkoutInput(req.body, req.get('Idempotency-Key'));
  await checkout.releaseExpired(prisma);
  res.status(201).json(await checkout.reserve(prisma, input));
}));

module.exports = router;
