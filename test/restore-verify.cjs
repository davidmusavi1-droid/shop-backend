const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/motif_restore_test', 'Disposable local restore target required');
const prisma = new PrismaClient();
(async () => {
  const customer = await prisma.customer.findUnique({ where: { phone: '09111111111' } });
  assert.equal(customer.fullName, 'Original');
  assert.equal(customer.address, 'Original synthetic address');
  const product = await prisma.product.findFirst({ where: { title: 'Security synthetic fixture' }, include: { variants: true } });
  assert.equal(product.variants[0].stock, 1);
  const orders = await prisma.order.findMany({ where: { customerId: customer.id }, include: { items: true } });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, 'CANCELED');
  assert.equal(orders[0].items[0].variantId, product.variants[0].id);
  assert.equal(orders[0].totalPrice, 100);
  await prisma.siteContent.findUnique({ where: { id: 'main' } });
  // Validate every foreign key even if the current fixture changes later.
  const broken = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "OrderItem" i LEFT JOIN "Order" o ON i."orderId"=o.id LEFT JOIN "Variant" v ON i."variantId"=v.id LEFT JOIN "Product" p ON i."productId"=p.id WHERE o.id IS NULL OR v.id IS NULL OR p.id IS NULL`;
  assert.equal(broken[0].n, 0);
  console.log('PASS: synthetic backup restored with customer, stock, order, amount and foreign-key integrity');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
