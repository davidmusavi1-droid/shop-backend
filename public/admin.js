"use strict";
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
let products = [],
  suspended = false,
  fabricChoices = MotifCatalog.fabrics,
  editing = null,
  step = 1,
  page = 1,
  dirty = false,
  busy = false,
  recoveryKey = "",
  draftTimer,
  baseline = "",
  pendingCreateCode = null,
  c22Enabled = false,
  c22Transfer = null;
const stepNames = [
  "هویت و دسته‌بندی",
  "مشخصات و اندازه‌ها",
  "قیمت و کیفیت",
  "تصاویر",
  "بررسی نهایی",
];
const groups = [
  [
    "اطلاعات اصلی و دسته‌بندی",
    [
      "productCode",
      "title",
      "brand",
      "mainCategories",
      "productType",
      "seasons",
      "uses",
      "customerNeeds",
    ],
    1,
  ],
  [
    "جنس و مدل",
    [
      "fabrics",
      "fabricBasis",
      "modelName",
      "garmentDesign",
      "hasHood",
      "fabricTechnology",
      "technologyVerified",
      "technologyEvidence",
      "fabricNote",
    ],
    1,
  ],
  ["اندازه‌ها", [], 2],
  ["قیمت و موجودی", ["basePrice", "inventoryMode"], 3],
  ["گرید و وضعیت محصول", ["qualityGrade", "condition", "defect"], 3],
  ["تصاویر اصلی", ["images"], 4],
  ["تصاویر ایراد", ["defectImages"], 4],
  [
    "محتوای متنی محصول",
    [
      "description",
      "identityOrigin",
      "identityHistory",
      "identityPurpose",
      "identityUseCases",
      "identityDesign",
      "identityTechnical",
      "identitySources",
    ],
    5,
  ],
  ["وضعیت انتشار", ["isActive"], 5],
];
function button(text, action, cls) {
  const n = el("button", text, cls);
  n.type = "button";
  n.onclick = action;
  return n;
}
const icons = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  products: '<path d="m3 7 9-4 9 4-9 4-9-4v10l9 4 9-4V7M12 11v10"/>',
  create:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 7v10M7 12h10"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
};
for (const root of [$("desktopNav"), $("mobileNav")])
  for (const [view, title] of [
    ["dashboard", "داشبورد"],
    ["products", "محصولات"],
    ["create", "ثبت محصول"],
    ["settings", "تنظیمات"],
  ]) {
    const b = button(
      "",
      () => (view === "create" ? openEditor() : navigate(view)),
      "nav-button",
    );
    b.dataset.view = view;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = icons[view];
    b.append(svg, el("span", title));
    root.append(b);
  }
function mark() {
  dirty = true;
  $("dirtyState").textContent =
    "تغییرات ذخیره‌نشده · بازیابی خودکار در همین زبانه";
  $("saveSuccess").hidden = true;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(cache, 500);
}
function snapshot() {
  const data = read($("productFields"), fields);
  if (!data.productCode) delete data.productCode;
  data.variants = [...$("variants").children].map((box) => ({
    ...read(box, variantFields),
    ...(box.dataset.id
      ? { id: box.dataset.id, expectedStock: Number(box.dataset.expectedStock) }
      : {}),
  }));
  if (data.inventoryMode === "SINGLE")
    data.variants.forEach((v) => {
      if (!v.size) v.size = "نامشخص";
    });
  if (editing) {
    data.updatedAt = editing.updatedAt;
    data.styles = editing.styles || [];
    if (c22Transfer) data.c22Transfer = c22Transfer;
  }
  return data;
}
function cache(force = false) {
  if (!recoveryKey || $("editor").hidden || (busy && !force)) return;
  try {
    sessionStorage.setItem(
      recoveryKey,
      JSON.stringify({
        data: snapshot(),
        id: editing?.id || null,
        step,
        base: editing?.updatedAt,
        createCode: pendingCreateCode,
      }),
    );
    $("dirtyState").textContent =
      "تغییرات ذخیره‌نشده · نسخه بازیابی در همین زبانه ذخیره شد";
  } catch {
    $("dirtyState").textContent =
      "تغییرات ذخیره‌نشده · ذخیره بازیابی در این مرورگر ممکن نیست";
  }
}
function leave() {
  if (busy || MotifImages.guard()) return false;
  if (dirty) {
    if (!confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟")) return false;
    try {
      sessionStorage.removeItem(recoveryKey);
    } catch {}
  }
  if (!MotifSiteAdmin.close()) return false;
  dirty = false;
  clearTimeout(draftTimer);
  return true;
}
function display(view) {
  for (const [id, v] of [
    ["dashboard", "dashboard"],
    ["productListSection", "products"],
    ["editor", "editor"],
    ["settings", "settings"],
  ])
    $(id).hidden = view !== v;
  $("sitePanel").hidden = true;
  if (view === "settings") {
    void loadShippingSettings();
    void loadCardSettings();
    void loadCheckoutOrders();
  }
  $("pageTitle").textContent = {
    dashboard: "داشبورد",
    products: "محصولات",
    editor: editing ? "ویرایش محصول" : "ثبت محصول",
    settings: "تنظیمات",
  }[view];
  document.querySelectorAll("[data-view]").forEach((b) => {
    if (
      b.dataset.view ===
      (view === "editor" ? (editing ? "products" : "create") : view)
    )
      b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}
function navigate(view) {
  if (!leave()) return;
  display(view);
  render();
}
function openEditor(p = null, recover = null) {
  if (!leave()) return false;
  editing = p;
  c22Transfer = p ? recover?.data?.c22Transfer || null : null;
  pendingCreateCode = recover?.createCode || null;
  step = recover?.step || 1;
  $("productFields").replaceChildren();
  const source = recover?.data ||
    p || { basePrice: 0, inventoryMode: "SINGLE", isActive: false };
  $("editorTitle").textContent = p ? "ویرایش: " + p.title : "ثبت محصول جدید";
  for (const [name, keys, st] of groups) {
    const d = el("details", null, "form-section");
    d.dataset.step = st;
    d.open =
      !p || name === "اطلاعات اصلی و دسته‌بندی" || name === "قیمت و موجودی";
    d.append(el("summary", name));
    const grid = el("div", null, "grid");
    for (const key of keys) {
      const spec = fields.find((f) => f[0] === key);
      if (key === "mainCategories") {
        grid.append(control([...spec.slice(0, 3), categoryChoices()], MotifCatalog.categoriesOf(source)));
      } else if (key === "fabrics") {
        const box = control([...spec.slice(0, 3), fabricChoices], MotifCatalog.fabricsOf(source));
        appendChoiceEditor(box, "نام جنس جدید", saveFabricOption);
        grid.append(box);
      } else {
        grid.append(control(spec, key === "fabricBasis" ? source[key] || "UNKNOWN" : source[key]));
      }
    }
    d.append(grid);
    if (name === "اندازه‌ها") {
      d.id = "measureSection";
      d.append(
        el(
          "p",
          "اندازه‌ها بر حسب سانتی‌متر و مربوط به خود لباس روی سطح صاف‌اند. آستین را از کنار گردن، در مسیر شانه تا انتهای سرآستین اندازه بگیرید.",
        ),
      );
      const variants = el("div");
      variants.id = "variants";
      d.append(
        variants,
        button("افزودن سایز", () => {
          addVariant();
          arrangeVariants();
          mark();
        }),
      );
      d.lastChild.id = "addVariant";
    }
    const extraId = {
      "قیمت و موجودی": "variantPricing",
      "گرید و وضعیت محصول": "variantQuality",
      "تصاویر اصلی": "variantImages",
      "تصاویر ایراد": "variantDefects",
    }[name];
    if (extraId) {
      const extra = el("div");
      extra.id = extraId;
      d.append(extra);
    }
    if (name === "تصاویر اصلی") {
      d.append(
        el(
          "p",
          "نمای لیبل (Label)، جلو (Front)، پشت (Back) و جزئیات (Detail) را اضافه کنید. نام فایل و کد محصول را پیش از انتخاب بررسی کنید.",
        ),
      );
    }
    if (name === "وضعیت انتشار") {
      d.append(
        el("p", "تغییر وضعیت فقط با دکمهٔ ذخیره یا تأیید انتشار اعمال می‌شود."),
      );
    }
    $("productFields").append(d);
  }
  syncC22();
  for (const v of source.variants || [{ stock: 1, priceDelta: 0 }])
    addVariant(v);
  const field = (k) =>
    $("productFields").querySelector('[data-key="' + k + '"]');
  const code = field("productCode");
  code.maxLength = 64;
  code.pattern = "[A-Za-z0-9][A-Za-z0-9-]{0,63}";
  code.dir = "ltr";
  code.oninput = syncInventory;
  field("inventoryMode").onchange = () => {
    syncInventory();
    mark();
  };
  const priority = field("productType"), categories = field("mainCategories");
  function syncPriority(value) {
    const selected = [...categories.querySelectorAll("input:checked")].map(n => n.value);
    priority.replaceChildren(new Option("انتخاب کنید", ""), ...selected.map(n => new Option(n, n)));
    priority.value = selected.includes(value) ? value : "";
    priority.required = !!selected.length || !!MotifCatalog.categoriesOf(p || {}).length;
  }
  categories.onchange = () => syncPriority(priority.value);
  appendChoiceEditor(categories, "نام دسته جدید", async name => name);
  syncPriority(source.productType);
  if (p && !MotifCatalog.categoriesOf(source).includes(source.productType)) {
    categories.append(el("p", "دستهٔ قبلی مشخص نیست. دسته‌های محصول و اولویت آن‌ها را بررسی کنید."));
  }
  let previous = priority.value;
  field("productType").onchange = () => {
    const value = field("productType").value;
    if (
      (previous === "شلوار") !== (value === "شلوار") &&
      [...$("variants").querySelectorAll("input[type=number]")].some(
        (n) => n.dataset.key.endsWith("Cm") && n.value,
      )
    ) {
      if (
        !confirm(
          "نوع لباس تغییر می‌کند. اندازه‌های قبلی حفظ می‌شوند؛ اندازه‌های دستهٔ جدید را جداگانه بررسی کنید.",
        )
      ) {
        priority.value = [...priority.options].some(o => o.value === previous) ? previous : "";
        return;
      }
    }
    previous = value;
    syncMeasures();
    mark();
  };
  syncInventory();
  syncDefects($("productFields"), "qualityGrade", "defectImages", "defect");
  arrangeVariants();
  syncMeasures();
  dirty = !!recover;
  baseline = JSON.stringify(snapshot());
  $("dirtyState").textContent = recover
    ? "پیش‌نویس بازیابی شد؛ پیش از ذخیره بررسی کنید."
    : "تمام تغییرات ذخیره شده است";
  $("saveSuccess").hidden = true;
  display("editor");
  showStep();
  if (recover) cache();
  return true;
}
function arrangeVariants() {
  for (const [index, box] of [...$("variants").children].entries()) {
    if (box._controls) continue;
    box._controls = Object.fromEntries(
      [...box.querySelectorAll("[data-key]")].map((n) => [n.dataset.key, n]),
    );
    box._panels = [];
    const targets = {};
    for (const id of [
      "variantPricing",
      "variantQuality",
      "variantImages",
      "variantDefects",
    ]) {
      const panel = el("fieldset");
      panel.append(el("legend", "سایز " + (index + 1)));
      const grid = el("div", null, "grid");
      panel.append(grid);
      $(id).append(panel);
      box._panels.push(panel);
      targets[id] = grid;
    }
    for (const [k, n] of Object.entries(box._controls)) {
      const host = n.closest("label") || n.closest(".image-editor") || n;
      const destination = ["stock", "priceDelta"].includes(k)
        ? "variantPricing"
        : ["itemGrade", "itemCondition", "itemDefect"].includes(k)
          ? "variantQuality"
          : k === "itemImages"
            ? "variantImages"
            : k === "itemDefectImages"
              ? "variantDefects"
              : null;
      host.dataset.variantStage =
        destination?.includes("Images") || destination === "variantDefects"
          ? "4"
          : ["variantPricing", "variantQuality"].includes(destination)
            ? "3"
            : "2";
      if (destination) targets[destination].append(host);
    }
  }
  syncMeasures();
  showStep();
}
function syncMeasures() {
  const pants =
    $("productFields").querySelector("[data-key=productType]").value ===
    "شلوار";
  const bottom = [
    "waistCm",
    "waistWidthCm",
    "riseCm",
    "totalLengthCm",
    "thighWidthCm",
    "hemWidthCm",
  ];
  for (const box of $("variants").children)
    for (const spec of variantFields.filter((s) => s[2] === "measure")) {
      const n = box.querySelector("[data-key=" + spec[0] + "]");
      n.closest("label").dataset.wrongKind = String(
        pants !== bottom.includes(spec[0]),
      );
    }
  showStep();
}
function showStep() {
  if (!$("variants")) return;
  $("steps").hidden = !!editing;
  if (!editing && !$("steps").children.length)
    stepNames.forEach((name, i) => {
      const li = el("li");
      const b = button("", () => {
        step = i + 1;
        showStep();
        cache();
      });
      b.append(el("b", String(i + 1)), el("span", name));
      if (step === i + 1) b.setAttribute("aria-current", "step");
      li.append(b);
      $("steps").append(li);
    });
  [...$("steps").querySelectorAll("button")].forEach((b, i) => {
    if (i + 1 === step) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  });
  for (const section of $("productFields").children)
    section.hidden = !editing && Number(section.dataset.step) !== step;
  // Controls retain references to their original variant row and concurrency fields.

  for (const n of $("editor").querySelectorAll("[data-variant-stage]"))
    n.hidden =
      (!editing && Number(n.dataset.variantStage) !== step) ||
      n.dataset.wrongKind === "true" ||
      n.dataset.gradeHidden === "true";
  $("addVariant").hidden =
    (!editing && step !== 2) ||
    $("productFields").querySelector("[data-key=inventoryMode]").value ===
      "SINGLE";
  for (const box of $("variants").children)
    for (const panel of box._panels || []) {
      panel.hidden = [...panel.querySelectorAll("[data-variant-stage]")].every(
        (n) => n.hidden,
      );
    }
  const defectRoot = $("productFields")
    .querySelector("[data-key=defectImages]")
    ?.closest(".form-section");
  if (defectRoot && !defectRoot.hidden) {
    defectRoot.hidden = [...defectRoot.querySelectorAll(".image-editor")].every(
      (n) => n.hidden,
    );
  }
  $("backStep").hidden = !!editing || step === 1;
  $("nextStep").hidden = !!editing || step === 5;
  $("publish").hidden = !editing && step !== 5;
  $("review").hidden = !!editing || step !== 5;
  $("save").textContent = editing ? "ذخیره تغییرات" : "ذخیره پیش‌نویس";
  if (!editing && step === 5) review();
}
function focusField(key, st) {
  if (!editing) {
    step = st;
    showStep();
  }
  const input = $("editor").querySelector('[data-key="' + key + '"]');
  if (!input) return;
  for (let n = input; n && n !== $("editor"); n = n.parentElement)
    if (n.tagName === "DETAILS") n.open = true;
  input.closest("[data-variant-stage]")?.removeAttribute("hidden");
  input.scrollIntoView({ block: "center" });
  input.focus();
  input.classList.add("field-error");
}
function review() {
  const p = snapshot(),
    root = $("review");
  root.replaceChildren(el("h2", "بررسی نهایی"));
  const issues = MotifReadiness.issues(p);
  root.append(
    el(
      "p",
      issues.length
        ? issues.length + " مورد برای تکمیل اطلاعات باقی مانده است."
        : "اطلاعات ضروری کامل است؛ آماده بررسی و انتشار.",
    ),
  );
  for (const issue of issues)
    root.append(
      button(
        "تکمیل: " + issue.label,
        () => focusField(issue.key, issue.step),
        "issue",
      ),
    );
  const lines = [
    ["نام و کد", [p.title, p.productCode].filter(Boolean).join(" · ")],
    ["دسته و برند", [...p.mainCategories, p.brand].filter(Boolean).join(" · ")],
    ["دسته اولویت‌دار", p.productType],
    [
      "جنس و مدل",
      [...p.fabrics, p.garmentDesign, p.modelName]
        .filter(Boolean)
        .join(" · "),
    ],
    ["فصل / کاربرد", [...p.seasons, ...p.uses].join("، ")],
    ["قیمت", MotifCatalog.formatPriceInput(p.basePrice) + " تومان"],
    ["گرید", MotifCatalog.gradeLetter(p.qualityGrade) || "تعیین نشده"],
    ["وضعیت / ایراد", [p.condition, p.defect].filter(Boolean).join(" · ")],
    ["توضیحات", p.description],
  ];
  p.variants.forEach((v, i) => {
    lines.push([
      "سایز " + (i + 1),
      `${v.size || "نامشخص"} · ${v.color || "—"} · SKU: ${v.sku || "—"} · موجودی: ${v.stock} · اختلاف قیمت: ${MotifCatalog.formatPriceInput(v.priceDelta)} · گرید: ${MotifCatalog.gradeLetter(v.itemGrade) || "گرید محصول"}`,
    ]);
    lines.push([
      "اندازه‌ها",
      variantFields
        .filter((f) => f[2] === "measure" && v[f[0]])
        .map((f) => f[1] + ": " + v[f[0]])
        .join("، "),
    ]);
    lines.push([
      "وضعیت سایز",
      [v.itemCondition, v.itemDefect].filter(Boolean).join(" · "),
    ]);
  });
  for (const [label, value] of lines) {
    const row = el("div", null, "review-row");
    row.append(el("span", label), el("span", value || "—"));
    root.append(row);
  }
  for (const [label, urls] of [
    ["تصاویر اصلی", p.images],
    ["تصاویر ایراد", p.defectImages],
    ...p.variants.flatMap((v, i) => [
      [`تصاویر سایز ${i + 1}`, v.itemImages],
      [`عکس ایراد سایز ${i + 1}`, v.itemDefectImages],
    ]),
  ])
    if (urls.length) {
      root.append(el("h3", label));
      const gallery = el("div", null, "review-gallery");
      urls.forEach((url) => {
        const img = el("img");
        img.src = url;
        img.alt = label;
        gallery.append(img);
      });
      root.append(gallery);
    }
}
async function api(path, options = {}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await MotifAdminSession.request(path, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error("پاسخ سرور قابل خواندن نیست؛ HTTP " + response.status);
    }
    if (!response.ok)
      throw Error(data.error || "خطای ارتباط (" + response.status + ")");
    return data;
  } catch (e) {
    throw Error(
      e.name === "AbortError"
        ? "پاسخ سرور دیر رسید؛ اطلاعات حفظ شده است. پیش از تلاش دوباره، فهرست را تازه‌سازی کنید."
        : e.message === "Failed to fetch"
          ? "ارتباط برقرار نشد؛ اطلاعات فرم حفظ شده است."
          : e.message,
    );
  } finally {
    clearTimeout(timer);
  }
}
const stock = (p) => (p.variants || []).reduce((s, v) => s + v.stock, 0),
  statusLabel = (p) =>
    p.isActive
      ? "منتشرشده"
      : MotifReadiness.issues(p).length
        ? "پیش‌نویس · ناقص"
        : "آماده بررسی";
function card(p) {
  const row = el("article", null, "product-card");
  if (p.images?.[0]) {
    const img = el("img");
    img.src = p.images[0];
    img.alt = p.title;
    img.loading = "lazy";
    row.append(img);
  } else row.append(el("div", "◇", "photo-placeholder"));
  const name = el("div");
  name.append(
    el("h3", p.title || "پیش‌نویس بدون نام"),
    el(
      "small",
      [p.brand, p.productCode || "بدون کد"].filter(Boolean).join(" · "),
    ),
    el("small", MotifCatalog.categoriesOf(p).join("، ") || "دسته نیازمند بررسی"),
  );
  row.append(
    name,
    el("div", MotifCatalog.formatPriceInput(p.basePrice) + " تومان", "price"),
  );
  const grade = el("div", null, "product-stock");
  const gradeLabel = el("span", "گرید "),
    letter = el("bdi", MotifCatalog.gradeLetter(p.qualityGrade) || "—");
  letter.dir = "ltr";
  gradeLabel.append(letter);
  grade.append(gradeLabel, el("small", "موجودی " + stock(p)));
  row.append(grade);
  const state = el("div", null, "product-status");
  state.append(
    el("span", statusLabel(p), "badge" + (!p.isActive ? " warning" : "")),
  );
  row.append(state);
  const actions = el("div", null, "actions");
  actions.append(
    button("ویرایش", () => openEditor(p)),
    button("قیمت / موجودی", () => {
      if (openEditor(p)) {
        const input = $("productFields").querySelector("[data-key=basePrice]");
        input.closest("details").open = true;
        input.scrollIntoView({ block: "center" });
        input.focus();
      }
    }),
  );
  if (p.isActive) {
    actions.append(button("خارج‌کردن از فروش", async () => {
      if (!window.confirm("این محصول از ویترین فروشگاه برداشته شود؟")) return;
      try {
        await api("/api/products/" + encodeURIComponent(p.id) + "/unpublish", {
          method: "PATCH", body: JSON.stringify({ updatedAt: p.updatedAt }),
        });
        await refresh();
        notice("محصول از فروش خارج شد.");
      } catch (error) {
        notice(error.message);
      }
    }));
    const a = el("a", "مشاهده ↗");
    a.href = "/products/" + encodeURIComponent(p.id);
    a.target = "_blank";
    a.rel = "noopener";
    actions.append(a);
  }
  row.append(actions);
  return row;
}
function render() {
  const cats = $("categoryFilter"),
    selected = cats.value;
  cats.replaceChildren(new Option("همه دسته‌ها", ""));
  categoryChoices().forEach(v => cats.add(new Option(v, v)));
  cats.value = selected;
  $("stats").replaceChildren();
  const incomplete = products.filter(
      (p) => MotifReadiness.issues(p).length,
    ).length,
    ready = products.filter(
      (p) => !p.isActive && !MotifReadiness.issues(p).length,
    ).length;
  for (const [title, value, filter] of [
    ["کل محصولات", products.length, "all"],
    ["منتشرشده", products.filter((p) => p.isActive).length, "published"],
    ["پیش‌نویس", products.filter((p) => !p.isActive).length, "draft"],
    ["ناقص", incomplete, "incomplete"],
    ["آماده بررسی", ready, "ready"],
  ]) {
    const b = button(
      "",
      () => filterList(filter),
      "stat" + (filter === "all" ? " active" : ""),
    );
    b.append(el("span", title), el("strong", value.toLocaleString("fa-IR")));
    $("stats").append(b);
  }
  $("quickActions").replaceChildren(
    button("＋ ثبت محصول جدید", () => openEditor()),
    button("همه محصولات ←", () => filterList("all")),
    button("ادامه پیش‌نویس‌ها", () => filterList("draft")),
    button("تکمیل محصولات ناقص", () => filterList("incomplete")),
  );
  $("recent").replaceChildren(...products.slice(0, 5).map(card));
  if (!products.length)
    $("recent").append(el("p", "هنوز محصولی ثبت نشده است.", "panel"));
  const q = $("search").value.trim().toLowerCase(),
    filter = $("filter").value;
  let list = products.filter(
    (p) =>
      [p.title, p.productCode, p.brand, ...p.variants.map((v) => v.sku)]
        .join(" ")
        .toLowerCase()
        .includes(q) &&
      (!cats.value || MotifCatalog.categoriesOf(p).includes(cats.value)) &&
      (!$("gradeFilter").value || p.qualityGrade === $("gradeFilter").value) &&
      {
        all: true,
        published: p.isActive,
        draft: !p.isActive,
        inactive: !p.isActive,
        incomplete: !!MotifReadiness.issues(p).length,
        ready: MotifReadiness.status(p) === "ready",
        available: p.isActive && stock(p) > 0,
        sold: stock(p) === 0,
      }[filter],
  );
  list.sort((a, b) =>
    $("sort").value === "price"
      ? b.basePrice - a.basePrice
      : $("sort").value === "stock"
        ? stock(b) - stock(a)
        : $("sort").value === "oldest"
          ? new Date(a.createdAt) - new Date(b.createdAt)
          : new Date(b.createdAt) - new Date(a.createdAt),
  );
  const pages = Math.max(1, Math.ceil(list.length / 20));
  page = Math.min(page, pages);
  $("list").replaceChildren(
    ...list.slice((page - 1) * 20, page * 20).map(card),
  );
  if (!list.length)
    $("list").append(el("p", "محصولی با این مشخصات یافت نشد.", "panel"));
  $("resultCount").textContent = list.length.toLocaleString("fa-IR") + " محصول";
  $("pageNumber").textContent = page + " / " + pages;
  $("prevPage").disabled = page === 1;
  $("nextPage").disabled = page === pages;
}
function filterList(filter) {
  if (!leave()) return;
  $("filter").value = filter;
  page = 1;
  display("products");
  render();
}
function categoryChoices() {
  return [...new Set([...MotifCatalog.productTypes, ...products.flatMap(MotifCatalog.categoriesOf)])];
}
async function saveFabricOption(label) {
  const saved = await api("/api/products/admin/fabrics", { method: "POST", body: JSON.stringify({ label }) });
  fabricChoices = [...new Set([...fabricChoices, saved])];
  return saved;
}
function appendChoiceEditor(box, title, save) {
  const row = el("div", null, "choice-editor");
  const label = el("label", title);
  const input = el("input");
  input.maxLength = save === saveFabricOption ? 80 : 100;
  label.append(input);
  const add = button("افزودن به فهرست", async () => {
    const value = input.value.trim();
    if (!value || add.disabled) return;
    add.disabled = true;
    try {
      const name = await save(value);
      if (!box.isConnected) return;
      const existing = [...box.querySelectorAll("input[type=checkbox]")].find(n => n.value === name);
      if (existing) existing.checked = true;
      else box.insertBefore(checkChoice(name, true), row);
      input.value = "";
      box.dispatchEvent(new Event("change", { bubbles: true }));
      notice("");
    } catch (err) {
      notice(err.message);
    } finally {
      add.disabled = false;
    }
  });
  input.onkeydown = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      add.click();
    }
  };
  row.append(label, add);
  box.append(row);
}
async function refresh() {
  const loaded = await api("/api/products/admin/list");
  products = loaded;
  render();
}
function formValid(draft = false) {
  for (const n of $("editor").querySelectorAll("[data-key]")) {
    if (
      n.matches("input,select,textarea") &&
      !(
        draft &&
        n.validity.valueMissing &&
        ["title", "color"].includes(n.dataset.key)
      ) &&
      !n.checkValidity()
    ) {
      const key = n.dataset.key;
      const st = Number(
        n.closest("[data-variant-stage]")?.dataset.variantStage ||
          n.closest("[data-step]")?.dataset.step ||
          1,
      );
      focusField(key, st);
      notice(n.validationMessage);
      return false;
    }
  }
  return true;
}
function publication() {
  if (busy || MotifImages.guard()) return;
  const issues = MotifReadiness.issues(snapshot());
  if (issues.length) {
    step = 5;
    showStep();
    review();
    $("review").hidden = false;
    notice("پیش از انتشار، موارد مشخص‌شده را تکمیل کنید.");
    return;
  }
  if (!formValid()) return;
  $("publishName").textContent = [
    snapshot().productCode,
    snapshot().title,
  ].join(" · ");
  $("publishDialog").showModal();
}
async function save(publish = false) {
  if (busy || MotifImages.guard()) return;
  syncInventory();
  const active =
    publish ||
    (editing &&
      $("productFields").querySelector("[data-key=isActive]").value === "true");
  if (!formValid(!active)) return;
  const data = snapshot();
  data.title = data.title || "";
  if (!editing) data.isActive = false;
  if (publish) {
    data.isActive = true;
    data.publicationIntent = true;
  }
  if (!data.variants.length) {
    notice(
      "برای ذخیره در سرور یک ردیف موجودی لازم است. اطلاعات نیمه‌کاره در همین زبانه حفظ می‌شود.",
    );
    cache();
    return;
  }
  if (data.isActive && !editing?.isActive && !publish) {
    publication();
    return;
  }
  // Stable productCode reconciles an uncertain POST before another create is attempted.
  if (!editing && !data.productCode) {
    focusField("productCode", 1);
    notice("برای جلوگیری از ثبت تکراری، کد یکتا را وارد کنید.");
    return;
  }
  busy = true;
  $("editor").inert = true;
  $("save").disabled = true;
  $("publish").disabled = true;
  notice("در حال ذخیره…");
  try {
    if (!editing && pendingCreateCode) {
      const existing = await api("/api/products/admin/list");
      const found = existing.find((p) => p.productCode === pendingCreateCode);
      if (found) {
        products = existing;
        busy = false;
        $("editor").inert = false;
        dirty = false;
        openEditor(found);
        notice(
          "ثبت قبلی در سرور پیدا شد؛ محصول بازیابی شد. تغییرات جدید را بررسی و ذخیره کنید.",
        );
        return;
      }
    }
    if (!editing) pendingCreateCode = data.productCode;
    const saved = await api(
      "/api/products" + (editing ? "/" + editing.id : ""),
      { method: editing ? "PATCH" : "POST", body: JSON.stringify(data) },
    );
    products = [saved, ...products.filter((p) => p.id !== saved.id)];
    dirty = false;
    clearTimeout(draftTimer);
    try {
      sessionStorage.removeItem(recoveryKey);
    } catch {}
    busy = false;
    $("editor").inert = false;
    openEditor(saved);
    render();
    $("saveSuccess").hidden = false;
    notice("محصول ذخیره شد.");
    return saved;
  } catch (err) {
    notice(err.message);
    busy = false;
    cache();
  } finally {
    busy = false;
    $("editor").inert = false;
    $("save").disabled = false;
    $("publish").disabled = false;
  }
}
const c22Targets = ["identityHistory", "identityDesign", "identityUseCases"];
const productInput = (key) => $("productFields").querySelector('[data-key="' + key + '"]');
const comparableBrand = (value) => (value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
function syncC22() {
  $("c22Actions").hidden = !c22Transfer && !c22Enabled;
  $("openC22").disabled = !c22Enabled;
  $("openC22").textContent = editing ? "تحلیل و تحقیق محصول" : "ذخیره پیش‌نویس و شروع تحلیل";
  $("clearC22").hidden = !c22Transfer;
  for (const key of c22Targets) {
    const input = productInput(key);
    if (input) input.readOnly = c22Transfer?.keys.includes(key) ?? false;
  }
}

$("openC22").onclick = async () => {
  if (!c22Enabled || busy) return;
  const product = editing || await save();
  if (!product || editing !== product || busy) return;
  $("openC22").disabled = true;
  try {
    const dossier = await api("/api/admin/smart-panel/store/products/" + product.id + "/dossier", { method: "POST" });
    if (editing !== product || $("workspace").hidden || $("editor").hidden) return;
    $("c22Frame").src = "/smart-panel/?product=1#dossier=" + dossier.id;
    $("c22Dialog").showModal();
  } catch (err) {
    notice(err.message);
  } finally { syncC22(); }
};
$("closeC22").onclick = () => $("c22Dialog").close();
$("c22Dialog").addEventListener("close", () => $("c22Frame").removeAttribute("src"));
$("clearC22").onclick = () => {
  for (const key of c22Transfer.keys) productInput(key).value = "";
  c22Transfer = null;
  syncC22();
  mark();
};

window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin || event.source !== $("c22Frame").contentWindow ||
      !$("c22Dialog").open || !["motif-c22-transfer", "motif-c22-specs", "motif-c22-gallery"].includes(event.data?.type) ||
      !/^[a-f0-9-]{36}$/.test(event.data.id) || !editing) return;
  const product = editing;
  try {
    const transfer = await api("/api/admin/smart-panel/dossiers/" + event.data.id + "/store-transfer");
    if (editing !== product || !$("c22Dialog").open) return;
    if (transfer.productId !== product.id || transfer.updatedAt !== product.updatedAt ||
        transfer.version !== event.data.version) {
      throw Error("نسخهٔ پرونده یا برند با فرم محصول یکسان نیست. اطلاعات را بررسی کنید.");
    }
    if (c22Transfer && c22Transfer.version !== transfer.version) {
      if (c22Transfer.id !== transfer.id || c22Transfer.keys.some(key =>
        productInput(key).value !== transfer.sections[key])) {
        throw Error("متن پیشنهادی تغییر کرده است؛ ابتدا متن‌های قبلی فرم را بررسی کنید.");
      }
      c22Transfer = { ...c22Transfer, version: transfer.version };
    }
    if (event.data.type === "motif-c22-gallery") {
      const input = productInput("images");
      const existing = input.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
      const images = [...new Set([...existing, ...(transfer.gallery || [])])];
      input.value = images.join("\n");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      mark();
      $("c22Dialog").close();
      input.closest("details").open = true;
      notice("عکس‌ها به فرم اضافه شدند؛ عکس‌های قبلی محفوظ‌اند. ترتیب و حذف را بررسی و سپس پیش‌نویس را ذخیره کنید.");
      return;
    }
    if (event.data.type === "motif-c22-specs") {
      const suggestions = transfer.suggestions || {};
      const brand = productInput("brand");
      const type = productInput("productType");
      const categories = productInput("mainCategories");
      const category = [...categories.querySelectorAll('input[type="checkbox"]')].find(input =>
        input.value === suggestions.productType && MotifCatalog.productTypes.includes(input.value));
      const canSetBrand = suggestions.brand && !brand.value.trim();
      const canSetType = category && !type.value && !categories.querySelector("input:checked");
      const fabrics = productInput("fabrics");
      const fabric = [...fabrics.querySelectorAll('input[type="checkbox"]')].find(input =>
        input.value === suggestions.fabric && MotifCatalog.fabrics.includes(input.value));
      const canSetFabric = fabric && !fabrics.querySelector("input:checked") &&
        productInput("fabricBasis").value === "UNKNOWN" && !productInput("fabricNote").value.trim();
      if (!canSetBrand && !canSetType && !canSetFabric) throw Error("فیلد خالی برای درج پیشنهاد وجود ندارد.");
      if (canSetBrand) brand.value = suggestions.brand;
      if (canSetFabric) {
        fabric.checked = true;
        productInput("fabricBasis").value = "LABEL";
      }
      if (canSetType) {
        category.checked = true;
        categories.dispatchEvent(new Event("change", { bubbles: true }));
        type.value = category.value;
        type.dispatchEvent(new Event("change", { bubbles: true }));
      }
      mark();
      $("c22Dialog").close();
      notice("پیشنهادها در فرم قرار گرفتند. برای ثبت آن‌ها، پیش‌نویس را ذخیره کنید.");
      return;
    }
    if (comparableBrand(transfer.brand) !== comparableBrand(productInput("brand").value)) {
      throw Error("برند پرونده با برند فرم محصول یکسان نیست.");
    }
    if (c22Transfer && (c22Transfer.id !== transfer.id || c22Transfer.version !== transfer.version)) {
      throw Error("ابتدا پیشنهاد قبلی را از فرم حذف کنید.");
    }
    const keys = c22Targets.filter(key => transfer.sections[key] && !productInput(key).value.trim());
    if (!keys.length) throw Error("فیلد خالی برای انتقال بخش تأییدشده وجود ندارد.");
    for (const key of keys) productInput(key).value = transfer.sections[key];
    c22Transfer = { id: transfer.id, version: transfer.version, keys: [...new Set([...(c22Transfer?.keys || []), ...keys])] };
    syncC22();
    mark();
    $("c22Dialog").close();
    productInput(keys[0]).closest("details").open = true;
    productInput(keys[0]).focus();
    notice("متن پیشنهادی در فرم قرار گرفت. برای ثبت آن، محصول را ذخیره کنید.");
  } catch (err) {
    $("c22Dialog").close();
    notice(err.message);
  }
});

async function showWorkspace(session) {
  const [, fabricLoadFailed] = await Promise.all([
    refresh(),
    api("/api/products/admin/fabrics").then(choices => {
      if (Array.isArray(choices) && choices.every(label => typeof label === "string")) fabricChoices = choices;
      return false;
    }, () => true),
  ]);
  c22Enabled = await api("/api/admin/smart-panel/store/status").then(result => result.enabled === true, () => false);
  syncC22();
  recoveryKey = session.recoveryKey;
  $("login").hidden = true;
  $("workspace").hidden = false;
  notice(fabricLoadFailed ? "دریافت فهرست جنس‌های سفارشی ممکن نشد." : "");
  if (suspended) {
    suspended = false;
    return;
  }
  display("dashboard");
  let recovery;
  try {
    recovery = JSON.parse(sessionStorage.getItem(recoveryKey));
  } catch {}
  if (recovery) {
    const old = products.find(p => p.id === recovery.id);
    if (recovery.id && !old) notice("محصول پیش‌نویس بازیابی پیدا نشد؛ فهرست را بررسی کنید.");
    else if (old && old.updatedAt !== recovery.base)
      notice("نسخه سرور تغییر کرده است؛ برای جلوگیری از بازنویسی، نسخه جاری را باز کنید.");
    else if (confirm("فرم ذخیره‌نشدهٔ قبلی بازیابی شود؟")) openEditor(old || null, recovery);
  }
}

async function migrateRecovery(password, destination) {
  try {
    if (sessionStorage.getItem(destination) || !crypto.subtle) return;
    if (!Object.keys(sessionStorage).some(key => /^motif-admin-recovery-[a-f0-9]{64}$/.test(key))) return;
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const oldKey = "motif-admin-recovery-" + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
    const data = sessionStorage.getItem(oldKey);
    if (data) {
      sessionStorage.setItem(destination, data);
      sessionStorage.removeItem(oldKey);
    }
  } catch {}
}

MotifAdminSession.onEnd(message => {
  if (dirty) cache(true);
  suspended = !$("workspace").hidden || suspended;
  $("publishDialog").close();
  $("c22Dialog").close();
  $("workspace").hidden = true;
  $("login").hidden = false;
  notice(message);
});
const loginButton = $("loginForm").querySelector("button");
$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  if (loginButton.disabled) return;
  const password = $("token").value;
  $("token").value = "";
  loginButton.disabled = true;
  try {
    const session = await MotifAdminSession.login(password);
    await migrateRecovery(password, session.recoveryKey);
    await showWorkspace(session);
  } catch (err) {
    notice(err.message);
  } finally {
    loginButton.disabled = false;
  }
};
$("logout").onclick = async () => {
  if (!leave()) return;
  $("logout").disabled = true;
  try {
    await MotifAdminSession.logout();
    try { sessionStorage.removeItem(recoveryKey); } catch {}
    recoveryKey = "";
    suspended = false;
    products = [];
    fabricChoices = MotifCatalog.fabrics;
    editing = null;
    $("productFields").replaceChildren();
    $("list").replaceChildren();
    $("workspace").hidden = true;
    $("login").hidden = false;
    notice("");
  } catch (err) {
    notice(err.message);
  } finally {
    $("logout").disabled = false;
  }
};
$("siteButton").onclick = () => {
  if (!leave()) return;
  display("settings");
  void loadShippingSettings();
  void loadCardSettings();
  void loadCheckoutOrders();
  $("settings").hidden = true;
  MotifSiteAdmin.open(products);
};
$("newProduct").onclick = () => openEditor();
$("nextProduct").onclick = () => openEditor();
$("allProducts").onclick = () => filterList("all");
$("cancel").onclick = () => navigate("products");
$("reload").onclick = () => {
  if (busy) return;
  refresh()
    .then(() => notice("اطلاعات تازه شد."))
    .catch((e) => notice(e.message));
};
for (const id of ["search", "filter", "categoryFilter", "gradeFilter", "sort"])
  $(id).addEventListener(id === "search" ? "input" : "change", () => {
    page = 1;
    render();
  });
$("prevPage").onclick = () => {
  page--;
  render();
};
$("nextPage").onclick = () => {
  page++;
  render();
};
$("nextStep").onclick = () => {
  step = Math.min(5, step + 1);
  showStep();
  cache();
  $("editorTitle").scrollIntoView({ block: "start" });
};
$("backStep").onclick = () => {
  step = Math.max(1, step - 1);
  showStep();
};
$("save").onclick = () => save();
$("publish").onclick = publication;
$("confirmPublish").onclick = () => {
  $("publishDialog").close();
  save(true);
};
$("cancelPublish").onclick = () => $("publishDialog").close();
$("editor").onsubmit = (e) => {
  e.preventDefault();
};
$("editor").addEventListener("input", mark);
$("editor").addEventListener("change", (event) => {
  mark();
  if (
    ["qualityGrade", "itemGrade", "defect", "itemDefect"].includes(
      event.target.dataset.key,
    )
  )
    showStep();
  if (!editing && step === 5) review();
});
window.addEventListener("beforeunload", (e) => {
  if (dirty || busy) {
    cache();
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("offline", () => {
  if (!$("workspace").hidden)
    notice("اینترنت قطع است؛ اطلاعات فرم حفظ می‌شود. پس از اتصال دوباره تلاش کنید.");
});
window.addEventListener("online", () => {
  if (!$("workspace").hidden)
    notice("اتصال برقرار شد؛ می‌توانید عملیات ناموفق را دوباره انجام دهید.");
});

function cacheOnSuspend() {
  if (dirty) cache(true);
}
window.addEventListener("pagehide", cacheOnSuspend);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cacheOnSuspend();
});
loginButton.disabled = true;
MotifAdminSession.restore().then(showWorkspace).catch(err => {
  if (err.code !== "SESSION_REQUIRED") notice(err.message);
}).finally(() => { loginButton.disabled = false; });

let shippingRevision=null,shippingProvinces=[];
function shippingRuleRow(rule={}){
  const row=el('fieldset');row.className='two-fields';row.dataset.shippingRule='true';
  for(const[name,label,type]of [['province','استان','select'],['city','شهر؛ * یعنی همه شهرهای استان','text'],['fee','مبلغ کامل و قطعی ارسال، تومان','number'],['maxItems','حداکثر تعداد کالا','number'],['maxGoodsTomans','حداکثر ارزش کالا، تومان','number'],['minGrams','حداقل وزن بسته، گرم','number'],['maxGrams','حداکثر وزن بسته، گرم','number'],['maxLengthMm','حداکثر طول، میلی‌متر','number'],['maxWidthMm','حداکثر عرض، میلی‌متر','number'],['maxHeightMm','حداکثر ارتفاع، میلی‌متر','number']]){
    const box=el('label',label),field=el(type==='select'?'select':'input');field.dataset.field=name;field.required=true;
    if(type==='select')for(const p of shippingProvinces){const o=el('option',p);o.value=p;field.append(o);}
    else{field.type=type;if(type==='number'){field.min='1';field.max=name==='maxItems'?'100':'2147483647';field.step='1';}else field.maxLength=80;}
    field.value=rule[name]??(name==='city'?'*':'');box.append(field);row.append(box);
  }
  for(const [key,label] of [['freight','کرایه'],['packing','بسته‌بندی'],['insurance','بیمه'],['other','سایر هزینه‌های ضروری'],['margin','حاشیه احتیاط مورد تأیید مالک']]){
    const box=el('label',label+'، تومان'),field=el('input');field.type='number';field.min='0';field.max='2147483647';field.step='1';field.required=true;field.dataset.cost=key;field.value=rule.costs?.[key]??'';box.append(field);row.append(box);
  }
  const fee=row.querySelector('[data-field="fee"]');fee.readOnly=true;
  row.addEventListener('input',()=>{const parts=[...row.querySelectorAll('[data-cost]')];fee.value=parts.every(x=>Number.isInteger(x.valueAsNumber)&&x.valueAsNumber>=0)?parts.reduce((sum,x)=>sum+x.valueAsNumber,0):'';});
  const remove=el('button','حذف ردیف');remove.type='button';remove.onclick=()=>row.remove();row.append(remove);return row;
}
async function loadShippingSettings(){
  const form=$('shippingSettings');form.hidden=true;
  try{
    const data=await api('/api/checkout/shipping/tariff');if(!Array.isArray(data.provinces))return;
    shippingProvinces=data.provinces;const t=data.tariff;shippingRevision=t?.id||null;
    form.elements.originProvince.replaceChildren(...shippingProvinces.map(p=>{const o=el('option',p);o.value=p;return o;}));
    for(const name of ['source','carrier','originProvince','originCity'])form.elements[name].value=t?.[name]||({carrier:'POST_PISHTAZ',originProvince:'البرز',originCity:'کرج'}[name]||'');
    const localDate=v=>{const d=new Date(v);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
    form.elements.validFrom.value=localDate(t?.validFrom||Date.now());form.elements.validUntil.value=t?localDate(t.validUntil):'';
    form.elements.allInclusive.checked=false;form.elements.merchantCoversDifference.checked=false;form.elements.ownerApproved.checked=false;
    $('shippingRules').replaceChildren(...(t?.rules||shippingProvinces.map(province=>({province,city:'*'}))).map(shippingRuleRow));
    $('shippingStatus').textContent=t?'نسخه فعلی: '+t.id:'تعرفه‌ای ثبت نشده است؛ مبلغ واقعی را از روی حدس درج نکنید.';form.hidden=false;
  }catch(error){$('shippingStatus').textContent=error.message;}
}
$('addShippingRule').onclick=()=>$('shippingRules').append(shippingRuleRow());
$('shippingSettings').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
    const body={ownerApproved:form.elements.ownerApproved.checked,expectedTariffId:shippingRevision,allInclusive:form.elements.allInclusive.checked,merchantCoversDifference:form.elements.merchantCoversDifference.checked};
    for(const name of ['source','carrier','originProvince','originCity'])body[name]=form.elements[name].value.trim();
    for(const name of ['validFrom','validUntil'])body[name]=new Date(form.elements[name].value).toISOString();
    body.rules=[...$('shippingRules').children].map(row=>({...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(field=>[field.dataset.field,field.type==='number'?field.valueAsNumber:field.value])),costs:Object.fromEntries([...row.querySelectorAll('[data-cost]')].map(field=>[field.dataset.cost,field.valueAsNumber]))}));
    await api('/api/checkout/shipping/tariff',{method:'POST',body:JSON.stringify(body)});
    await loadShippingSettings();$('shippingStatus').textContent='نسخه جدید ذخیره شد؛ مبلغ سفارش‌های قبلی حفظ شد.';
  }catch(error){$('shippingStatus').textContent=error.message;}finally{button.disabled=false;}
});

const transferBase = '/api/checkout/card-transfer';
const checkoutStatuses = {
  PENDING: 'در انتظار پرداخت', PAID: 'پرداخت‌شده', PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال‌شده', DELIVERED: 'تحویل‌شده', CANCELED: 'لغوشده',
};
async function loadCardSettings() {
  const form = $('cardSettings');
  form.hidden = true;
  try {
    const settings = await api(transferBase + '/settings');
    form.elements.cardNumber.value = settings.cardNumber;
    form.elements.accountHolder.value = settings.accountHolder;
    form.elements.enabled.checked = settings.enabled;
    form.hidden = false;
  } catch {}
}
$('cardSettings').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = event.currentTarget.elements;
  try {
    await api(transferBase + '/settings', { method: 'PUT', body: JSON.stringify({
      cardNumber: fields.cardNumber.value.trim(), accountHolder: fields.accountHolder.value.trim(), enabled: fields.enabled.checked,
    }) });
    $('cardSettingsStatus').textContent = 'حساب مقصد ذخیره شد.';
  } catch (error) { $('cardSettingsStatus').textContent = error.message; }
});

async function loadCheckoutOrders(after) {
  try {
    const data = await api(transferBase + '/orders' + (after ? '?after=' + encodeURIComponent(after) : ''));
    $('checkoutOrders').hidden = false;
    const list = $('checkoutOrderList');
    if (!after) list.replaceChildren();
    for (const order of data.orders) list.append(renderCheckoutOrder(order));
    $('moreCheckoutOrders').hidden = !data.next;
    $('moreCheckoutOrders').onclick = () => loadCheckoutOrders(data.next);
  } catch (error) { $('checkoutOrderStatus').textContent = error.message; }
}
function renderCheckoutOrder(order) {
  const element = document.createElement('article');
  const receiver = order.checkout;
  const url = transferBase + '/orders/' + encodeURIComponent(order.id);
  const line = text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    element.append(paragraph);
  };
  const action = (label, callback, refresh = true) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = async () => {
      button.disabled = true;
      try {
        await callback();
        $('checkoutOrderStatus').textContent = '';
        if (refresh) await loadCheckoutOrders();
      } catch (error) {
        $('checkoutOrderStatus').textContent = error.message;
      } finally { button.disabled = false; }
    };
    element.append(button);
  };
  const update = (path, method, body) => api(path, { method, body: JSON.stringify(body) });
  line(order.id + ' · ' + checkoutStatuses[order.status]);
  line(receiver.fullName + ' · ' + receiver.phone + ' · ' + [receiver.province, receiver.city, receiver.address, receiver.postalCode].join('، '));
  line('مبلغ سفارش ' + order.totalPrice.toLocaleString('fa-IR') + ' تومان');
  const transfer = order.payment?.cardTransfer;
  line(order.payment?.isSuccessful ? 'پرداخت تأیید شده' : transfer?.rejected ? 'رسید رد شده' : transfer ? 'رسید در انتظار بررسی' : 'رسید ثبت نشده');
  if (transfer) {
    action('دریافت رسید', async () => {
      const response = await MotifAdminSession.request(url + '/receipt');
      if (!response.ok) throw Error('دریافت رسید ممکن نیست.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'receipt.jpg';
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    }, false);
    if (!transfer.reviewedAt) {
      action('تأیید پرداخت', async () => {
        if (!confirm('واریز و مبلغ را در حساب بانکی بررسی کرده‌اید؟')) return;
        await update(url + '/review', 'POST', { approved: true });
      });
      action('رد رسید و لغو سفارش', async () => {
        if (!confirm('رسید رد و موجودی سفارش آزاد شود؟')) return;
        await update(url + '/review', 'POST', { approved: false });
      });
    }
  }
  const next = { PAID: 'PROCESSING', PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED' }[order.status];
  if (next) action(checkoutStatuses[next], () => update('/api/orders/' + encodeURIComponent(order.id) + '/status', 'PATCH', { status: next }));
  if (order.shipmentTrackingCode) line('کد مرسوله ' + order.shipmentTrackingCode);
  if (order.status === 'SHIPPED') {
    const code = document.createElement('input');
    code.setAttribute('aria-label', 'کد رهگیری مرسوله');
    code.value = order.shipmentTrackingCode || '';
    element.append(code);
    action('ذخیره کد مرسوله', () => update(url + '/shipment', 'PATCH', { shipmentTrackingCode: code.value }));
  }
  return element;
}
