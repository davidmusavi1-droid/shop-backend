const { randomUUID } = require('node:crypto');
const { fail } = require('./checkout');
const { toRials, trackId } = require('./zibal');
const { TTL, WINDOW, MAX_ATTEMPTS, evidence, auditResponse } = require('./zibal-retry-policy');

function createRetryPayment(prisma, gateway, options = {}) {
  const now = options.now || (() => new Date());
  const status11Final = options.status11Final === true;
  const pending = code => ({ status: 'PENDING', code });
  const attempts = paymentId => prisma.zibalPaymentAttempt.findMany({
    where: { paymentId }, orderBy: { sequence: 'asc' },
  });
  const event = (attemptId, operation, response) => prisma.zibalAttemptEvent.create({
    data: { attemptId, operation, response: auditResponse(response) },
  });

  // Durable compare-and-swap covers network calls and every callback for the
  // order, across processes. A crash never silently unlocks a possible charge.
  async function locked(orderId, action) {
    const token = randomUUID();
    await prisma.zibalRetryGate.upsert({ where: { orderId }, create: { orderId }, update: {} });
    const claim = await prisma.zibalRetryGate.updateMany({
      where: { orderId, busyToken: null }, data: { busyToken: token },
    });
    if (!claim.count) return pending('PAYMENT_BUSY');
    // Unexpected errors deliberately retain the gate for reconciliation.
    const result = await action();
    await prisma.zibalRetryGate.updateMany({ where: { orderId, busyToken: token }, data: { busyToken: null } });
    return result;
  }

  async function adopt(payment) {
    let rows = await attempts(payment.id);
    if (!rows.length && payment.zibalAttempt) {
      const old = payment.zibalAttempt;
      const row = await prisma.zibalPaymentAttempt.create({ data: {
        id: payment.id, paymentId: payment.id, sequence: 1,
        trackId: old.trackId, issuedAt: old.trackIssuedAt,
        state: payment.isSuccessful ? 'PAID' : old.state === 'OPEN' ? 'OPEN' :
          old.state === 'EXPIRED' ? 'UNPAID' : 'REVIEW',
      } });
      await event(row.id, 'LEGACY_IMPORT', { status: old.state });
      rows = [row];
    }
    return rows;
  }

  async function invoke(attempt, operation, amount) {
    let response;
    try { response = await gateway[operation](operation === 'request' ? amount : attempt.trackId); }
    catch { await event(attempt.id, operation + '_ERROR', {}); return null; }
    await event(attempt.id, operation, response);
    return response;
  }

  async function settle(payment, attempt) {
    return prisma.$transaction(async tx => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.isSuccessful) {
        if (attempt.state !== 'PAID') {
          await tx.zibalRetryGate.update({ where: { orderId: payment.orderId }, data: { blocked: true } });
          await tx.zibalAttemptEvent.create({ data: { attemptId: attempt.id,
            operation: 'SECOND_PAYMENT_EVIDENCE', response: {} } });
        }
        return { status: 'PAID' };
      }
      const changed = await tx.order.updateMany({ where: {
        id: payment.orderId, status: 'PENDING', totalPrice: payment.amount,
        payment: { isSuccessful: false },
      }, data: { status: 'PAID' } });
      if (changed.count !== 1) {
        await tx.zibalRetryGate.update({ where: { orderId: payment.orderId }, data: { blocked: true } });
        return pending('ORDER_REVIEW');
      }
      // Do not touch stock: it was deducted once by checkout.reserve.
      await tx.payment.update({ where: { id: payment.id }, data: { isSuccessful: true } });
      await tx.zibalPaymentAttempt.update({ where: { id: attempt.id }, data: { state: 'PAID' } });
      await tx.zibalRetryGate.update({ where: { orderId: payment.orderId }, data: { blocked: true } });
      return { status: 'PAID' };
    });
  }

  async function inspect(payment, attempt) {
    if (!attempt.trackId) return 'UNKNOWN';
    const response = await invoke(attempt, 'inquiry');
    const state = evidence(response, toRials(payment.amount), attempt.issuedAt, now(), status11Final);
    if (state === 'UNKNOWN' && response?.result === 100 &&
        ([1, 2].includes(response.status) || response.paidAt || response.verifiedAt || response.refNumber)) {
      await prisma.zibalRetryGate.update({ where: { orderId: payment.orderId }, data: { blocked: true } });
    }
    if (state === 'PAID') return (await settle(payment, attempt)).status === 'PAID' ? 'PAID' : 'REVIEW';
    if (state === 'REVIEW') {
      // Paid/unverified is never treated as a failed payment.
      await prisma.zibalRetryGate.update({ where: { orderId: payment.orderId }, data: { blocked: true } });
      return state;
    }
    if (state === 'UNPAID') {
      await prisma.zibalPaymentAttempt.update({ where: { id: attempt.id }, data: { state: 'UNPAID' } });
    }
    return state;
  }

  async function start(orderId, requestKey) {
    // Authenticate ownership before making even the gate write.
    const owned = await prisma.checkoutReservation.findFirst({ where: { orderId, requestKey } });
    if (!owned) throw fail(404, 'سفارش پیدا نشد');
    return locked(orderId, async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId },
        include: { checkout: true, payment: { include: { zibalAttempt: true } } } });
      let payment = order.payment;
      let newPayment = false;
      if (payment?.isSuccessful) return { status: 'PAID' };
      if (order.status !== 'PENDING') return pending('ORDER_CLOSED');
      const gate = await prisma.zibalRetryGate.findUniqueOrThrow({ where: { orderId } });
      if (gate.blocked) return pending('PAYMENT_REVIEW');
      if (!payment) {
        if (order.checkout.expiresAt <= now()) return { status: 'EXPIRED' };
        payment = await prisma.payment.create({ data: {
          orderId, amount: order.totalPrice, zibalAttempt: { create: {} },
        }, include: { zibalAttempt: true } });
        newPayment = true;
      } else if (!payment.zibalAttempt) return pending('OTHER_PAYMENT_METHOD');
      if (payment.amount !== order.totalPrice) return pending('AMOUNT_MISMATCH');
      let rows = await attempts(payment.id);
      // Only import an existing legacy attempt, not the empty row just created.
      if (!rows.length && payment.zibalAttempt.trackId) rows = await adopt(payment);
      if (!rows.length && !newPayment) return pending('LEGACY_REQUEST_OUTCOME_UNKNOWN');
      if (!rows.length && payment.zibalAttempt.state !== 'STARTING') return pending('PAYMENT_REVIEW');
      if (rows.length) {
        if (rows.some(row => ['STARTING', 'UNKNOWN', 'REVIEW'].includes(row.state))) {
          return pending('PAYMENT_REVIEW');
        }
        // Recheck ALL historical tracks before issuing another. A late callback
        // cannot race this check because both paths hold the same durable gate.
        for (const row of rows) {
          const state = await inspect(payment, row);
          if (state === 'PAID') return { status: 'PAID' };
          if (state === 'OPEN' && row.sequence === rows.length && row.state === 'OPEN') {
            return { status: 'OPEN', url: gateway.redirect(row.trackId) };
          }
          if (state !== 'UNPAID') return pending('RETRY_NOT_PROVEN_SAFE');
        }
      }
      if (rows.length >= MAX_ATTEMPTS || now().getTime() + TTL > order.createdAt.getTime() + WINDOW) {
        return pending('RETRY_LIMIT');
      }
      const attempt = await prisma.zibalPaymentAttempt.create({ data: {
        paymentId: payment.id, sequence: rows.length + 1, state: 'STARTING',
      } });
      const response = await invoke(attempt, 'request', toRials(payment.amount));
      const id = response?.result === 100 && trackId(response.trackId);
      if (!id) {
        await prisma.zibalPaymentAttempt.update({ where: { id: attempt.id }, data: { state: 'UNKNOWN' } });
        return pending('REQUEST_OUTCOME_UNKNOWN');
      }
      const issuedAt = now();
      await prisma.$transaction(async tx => {
        await tx.zibalPaymentAttempt.update({ where: { id: attempt.id }, data: { trackId: id, state: 'OPEN', issuedAt } });
        // v37's first track remains intact; no old track is overwritten on retry.
        if (!rows.length) await tx.zibalAttempt.update({ where: { paymentId: payment.id },
          data: { trackId: id, state: 'OPEN', trackIssuedAt: issuedAt } });
        await tx.checkoutReservation.update({ where: { orderId }, data: { expiresAt: new Date(issuedAt.getTime() + TTL) } });
      });
      return { status: 'OPEN', url: gateway.redirect(id) };
    });
  }

  async function verify(rawId) {
    const id = trackId(rawId);
    if (!id) return { status: 'UNKNOWN' };
    const row = await prisma.zibalPaymentAttempt.findUnique({ where: { trackId: id }, include: { payment: true } });
    const legacy = row ? null : await prisma.zibalAttempt.findUnique({ where: { trackId: id }, include: { payment: true } });
    const payment = row?.payment || legacy?.payment;
    if (!payment) return { status: 'UNKNOWN' };
    return locked(payment.orderId, async () => {
      const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { zibalAttempt: true } });
      const rows = await adopt(current);
      const attempt = rows.find(x => x.trackId === id);
      if (!attempt) return { status: 'UNKNOWN' };
      if (attempt.state === 'PAID' && current.isSuccessful) return { status: 'PAID' };
      // A delayed callback for an old attempt must still be reconciled server-side.
      const state = await inspect(current, attempt);
      if (state === 'PAID') return { status: 'PAID' };
      if (state === 'REVIEW' || state === 'UNKNOWN') return pending('PAYMENT_REVIEW');
      if (state === 'OPEN') {
        const response = await invoke(attempt, 'verify');
        if (response?.result === 100 && response.status === 1 && response.amount === toRials(current.amount)) {
          return settle(current, attempt);
        }
        if (response?.result === 201) {
          // 201 is never success by itself, even on a repeated callback.
          if (await inspect(current, attempt) === 'PAID') return { status: 'PAID' };
        }
        if (response?.result === 201 || response?.result === 100 && [1, 2].includes(response.status)) {
          await prisma.zibalRetryGate.update({ where: { orderId: payment.orderId }, data: { blocked: true } });
        }
        return pending('PAYMENT_REVIEW');
      }
      // No stock release here: while retry is possible the existing reservation
      // remains held. Expired-pending reconciliation is an explicit operation.
      return pending('RETRY_AVAILABLE');
    });
  }

  async function expire(orderId, requestKey) {
    const owned = await prisma.checkoutReservation.findFirst({ where: { orderId, requestKey } });
    if (!owned) throw fail(404, 'سفارش پیدا نشد');
    return locked(orderId, async () => {
      const payment = await prisma.payment.findUnique({ where: { orderId }, include: { zibalAttempt: true } });
      if (!payment || payment.isSuccessful) return pending('NO_UNPAID_PAYMENT');
      const rows = await adopt(payment);
      if (!rows.length) return pending('PAYMENT_REVIEW');
      for (const row of rows) {
        if (!row.trackId || !row.issuedAt || now() - row.issuedAt < TTL) return pending('TRACK_NOT_EXPIRED');
        const response = await invoke(row, 'inquiry');
        const state = evidence(response, toRials(payment.amount), row.issuedAt, now());
        if (state === 'PAID') return settle(payment, row);
        // Release retains the original strict expired-pending-only contract.
        if (state !== 'UNPAID' || response.status !== -1) return pending('PAYMENT_REVIEW');
      }
      return prisma.$transaction(async tx => {
        const changed = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING',
          totalPrice: payment.amount, payment: { isSuccessful: false } }, data: { status: 'CANCELED' } });
        if (!changed.count) return { status: 'EXPIRED' };
        const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { variantId: 'asc' } });
        for (const item of items) await tx.variant.update({ where: { id: item.variantId },
          data: { stock: { increment: item.quantity } } });
        await tx.zibalPaymentAttempt.updateMany({ where: { paymentId: payment.id }, data: { state: 'UNPAID' } });
        await tx.zibalRetryGate.update({ where: { orderId }, data: { blocked: true } });
        return { status: 'EXPIRED' };
      });
    });
  }

  return { start, verify, expire };
}

module.exports = { createRetryPayment };
