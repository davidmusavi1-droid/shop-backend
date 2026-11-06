// Run in a trusted Liara-connected environment. Never commit the output.
const fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
async function main(){
 if(!process.env.DATABASE_URL||!process.env.BACKUP_DIR)throw Error('Set DATABASE_URL and an absolute BACKUP_DIR outside the repository');
 const root=path.resolve(process.env.BACKUP_DIR),repo=path.resolve(__dirname,'..');
 if(!path.isAbsolute(process.env.BACKUP_DIR)||root===repo||root.startsWith(repo+path.sep))throw Error('BACKUP_DIR must be outside the repository');
 await fs.mkdir(root,{recursive:true,mode:0o700});
 const dir=path.join(root,'motif-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(dir,{mode:0o700});
 const u=new URL(process.env.DATABASE_URL),env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1))};
 if(u.searchParams.has('sslmode'))env.PGSSLMODE=u.searchParams.get('sslmode');
 const prisma=new PrismaClient();
 try{
 const result=spawnSync('pg_dump',['--format=custom','--file',path.join(dir,'database.dump')],{env,stdio:['ignore','pipe','pipe']});
 if(result.error||result.status!==0)throw Error('pg_dump failed; verify PostgreSQL tools, server version and connection. No complete backup created.');
 const listing=spawnSync('pg_restore',['--list',path.join(dir,'database.dump')],{stdio:['ignore','pipe','pipe']});if(listing.status!==0)throw Error('Backup archive cannot be read');
 // Raw reads support the pre-migration schema as well as the new schema.
 const products=await prisma.$queryRawUnsafe('SELECT * FROM "Product" ORDER BY "id"');
 const variants=await prisma.$queryRawUnsafe('SELECT * FROM "Variant" ORDER BY "id"');
 await fs.writeFile(path.join(dir,'products.json'),JSON.stringify({products,variants},null,2),{mode:0o600});
 const urls=[...new Set([...products.flatMap(p=>[...(p.images||[]),...(p.defectImages||[])]),...variants.flatMap(v=>[...(v.itemImages||[]),...(v.itemDefectImages||[])])])];
 await fs.mkdir(path.join(dir,'images'),{mode:0o700});const media=[];
 for(const [i,url]of urls.entries()){
 if(new URL(url).protocol!=='https:')throw Error('Non-HTTPS image reference; inspect manually');
 const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Image download failed at index '+i);
 const bytes=Buffer.from(await response.arrayBuffer()),filename='images/'+String(i+1).padStart(3,'0')+'.bin';await fs.writeFile(path.join(dir,filename),bytes,{mode:0o600});media.push({url,file:filename,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const dump=await fs.readFile(path.join(dir,'database.dump'));
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({createdAt:new Date(),productCount:products.length,variantCount:variants.length,databaseSha256:createHash('sha256').update(dump).digest('hex'),media,restoreTested:false},null,2),{mode:0o600});
 console.log('Backup complete:',dir,'Products:',products.length,'Images:',media.length,'Restore into an isolated database before migration.');
 }finally{await prisma.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
