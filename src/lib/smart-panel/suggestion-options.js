'use strict';

const catalog = require('../../../public/catalog');
const { keyFor } = require('../fabric-options');
// Exact aliases only. Technical claims and ambiguous blends never become facts.
const types = new Map([
  ['jacket', 'کاپشن'], ['coat', 'کاپشن'], ['windbreaker', 'بادگیر'],
  ['wind jacket', 'بادگیر'], ['trousers', 'شلوار'], ['pants', 'شلوار'],
  ['sweatshirt', 'سویشرت'], ['hoodie', 'سویشرت'],
]);
const fabrics = new Map([
  ['polyester', 'پلی‌استر'], ['polyamide', 'پلی‌آمید'], ['nylon', 'نایلون'],
  ['cotton', 'پنبه'], ['linen', 'کتان'], ['denim', 'جین'], ['fleece', 'فلیس'],
]);
const normal = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
function mapType(value) {
  const input = normal(value);
  return catalog.productTypes.find(label => normal(label) === input) || types.get(input) || null;
}
function mapFabric(value) {
  const input = normal(value).replace(/^(?:100|۱۰۰|١٠٠)\s*[%٪]\s*/, '');
  const label = catalog.fabrics.find(item => keyFor(item) === keyFor(input)) || fabrics.get(input);
  return label && catalog.fabrics.includes(label) && !['سایر', 'ترکیبی', 'کورتکس (اصطلاح رایج بازار)'].includes(label) ? label : null;
}
module.exports = { mapType, mapFabric };
