const { createHmac, randomInt, randomUUID, timingSafeEqual } = require('node:crypto');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const minute = 60_000;
const hour = 60 * minute;
const hash = (secret, id, code) => createHmac('sha256', secret).update(id + ':' + code).digest();

function createMockProvider(observe = () => {}) {
  return { async send({ receptor, token }) { await observe({ receptor, token }); } };
}

function createTracking({ prisma, provider, secret, now = Date.now }) {
  if (typeof secret !== 'string' || secret.length < 32) throw Error('Order tracking requires a dedicated secret');
  return {
    async issue(orderNumber, phone) {
      const id = randomUUID();
      const reply = { challengeId: id };
      const order = await prisma.checkoutReservation.findFirst({
        where: { orderId: orderNumber, phone }, select: { orderId: true },
      });
      if (!order) return reply;
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const created = await prisma.$transaction(async tx => {
        // This transaction-scoped lock enforces limits across application processes.
        await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(143755314)`;
        const time = now();
        const since = new Date(time - hour);
        await tx.orderTrackingChallenge.deleteMany({ where: { createdAt: { lt: new Date(time - 24 * hour) } } });
        const latest = await tx.orderTrackingChallenge.findFirst({
          where: { phone }, orderBy: { createdAt: 'desc' }, select: { createdAt: true },
        });
        if (latest && latest.createdAt.getTime() > time - minute) return false;
        const perPhone = await tx.orderTrackingChallenge.count({ where: { phone, createdAt: { gte: since } } });
        const global = await tx.orderTrackingChallenge.count({ where: { createdAt: { gte: since } } });
        if (perPhone >= 3 || global >= 20) return false;
        await tx.orderTrackingChallenge.updateMany({
          where: { phone, consumedAt: null }, data: { consumedAt: new Date(time) },
        });
        await tx.orderTrackingChallenge.create({ data: {
          id, orderId: order.orderId, phone, tokenHash: hash(secret, id, code).toString('hex'),
          createdAt: new Date(time), expiresAt: new Date(time + 5 * minute),
        } });
        return true;
      });
      if (!created) return reply;
      try { await provider.send({ receptor: phone, token: code }); }
      catch {
        await prisma.orderTrackingChallenge.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date(now()) } });
      }
      return reply;
    },

    async verify(id, code) {
      const where = { id, expiresAt: { gt: new Date(now()) }, consumedAt: null, attempts: { lt: 5 } };
      const challenge = await prisma.orderTrackingChallenge.findFirst({ where });
      if (!challenge) return null;
      const match = timingSafeEqual(Buffer.from(challenge.tokenHash, 'hex'), hash(secret, id, code));
      const claimed = await prisma.orderTrackingChallenge.updateMany({
        where: { ...where, expiresAt: { gt: new Date(now()) } },
        data: match ? { consumedAt: new Date(now()) } : { attempts: { increment: 1 } },
      });
      if (!match || claimed.count !== 1) return null;
      const order = await prisma.order.findUnique({
        where: { id: challenge.orderId },
        select: { id: true, status: true, totalPrice: true, shipmentTrackingCode: true, payment: { select: { isSuccessful: true } } },
      });
      return order && {
        orderNumber: order.id, status: order.status, totalPrice: order.totalPrice,
        shipmentTrackingCode: order.shipmentTrackingCode, paid: order.payment?.isSuccessful === true,
      };
    },
  };
}

module.exports = { createMockProvider, createTracking, uuid };
