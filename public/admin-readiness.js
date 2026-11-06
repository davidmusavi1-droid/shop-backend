(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MotifReadiness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function issues(p) {
    const out = [],
      add = (key, label, step = 1) => out.push({ key, label, step });
    for (const [key, label] of [
      ["productCode", "کد یکتا"],
      ["title", "نام محصول"],
      ["productType", "نوع محصول"],
      ["brand", "برند"],
      ["mainFabric", "جنس اصلی"],
    ])
      if (!String(p[key] || "").trim()) add(key, label);
    if (!p.qualityGrade) add("qualityGrade", "گرید کیفیت", 3);
    if (!Number.isInteger(p.basePrice) || p.basePrice <= 0)
      add("basePrice", "قیمت پایه بیشتر از صفر", 3);
    if (!p.images?.length) add("images", "حداقل یک تصویر اصلی", 4);
    if (!p.variants?.length) add("variants", "ردیف موجودی", 2);
    for (const [i, v] of (p.variants || []).entries()) {
      for (const key of ["color", "sku"])
        if (!String(v[key] || "").trim())
          add(key, `سایز ${i + 1}: ${key === "color" ? "رنگ" : "SKU"}`, 2);
      if (!Number.isInteger(v.stock) || v.stock < 0)
        add("stock", `سایز ${i + 1}: موجودی معتبر`, 3);
      const keys =
        p.productType === "شلوار"
          ? [
              ["waistCm", "دور کمر"],
              ["riseCm", "فاق"],
              ["totalLengthCm", "قد کل"],
              ["thighWidthCm", "عرض ران"],
              ["hemWidthCm", "عرض دمپا"],
            ]
          : [
              ["chestWidthCm", "عرض سینه"],
              ["lengthCm", "قد لباس"],
              ["sleeveFromNeckCm", "طول آستین"],
            ];
      for (const [key, label] of keys)
        if (!(Number(v[key]) > 0)) add(key, `سایز ${i + 1}: ${label}`, 2);
      if (v.itemDefect?.trim() && !v.itemDefectImages?.length)
        add("itemDefectImages", `سایز ${i + 1}: عکس ایراد`, 4);
    }
    if (p.defect?.trim() && !p.defectImages?.length)
      add("defectImages", "عکس ایراد ثبت‌شده", 4);
    return out;
  }
  const status = (p) =>
    p.isActive ? "published" : issues(p).length ? "incomplete" : "ready";
  return { issues, status };
});
