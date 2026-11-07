const { chromium } = require("playwright"),
  fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict");
const site = require("../public/site-content");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_BIN
      ? {
          executablePath: process.env.CHROME_BIN,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : {}),
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      }),
      errors = [];
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      if (process.env.DEBUG_ADMIN) console.log("page error", e.message);
    });
    page.on("dialog", (d) => d.accept());
    let products = [],
      payload,
      posts = 0,
      uploadAttempts = 0,
      failSave = false,
      dropResponse = false,
      uploadFailure = true;
    const fixture = {
      id: "existing",
      title: "کاپشن آزمایشی",
      productCode: "MOTIF-TEST-OLD",
      brand: "MOTIF",
      productType: "کاپشن",
      mainFabric: "شمعی",
      complementaryFabrics: [],
      seasons: ["پاییز"],
      uses: ["روزمره"],
      customerNeeds: [],
      styles: [],
      qualityGrade: "B",
      basePrice: 2350000,
      inventoryMode: "SINGLE",
      isActive: true,
      images: ["https://img.test/front"],
      defectImages: [],
      createdAt: "2026-11-06T00:00:00.000Z",
      updatedAt: "2026-11-06T00:00:00.000Z",
      variants: [
        {
          id: "old-v",
          sku: "old-sku",
          size: "L",
          color: "سبز",
          stock: 1,
          priceDelta: 0,
          chestWidthCm: 59,
          lengthCm: 69,
          sleeveFromNeckCm: 73,
          itemImages: [],
          itemDefectImages: [],
          itemGrade: "A",
        },
      ],
    };
    products = [structuredClone(fixture)];
    await page.route("https://img.test/**", (r) =>
      r.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1EAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await page.route("https://motif.test/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (u.pathname === "/api/products/admin/list")
        return route.fulfill({ json: products });
      if (u.pathname === "/api/products/admin/fabrics")
        return route.fulfill({ json: require("../public/catalog").fabrics });
      if (u.pathname === "/api/site/admin")
        return route.fulfill({
          json: {
            version: 0,
            draft: site.defaults,
            published: site.defaults,
            history: [],
          },
        });
      if (u.pathname === "/api/uploads/images") {
        uploadAttempts++;
        return route.fulfill(
          uploadFailure
            ? {
                status: 502,
                json: { error: "مجوز نوشتن در فضای عکس لیارا کافی نیست." },
              }
            : {
                status: 201,
                json: { url: "https://img.test/upload-" + uploadAttempts },
              },
        );
      }
      if (u.pathname.startsWith("/api/products")) {
        if (failSave) return route.abort();
        payload = req.postDataJSON();
        if (req.method() === "POST") posts++;
        const p = {
          ...payload,
          id:
            req.method() === "POST"
              ? "p" + posts
              : u.pathname.split("/").at(-1),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          variants: payload.variants.map((v, i) => ({
            ...v,
            id: v.id || "v" + posts + "-" + i,
          })),
        };
        products = [p, ...products.filter((x) => x.id !== p.id)];
        if (dropResponse) {
          dropResponse = false;
          return route.abort();
        }
        return route.fulfill({ json: p });
      }
      const filename =
          u.pathname === "/admin.html" ? "admin.html" : u.pathname.slice(1),
        file = path.join(__dirname, "../public", filename);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({
        contentType: filename.endsWith(".js")
          ? "application/javascript"
          : filename.endsWith(".css")
            ? "text/css"
            : filename.endsWith(".woff2")
              ? "font/woff2"
              : "text/html",
        body: fs.readFileSync(file),
      });
    });
    const pf = (k) =>
        page.locator("#productFields [data-key=" + k + "]").first(),
      vf = (k) => page.locator("#editor [data-key=" + k + "]").first();
    const nav = async (name) => {
      await page
        .locator("#mobileNav")
        .getByRole("button", { name, exact: true })
        .click();
    };
    const stage = async (n) => {
      if (process.env.DEBUG_ADMIN) console.log("stage", n);
      await page
        .locator("#steps li")
        .nth(n - 1)
        .getByRole("button")
        .click();
    };
    await page.goto("https://motif.test/admin.html");
    await page.locator("#token").fill("test");
    await page.locator("#loginForm button").click();
    await page.locator("#dashboard").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#stats .stat strong").first().innerText(),
      "۱",
    );
    assert(await page.locator("#mobileNav").isVisible());
    assert(!(await page.locator(".sidebar").isVisible()));
    fs.mkdirSync("/tmp/motif-admin-previews", { recursive: true });
    await page.screenshot({
      path: "/tmp/motif-admin-previews/MOTIF-dashboard-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert(await page.locator(".sidebar").isVisible());
    await page.screenshot({
      path: "/tmp/motif-admin-previews/MOTIF-dashboard-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [i, type] of ["کاپشن", "شلوار", "سویشرت"].entries()) {
      await nav("ثبت محصول");
      await pf("mainCategories").locator(`input[value="${type}"]`).check();
      await pf("productType").selectOption(type);
      await pf("productCode").fill("MOTIF-TEST-" + i);
      await pf("title").fill(type + " تست");
      await pf("brand").fill("MOTIF");
      await pf("fabrics").locator('input[value="شمعی"]').check();
      await pf("seasons").locator('input[value="پاییز"]').check();
      await pf("uses").locator('input[value="روزمره"]').check();
      await stage(2);
      await vf("color").fill("سبز");
      if (type === "شلوار") {
        for (const [key, value] of [
          ["waistCm", "84"],
          ["riseCm", "29"],
          ["totalLengthCm", "105"],
          ["thighWidthCm", "30"],
          ["hemWidthCm", "20"],
        ])
          await vf(key).fill(value);
        assert(!(await vf("sleeveFromNeckCm").isVisible()));
      } else {
        for (const [key, value] of [
          ["chestWidthCm", "59"],
          ["lengthCm", "69"],
          ["sleeveFromNeckCm", "73"],
        ])
          await vf(key).fill(value);
        assert(!(await vf("waistCm").isVisible()));
      }
      await stage(3);
      await pf("basePrice").fill("۲٬۳۵۰٬۰۰۰");
      await pf("basePrice").dispatchEvent("input");
      assert.equal(await pf("basePrice").inputValue(), "2,350,000");
      await vf("priceDelta").fill("-50,000");
      await pf("qualityGrade").selectOption(i === 0 ? "B" : "A");
      if (i === 0) await pf("defect").fill("سوراخ کوچک");
      await stage(4);
      const main = page.locator(".image-editor:has([data-key=images])").first();
      await main.locator("summary").click();
      await pf("images").fill("https://img.test/front\nhttps://img.test/back");
      await pf("images").dispatchEvent("input");
      const defect = page
        .locator(".image-editor:has([data-key=defectImages])")
        .first();
      assert.equal(await defect.isVisible(), i === 0);
      if (i === 0) {
        const file = {
          name: "defect.png",
          mimeType: "image/png",
          buffer: Buffer.from("test"),
        };
        await defect.locator("input[type=file]").setInputFiles(file);
        await defect.getByText(/مجوز نوشتن/).waitFor();
        uploadFailure = false;
        await defect
          .getByRole("button", { name: "تلاش دوباره برای عکس‌های ناموفق" })
          .click();
        await defect.getByText(/1 عکس اضافه شد/).waitFor();
        assert(
          (await pf("defectImages").inputValue()).includes(
            "https://img.test/upload-",
          ),
        );
        await main
          .getByRole("button", { name: "پایین‌تر", exact: true })
          .first()
          .click();
        assert.equal(
          (await pf("images").inputValue()).split("\n")[0],
          "https://img.test/back",
        );
        const chooserPromise = page.waitForEvent("filechooser");
        await main
          .getByRole("button", { name: "جایگزینی عکس", exact: true })
          .first()
          .click();
        await (
          await chooserPromise
        ).setFiles({ ...file, name: "replace.jpg", mimeType: "image/jpeg" });
        await main.getByText(/1 عکس اضافه شد/).waitFor();
        assert(
          (await pf("images").inputValue()).startsWith(
            "https://img.test/upload-",
          ),
        );
      }
      await stage(5);
      assert.equal(await page.locator("#review .issue").count(), 0);
      await page.locator("#publish").click();
      assert(await page.locator("#publishDialog").isVisible());
      assert.equal(posts, i);
      await page.locator("#cancelPublish").click();
      if (process.env.DEBUG_ADMIN) console.log("save");
      await page.locator("#save").click();
      await page
        .getByText("محصول ذخیره شد.", { exact: true })
        .first()
        .waitFor();
      assert.equal(payload.isActive, false);
      assert.equal(payload.basePrice, 2350000);
      assert.equal(payload.productType, type);
      assert.equal(payload.variants[0].priceDelta, -50000);
      assert.equal(posts, i + 1);
      await page.locator("#publish").click();
      if (process.env.DEBUG_ADMIN) console.log("publish confirm");
      await page.locator("#confirmPublish").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#saveSuccess").hidden === false &&
          !document.querySelector("#editor").inert,
      );
      assert.equal(payload.isActive, true);
      assert.equal(payload.publicationIntent, true);
    }
    // Single-page editing preserves original grade, IDs, images and concurrency metadata.
    await nav("محصولات");
    await page.locator("#search").fill("MOTIF-TEST-OLD");
    await page
      .locator("#list")
      .getByRole("button", { name: "ویرایش", exact: true })
      .click();
    assert(!(await page.locator("#steps").isVisible()));
    await pf("basePrice").fill("2,450,000");
    await page.locator("#measureSection summary").click();
    await vf("sleeveFromNeckCm").fill("75");
    if (process.env.DEBUG_ADMIN) console.log("save");
    await page.locator("#save").click();
    await page.waitForFunction(() => !document.querySelector("#editor").inert);
    assert.equal(payload.qualityGrade, "B");
    assert.equal(payload.variants[0].itemGrade, "A");
    assert.equal(payload.variants[0].id, "old-v");
    assert.equal(payload.variants[0].expectedStock, 1);
    assert.equal(payload.variants[0].sleeveFromNeckCm, 75);
    assert.deepEqual(payload.images, fixture.images);
    await page.screenshot({
      path: "/tmp/motif-admin-previews/MOTIF-editor-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "/tmp/motif-admin-previews/MOTIF-editor-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    // Failed request keeps typed values and recovery, and same product code remains stable.
    await nav("ثبت محصول");
    await pf("productCode").fill("MOTIF-RECOVER");
    await pf("title").fill("پیش‌نویس اینترنت ضعیف");
    await stage(2);
    await vf("color").fill("مشکی");
    failSave = true;
    if (process.env.DEBUG_ADMIN) console.log("save");
    await page.locator("#save").click();
    await page.getByText(/ارتباط برقرار نشد/).waitFor();
    assert.equal(await pf("title").inputValue(), "پیش‌نویس اینترنت ضعیف");
    failSave = false;
    await page.reload();
    await page.locator("#token").fill("test");
    await page.locator("#loginForm button").click();
    await page.locator("#editor").waitFor({ state: "visible" });
    assert.equal(await pf("title").inputValue(), "پیش‌نویس اینترنت ضعیف");
    if (process.env.DEBUG_ADMIN) console.log("save");
    await page.locator("#save").click();
    await page.waitForFunction(() => !document.querySelector("#editor").inert);
    assert.equal(
      products.filter((p) => p.productCode === "MOTIF-RECOVER").length,
      1,
    );
    await nav("محصولات");
    await page.locator("#search").fill("MOTIF-TEST");
    await page.locator("#gradeFilter").selectOption("A");
    assert.equal(await page.locator("#list article").count(), 2);
    await page.locator("#gradeFilter").selectOption("");
    await page.locator("#categoryFilter").selectOption("شلوار");
    assert.equal(await page.locator("#list article").count(), 1);
    await page.locator("#categoryFilter").selectOption("");
    await page.locator("#search").fill("");
    await page.screenshot({
      path: "/tmp/motif-admin-previews/MOTIF-products-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "/tmp/motif-admin-previews/MOTIF-products-desktop.png",
      fullPage: true,
    });
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + width,
      );
    }
    // A multi-size draft keeps each row's stock, price and identity together.
    await page.setViewportSize({ width: 390, height: 844 });
    await nav("ثبت محصول");
    await pf("productCode").fill("MOTIF-MULTI");
    await pf("title").fill("چندسایزی");
    await stage(3);
    await pf("inventoryMode").selectOption("MULTI");
    await stage(2);
    await vf("size").fill("M");
    await vf("color").fill("سبز");
    await page.locator("#addVariant").click();
    const second = page.locator("#variants>fieldset").nth(1);
    await second.locator("[data-key=size]").fill("L");
    await second.locator("[data-key=color]").fill("سبز");
    await second.locator("[data-key=sku]").fill("MOTIF-MULTI-L");
    await stage(3);
    const pricing = page.locator("#variantPricing>fieldset");
    await pricing.nth(0).locator("[data-key=stock]").fill("2");
    await pricing.nth(1).locator("[data-key=stock]").fill("4");
    await pricing.nth(1).locator("[data-key=priceDelta]").fill("50,000");
    await page.locator("#save").click();
    await page.waitForFunction(() => !document.querySelector("#editor").inert);
    assert.equal(payload.variants.length, 2);
    assert.deepEqual(
      payload.variants.map((v) => v.stock),
      [2, 4],
    );
    assert.equal(payload.variants[1].priceDelta, 50000);
    // A successful POST whose response is lost is reconciled without a second create.
    await nav("ثبت محصول");
    await pf("productCode").fill("MOTIF-UNCERTAIN");
    await stage(2);
    await vf("color").fill("مشکی");
    dropResponse = true;
    await page.locator("#save").click();
    await page.getByText(/ارتباط برقرار نشد/).waitFor();
    const before = posts;
    await page.locator("#save").click();
    await page.getByText(/ثبت قبلی در سرور پیدا شد/).waitFor();
    assert.equal(posts, before);
    assert.equal(
      products.filter((p) => p.productCode === "MOTIF-UNCERTAIN").length,
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: dashboard, responsive navigation, 3 categories, five stages, publish confirmation, drafts, edit preservation, image failure/retry/replacement/order, local recovery, search/filters, five viewport widths. Mock APIs only; no production data writes.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
