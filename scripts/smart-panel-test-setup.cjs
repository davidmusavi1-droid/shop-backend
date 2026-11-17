'use strict';

const { assertTestEnvironment, verifyTestDatabase } = require('../src/lib/smart-panel/test-environment');
const target = assertTestEnvironment();
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const prisma = path.resolve(__dirname, '../node_modules/prisma/build/index.js');
const commands = [
  ['migrate', 'deploy'],
  ['db', 'execute', '--file', 'db/add-site-content.sql', '--schema', 'prisma/schema.prisma'],
  ['db', 'execute', '--file', 'db/smart-panel/test-schema.sql', '--schema', 'prisma/schema.prisma'],
];
async function main() {
  const client = new (require('@prisma/client').PrismaClient)();
  try { await verifyTestDatabase(client, target); }
  finally { await client.$disconnect(); }
  for (const args of commands) {
    // Prisma CLI output can include connection details on failure.
    const result = spawnSync(process.execPath, [prisma, ...args], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
    if (result.status !== 0) {
      console.error('Isolated setup failed at Prisma ' + args.slice(0, 2).join(' '));
      process.exitCode = 1;
      return;
    }
  }
  console.log('Isolated PostgreSQL schema is ready.');
}
main().catch(() => {
  console.error('Could not verify the isolated database identity.');
  process.exitCode = 1;
});
