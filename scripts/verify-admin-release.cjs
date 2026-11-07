// Release gate: real HTTP routes and database, isolated from all store records.
// Never runs during normal startup unless explicitly selected by a release hook.
const assert = require("node:assert/strict");
const { randomBytes, createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const sharp = require("sharp");
const root = path.resolve(__dirname, "..");
const original = process.env.DATABASE_URL;
if (!original || !process.env.ADMIN_TOKEN)
  throw Error("Release check requires existing environment configuration");
const schema = "motif_admin_smoke_" + randomBytes(8).toString("hex");
assert(/^motif_admin_smoke_[a-f0-9]{16}$/.test(schema));
const testUrl = new URL(original);
testUrl.searchParams.set("schema", schema);
const production = new PrismaClient({ datasources: { db: { url: original } } });
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const snapshot = () =>
  production.product.findMany({
    orderBy: { id: "asc" },
    include: { variants: { orderBy: { id: "asc" } } },
  });
let stage = "snapshot",
  testClient,
  server,
  created = false;
(async () => {
  const before = await snapshot();
  stage = "isolated-schema";
  await production.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
  created = true;
  process.env.DATABASE_URL = testUrl.toString();
  const migration = spawnSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "db",
      "push",
      "--skip-generate",
      "--schema",
      path.join(root, "prisma/schema.prisma"),
    ],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      encoding: "utf8",
      timeout: 60000,
    },
  );
  assert.equal(migration.status, 0, "Cannot initialize isolated schema");
  testClient = require("../src/lib/prisma");
  const selected = await testClient.$queryRawUnsafe(
    "SELECT current_schema() AS name",
  );
  assert.equal(selected[0].name, schema);
  const app = express();
  app.use(express.json());
  app.use("/api/products", require("../src/routes/products"));
  app.use("/api/uploads", require("../src/routes/uploads"));
  app.use((err, req, res, next) =>
    res.status(err.statusCode || 500).json({ error: "release-test-error" }),
  );
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  async function api(method, url, body, auth = true) {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { "X-Admin-Token": process.env.ADMIN_TOKEN } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    return { status: r.status, data: await r.json() };
  }
  stage = "authentication";
  assert.equal(
    (await api("GET", "/api/products/admin/list", null, false)).status,
    401,
  );
  assert.equal((await api("GET", "/api/products/admin/list")).status, 200);
  let images = ["https://release-test.invalid/front.webp"];
  const uploadUrls = [];
  const storage = !process.argv.includes("--skip-storage");
  if (storage) {
    stage = "real-storage";
    images = [];
    for (const format of ["png", "jpeg"]) {
      const buffer = await sharp({
        create: { width: 256, height: 256, channels: 3, background: "#9cb6a4" },
      })
        .toFormat(format)
        .toBuffer();
      const form = new FormData();
      form.append(
        "image",
        new Blob([buffer], { type: "image/" + format }),
        "release-test." + format,
      );
      const r = await fetch(base + "/api/uploads/images", {
        method: "POST",
        headers: { "X-Admin-Token": process.env.ADMIN_TOKEN },
        body: form,
        signal: AbortSignal.timeout(90000),
      });
      assert.equal(r.status, 201);
      const data = await r.json();
      assert.match(data.url, /^https:\/\//);
      images.push(data.url);
      uploadUrls.push(data.url);
      const publicImage = await fetch(data.url, {
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(publicImage.status, 200);
      const bytes = Buffer.from(await publicImage.arrayBuffer());
      assert(bytes.length <= 3000000);
      assert.equal((await sharp(bytes).metadata()).format, "webp");
    }
  }
  stage = "save-and-edit";
  const body = {
    title: "",
    productCode: "MOTIF-SMOKE-" + randomBytes(6).toString("hex").toUpperCase(),
    basePrice: 0,
    inventoryMode: "SINGLE",
    isActive: false,
    images,
    variants: [
      {
        size: null,
        color: null,
        sku: "SMOKE-" + randomBytes(6).toString("hex"),
        stock: 1,
        priceDelta: 0,
      },
    ],
  };
  let result = await api("POST", "/api/products", body);
  assert.equal(result.status, 201);
  let p = result.data;
  assert.equal(p.isActive, false);
  assert.equal(p.title, "");
  assert.equal((await api("GET", "/api/products")).data.length, 0);
  const edit = (p) => ({
    ...p,
    variants: p.variants.map((v) => ({ ...v, expectedStock: v.stock })),
  });
  result = await api("PATCH", "/api/products/" + p.id, {
    ...edit(p),
    title: "Isolated release fixture",
    brand: "MOTIF TEST",
    productType: "کاپشن",
    mainCategories: ["کاپشن", "بادگیر"],
    fabrics: ["شمعی"],
    qualityGrade: "B",
    basePrice: 2350000,
    variants: p.variants.map((v) => ({
      ...v,
      expectedStock: v.stock,
      color: "سبز",
      chestWidthCm: 59,
      lengthCm: 69,
      sleeveFromNeckCm: 73,
    })),
  });
  assert.equal(result.status, 200);
  p = result.data;
  const variant = p.variants[0].id;
  result = await api("PATCH", "/api/products/" + p.id, {
    ...edit(p),
    basePrice: 2450000,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.qualityGrade, "B");
  assert.equal(result.data.variants[0].id, variant);
  assert.deepEqual(result.data.images, images);
  p = result.data;
  stage = "publication";
  result = await api("PATCH", "/api/products/" + p.id, {
    ...edit(p),
    isActive: true,
    publicationIntent: true,
    defect: "Test defect",
  });
  assert.equal(result.status, 400);
  assert.equal((await api("GET", "/api/products")).data.length, 0);
  result = await api("PATCH", "/api/products/" + p.id, {
    ...edit(p),
    isActive: true,
    publicationIntent: true,
  });
  assert.equal(result.status, 200);
  assert.equal((await api("GET", "/api/products")).data.length, 1);
  stage = "production-preservation";
  const after = await snapshot();
  assert.equal(
    hash(after),
    hash(before),
    "Store changed while isolated check ran",
  );
  console.log(
    "MOTIF_ADMIN_RELEASE_CHECK_PASS",
    JSON.stringify({
      storeProducts: before.length,
      storeHash: hash(after),
      isolatedAuthentication: true,
      isolatedSaveAndEdit: true,
      isolatedPublish: true,
      realJpgAndPngUploads: storage,
      storeUnchanged: true,
    }),
  );
  // Test image objects are tiny, unreferenced by the store, and intentionally retained.
})()
  .catch((error) => {
    console.error(
      "MOTIF_ADMIN_RELEASE_CHECK_FAILED",
      stage,
      error.code || error.name || "Error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (testClient) await testClient.$disconnect();
    process.env.DATABASE_URL = original;
    if (created)
      try {
        await production.$executeRawUnsafe(
          'DROP SCHEMA "' + schema + '" CASCADE',
        );
        console.log("MOTIF_ADMIN_TEST_SCHEMA_REMOVED");
      } catch {
        console.error("MOTIF_ADMIN_TEST_SCHEMA_CLEANUP_FAILED");
        process.exitCode = 1;
      }
    await production.$disconnect();
  });
