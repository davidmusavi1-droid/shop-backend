const { fail } = require('./checkout');
const { toRials, trackId } = require('./zibal');

function createOnlinePayment(prisma, gateway) {
  async function start(orderId, requestKey) {
    const claim = await prisma.$transaction(async tx => {
      const reservation = await tx.checkoutReservation.findFirst({
        where: { orderId, requestKey }, include: { order: true },
      });
      if (!reservation) throw fail(404, 'سفارش پیدا نشد');
      const recipient = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING', checkout: { expiresAt: { gt: new Date() } } },
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
      return claim.attempt.state === 'OPEN'
        ? { status: 'OPEN', url: gateway.redirect(claim.attempt.trackId) }
        : { status: 'PENDING' };
    }
    let response;
    try { response = await gateway.request(claim.amount); }
    catch { return { status: 'PENDING' }; }
    const id = response?.result === 100 && trackId(response.trackId);
    if (!id) return { status: 'PENDING' };
    await prisma.zibalAttempt.update({
      where: { paymentId: claim.attempt.paymentId }, data: { trackId: id, state: 'OPEN' },
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
    const claimed = await prisma.zibalAttempt.updateMany({ where: { ...where, state: 'OPEN' }, data: { state: 'VERIFYING' } });
    if (!claimed.count) return { status: 'PENDING' };
    let response;
    try { response = await gateway.verify(id); } catch {}
    // An unconfirmed answer is never permission to release stock.
    const valid = response?.result === 100 && response.status === 1 && response.amount === toRials(attempt.payment.amount);
    if (!valid) {
      const state = response?.result === 100 ? 'REVIEW' : 'OPEN';
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
