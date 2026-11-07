"use strict";
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
let token = "",
  products = [],
  fabricChoices = MotifCatalog.fabrics,
  editing = null,
  step = 1,
  page = 1,
  dirty = false,
  busy = false,
  recoveryKey = "",
  draftTimer,
  baseline = "",
  pendingCreateCode = null;
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
  }
  return data;
}
function cache() {
  if (!recoveryKey || $("editor").hidden || busy) return;
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
  if (p && !source.productType) {
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
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Admin-Token": token },
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
$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  token = $("token").value;
  $("loginForm").querySelector("button").disabled = true;
  try {
    await refresh();
    let fabricLoadFailed = false;
    try {
      const choices = await api("/api/products/admin/fabrics");
      if (Array.isArray(choices) && choices.every(label => typeof label === "string")) fabricChoices = choices;
    } catch {
      fabricLoadFailed = true;
    }
    if (crypto.subtle) {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      recoveryKey =
        "motif-admin-recovery-" +
        Array.from(new Uint8Array(hash))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
    } else recoveryKey = "";
    $("token").value = "";
    $("login").hidden = true;
    $("workspace").hidden = false;
    display("dashboard");
    notice(fabricLoadFailed ? "دریافت فهرست جنس‌های سفارشی ممکن نشد. برای تلاش دوباره وارد پنل شوید." : "");
    let recovery;
    try {
      recovery = JSON.parse(sessionStorage.getItem(recoveryKey));
    } catch {}
    if (recovery) {
      const old = products.find((p) => p.id === recovery.id);
      if (recovery.id && !old)
        notice("محصول پیش‌نویس بازیابی پیدا نشد؛ فهرست را بررسی کنید.");
      else if (old && old.updatedAt !== recovery.base)
        notice(
          "نسخه سرور تغییر کرده است؛ برای جلوگیری از بازنویسی، نسخه جاری را باز کنید.",
        );
      else if (confirm("فرم ذخیره‌نشدهٔ قبلی بازیابی شود؟"))
        openEditor(old || null, recovery);
    }
  } catch (err) {
    token = "";
    notice(err.message);
  } finally {
    $("loginForm").querySelector("button").disabled = false;
  }
};
$("logout").onclick = () => {
  if (!leave()) return;
  try {
    sessionStorage.removeItem(recoveryKey);
  } catch {}
  token = "";
  recoveryKey = "";
  products = [];
  fabricChoices = MotifCatalog.fabrics;
  editing = null;
  $("productFields").replaceChildren();
  $("list").replaceChildren();
  $("workspace").hidden = true;
  $("login").hidden = false;
  notice("");
};
$("siteButton").onclick = () => {
  if (!leave()) return;
  display("settings");
  $("settings").hidden = true;
  MotifSiteAdmin.open(() => token, products);
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
window.addEventListener("offline", () =>
  notice(
    "اینترنت قطع است؛ اطلاعات فرم حفظ می‌شود. پس از اتصال دوباره تلاش کنید.",
  ),
);
window.addEventListener("online", () =>
  notice("اتصال برقرار شد؛ می‌توانید عملیات ناموفق را دوباره انجام دهید."),
);
