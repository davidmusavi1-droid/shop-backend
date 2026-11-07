/* Images stay in product/variant arrays. Removing a reference never deletes storage. */
window.MotifImages = (() => {
  let pending = 0;
  function guard() {
    if (!pending) return false;
    alert("لطفاً تا پایان آپلود عکس‌ها صبر کنید.");
    return true;
  }
  window.addEventListener("beforeunload", (e) => {
    if (pending) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  function control(key, title, value) {
    const defect = /Defect|defect/.test(key),
      box = document.createElement("div");
    box.className = "image-editor";
    const node = (tag, text) => {
      const n = document.createElement(tag);
      if (text) n.textContent = text;
      return n;
    };
    const heading = node(
      "p",
      defect
        ? "تصاویر اختصاصی ایراد — مستقل از عکس‌های اصلی"
        : key === "images"
          ? "عکس‌های محصول"
          : "عکس‌های مخصوص این سایز",
    );
    const hint = node(
      "small",
      "عکس اول، عکس اصلی است. JPG، PNG یا WebP؛ ورودی تا ۱۰ مگابایت؛ خروجی سایت تا سقف ۳ مگابایت، بدون روتوش. تغییرات عکس‌ها با ذخیره محصول ثبت می‌شوند.",
    );
    const pickerLabel = node("label", "انتخاب عکس از گوشی یا رایانه"),
      picker = node("input");
    picker.type = "file";
    picker.accept = "image/jpeg,image/png,image/webp";
    picker.multiple = true;
    pickerLabel.append(picker);
    const status = node("p");
    status.setAttribute("role", "status");
    const gallery = node("div");
    gallery.className = "image-previews";
    const advanced = node("details"),
      summary = node("summary", "لینک عکس‌ها (اختیاری)"),
      links = node("textarea");
    links.dataset.key = key;
    links.setAttribute("aria-label", title);
    links.value = (value || []).join("\n");
    advanced.append(summary, links);
    const retry = node("button", "تلاش دوباره برای عکس‌های ناموفق");
    retry.type = "button";
    retry.hidden = true;
    let failed = [],
      targetIndex = null;
    const urls = () =>
      links.value
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    function set(items) {
      links.value = items.join("\n");
      links.dispatchEvent(new Event("change", { bubbles: true }));
      render();
    }
    function render() {
      gallery.replaceChildren();
      urls().forEach((url, index) => {
        const card = node("div"),
          img = node("img");
        img.alt = (defect ? "عکس ایراد " : "عکس محصول ") + (index + 1);
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        if (/^https:\/\//.test(url)) img.src = url;
        card.append(img);
        const actions = [
          [
            index === 0
              ? defect
                ? "اولین عکس ایراد"
                : "عکس اصلی"
              : defect
                ? "انتخاب به‌عنوان اولین عکس ایراد"
                : "انتخاب به‌عنوان اصلی",
            () => {
              const a = urls();
              a.unshift(a.splice(index, 1)[0]);
              set(a);
            },
            index === 0,
          ],
          [
            "بالاتر",
            () => {
              const a = urls();
              [a[index - 1], a[index]] = [a[index], a[index - 1]];
              set(a);
            },
            index === 0,
          ],
          [
            "پایین‌تر",
            () => {
              const a = urls();
              [a[index + 1], a[index]] = [a[index], a[index + 1]];
              set(a);
            },
            index === urls().length - 1,
          ],
          [
            "جایگزینی عکس",
            () => {
              targetIndex = index;
              picker.multiple = false;
              picker.click();
            },
            false,
          ],
          [
            "حذف از محصول",
            () => {
              if (
                confirm(
                  "این عکس از محصول برداشته شود؟ فایل اصلی در فضای عکس باقی می‌ماند.",
                )
              )
                set(urls().filter((_, i) => i !== index));
            },
            false,
          ],
        ];
        for (const [text, action, disabled] of actions) {
          const b = node("button", text);
          b.type = "button";
          b.disabled = pending > 0 || disabled;
          b.onclick = () => {
            if (!guard()) action();
          };
          card.append(b);
        }
        gallery.append(card);
      });
    }
    links.oninput = () => {
      links.dispatchEvent(new Event("change", { bubbles: true }));
      render();
    };
    async function upload(files, index = null) {
      if (guard() || !files.length) return;
      const code = document
        .querySelector("#productFields [data-key=productCode]")
        ?.value.trim()
        .toUpperCase();
      for (const f of files) {
        const match = f.name.toUpperCase().match(/MOTIF-\d+/);
        if (match && code && match[0] !== code) {
          status.textContent =
            "کد نام فایل " +
            f.name +
            " با کد این محصول یکسان نیست؛ عکس را بررسی کنید.";
          return;
        }
      }
      pending++;
      for (const id of ["save", "publish"]) {
        const b = document.getElementById(id);
        if (b) b.disabled = true;
      }
      picker.disabled = true;
      links.disabled = true;
      failed = [];
      retry.hidden = true;
      render();
      const errors = [];
      let success = 0;
      try {
        for (const [i, file] of files.entries()) {
          status.textContent = `در حال آپلود عکس ${i + 1} از ${files.length}…`;
          const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), 45000);
          try {
            if (file.size > 10 * 1024 * 1024) throw Error("بیش از ۱۰ مگابایت");
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
              throw Error("فرمت فایل پشتیبانی نمی‌شود");
            const form = new FormData();
            form.append("image", file);
            const response = await MotifAdminSession.request("/api/uploads/images", {
              method: "POST",
              body: form,
              signal: controller.signal,
            });
            let data;
            try {
              data = await response.json();
            } catch {
              throw Error(
                "پاسخ سرور آپلود قابل خواندن نیست؛ HTTP " + response.status,
              );
            }
            if (!response.ok) throw Error(data.error || "آپلود ناموفق");
            if (!/^https:\/\//.test(data.url || ""))
              throw Error("پاسخ نامعتبر از سرور");
            const items = urls();
            if (index !== null) items[index] = data.url;
            else items.push(data.url);
            set(items);
            success++;
          } catch (error) {
            failed.push(file);
            errors.push(
              file.name +
                ": " +
                (error.name === "AbortError"
                  ? "زمان آپلود تمام شد؛ دوباره تلاش کنید"
                  : error.message === "Failed to fetch"
                    ? "ارتباط قطع شد"
                    : error.message),
            );
          } finally {
            clearTimeout(timer);
          }
        }
      } finally {
        pending--;
        for (const id of ["save", "publish"]) {
          const b = document.getElementById(id);
          if (b) b.disabled = false;
        }
        picker.disabled = false;
        links.disabled = false;
        picker.value = "";
        picker.multiple = true;
        render();
        retry.hidden = !failed.length;
        status.textContent =
          (success
            ? `${success} عکس اضافه شد. برای ثبت نهایی، محصول را ذخیره کنید.`
            : "آپلود انجام نشد.") +
          (errors.length ? " " + errors.join("؛ ") : "");
      }
    }
    picker.onchange = () => {
      const index = targetIndex;
      targetIndex = null;
      retry.dataset.index = index === null ? "" : String(index);
      retry.dataset.targetUrl = index === null ? "" : urls()[index] || "";
      upload([...picker.files], index);
    };
    picker.oncancel = () => {
      targetIndex = null;
      picker.multiple = true;
    };
    retry.onclick = () => {
      const index =
        retry.dataset.index === ""
          ? null
          : urls().indexOf(retry.dataset.targetUrl);
      if (index === -1) {
        status.textContent =
          "عکس قبلی از فهرست برداشته شده است؛ برای جایگزینی، عکس موردنظر را دوباره انتخاب کنید.";
        return;
      }
      upload([...failed], index);
    };
    box.append(heading, hint, pickerLabel, status, retry, gallery, advanced);
    render();
    return box;
  }
  return { control, guard };
})();
