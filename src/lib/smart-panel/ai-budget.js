'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const { fail } = require('./validation');
const utcDay = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
function budgetConfig(env) {
  return { estimates: { analyze: positive(env.MOTIF_C22_VISION_ESTIMATE_USD), research: positive(env.MOTIF_C22_RESEARCH_ESTIMATE_USD) },
    dailyBudgetUsd: positive(env.MOTIF_C22_DAILY_ESTIMATE_BUDGET_USD) };
}
function summarize(runs, config) {
  let reservedUsd = 0, reportedUsd = 0, reportedToman = 0, unknownCosts = 0;
  const counts = { analyze: 0, research: 0 };
  for (const run of runs) {
    counts[run.operation] = (counts[run.operation] || 0) + 1;
    const usage = run.usage || {};
    const known = typeof usage.costUsd === 'number' && usage.costUsd >= 0;
    const estimate = usage.estimateUsd ?? config?.estimates?.[run.operation];
    reservedUsd += Math.max(known ? usage.costUsd : 0, estimate || 0);
    if (known) reportedUsd += usage.costUsd;
    if (typeof usage.costToman === 'number') reportedToman += usage.costToman;
    if (!known && typeof usage.costToman !== 'number') unknownCosts++;
  }
  return { day: utcDay().toISOString().slice(0, 10), used: runs.length, counts, reservedUsd,
    reportedUsd, reportedToman, unknownCosts, dailyLimit: config?.dailyLimit || 0,
    remaining: Math.max(0, (config?.dailyLimit || 0) - runs.length),
    dailyBudgetUsd: config?.dailyBudgetUsd || null };
}
const sign = (text, key) => createHmac('sha256', key).update(text).digest('base64url');
function quote(row, operation, config, usage, now = Date.now()) {
  const estimateUsd = config?.estimates?.[operation];
  if (!config?.operations?.includes(operation)) throw fail(503, 'AI_UNAVAILABLE', 'این عملیات اکنون خاموش است.');
  if (!estimateUsd || !config.dailyBudgetUsd) throw fail(503, 'AI_BUDGET_REQUIRED', 'ابتدا برآورد هر درخواست و بودجهٔ روزانه در تنظیمات امن تعیین شود.');
  if (usage.remaining < 1 || usage.reservedUsd + estimateUsd > config.dailyBudgetUsd + 1e-9) {
    throw fail(429, 'AI_DAILY_LIMIT', 'سقف تعداد درخواست یا بودجهٔ برآوردی امروز پر شده است.');
  }
  const data = { dossierId: row.id, version: row.version, operation, estimateUsd,
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
    !config.dailyBudgetUsd || !config.estimates?.[operation] || data.estimateUsd !== config.estimates[operation]) throw invalid();
  return data;
}
module.exports = { budgetConfig, summarize, quote, verifyQuote, utcDay };
