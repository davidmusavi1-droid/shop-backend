// Synthetic data only, never run against Railway or a non-local database.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/motif_test', 'Disposable local motif_test database required');
const prisma = new PrismaClient();
const token = process.env.ADMIN_TOKEN;
assert(token);
const base = 'http://127.0.0.1:4188';
const server = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: '4188' }, stdio: 'inherit' });
const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': token };
async function api(path, method, body, auth = true) {
  const r = await fetch(base + path, { method, headers: auth ? headers : { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function main() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    if (i === 59) throw Error('Startup failed');
    await delay(500);
  }
  const product = await prisma.product.create({ data: {
    title: 'Security synthetic fixture', basePrice: 100, images: [], customerNeeds: [], styles: [],
    variants: { create: { sku: 'security-' + Date.now(), size: 'L', color: 'black', stock: 1, itemImages: [] } },
  }, include: { variants: true } });
  const variantId = product.variants[0].id;
  const body = { customer: { fullName: 'Original', phone: '09111111111', address: 'Original synthetic address' }, items: [{ variantId, quantity: 1 }] };
  await prisma.customer.create({ data: body.customer });
  assert.equal((await api('/api/orders', 'POST', body, false)).status, 401);
  assert.equal((await prisma.variant.findUnique({ where: { id: variantId } })).stock, 1);
  const attempts = await Promise.all(Array.from({ length: 8 }, () => api('/api/orders', 'POST', {
    ...body, customer: { ...body.customer, fullName: 'Replacement', address: 'Replacement' },
  })));
  assert.deepEqual(attempts.map(r => r.status).sort(), [201, 409, 409, 409, 409, 409, 409, 409]);
  const winner = attempts.find(r => r.status === 201).body;
  assert.equal(winner.totalPrice, 100);
  const customer = await prisma.customer.findUnique({ where: { phone: body.customer.phone } });
  assert.equal(customer.fullName, 'Original');
  assert.equal(customer.address, 'Original synthetic address');
  assert.equal((await prisma.variant.findUnique({ where: { id: variantId } })).stock, 0);
  assert.equal(await prisma.orderItem.count({ where: { variantId } }), 1);
  const cancellations = await Promise.all([1, 2].map(() => api('/api/orders/' + winner.id + '/status', 'PATCH', { status: 'CANCELED' })));
  assert(cancellations.every(r => [200, 409].includes(r.status)));
  assert(cancellations.some(r => r.status === 200));
  assert.equal((await api('/api/orders/' + winner.id + '/status', 'PATCH', { status: 'CANCELED' })).status, 200);
  assert.equal((await prisma.variant.findUnique({ where: { id: variantId } })).stock, 1);
  assert.equal((await api('/api/orders/' + winner.id + '/status', 'PATCH', { status: 'PAID' })).status, 400);
  assert.equal((await api('/api/payment/request/' + winner.id, 'POST', {})).status, 503);
  console.log('PASS: real PostgreSQL concurrent reservations/cancellations, no anonymous stock mutation, customer preservation, verified-payment guard');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => {
  await prisma.$disconnect(); server.kill('SIGTERM');
});
