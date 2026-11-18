'use strict';

const { createHash } = require('node:crypto');
const path = require('node:path');
const repo = path.resolve(__dirname, '../../..');

function assertTestEnvironment(env = process.env) {
  const port = Number(env.PORT);
  let db;
  try { db = new URL(env.DATABASE_URL); } catch { /* Reject without exposing the URL. */ }
  if (env.MOTIF_SMART_PANEL !== 'test' || env.NODE_ENV === 'production' ||
    db?.protocol !== 'postgresql:' || db?.hostname !== '127.0.0.1' || !db.port ||
    db.username !== 'motif_smart_test' || !/^\/motif_smart_test(?:_[a-z0-9_]+)?$/.test(db.pathname) ||
    (db.search && db.search !== '?pgbouncer=true&connection_limit=1') || db.hash || env.DIRECT_URL || env.SHADOW_DATABASE_URL ||
    !Number.isInteger(port) || port < 1024 || port > 65535 ||
    env.ADMIN_ORIGIN !== 'http://127.0.0.1:' + port ||
    !/^smart-test-[a-f0-9]{32,}$/.test(env.ADMIN_TOKEN || '') ||
    Object.keys(env).some(key => /^(LIARA_|S3_|AWS_)/.test(key) && env[key])) {
    throw new Error('Smart panel requires an isolated loopback database, test login, and no cloud credentials.');
  }
  const target = createHash('sha256').update(db.host + db.pathname).digest('hex').slice(0, 16);
  return { port, database: db.pathname.slice(1), storageDir: path.join(repo, '.smart-panel-test', target) };
}
async function verifyTestDatabase(prisma, target) {
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS "name", current_user AS "role"`;
  if (identity?.name !== target.database || identity?.role !== 'motif_smart_test') {
    throw new Error('Connected database identity does not match the isolated test target.');
  }
}
module.exports = { assertTestEnvironment, verifyTestDatabase };
