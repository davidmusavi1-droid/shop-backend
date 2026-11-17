'use strict';

const { displayResearch } = require('./brand-research');
const { fail, uuid } = require('./validation');

const targets = ['identityHistory', 'identityDesign', 'identityUseCases'];
const brandKey = value => (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const stale = () => fail(409, 'C22_TRANSFER_STALE', 'پیشنهاد یا محصول تغییر کرده است. متن را در پنل هوشمند دوباره بررسی کنید.');

function approvedSections(payload) {
  const research = displayResearch(payload);
  const draft = research?.draft;
  if (research?.mode !== 'live' || !research.draftCurrent || draft.status !== 'pending') return {};
  const { finding } = research;
  if ([finding.status, finding.design?.status, finding.style?.status]
    .some(status => ['pending_source_review', 'invalid_source'].includes(status))) return {};
  return Object.fromEntries(targets.flatMap((key, i) =>
    draft.decisions[i] === 'approved' && draft.sections[i]?.trim() &&
      (i !== 0 || research.finding.status === 'manager_verified') ? [[key, draft.sections[i]]] : []));
}

async function checkTransfer(tx, product, data, receipt) {
  if (process.env.MOTIF_SMART_PANEL !== 'store' ||
      !uuid.test(receipt?.id || '') || !Number.isSafeInteger(receipt.version) ||
      !Array.isArray(receipt.keys) || !receipt.keys.length || new Set(receipt.keys).size !== receipt.keys.length ||
      !receipt.keys.every(key => targets.includes(key))) throw stale();
  const [row] = await tx.$queryRaw`
    SELECT "version", "payload" FROM "SmartDossier"
    WHERE "id" = ${receipt.id} AND "productId" = ${product.id} AND "archivedAt" IS NULL FOR SHARE`;
  if (row?.version !== receipt.version || brandKey(row.payload.brand) !== brandKey(data.brand)) throw stale();
  const allowed = approvedSections(row.payload);
  if (receipt.keys.some(key => product[key]?.trim() || !allowed[key] || data[key] !== allowed[key])) throw stale();
}

module.exports = { approvedSections, brandKey, checkTransfer };
