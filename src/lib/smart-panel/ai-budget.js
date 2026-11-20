'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const { fail } = require('./validation');
const utcDay = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
function budgetConfig(env) {
  return { estimates: { analyze: positive(env.MOTIF_C22_VISION_ESTIMATE_USD), research: positive(env.MOTIF_C22_RESEARCH_ESTIMATE_USD) },
    dailyBudgetUsd: positive(env.MOTIF_C22_DAILY_ESTIMATE_BUDGET_USD),
    estimatesToman: { analyze: positive(env.MOTIF_C22_VISION_ESTIMATE_TOMAN), research: positive(env.MOTIF_C22_RESEARCH_ESTIMATE_TOMAN) },
    dailyBudgetToman: Math.min(positive(env.MOTIF_C22_DAILY_BUDGET_TOMAN) || 40_000, 40_000) };
}
function summarize(runs, config) {
  let reservedUsd = 0, reservedToman = 0, reportedUsd = 0, reportedToman = 0, unknownCosts = 0, estimatedUsd = 0, estimatedToman = 0;
  const counts = { analyze: 0, research: 0 };
  const reportedCostCounts = { usd: 0, toman: 0 };
  const statusCounts = { started: runs.length, sent: 0, successful: 0, failed: 0, unknown: 0, reserved: 0, released: 0 };
  let used = 0;
  for (const run of runs) {
    const usage = run.usage || {}, phase = usage.lifecycle?.phase;
    const released = run.status === 'released' && phase === 'released' && usage.lifecycle?.proof === 'local_before_fetch';
    if (released) { statusCounts.released++; statusCounts.failed++; continue; }
    used++;
    counts[run.operation] = (counts[run.operation] || 0) + 1;
    if (run.status === 'completed') statusCounts.successful++;
    else if (run.status === 'failed' && phase === 'responded') statusCounts.failed++;
    else if (run.status === 'pending' && phase === 'reserved') statusCounts.reserved++;
    else statusCounts.unknown++; // Legacy failures and abandoned dispatches stay charged conservatively.
    if (usage.lifecycle?.dispatchedAt || run.status === 'completed') statusCounts.sent++;
    const known = typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd) && usage.costUsd >= 0;
    const knownToman = typeof usage.costToman === 'number' && Number.isFinite(usage.costToman) && usage.costToman >= 0;
    const estimate = usage.estimateUsd ?? config?.estimates?.[run.operation];
    const estimateToman = usage.estimateToman ?? config?.estimatesToman?.[run.operation];
    estimatedUsd += estimate || 0; estimatedToman += estimateToman || 0;
    reservedUsd += Math.max(known ? usage.costUsd : 0, estimate || 0);
    reservedToman += Math.max(knownToman ? usage.costToman : 0, estimateToman || 0);
    if (known) { reportedUsd += usage.costUsd; reportedCostCounts.usd++; }
    if (knownToman) { reportedToman += usage.costToman; reportedCostCounts.toman++; }
    if (!known && !knownToman) unknownCosts++;
  }
  return { day: utcDay().toISOString().slice(0, 10), used, counts, statusCounts, reservedUsd, reservedToman,
    reportedUsd, reportedToman, reportedCostCounts, estimatedUsd, estimatedToman, unknownCosts, dailyLimit: config?.dailyLimit || 0,
    remaining: Math.max(0, (config?.dailyLimit || 0) - used),
    dailyBudgetUsd: config?.dailyBudgetUsd || null, dailyBudgetToman: config?.dailyBudgetToman || null };
}
function checkCapacity(usage, config, operation) {
  const usd = config?.estimates?.[operation], toman = config?.estimatesToman?.[operation];
  if (usage.remaining < 1 || (config.dailyBudgetUsd && usage.reservedUsd + (usd || 0) > config.dailyBudgetUsd + 1e-9) ||
      (config.dailyBudgetToman && usage.reservedToman + (toman || 0) > config.dailyBudgetToman)) {
    throw fail(429, 'AI_DAILY_LIMIT', 'سقف تعداد درخواست یا بودجهٔ برآوردی امروز پر شده است.');
  }
}

const sign = (text, key) => createHmac('sha256', key).update(text).digest('base64url');
function quote(row, operation, config, usage, now = Date.now()) {
  const estimateUsd = config?.estimates?.[operation] || null;
  const estimateToman = config?.estimatesToman?.[operation] || null;
  if (!config?.operations?.includes(operation)) throw fail(503, 'AI_UNAVAILABLE', 'این عملیات اکنون خاموش است.');
  if (!(estimateUsd && config.dailyBudgetUsd || estimateToman && config.dailyBudgetToman) ||
      config.dailyBudgetToman && !estimateToman) throw fail(503, 'AI_BUDGET_REQUIRED', 'ابتدا برآورد هر درخواست و بودجهٔ روزانه در تنظیمات امن تعیین شود.');
  checkCapacity(usage, config, operation);
  const data = { dossierId: row.id, version: row.version, operation, estimateUsd, estimateToman,
    day: usage.day, expires: now + 300_000 };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  return { ...data, requests: 1, usage, token: encoded + '.' + sign(encoded, config.key) };
}
function verifyQuote(token, row, operation, config, now = Date.now()) {
  const invalid = () => fail(409, 'AI_QUOTE_REQUIRED', 'پیش‌نمایش مصرف تغییر کرده یا منقضی شده است؛ هزینه را دوباره بررسی و تأیید کنید.');
  if (typeof token !== 'string' || token.length > 1500) throw invalid();
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(signature || '') || extra || !config?.key) throw invalid();
  const expected = sign(encoded, config.key);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw invalid();
  let data;
  try { data = JSON.parse(Buffer.from(encoded, 'base64url').toString()); } catch { throw invalid(); }
  if (data.dossierId !== row.id || data.version !== row.version || data.operation !== operation ||
    data.day !== utcDay().toISOString().slice(0, 10) || data.expires <= now || data.expires > now + 300_000 ||
    !(config.dailyBudgetUsd && config.estimates?.[operation] || config.dailyBudgetToman && config.estimatesToman?.[operation]) ||
    config.dailyBudgetToman && !config.estimatesToman?.[operation] ||
    data.estimateUsd !== (config.estimates?.[operation] || null) || data.estimateToman !== (config.estimatesToman?.[operation] || null)) throw invalid();
  return data;
}
module.exports = { budgetConfig, summarize, quote, verifyQuote, utcDay, checkCapacity };
