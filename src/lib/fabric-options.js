const catalog = require('../../public/catalog');

const labelFor = value => typeof value === 'string'
  ? value.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu, ' ').replace(/\s+/gu, ' ').trim()
  : '';
const keyFor = value => labelFor(value).replace(/[\s\p{P}]+/gu, '').toLowerCase();
const builtIn = new Map(catalog.fabrics.map(label => [keyFor(label), label]));

function isClaim(value) {
  const key = keyFor(value);
  return !builtIn.has(key) && /goretex|گورتکس|کورتکس|گورتطکس|گورطکس|ضدآب|ضداب|ضدباد|waterproof|windproof|کوهنوردی/u.test(key);
}

async function options(prisma) {
  const custom = await prisma.fabricOption.findMany({ orderBy: { label: 'asc' } });
  return [...catalog.fabrics, ...custom.map(({ label }) => label)];
}

module.exports = { labelFor, keyFor, builtIn, isClaim, options };
