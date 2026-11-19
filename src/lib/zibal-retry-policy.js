const TTL = 30 * 60 * 1000;
const WINDOW = 90 * 60 * 1000;
const MAX_ATTEMPTS = 3;

// Status 11 describes a switch error, not a documented guarantee against late
// settlement. Never infer that guarantee from the code alone.
function evidence(response, amount, issuedAt, now, status11Final = false) {
  if (response?.result !== 100 || response.amount !== amount) return 'UNKNOWN';
  if ([1, 2].includes(response.status) || response.paidAt || response.verifiedAt || response.refNumber) {
    return response.status === 1 ? 'PAID' : 'REVIEW';
  }
  const elapsed = issuedAt && now.getTime() - issuedAt.getTime() >= TTL;
  if (response.status === -1) return elapsed ? 'UNPAID' : 'OPEN';
  if (response.status === 11 && elapsed && status11Final &&
      response.paidAt === null && response.verifiedAt === null) return 'UNPAID';
  return 'UNKNOWN';
}

function auditResponse(value) {
  const safe = {};
  for (const key of ['result', 'status', 'amount', 'paidAt', 'verifiedAt', 'createdAt', 'refNumber', 'orderId']) {
    const v = value?.[key];
    if (v === null || typeof v === 'number' || typeof v === 'string' && v.length <= 160) safe[key] = v;
  }
  return safe;
}

module.exports = { TTL, WINDOW, MAX_ATTEMPTS, evidence, auditResponse };
