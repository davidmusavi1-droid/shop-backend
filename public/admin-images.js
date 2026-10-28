/* Image URLs remain compatible with the existing product/variant API. */
window.MotifImages = (() => {
  let pending = 0;
  function guard() {
    if (!pending) return false;
    alert('لطفاً تا پایان آپلود عکس‌ها صبر کنید.');
    return true;
  }
  window.addEventListener('beforeunload', event => {
    if (pending) { event.preventDefault(); event.returnValue = ''; }
  });
  function control(key, title, value, getToken) {
    const box = document.createElement('div');
    box.className = 'image-editor';
    const heading = document.createElement('p');
    heading.textContent = key === 'images' ? 'عکس‌های محصول' : 'عکس‌های مخصوص این سایز';
    const hint = document.createElement('small');
    hint.textContent = 'عکس اول، عکس اصلی است. JPG، PNG یا WebP؛ فایل ورودی حداکثر ۱۰ مگابایت؛ نسخهٔ سایت با حفظ جزئیات تا سقف ۳ مگابایت آماده می‌شود. پس از آپلود، «ذخیره محصول» را بزنید.';
    const pickerLabel = document.createElement('label');
    pickerLabel.textContent = 'انتخاب عکس از گوشی یا رایانه';
    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp'; picker.multiple = true;
    pickerLabel.append(picker);
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const gallery = document.createElement('div'); gallery.className = 'image-previews';
    const advanced = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'لینک عکس‌ها (اختیاری)';
    const links = document.createElement('textarea'); links.dataset.key = key;
    links.setAttribute('aria-label', title); links.value = (value || []).join('\n');
    advanced.append(summary, links);
    function urls() { return links.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
    function set(items) { links.value = items.join('\n'); render(); }
    function render() {
      gallery.replaceChildren();
      urls().forEach((url, index) => {
        const card = document.createElement('div');
        const img = document.createElement('img'); img.alt = 'عکس ' + (index + 1); img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        if (/^https:\/\//.test(url)) img.src = url;
        card.append(img);
        for (const [label, action] of [
          [index === 0 ? 'عکس اصلی' : 'انتخاب به‌عنوان اصلی', () => { const a = urls(); a.unshift(a.splice(index, 1)[0]); set(a); }],
          ['حذف از محصول', () => set(urls().filter((_, i) => i !== index))]
        ]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.disabled = pending > 0 || label === 'عکس اصلی'; button.onclick = () => { if (!guard()) action(); }; card.append(button);
        }
        gallery.append(card);
      });
    }
    links.oninput = render;
    picker.onchange = async () => {
      if (guard()) { picker.value = ''; return; }
      const files = [...picker.files];
      if (!files.length) return;
      pending++; picker.disabled = true; links.disabled = true;
      const save = document.getElementById('save'); save.disabled = true;
      render();
      let success = 0; const errors = [];
      try {
        for (const [i, file] of files.entries()) {
          status.textContent = `در حال آپلود عکس ${i + 1} از ${files.length}…`;
          if (file.size > 10 * 1024 * 1024) { errors.push(file.name + ': بیش از ۱۰ مگابایت'); continue; }
          try {
            const form = new FormData(); form.append('image', file);
            const response = await fetch('/api/uploads/images', { method: 'POST', headers: { 'X-Admin-Token': getToken() }, body: form });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'آپلود ناموفق');
            if (!/^https:\/\//.test(data.url || '')) throw new Error('پاسخ نامعتبر از سرور');
            set([...urls(), data.url]); success++;
          } catch (error) { errors.push(file.name + ': ' + error.message); }
        }
      } finally {
        pending--; picker.disabled = false; links.disabled = false; picker.value = ''; save.disabled = false; render();
        status.textContent = `${success} عکس اضافه شد. برای ثبت نهایی، محصول را ذخیره کنید.` + (errors.length ? ' عکس‌های ناموفق را دوباره انتخاب کنید: ' + errors.join('؛ ') : '');
      }
    };
    box.append(heading, hint, pickerLabel, status, gallery, advanced); render(); return box;
  }
  return { control, guard };
})();
