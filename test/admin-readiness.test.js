const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("fs"),
  vm = require("vm");
const readiness = require("../public/admin-readiness");
const complete = {
  title: "کاپشن",
  productCode: "MOTIF-900",
  productType: "کاپشن",
  brand: "MOTIF",
  mainFabric: "شمعی",
  qualityGrade: "B",
  basePrice: 2350000,
  images: ["https://img.test/front"],
  variants: [
    {
      size: "L",
      sku: "M900",
      color: "سبز",
      stock: 1,
      chestWidthCm: 59,
      lengthCm: 69,
      sleeveFromNeckCm: 73,
    },
  ],
};
test("readiness separates existing publication from completeness without altering records", () => {
  const p = { isActive: true, title: "old" };
  const before = JSON.stringify(p);
  assert.equal(readiness.status(p), "published");
  assert(readiness.issues(p).length);
  assert.equal(JSON.stringify(p), before);
  assert.equal(readiness.status({ ...complete, isActive: false }), "ready");
  assert.equal(readiness.status({ isActive: false }), "incomplete");
});
test("pants and upper-body readiness uses real fields and matching defect media", () => {
  assert.equal(readiness.issues(complete).length, 0);
  assert(
    readiness
      .issues({
        ...complete,
        variants: [{ ...complete.variants[0], sleeveFromNeckCm: null }],
      })
      .some((i) => i.key === "sleeveFromNeckCm"),
  );
  assert(
    readiness
      .issues({ ...complete, productType: "شلوار" })
      .some((i) => i.key === "waistCm"),
  );
  assert(
    readiness
      .issues({ ...complete, defect: "hole" })
      .some((i) => i.key === "defectImages"),
  );
  assert(
    readiness
      .issues({
        ...complete,
        variants: [{ ...complete.variants[0], itemDefect: "hole" }],
        defectImages: ["https://img.test/other"],
      })
      .some((i) => i.key === "itemDefectImages"),
  );
});
test("server rejects explicit incomplete publication and incomplete draft activation", async () => {
  const routes = {};
  let writes = 0;
  const current = {
    ...complete,
    isActive: false,
    updatedAt: new Date(),
    id: "p",
    variants: [{ ...complete.variants[0], id: "v" }],
  };
  const tx = {
    product: {
      findUnique: async () => current,
      updateMany: async () => {
        writes++;
        return { count: 1 };
      },
    },
    variant: { updateMany: async () => ({ count: 1 }) },
  };
  const prisma = {
    product: {
      create: async () => {
        writes++;
        return complete;
      },
    },
    $transaction: (fn) => fn(tx),
  };
  const router = Object.fromEntries(
    ["get", "post", "patch"].map((m) => [
      m,
      (p, ...handlers) => (routes[m + " " + p] = handlers.at(-1)),
    ]),
  );
  vm.runInNewContext(fs.readFileSync("src/routes/products.js", "utf8"), {
    module: { exports: {} },
    require: (n) =>
      n === "express"
        ? { Router: () => router }
        : n.includes("admin-readiness")
          ? readiness
          : n.includes("requireAdmin")
            ? () => {}
            : prisma,
  });
  async function call(key, body) {
    let err;
    await routes[key](
      { body, params: { id: "p" } },
      {
        status() {
          return this;
        },
        json() {},
      },
      (e) => (err = e),
    );
    return err;
  }
  const incomplete = {
    ...complete,
    brand: null,
    isActive: true,
    publicationIntent: true,
  };
  assert.equal((await call("post /", incomplete)).statusCode, 400);
  assert.equal(
    (
      await call("patch /:id", {
        ...incomplete,
        publicationIntent: undefined,
        updatedAt: current.updatedAt.toISOString(),
        variants: [{ ...current.variants[0], expectedStock: 1 }],
      })
    ).statusCode,
    400,
  );
  assert.equal(writes, 0);
  assert.equal(
    await call("post /", {
      ...complete,
      isActive: true,
      publicationIntent: true,
    }),
    undefined,
  );
  assert.equal(writes, 1);
});

test("server stores a deliberately incomplete draft without inventing title, color or grade", async () => {
  const routes = {};
  let saved;
  const router = Object.fromEntries(
    ["get", "post", "patch"].map((m) => [
      m,
      (p, ...h) => (routes[m + " " + p] = h.at(-1)),
    ]),
  );
  vm.runInNewContext(fs.readFileSync("src/routes/products.js", "utf8"), {
    module: { exports: {} },
    require: (n) =>
      n === "express"
        ? { Router: () => router }
        : n.includes("requireAdmin")
          ? () => {}
          : { product: { create: async ({ data }) => (saved = data) } },
  });
  let err;
  await routes["post /"](
    {
      body: {
        title: "",
        productCode: "DRAFT-1",
        isActive: false,
        basePrice: 0,
        inventoryMode: "SINGLE",
        variants: [{ sku: "DRAFT-1", color: null, size: null, stock: 1 }],
      },
    },
    {
      status() {
        return this;
      },
      json() {},
    },
    (e) => (err = e),
  );
  assert.equal(err, undefined);
  assert.equal(saved.title, "");
  assert.equal(saved.variants.create[0].color, "");
  assert.equal(saved.qualityGrade, null);
  assert.equal(saved.isActive, false);
});
