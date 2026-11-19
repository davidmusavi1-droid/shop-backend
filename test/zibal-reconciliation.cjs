const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createOnlinePayment } = require('../src/lib/online-payment');
const { createZibalGateway } = require('../src/lib/zibal');
const { checkoutInput, reserve } = require('../src/lib/checkout');

assert.equal(process.env.DATABASE_URL, 'postgresql://motif_test:local_test_only@127.0.0.1:5432/motif_test');
const prisma = require('../src/lib/prisma');
let time = Date.now(), nextId = 10000000, calls = 0;
let inquiry = { result: 100, status: -1, amount: 1250 };
const mock = createZibalGateway({ merchant: 'mock', callbackUrl: '/test', transport(url, request) {
  if (url.endsWith('/request')) {
    assert.equal(request.amount, 1250);
    return { result: 100, trackId: ++nextId };
  }
  if (url.endsWith('/verify')) return { result: 201 };
  assert.match(url, /\/v1\/inquiry$/);
  calls++;
  if (inquiry instanceof Error) throw inquiry;
  return inquiry;
} });
const payment = createOnlinePayment(prisma, mock, () => new Date(time));

async function run() {
  const priorFee = await prisma.shippingSettings.findUnique({ where: { id: 'default' } });
  await prisma.shippingSettings.upsert({ where: { id: 'default' }, create: { id: 'default', fee: 25 }, update: { fee: 25 } });
  try {
    const product = await prisma.product.create({ data: {
      title: 'Zibal reconciliation fixture', basePrice: 100, inventoryMode: 'SINGLE', images: [],
      customerNeeds: [], styles: [], variants: { create: {
        size: 'M', color: 'black', sku: randomUUID(), stock: 1, itemImages: [],
      } },
    }, include: { variants: true } });
    const variantId = product.variants[0].id;
    const stock = async () => (await prisma.variant.findUniqueOrThrow({ where: { id: variantId } })).stock;
    async function checkout() {
      const key = randomUUID();
      const { orderNumber } = await reserve(prisma, checkoutInput({
        customer: { fullName: 'Fixture', phone: '09128880159', address: 'Fixture', province: 'Tehran',
          city: 'Tehran', postalCode: '1234567890' },
        items: [{ variantId, quantity: 1 }],
      }, key));
      const started = await payment.start(orderNumber, key);
      assert.equal(started.status, 'OPEN');
      return { id: String(nextId), orderNumber };
    }
    const first = await checkout();
    time += 30 * 60000 - 1;
    assert.equal((await payment.verify(first.id)).status, 'PENDING');
    assert.equal(await stock(), 0);

    // A 201 with inconsistent inquiry is conservatively held for review.
    time += 1;
    assert.equal((await payment.verify(first.id)).status, 'PENDING');
    assert.equal(await stock(), 0);
    inquiry = { result: 100, status: 1, amount: 1250 };
    assert.equal((await payment.verify(first.id)).status, 'PAID');
    const paid = await prisma.payment.findUniqueOrThrow({ where: { orderId: first.orderNumber } });
    assert.equal(paid.isSuccessful, true);
    console.log('PASS 201 is reconciled only by confirmed inquiry with matching amount');

    const extra = await prisma.product.create({ data: {
      title: 'Zibal expiry fixture', basePrice: 100, inventoryMode: 'SINGLE', images: [],
      customerNeeds: [], styles: [], variants: { create: {
        size: 'M', color: 'black', sku: randomUUID(), stock: 1, itemImages: [],
      } },
    }, include: { variants: true } });
    const expiryVariant = extra.variants[0].id;
    async function reserveExpiry() {
      const key = randomUUID();
      const { orderNumber } = await reserve(prisma, checkoutInput({
        customer: { fullName: 'Fixture', phone: '09128880158', address: 'Fixture', province: 'Tehran',
          city: 'Tehran', postalCode: '1234567890' },
        items: [{ variantId: expiryVariant, quantity: 1 }],
      }, key));
      assert.equal((await payment.start(orderNumber, key)).status, 'OPEN');
      return { id: String(nextId), orderNumber };
    }
    time = Date.now();
    const expiring = await reserveExpiry();
    time += 30 * 60000;
    const expiryStock = async () => (await prisma.variant.findUniqueOrThrow({ where: { id: expiryVariant } })).stock;
    for (const response of [new Error('timeout'), { result: 203 }, { result: 100, status: 3, amount: 1250 },
      { result: 100, status: -1, amount: 1251 }]) {
      inquiry = response;
      assert.equal((await payment.verify(expiring.id)).status, 'PENDING');
      assert.equal(await expiryStock(), 0);
    }
    inquiry = { result: 100, status: -1, amount: 1250 };
    await Promise.all([payment.verify(expiring.id), payment.verify(expiring.id)]);
    assert.equal((await payment.verify(expiring.id)).status, 'EXPIRED');
    assert.equal(await expiryStock(), 1);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: expiring.orderNumber } })).status, 'CANCELED');
    time = Date.now();
    const retried = await reserveExpiry();
    assert.notEqual(retried.id, expiring.id);
    assert.equal((await payment.verify(expiring.id)).status, 'EXPIRED');
    assert.equal(await expiryStock(), 0);
    assert.ok(calls > 0);
    console.log('PASS errors and mismatches preserve stock; valid expiry releases once and retry uses a new trackId');
  } finally {
    if (priorFee) await prisma.shippingSettings.update({ where: { id: 'default' }, data: { fee: priorFee.fee } });
    else await prisma.shippingSettings.delete({ where: { id: 'default' } });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
