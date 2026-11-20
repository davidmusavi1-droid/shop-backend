'use strict';
// Durable, one-way dispatch boundary. No provider calls and no retry mechanism here.
function lifecycle(db, id, scope, reservationUsage = {}) {
  let state = { version: 1, originalScope: scope, phase: 'reserved', reservedAt: new Date().toISOString() };
  const usage = extra => ({ ...reservationUsage, ...extra, lifecycle: { ...state } });
  return {
    async beforeSend() {
      if (state.phase !== 'reserved') throw new Error('AI dispatch can only begin once');
      const reservationUsageWithPhase = usage();
      state = { ...state, phase: 'dispatching', dispatchedAt: new Date().toISOString() };
      const changed = await db.smartAiRun.updateMany({ where: { id, status: 'pending', usage: { equals: reservationUsageWithPhase } },
        data: { usage: usage() } });
      if (changed.count !== 1) throw new Error('AI dispatch reservation is no longer available');
    },
    completed(providerUsage) {
      state = { ...state, phase: 'responded', responseAt: new Date().toISOString() };
      return usage(providerUsage);
    },
    async failed(error, { providerInvoked, outcome } = {}) {
      // Only local proof that fetch was never invoked can release a reservation.
      const unsent = !providerInvoked || error.requestSent === false;
      state = { ...state, phase: unsent ? 'released' : error.responseReceived || outcome ? 'responded' : 'unknown',
        endedAt: new Date().toISOString(), ...(unsent ? { proof: 'local_before_fetch' } : {}) };
      const status = 'failed'; // DB status stays compatible; lifecycle carries precise outcome.
      await db.smartAiRun.updateMany({ where: { id, status: 'pending' }, data: {
        status, errorCode: error.code || 'AI_UNKNOWN', usage: usage(outcome?.usage || error.usage),
        ...(outcome?.result && { result: outcome.result }),
        // Keep attempt history while allowing a NEW, explicitly confirmed unsent attempt.
        ...(unsent && { scope: scope + ':released:' + id }),
      } });
    },
    reservationUsage: usage(),
  };
}
async function releaseStaleUnsent(db, now = new Date()) {
  // Safe crash recovery: an old RESERVED row is proof that the guarded fetch boundary
  // was never reached. CAS prevents a live worker from dispatching after release.
  const rows = await db.smartAiRun.findMany({ where: { status: 'pending', at: { lt: new Date(now - 300_000) } },
    select: { id: true, scope: true, usage: true }, take: 200, orderBy: { at: 'asc' } });
  for (const row of rows) {
    const phase = row.usage?.lifecycle;
    if (phase?.version !== 1 || phase.phase !== 'reserved') continue;
    await db.smartAiRun.updateMany({ where: { id: row.id, status: 'pending', usage: { equals: row.usage } }, data: {
      status: 'failed', scope: row.scope + ':released:' + row.id, errorCode: 'AI_UNSENT_RESERVATION_EXPIRED',
      usage: { ...row.usage, lifecycle: { ...phase, phase: 'released', proof: 'local_before_fetch', endedAt: now.toISOString() } },
    } });
  }
}
module.exports = { lifecycle, releaseStaleUnsent };
