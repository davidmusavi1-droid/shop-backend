const fs = require('node:fs');
const path = require('node:path');
const statements = fs.readFileSync(path.join(__dirname, '../../db/add-product-code.sql'), 'utf8').split(';').map(s => s.trim()).filter(Boolean);
async function prepare(prisma) {
  for (const sql of statements) await prisma.$executeRawUnsafe(sql);
  await prisma.product.findFirst({ select: { productCode: true } });
}
module.exports = { prepare };
