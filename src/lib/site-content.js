const prisma = require('./prisma');
const {defaults,validate,validateDraft} = require('../../public/site-content');
const clone = value => JSON.parse(JSON.stringify(value));
const conflict = () => Object.assign(new Error('تنظیمات در نشست دیگری تغییر کرده؛ دوباره بارگذاری کنید'),{statusCode:409});
async function published() {
  try { const row=await prisma.siteContent.findUnique({where:{id:'main'}});return row?.published || clone(defaults); }
  catch(error) { if(error.code==='P2021'||error.code==='P2022')return clone(defaults);throw error; }
}
async function getAdmin() {
  return prisma.siteContent.upsert({where:{id:'main'},update:{},create:{id:'main',draft:clone(defaults),published:clone(defaults),history:[]}});
}
async function change(action, body) {
  if(!Number.isInteger(body?.version)||body.version<0)throw Object.assign(new Error('نسخهٔ تنظیمات نامعتبر است'),{statusCode:400});
  const draft=action==='draft'?validateDraft(body.content):null;
  return prisma.$transaction(async tx=>{
    const row=await tx.siteContent.findUnique({where:{id:'main'}});
    if(!row||row.version!==body.version)throw conflict();
    let data={version:{increment:1}};
    if(action==='draft')data.draft=draft;
    else if(action==='publish') {
      const content=validate(row.draft);
      data.published=content;
      data.history=[{id:require('node:crypto').randomUUID(),at:new Date().toISOString(),content:row.published},...(row.history||[])].slice(0,10);
    } else {
      const revision=(row.history||[]).find(r=>r.id===body.revisionId);
      if(!revision)throw Object.assign(new Error('نسخه پیدا نشد'),{statusCode:404});
      data.draft=validate(revision.content);
    }
    const updated=await tx.siteContent.updateMany({where:{id:'main',version:body.version},data});
    if(updated.count!==1)throw conflict();
    return tx.siteContent.findUnique({where:{id:'main'}});
  },{isolationLevel:'Serializable'});
}
module.exports={published,getAdmin,change};
