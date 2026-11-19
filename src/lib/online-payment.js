const { fail } = require('./checkout');
const { toRials, trackId } = require('./zibal');

const TRACK_TTL = 30 * 60 * 1000;

function createOnlinePayment(prisma, gateway, now = () => new Date()) {
  const expired = attempt => attempt.trackIssuedAt &&
    now().getTime() - attempt.trackIssuedAt.getTime() >= TRACK_TTL;
  async function start(orderId, requestKey) {
    const prior = await prisma.checkoutReservation.findFirst({
      where: { orderId, requestKey }, include: { order: { include: { payment: { include: { zibalAttempt: true } } } } },
    });
    if (!prior) throw fail(404, 'سفارش پیدا نشد');
    const priorAttempt = prior.order.payment?.zibalAttempt;
    if (priorAttempt?.state === 'EXPIRED') return { status: 'EXPIRED' };
    if (priorAttempt?.trackId && expired(priorAttempt)) return verify(priorAttempt.trackId);
    const claim = await prisma.$transaction(async tx => {
      const reservation = await tx.checkoutReservation.findFirst({
        where: { orderId, requestKey }, include: { order: true },
      });
      if (!reservation) throw fail(404, 'سفارش پیدا نشد');
      const recipient = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING', checkout: { expiresAt: { gt: now() } } },
        data: { status: 'PENDING' },
      });
      if (!recipient.count) throw fail(409, 'رزرو سفارش معتبر نیست');
      const previous = await tx.payment.findUnique({ where: { orderId }, include: { zibalAttempt: true } });
      if (previous) {
        if (!previous.zibalAttempt) throw fail(409, 'روش پرداخت دیگری آغاز شده است');
        return { attempt: previous.zibalAttempt, amount: toRials(previous.amount), send: false };
      }
      const payment = await tx.payment.create({
        data: { orderId, amount: reservation.order.totalPrice, zibalAttempt: { create: {} } },
        include: { zibalAttempt: true },
      });
      return { attempt: payment.zibalAttempt, amount: toRials(payment.amount), send: true };
    });
    if (!claim.send) {
      return claim.attempt.state === 'OPEN' && !expired(claim.attempt)
        ? { status: 'OPEN', url: gateway.redirect(claim.attempt.trackId) }
        : { status: 'PENDING' };
    }
    let response;
    try { response = await gateway.request(claim.amount); }
    catch { return { status: 'PENDING' }; }
    const id = response?.result === 100 && trackId(response.trackId);
    if (!id) return { status: 'PENDING' };
    await prisma.zibalAttempt.update({
      where: { paymentId: claim.attempt.paymentId }, data: { trackId: id, state: 'OPEN', trackIssuedAt: now() },
    });
    return { status: 'OPEN', url: gateway.redirect(id) };
  }

  async function verify(rawId) {
    const id = trackId(rawId);
    if (!id) return { status: 'UNKNOWN' };
    const attempt = await prisma.zibalAttempt.findUnique({ where: { trackId: id }, include: { payment: true } });
    if (!attempt) return { status: 'UNKNOWN' };
    const where = { paymentId: attempt.paymentId };
    if (attempt.state === 'PAID') return { status: 'PAID' };
    if (attempt.state === 'EXPIRED') return { status: 'EXPIRED' };
    if (!['OPEN', 'REVIEW'].includes(attempt.state)) return { status: 'PENDING' };
    const claimed = await prisma.zibalAttempt.updateMany({
      where: { ...where, state: attempt.state }, data: { state: 'VERIFYING' },
    });
    if (!claimed.count) return { status: 'PENDING' };

    const inquiryAfterExpiry = Boolean(expired(attempt));
    let response;
    let alreadyVerified = false;
    try {
      response = inquiryAfterExpiry || attempt.state === 'REVIEW'
        ? await gateway.inquiry(id) : await gateway.verify(id);
      if (response?.result === 201 && !inquiryAfterExpiry && attempt.state === 'OPEN') {
        alreadyVerified = true;
        response = await gateway.inquiry(id);
      }
    } catch { response = null; }

    const amountMatches = response?.amount === toRials(attempt.payment.amount);
    if (inquiryAfterExpiry && attempt.state === 'OPEN' &&
        response?.result === 100 && response.status === -1 && amountMatches) {
      return prisma.$transaction(async tx => {
        const changed = await tx.order.updateMany({
          where: { id: attempt.payment.orderId, status: 'PENDING',
            totalPrice: attempt.payment.amount, payment: { isSuccessful: false } },
          data: { status: 'CANCELED' },
        });
        if (changed.count !== 1) throw fail(409, 'وضعیت سفارش نیاز به بررسی دارد');
        const items = await tx.orderItem.findMany({
          where: { orderId: attempt.payment.orderId }, orderBy: { variantId: 'asc' },
        });
        for (const item of items) {
          await tx.variant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
        }
        await tx.zibalAttempt.update({ where, data: { state: 'EXPIRED' } });
        return { status: 'EXPIRED' };
      });
    }

    if (!(response?.result === 100 && response.status === 1 && amountMatches)) {
      // Evidence of payment or an already-verified reply prohibits automatic release.
      const paymentEvidence = response?.result === 100 && [1, 2].includes(response.status);
      const state = alreadyVerified || paymentEvidence ? 'REVIEW' : attempt.state;
      await prisma.zibalAttempt.update({ where, data: { state } });
      return { status: 'PENDING' };
    }
    await prisma.$transaction(async tx => {
      const updated = await tx.order.updateMany({
        where: { id: attempt.payment.orderId, status: 'PENDING', totalPrice: attempt.payment.amount },
        data: { status: 'PAID' },
      });
      if (!updated.count) throw fail(409, 'وضعیت سفارش نیاز به بررسی دارد');
      await tx.payment.update({ where: { id: attempt.paymentId }, data: { isSuccessful: true } });
      await tx.zibalAttempt.update({ where, data: { state: 'PAID' } });
    });
    return { status: 'PAID' };
  }

  return { start, verify };
}

module.exports = { createOnlinePayment };
