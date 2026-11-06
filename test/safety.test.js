const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(name, prisma = {}) {
  const routes = {};
  const admin = () => {};
  const router = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, (url, ...handlers) => { routes[method + ' ' + url] = handlers; }]));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes', name + '.js'), 'utf8'), {
    require: name => name === 'express' ? { Router: () => router } : name.includes('requireAdmin') ? admin : prisma,
    module: { exports: {} },
  });
  return { routes, admin };
}
async function call(handlers, body, params = {}) {
  let code = 200, data, error;
  await handlers.at(-1)({ body, params, query: { Authority: 'fake', Status: 'OK' } }, {
    status(n) { code = n; return this; }, json(d) { data = d; return this; },
  }, e => { error = e; });
  return { code: error?.statusCode || code, data, error };
}
const valid = { customer: { fullName: 'Test', phone: '09000000000' }, items: [{ variantId: 'v1', quantity: 1 }] };
test('reject invalid quantities and bodies before database use', async () => {
  const { routes } = load('orders');
  for (const body of [null, {}, { ...valid, customer: null }, ...[0, -1, 1.5, '1'].map(quantity => ({ ...valid, items: [{ variantId: 'v1', quantity }] }))]) {
    assert.equal((await call(routes['post /'], body)).code, 400);
  }
});
test('order details and changes require administrator middleware', () => {
  const { routes, admin } = load('orders');
  assert.equal(routes['get /:id'][0], admin);
  assert.equal(routes['patch /:id/status'][0], admin);
});
test('stock reservation is conditional and conflicts reject the order', async () => {
  let created = false, where;
  const tx = {
    customer: { upsert: async () => ({ id: 'c1' }) },
    variant: {
      findUnique: async () => ({ id: 'v1', productId: 'p1', priceDelta: 0, product: { isActive: true, basePrice: 100 } }),
      updateMany: async args => { where = args.where; return { count: 0 }; },
    }, order: { create: async () => { created = true; } },
  };
  const { routes } = load('orders', { $transaction: fn => fn(tx) });
  assert.equal((await call(routes['post /'], valid)).code, 409);
  assert.equal(where.stock.gte, 1);
  assert.equal(where.product.isActive, true);
  assert.equal(created, false);
});
test('cancellation returns reserved stock once, repeated cancellation is harmless', async () => {
  const current = { id: 'o1', status: 'PENDING', items: [{ variantId: 'v1', quantity: 2 }] };
  let restored = 0;
  const tx = { order: {
    findUnique: async () => current,
    updateMany: async ({ data }) => { current.status = data.status; return { count: 1 }; },
  }, variant: { update: async ({ data }) => { restored += data.stock.increment; } } };
  const { routes } = load('orders', { $transaction: fn => fn(tx) });
  for (let i = 0; i < 2; i++) assert.equal((await call(routes['patch /:id/status'], { status: 'CANCELED' }, { id: 'o1' })).code, 200);
  assert.equal(restored, 2);
  assert.equal((await call(routes['patch /:id/status'], { status: 'PAID' }, { id: 'o1' })).code, 400);
});
test('fake gateway requests and callbacks fail closed without database writes', async () => {
  const { routes } = load('payment');
  for (const key of ['post /request/:orderId', 'get /verify']) {
    assert.equal((await call(routes[key], {}, { orderId: 'o1' })).code, 503);
  }
});
test('blank measurements remain null and public listing filters stock', async () => {
  let created, query;
  const { routes } = load('products', { product: {
    create: async args => { created = args.data; return args.data; },
    findMany: async args => { query = args; return []; },
  } });
  await call(routes['post /'], { title: 'test', basePrice: 100, variants: [{ sku: 'test', size: 'L', color: 'black', chestWidthCm: null, lengthCm: 65 }] });
  assert.equal(created.variants.create[0].chestWidthCm, null);
  assert.equal(created.variants.create[0].lengthCm, 65);
  await call(routes['get /']);
  assert.equal(query.where.variants.some.stock.gt, 0);
});
const productBody = { title: 'test', basePrice: 100, inventoryMode: 'MULTI', variants: [{ sku: 'one', size: 'L', color: 'black', stock: 1 }] };
test('all product management endpoints require admin', () => {
  const { routes, admin } = load('products');
  for (const key of ['get /admin/list', 'post /', 'patch /:id']) assert.equal(routes[key][0], admin);
});
test('invalid and duplicate variants never reach database', async () => {
  const { routes } = load('products');
  for (const body of [null, {...productBody, basePrice: -1}, {...productBody, variants: []}, {...productBody, variants: [productBody.variants[0], productBody.variants[0]]}, {...productBody, inventoryMode:'SINGLE', variants:[{...productBody.variants[0],stock:2}]}, {...productBody, images:['javascript:alert(1)']}]) {
    assert.equal((await call(routes['post /'],body)).code,400);
  }
});
test('editing preserves variant IDs and rejects stale stock or removed variants', async () => {
  const updatedAt = new Date('2026-10-13T00:00:00Z');
  const current = { id:'p1', updatedAt, variants:[{id:'v1'}] };
  let updated=0, allowStock=true;
  const tx={product:{findUnique:async()=>current,updateMany:async()=>({count:1})},variant:{updateMany:async args=>{assert.equal(args.where.id,'v1');assert.equal(args.where.stock,1);updated++;return {count:allowStock?1:0};}}};
  const {routes}=load('products',{$transaction:fn=>fn(tx)});
  const body={...productBody,updatedAt:updatedAt.toISOString(),variants:[{...productBody.variants[0],id:'v1',expectedStock:1,stock:3}]};
  assert.equal((await call(routes['patch /:id'],body,{id:'p1'})).code,200);
  assert.equal(updated,1);
  allowStock=false;
  assert.equal((await call(routes['patch /:id'],body,{id:'p1'})).code,409);
  assert.equal((await call(routes['patch /:id'],{...body,updatedAt:'old'},{id:'p1'})).code,409);
  assert.equal((await call(routes['patch /:id'],{...body,variants:productBody.variants},{id:'p1'})).code,400);
});
test('admin listing includes sold-out and inactive products',async()=>{
  let query;
  const {routes}=load('products',{product:{findMany:async args=>{query=args;return [];}}});
  await call(routes['get /admin/list']);assert.equal(query.where,undefined);
});
test('flat waistband is validated separately and never inferred from legacy waist', async () => {
  let data;
  const {routes}=load('products',{product:{create:async args=>{data=args.data;return data;}}});
  const body={...productBody,variants:[{...productBody.variants[0],waistCm:84,waistWidthCm:42}]};
  assert.equal((await call(routes['post /'],body)).code,201);
  assert.equal(data.variants.create[0].waistWidthCm,42);
  assert.equal(data.variants.create[0].waistCm,84);
  for(const n of [0,-1,'42',Infinity])assert.equal((await call(routes['post /'],{...body,variants:[{...body.variants[0],waistWidthCm:n}]})).code,400);
  await call(routes['post /'],productBody);
  assert.equal(data.variants.create[0].waistWidthCm,undefined);
});


test('product codes normalize, reject invalid input, and report uniqueness conflicts', async () => {
  let data;
  const {routes}=load('products',{product:{create:async args=>{data=args.data;return data;}}});
  assert.equal((await call(routes['post /'],{...productBody,productCode:' motif-004 '})).code,201);
  assert.equal(data.productCode,'MOTIF-004');
  for(const productCode of ['', 4, 'MOTIF 004', 'x'.repeat(65)])assert.equal((await call(routes['post /'],{...productBody,productCode})).code,400);
  const conflict=load('products',{product:{create:async()=>{throw {code:'P2002',meta:{target:['productCode']}};}}});
  const result=await call(conflict.routes['post /'],{...productBody,productCode:'MOTIF-004'});
  assert.equal(result.code,409);assert.match(result.error.message,/کد یکتای محصول/);
});
test('single items accept unknown label size while multi-size items still require it',async()=>{
  let data;
  const {routes}=load('products',{product:{create:async args=>{data=args.data;return data;}}});
  const body={...productBody,inventoryMode:'SINGLE',variants:[{...productBody.variants[0],size:null}]};
  assert.equal((await call(routes['post /'],body)).code,201);
  assert.equal(data.variants.create[0].size,'نامشخص');
  assert.equal((await call(routes['post /'],{...body,inventoryMode:'MULTI'})).code,400);
  assert.equal((await call(routes['post /'],{...body,variants:[]})).code,400);
});
test('legacy editors preserve product codes when omitted from updates',async()=>{
  let changed;
  const updatedAt=new Date('2026-11-06T00:00:00Z');
  const current={id:'p1',productCode:'MOTIF-004',updatedAt,variants:[{id:'v1'}]};
  const tx={product:{findUnique:async()=>current,updateMany:async({data})=>{changed=data;return {count:1};}},variant:{updateMany:async()=>({count:1})}};
  const {routes}=load('products',{$transaction:fn=>fn(tx)});
  assert.equal((await call(routes['patch /:id'],{...productBody,updatedAt:updatedAt.toISOString(),variants:[{...productBody.variants[0],id:'v1',expectedStock:1}]},{id:'p1'})).code,200);
  assert.equal(Object.hasOwn(changed,'productCode'),false);
  assert.equal((await call(routes['patch /:id'],{...productBody,productCode:null,updatedAt:updatedAt.toISOString(),variants:[{...productBody.variants[0],id:'v1',expectedStock:1}]},{id:'p1'})).code,200);
  assert.equal(Object.hasOwn(changed,'productCode'),false);
});
