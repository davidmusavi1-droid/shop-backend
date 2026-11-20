const { createHash } = require('node:crypto');
const destinationShipping = require('./destination-shipping');

const MAX_AMOUNT = 2147483647;
const RESERVATION_MS = 30 * 60 * 1000;
const SHIPPING_ID = 'default';
const latePayment = new Error('Payment started before reservation cleanup');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const digits = value => value.replace(/[۰-۹٠-٩]/g, digit =>
  String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));

function checkoutInput(body, requestKey) {
  if (typeof requestKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) {
    throw fail(400, 'شناسه درخواست سفارش نامعتبر است');
  }
  const customer = {};
  for (const [key, max] of Object.entries({ fullName: 120, phone: 11, address: 500, province: 80, city: 80, postalCode: 10 })) {
    const value = body?.customer?.[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      throw fail(400, 'اطلاعات گیرنده را کامل کنید');
    }
    customer[key] = value.trim();
  }
  customer.phone = digits(customer.phone);
  customer.postalCode = digits(customer.postalCode);
  if (!/^09\d{9}$/.test(customer.phone) || !/^\d{10}$/.test(customer.postalCode)) {
    throw fail(400, 'شماره موبایل یا کد پستی نامعتبر است');
  }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) {
    throw fail(400, 'اقلام سفارش نامعتبر است');
  }
  const quantities = new Map();
  for (const line of body.items) {
    if (typeof line?.variantId !== 'string' || !line.variantId.trim() || line.variantId.length > 100 ||
        !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_AMOUNT) {
      throw fail(400, 'اقلام سفارش نامعتبر است');
    }
    const quantity = (quantities.get(line.variantId) || 0) + line.quantity;
    if (quantity > MAX_AMOUNT) throw fail(400, 'تعداد کالا نامعتبر است');
    quantities.set(line.variantId, quantity);
  }
  const items = [...quantities.keys()].sort().map(variantId => ({ variantId, quantity: quantities.get(variantId) }));
  const shippingAcceptance = body.shippingAcceptance;
  if (shippingAcceptance && (typeof shippingAcceptance.tariffId !== 'string' ||
      !Number.isInteger(shippingAcceptance.shippingFee) || !Number.isInteger(shippingAcceptance.totalPrice))) throw fail(400,'تأیید مبلغ ارسال نامعتبر است');
  const agreement = shippingAcceptance ? { shippingAcceptance: { tariffId: shippingAcceptance.tariffId, shippingFee: shippingAcceptance.shippingFee, totalPrice: shippingAcceptance.totalPrice } } : {};
  const requestHash = createHash('sha256').update(JSON.stringify({ customer, items, ...agreement })).digest('hex');
  return { customer, items, ...agreement, requestKey: requestKey.toLowerCase(), requestHash };
}

function orderTotal(fee, items) {
  let total = fee;
  for (const { unitPrice, quantity } of items) {
    total += unitPrice * quantity;
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 || unitPrice > MAX_AMOUNT ||
        !Number.isSafeInteger(total) || total > MAX_AMOUNT) {
      throw fail(400, 'مبلغ سفارش نامعتبر است');
    }
  }
  if (total <= 0) throw fail(400, 'مبلغ سفارش نامعتبر است');
  return total;
}

function receipt(reservation, hash) {
  if (reservation.requestHash !== hash) throw fail(409, 'شناسه درخواست برای سفارش دیگری استفاده شده است');
  return {
    orderNumber: reservation.orderId,
    status: reservation.order.status,
    shippingFee: reservation.shippingFee,
    totalPrice: reservation.order.totalPrice,
    expiresAt: reservation.expiresAt,
  };
}

async function reserve(prisma, input) {
  const where = { requestKey: input.requestKey };
  const include = { order: true };
  try {
    return await prisma.$transaction(async tx => {
      const saved = await tx.checkoutReservation.findUnique({ where, include });
      if (saved) return receipt(saved, input.requestHash);
      const shipping = destinationShipping.required() ? { fee: 0 } : await tx.shippingSettings.findUnique({ where: { id: SHIPPING_ID } });
      if (!shipping) throw fail(503, 'تعرفه ارسال هنوز تنظیم نشده است');

      const dbCustomer = await tx.customer.upsert({
        where: { phone: input.customer.phone },
        create: { phone: input.customer.phone, fullName: input.customer.fullName },
        update: {},
      });
      const order = await tx.order.create({
        data: {
          customerId: dbCustomer.id,
          totalPrice: 0,
          checkout: { create: {
            ...input.customer,
            requestKey: input.requestKey,
            requestHash: input.requestHash,
            shippingFee: shipping.fee,
            expiresAt: new Date(Date.now() + RESERVATION_MS),
          } },
        },
      });
      const items = [];
      for (const item of input.items) {
        const variant = await tx.variant.findUnique({ where: { id: item.variantId }, include: { product: true } });
        if (!variant) throw fail(404, 'کالا پیدا نشد');
        const reserved = await tx.variant.updateMany({
          where: { id: variant.id, stock: { gte: item.quantity }, product: { isActive: true } },
          data: { stock: { decrement: item.quantity } },
        });
        if (reserved.count !== 1) throw fail(409, 'موجودی کافی نیست');
        items.push({ ...item, productId: variant.productId, unitPrice: variant.product.basePrice + variant.priceDelta });
      }
      let shippingQuote;
      if (destinationShipping.required()) {
        shippingQuote = await destinationShipping.quote(tx, input.customer, items);
        destinationShipping.accepted(input, shippingQuote);
        shipping.fee = shippingQuote.shippingFee;
      }
      const totalPrice = orderTotal(shipping.fee, items);
      if (shippingQuote) await tx.orderShippingSnapshot.create({ data: {
        orderId: order.id, tariffId: shippingQuote.tariffId, fee: shippingQuote.shippingFee, details: shippingQuote.details,
      } });
      const paidAmount = await tx.order.update({ where: { id: order.id }, data: { totalPrice, items: { create: items } } });
      const savedReservation = await tx.checkoutReservation.update({
        where: { orderId: order.id },
        data: { shippingFee: shipping.fee, expiresAt: new Date(Date.now() + RESERVATION_MS) },
      });
      return receipt({ ...savedReservation, order: paidAmount }, input.requestHash);
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const saved = await prisma.checkoutReservation.findUnique({ where, include });
      if (saved) return receipt(saved, input.requestHash);
    }
    throw error;
  }
}

async function releaseExpired(prisma, now = new Date()) {
  // Only release orders with no payment attempt. Future gateway reconciliation must
  // resolve pending attempts before release, and claim orders via the same order row.
  const expired = await prisma.checkoutReservation.findMany({
    where: { expiresAt: { lte: now }, order: { status: 'PENDING', payment: null } },
    orderBy: { expiresAt: 'asc' },
    select: { orderId: true },
    take: 50,
  });
  for (const { orderId } of expired) {
    await prisma.$transaction(async tx => {
      const changed = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING', payment: null, checkout: { expiresAt: { lte: now } } },
        data: { status: 'CANCELED' },
      });
      if (changed.count !== 1) return;
      // A receipt transaction may have committed while this UPDATE waited for the order lock.
      if (await tx.payment.findUnique({ where: { orderId } })) throw latePayment;
      const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { variantId: 'asc' } });
      for (const item of items) {
        await tx.variant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
      }
    }).catch(error => { if (error !== latePayment) throw error; });
  }
}

module.exports = { checkoutInput, fail, MAX_AMOUNT, orderTotal, releaseExpired, reserve, SHIPPING_ID };
