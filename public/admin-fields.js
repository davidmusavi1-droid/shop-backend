const fields = [
  ["productType", "دسته اصلی", "suggest", MotifCatalog.productTypes],
  ["productCode", "کد یکتای محصول (مثلاً MOTIF-004)"],
  ["title", "نام محصول", "text"],
  ["brand", "برند"],
  ["modelName", "مدل"],
  ["mainFabric", "جنس اصلی پارچه", "suggest", MotifCatalog.fabrics],
  [
    "complementaryFabrics",
    "جنس مکمل (چندانتخابی)",
    "multi",
    MotifCatalog.fabrics,
  ],
  [
    "garmentDesign",
    "مدل و طراحی لباس",
    "suggest",
    ["نیم‌زیپ", "تمام‌زیپ", "یقه‌گرد"],
  ],
  [
    "hasHood",
    "کلاه",
    "select",
    [
      ["", "نامشخص"],
      ["true", "دارد"],
      ["false", "ندارد"],
    ],
  ],
  ["seasons", "فصل استفاده", "multi", MotifCatalog.seasons],
  ["uses", "کاربرد محصول", "multi", MotifCatalog.uses],
  ["fabricTechnology", "فناوری واقعی پارچه (فقط مستند)"],
  [
    "technologyVerified",
    "تأیید مستندات فناوری توسط مدیر",
    "select",
    [
      ["false", "تأیید نشده"],
      ["true", "تأیید می‌کنم"],
    ],
  ],
  ["technologyEvidence", "مستندات فناوری پارچه", "textarea"],
  ["fabricNote", "یادداشت جنس؛ نامشخص یا توصیف غیرقطعی", "textarea"],
  ["basePrice", "قیمت پایه (تومان)", "money"],
  [
    "inventoryMode",
    "نوع موجودی",
    "select",
    [
      ["SINGLE", "تک‌آیتمی"],
      ["MULTI", "چندسایزی"],
    ],
  ],
  [
    "isActive",
    "نمایش محصول",
    "select",
    [
      ["true", "فعال"],
      ["false", "غیرفعال"],
    ],
  ],
  ["description", "توضیحات", "textarea"],
  ["images", "تصاویر HTTPS؛ هر لینک در یک خط", "textarea"],
  ["customerNeeds", "نیاز مشتری؛ یک یا چند مورد", "needs"],
  ["qualityGrade", "گرید", "grade"],
  ["condition", "وضعیت"],
  ["defect", "ایراد مشخص؛ برای انتشار نیازمند عکس مرتبط", "textarea"],
  ["defectImages", "تصاویر اختصاصی ایراد", "images"],
  ["identityOrigin", "خاستگاه", "textarea"],
  ["identityHistory", "تاریخچه", "textarea"],
  ["identityPurpose", "هدف طراحی", "textarea"],
  ["identityUseCases", "کاربردها", "textarea"],
  ["identityDesign", "طراحی", "textarea"],
  ["identityTechnical", "ویژگی فنی", "textarea"],
  ["identitySources", "منابع", "textarea"],
];
const variantFields = [
  ["size", "سایز لیبل (برای تک‌آیتمی می‌تواند نامشخص باشد)"],
  ["color", "رنگ"],
  ["sku", "SKU"],
  ["stock", "موجودی قابل فروش", "number"],
  ["priceDelta", "اختلاف قیمت (تومان)", "money"],
  ["chestWidthCm", "عرض زیربغل تا زیربغل، روی سطح صاف (cm)", "measure"],
  ["lengthCm", "قد لباس (cm)", "measure"],
  [
    "sleeveFromNeckCm",
    "طول آستین از کنار گردن تا انتهای سرآستین، با احتساب مسیر شانه (cm)",
    "measure",
  ],
  ["waistCm", "دور کمر (cm)", "measure"],
  ["waistWidthCm", "عرض کمر روی سطح صاف، بدون کشش (cm)", "measure"],
  ["riseCm", "فاق (cm)", "measure"],
  ["totalLengthCm", "قد شلوار (cm)", "measure"],
  ["thighWidthCm", "عرض ران (cm)", "measure"],
  ["hemWidthCm", "عرض دمپا (cm)", "measure"],
  ["itemGrade", "گرید این سایز", "grade"],
  ["itemCondition", "وضعیت این سایز"],
  ["itemDefect", "ایراد این سایز"],
  ["itemDefectImages", "تصاویر اختصاصی ایراد این سایز", "images"],
  ["itemImages", "تصاویر این سایز HTTPS؛ هر لینک در یک خط", "textarea"],
];
function notice(text) {
  $("message").textContent = text;
  $("message").hidden = !text;
}
function control(spec, value) {
  const [key, title, type, options] = spec;
  if (
    ["images", "itemImages", "defectImages", "itemDefectImages"].includes(key)
  )
    return MotifImages.control(key, title, value, () => token);
  const label = document.createElement("label");
  label.append(document.createTextNode(title));
  if (type === "needs" || type === "multi") {
    const box = document.createElement("fieldset");
    box.dataset.key = key;
    const legend = document.createElement("legend");
    legend.textContent = title;
    box.append(legend);
    for (const n of [
      ...new Set([...(options || MotifCatalog.needs), ...(value || [])]),
    ]) {
      const l = document.createElement("label"),
        c = document.createElement("input");
      c.type = "checkbox";
      c.value = n;
      c.checked = (value || []).includes(n);
      c.style.cssText = "display:inline-block;width:auto;margin:0 8px";
      l.append(
        c,
        document.createTextNode(
          n +
            ((options || MotifCatalog.needs).includes(n)
              ? ""
              : " (برچسب قبلی؛ بازبینی شود)"),
        ),
      );
      box.append(l);
    }
    return box;
  }
  const input = document.createElement(
    type === "textarea"
      ? "textarea"
      : type === "select" || type === "grade"
        ? "select"
        : "input",
  );
  input.dataset.key = key;
  if (type === "select" || type === "grade") {
    for (const [v, t] of options || [
      ["", "انتخاب نشده"],
      ...MotifCatalog.qualityGrades.map(([g, t]) => [
        g,
        MotifCatalog.gradeLetter(g) + " — " + t,
      ]),
    ]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      input.append(o);
    }
  } else if (type === "number" || type === "measure") {
    input.type = "number";
    input.step = type === "measure" ? "0.1" : "1";
    if (key !== "priceDelta") input.min = type === "measure" ? "0.1" : "0";
  }
  if (["title", "basePrice", "size", "color", "sku", "stock"].includes(key))
    input.required = true;
  input.value = Array.isArray(value)
    ? value.join(["images", "itemImages"].includes(key) ? "\n" : "، ")
    : (value ?? "");
  if (type === "suggest") {
    const list = document.createElement("datalist");
    list.id = "options-" + key;
    for (const v of [...new Set([...(options || []), value].filter(Boolean))]) {
      const o = document.createElement("option");
      o.value = v;
      list.append(o);
    }
    input.setAttribute("list", list.id);
    label.append(list);
  }
  if (type === "money") {
    input.type = "text";
    input.inputMode = "numeric";
    input.dir = "ltr";
    input.value = MotifCatalog.formatPriceInput(value ?? 0);
    input.oninput = () => {
      const pos = input.selectionStart,
        old = input.value,
        digits = old.slice(0, pos).replace(/[,٬\s]/g, "").length;
      input.value = MotifCatalog.formatPriceInput(old);
      let i = 0,
        count = 0;
      while (i < input.value.length && count < digits) {
        if (input.value[i] !== ",") count++;
        i++;
      }
      input.setSelectionRange(i, i);
    };
  }
  label.append(input);
  return label;
}
function variantNode(container, key) {
  return (
    container._controls?.[key] ||
    container.querySelector('[data-key="' + key + '"]')
  );
}
function read(container, specs) {
  const data = {};
  for (const [key, , type] of specs) {
    if (type === "needs" || type === "multi") {
      data[key] = [
        ...container.querySelectorAll('[data-key="' + key + '"] input:checked'),
      ].map((n) => n.value);
      continue;
    }
    const v = variantNode(container, key).value.trim();
    data[key] =
      type === "money"
        ? MotifCatalog.priceNumber(v)
        : type === "number"
          ? Number(v)
          : type === "measure"
            ? v === ""
              ? null
              : Number(v)
            : [
                  "images",
                  "itemImages",
                  "defectImages",
                  "itemDefectImages",
                ].includes(key)
              ? v.split(/\r?\n/).filter(Boolean)
              : ["styles", "customerNeeds"].includes(key)
                ? v
                    .split(/[,،]/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                : key === "hasHood"
                  ? v === ""
                    ? null
                    : v === "true"
                  : ["isActive", "technologyVerified"].includes(key)
                    ? v === "true"
                    : v || null;
  }
  return data;
}
function addVariant(v = { stock: 1, priceDelta: 0 }) {
  const box = document.createElement("fieldset");
  if (v.id) {
    box.dataset.id = v.id;
    box.dataset.expectedStock = v.stock;
  }
  const grid = document.createElement("div");
  grid.className = "grid";
  for (const spec of variantFields)
    grid.append(
      control(
        spec,
        spec[2] === "measure" && !(v[spec[0]] > 0) ? null : v[spec[0]],
      ),
    );
  box.append(grid);
  if (v.waistCm > 0) {
    const note = document.createElement("p");
    note.textContent =
      "اندازهٔ کمر قبلی: " +
      v.waistCm +
      " سانتی‌متر؛ در فیلتر عرض کمر استفاده نمی‌شود. عرض کمر را دوباره روی سطح صاف اندازه بگیرید.";
    box.append(note);
  }
  if (!v.id) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "حذف این سایز جدید";
    remove.onclick = () => {
      if (MotifImages.guard()) return;
      if ($("variants").children.length <= 1) {
        notice("حداقل یک ردیف برای ثبت موجودی لازم است.");
        return;
      }
      box._panels?.forEach((n) => n.remove());
      box.remove();
      syncInventory();
      mark();
    };
    box.append(remove);
  }
  $("variants").append(box);
  syncDefects(box, "itemGrade", "itemDefectImages", "itemDefect");
  syncInventory();
}
function syncDefects(container, gradeKey, imagesKey, defectKey) {
  const grade = container.querySelector('[data-key="' + gradeKey + '"]'),
    images = container.querySelector('[data-key="' + imagesKey + '"]'),
    defect = container.querySelector('[data-key="' + defectKey + '"]');
  if (!grade || !images) return;
  const update = () => {
    const selected =
      grade.value ||
      $("productFields").querySelector("[data-key=qualityGrade]")?.value;
    const host = images.closest(".image-editor");
    host.dataset.gradeHidden = String(
      !["B", "C"].includes(selected) &&
        !images.value.trim() &&
        !defect?.value.trim(),
    );
    host.hidden =
      host.dataset.gradeHidden === "true" ||
      (!editing &&
        host.dataset.variantStage &&
        Number(host.dataset.variantStage) !== step);
  };
  grade.addEventListener("change", update);
  defect?.addEventListener("input", update);
  if (gradeKey === "itemGrade")
    $("productFields")
      .querySelector("[data-key=qualityGrade]")
      .addEventListener("change", update);
  update();
}
function syncInventory() {
  const single =
    $("productFields").querySelector('[data-key="inventoryMode"]')?.value ===
    "SINGLE";
  $("addVariant").hidden = single;
  const boxes = [...$("variants").children];
  for (const box of boxes) {
    const size = variantNode(box, "size"),
      stock = variantNode(box, "stock"),
      sku = variantNode(box, "sku");
    size.required = !single;
    size.placeholder = single ? "نامشخص" : "";
    if (single) stock.max = "1";
    else stock.removeAttribute("max");
    const code = $("productFields")
      .querySelector('[data-key="productCode"]')
      .value.trim()
      .toUpperCase();
    if (
      single &&
      !box.dataset.id &&
      (!sku.value || sku.dataset.auto === "true")
    ) {
      sku.value = code;
      sku.dataset.auto = "true";
    }
    sku.oninput = () => {
      sku.dataset.auto = "false";
    };
  }
  const mode = $("productFields").querySelector('[data-key="inventoryMode"]');
  mode?.setCustomValidity(
    single && boxes.length !== 1
      ? "برای حالت تک‌آیتمی باید دقیقاً یک ردیف موجودی داشته باشید."
      : "",
  );
}
