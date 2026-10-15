const fs=require('node:fs');
const path=require('node:path');
// Static, additive SQL only. Never schema push/reset against a live database.
const sql=fs.readFileSync(path.join(__dirname,'../../db/add-site-content.sql'),'utf8');
async function ready(prisma) {
  // Read the actual Prisma model/columns, not only process liveness. A missing
  // singleton is valid: the authenticated editor creates it on first use.
  await prisma.siteContent.findUnique({where:{id:'main'}});
}
async function prepare(prisma) {
  await prisma.$executeRawUnsafe(sql);
  await ready(prisma);
}
module.exports={prepare,ready};
