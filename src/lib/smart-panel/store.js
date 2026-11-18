'use strict';

const { displayResearch } = require('./brand-research');
const { fabricsOf } = require('../../../public/catalog');
const { builtIn, keyFor } = require('../fabric-options');
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

function reviewedFabric(product, payload) {
  if (fabricsOf(product).length || product.mainFabric || product.complementaryFabrics?.length ||
      product.fabricNote?.trim() || product.fabricBasis !== 'UNKNOWN') return null;
  const { fabric, sources, analysis, gallery } = payload;
  if (fabric?.length !== 1 || sources?.fabric !== 'label') return null;
  const value = fabric[0].trim();
  const evidence = analysis?.find(item => item.key === 'fabric' && item.kind === 'label' &&
    item.value.trim() === value && item.evidence?.trim() && gallery.some(image => image.id === item.imageId));
  if (!evidence) return null;
  const label = builtIn.get(keyFor(value.replace(/^(?:100|۱۰۰|١٠٠)\s*[%٪]\s*/, '')));
  return ['سایر', 'ترکیبی', 'کورتکس (اصطلاح رایج بازار)'].includes(label) ? null : label || null;
}

module.exports = { reviewedFabric, approvedSections, brandKey, checkTransfer };
