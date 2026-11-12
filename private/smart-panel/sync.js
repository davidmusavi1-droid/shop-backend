'use strict';

const embedded = window.parent !== window && new URLSearchParams(location.search).get('product') === '1';
const panelApi = '/api/admin/smart-panel';
const admin = window.MotifAdminSession;
const baseline = new Map();
const conflicts = new Set();
const notices = new Map();
const pending = new Map();
const recoveryId = crypto.randomUUID();
const editableKeys = [
  'name', 'brand', 'styleNumber', 'type', 'color', 'labelSize', 'country', 'fabric', 'design', 'season', 'uses',
  'neck', 'closure', 'observed', 'technology', 'chest', 'length', 'sleeve', 'waist', 'waistCircumference',
  'rise', 'total', 'thigh', 'hem', 'price', 'stock', 'grade', 'defect', 'depth', 'scope', 'content', 'researchDraft',
];
let recoveryPrefix = '';
let loggedIn = false;
let busy = false;
let loginEpoch = 0;

async function requestPanel(path, method = 'GET', body, headers = {}) {
  if (body !== undefined && !(body instanceof Blob)) {
    body = JSON.stringify(body);
    headers = { ...headers, 'Content-Type': 'application/json' };
  }
  const response = await admin.request(panelApi + path, { method, body, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'پاسخ سرور معتبر نیست.'), {
    status: response.status, code: result.code, issues: result.issues,
  });
  return result;
}

const dossierPath = p => '/dossiers/' + p.id;
function editable(p) {
  return Object.fromEntries(editableKeys.map(key =>
    [key, key === 'content' ? p.content.map(item => ({ text: item.text })) : structuredClone(p[key])]));
}
function diff(fields, previous) {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
    JSON.stringify(previous[key]) !== JSON.stringify(value)));
}
function changeSet(p, original = baseline.get(p.id)) {
  return {
    version: original?.version ?? 0,
    fields: diff(editable(p), original ? editable(original) : {}),
    ...(p.code !== original?.code ? { code: p.code } : {}),
  };
}
const hasChanges = change => Boolean(Object.keys(change.fields).length || Object.hasOwn(change, 'code'));
function recoveryKey(id) { return recoveryPrefix + recoveryId + ':' + id; }

function persistRecovery(p, change = changeSet(p)) {
  if (!recoveryPrefix) return false;
  try {
    if (hasChanges(change)) {
      localStorage.setItem(recoveryKey(p.id), JSON.stringify({
        id: p.id, name: titleOf(p), at: new Date().toISOString(), change,
      }));
    } else localStorage.removeItem(recoveryKey(p.id));
    return true;
  } catch { return false; }
}
function recoveryEntries() {
  if (!recoveryPrefix) return [];
  try {
    return Object.keys(localStorage).filter(key => key.startsWith(recoveryPrefix))
      .flatMap(key => {
        try {
          const value = JSON.parse(localStorage.getItem(key));
          if (!value || !/^[a-f0-9-]{36}$/.test(value.id) ||
              !Number.isSafeInteger(value.change?.version) || !value.change?.fields) return [];
          return [{ ...value, key }];
        } catch { return []; }
      })
      .sort((a,b) => b.at.localeCompare(a.at));
  } catch { return []; }
}
function useServer(p, server) {
  baseline.set(p.id, structuredClone(server));
  Object.assign(p, server);
}

function updateSaveLabel() {
  const p = current();
  if (!p) return;
  const label = $('#save-label');
  if (label) label.textContent = notices.get(p.id) ?? 'ذخیره‌شده در سرور آزمایشی';
  const conflictButton = $('[data-act=resolve-conflict]', main);
  if (conflictButton) conflictButton.hidden = !conflicts.has(p.id);
}
function changed(p, effective = true) {
  if (!p) return;
  if (effective) p.phase = 'draft';
  const savedLocally = persistRecovery(p);
  notices.set(p.id, savedLocally ? 'تغییرات در انتظار ذخیرهٔ سرور' : 'تغییرات ذخیره نشده‌اند. بازیابی محلی در دسترس نیست.');
  updateEditorStatus(p);
  updateSaveLabel();
  clearTimeout(writeTimer);
  if (state.auto && !conflicts.has(p.id)) writeTimer = setTimeout(() => saveDraft(p), 550);
}
function amend(p) { changed(p); }

async function saveDraft(p, explicit = false) {
  if (!loggedIn) return false;
  if (pending.has(p.id)) {
    if (!await pending.get(p.id)) return false;
    return saveDraft(p, explicit);
  }
  if (conflicts.has(p.id)) return false;
  const delta = changeSet(p);
  if (!hasChanges(delta)) {
    persistRecovery(p, delta);
    notices.delete(p.id);
    if (baseline.has(p.id)) p.phase = baseline.get(p.id).phase;
    updateEditorStatus(p);
    updateSaveLabel();
    if (explicit) toast('پرونده در سرور آزمایشی ذخیره شده است.');
    return true;
  }
  const before = editable(p);
  const code = p.code;
  const epoch = loginEpoch;
  notices.set(p.id, 'در حال ذخیره در سرور…');
  updateSaveLabel();
  const task = (async () => {
    try {
      const response = await requestPanel(dossierPath(p), 'PATCH', delta);
      if (epoch !== loginEpoch) return false;
      const later = diff(editable(p), before);
      const laterCode = p.code;
      const codeChanged = laterCode !== code;
      useServer(p, response);
      // A response acknowledges only the input captured when it was sent.
      for (const [key, value] of Object.entries(later)) {
        p[key] = key === 'content' ? value.map((item, i) => ({
          ...item, approved: p.content[i].approved && p.content[i].text === item.text,
        })) : value;
      }
      if (codeChanged) p.code = laterCode;
      notices.delete(p.id);
      if (Object.keys(later).length || codeChanged) {
        changed(p);
      } else {
        persistRecovery(p);
        if (explicit) toast('پرونده در سرور آزمایشی ذخیره شد.');
      }
      if (current() === p) {
        updateEditorStatus(p);
        updateSaveLabel();
        syncReview(p);
      }
      return true;
    } catch (error) {
      if (epoch !== loginEpoch) return false;
      const savedLocally = persistRecovery(p);
      if (error.code === 'VERSION_CONFLICT') {
        conflicts.add(p.id);
        notices.set(p.id, 'تعارض نسخه؛ تغییرات این تب حفظ شده‌اند.');
      } else if (!error.status) {
        notices.set(p.id, savedLocally ? 'ارتباط قطع است. نسخهٔ بازیابی محلی محفوظ است.' : 'ارتباط قطع است و بازیابی محلی در دسترس نیست.');
      } else notices.set(p.id, error.message);
      updateSaveLabel();
      if (explicit) toast(notices.get(p.id));
      return false;
    }
  })();
  pending.set(p.id, task);
  try { return await task; }
  finally { pending.delete(p.id); }
}

async function flush(p) {
  do {
    if (!await saveDraft(p)) return false;
  } while (hasChanges(changeSet(p)));
  return true;
}

async function refreshRegistry() {
  state.registry = await requestPanel('/codes');
}
async function loadPanel(session) {
  const epoch = ++loginEpoch;
  recoveryPrefix = 'motif-smart-b:' + session.recoveryKey + ':';
  const items = [];
  const id = location.hash.match(/^#dossier=([a-f0-9-]{36})$/)?.[1];
  let after;
  if (embedded && id) {
    const dossier = await requestPanel('/dossiers/' + id);
    if (!dossier.store || !dossier.productId) return;
    items.push(dossier);
    document.body.classList.add('store-embedded');
  } else do {
    const page = await requestPanel('/dossiers' + (after ? '?after=' + encodeURIComponent(after) : ''));
    items.push(...page.items);
    after = page.next;
  } while (after);
  const registry = embedded ? { reserved: [], legacy: [] } : await requestPanel('/codes');
  if (epoch !== loginEpoch) return;
  baseline.clear();
  state.products = items;
  state.registry = registry;
  items.forEach(p => baseline.set(p.id, structuredClone(p)));
  loggedIn = true;
  if (recoveryEntries().length) toast('تغییرات بازیابی‌نشده دارید. از تنظیمات به آن‌ها دسترسی دارید.');
  if (items.some(p => p.id === id)) openPage('editor', { id });
  else openPage('dashboard');
}
function lockPanel(message = '') {
  ++loginEpoch;
  loggedIn = false;
  clearTimeout(writeTimer);
  baseline.clear();
  notices.clear();
  conflicts.clear();
  state.products = [];
  state.registry = { reserved: [], legacy: [] };
  state.events = [];
  if ($('#dialog').open) $('#dialog').close();
  $('#nav').replaceChildren();
  $('#mobile').replaceChildren();
  $('#crumb').textContent = 'ورود مدیر';
  main.innerHTML = heading('ورود به پنل هوشمند', embedded ? 'با نشست مدیر MOTIF وارد شوید.' : 'از رمز جداگانهٔ محیط آزمایش استفاده کنید.') +
    '<form id="smart-login" class="card pad stack doc"><div class="field"><label for="smart-password">رمز مدیر</label>' +
    '<input id="smart-password" type="password" required autocomplete="current-password"></div>' +
    '<div class="row"><button class="btn primary" type="submit">ورود به پنل</button><small id="login-message" aria-live="polite">' +
    esc(message) + '</small></div></form>';
}

async function withAction(fn, p) {
  if (busy || !loggedIn) return;
  busy = true;
  main.inert = true;
  const epoch = loginEpoch;
  try {
    if (p && !await flush(p)) {
      toast(notices.get(p.id) || 'ابتدا پیش‌نویس را در سرور ذخیره کنید.');
      return;
    }
    if (epoch === loginEpoch) await fn();
  } catch (error) {
    if (epoch !== loginEpoch) return;
    if (p && error.code === 'VERSION_CONFLICT') {
      conflicts.add(p.id);
      notices.set(p.id, 'تعارض نسخه؛ اطلاعات این تب حفظ شد.');
      updateSaveLabel();
    }
    if (error.code === 'RESEARCH_STALE' && p && current() === p) refreshEditor();
    if (error.code === 'CODE_TAKEN') {
      await refreshRegistry().catch(() => {});
      if (p && current() === p) refreshEditor();
    }
    toast(error.status ? error.message : 'ارتباط با سرور آزمایشی برقرار نشد.');
  } finally {
    busy = false;
    main.inert = false;
  }
}
function changeDossier(p, path, method, body, success) {
  return withAction(async () => {
    const updated = await requestPanel(dossierPath(p) + path, method, { ...body, version: p.version });
    useServer(p, updated);
    if (path === '/approve') await refreshRegistry().catch(() => {});
    if (current() === p) refreshEditor();
    if (success) toast(success);
  }, p);
}

function resolveConflict(p) {
  withAction(async () => {
    const latest = await requestPanel(dossierPath(p));
    const delta = changeSet(p);
    const items = Object.entries(delta.fields).map(([key, value]) =>
      [labels[key] || key, latest[key], value]);
    if (Object.hasOwn(delta, 'code')) items.push(['کد', latest.code, delta.code]);
    const display = value => esc(typeof value === 'string' ? value : JSON.stringify(value ?? ''));
    const body = items.length
      ? '<div class="table-wrap"><table><thead><tr><th>فیلد</th><th>سرور</th><th>این تب</th></tr></thead><tbody>' +
        items.map(([label, server, local]) => '<tr><td>'+esc(label)+'</td><td>'+display(server)+'</td><td>'+display(local)+'</td></tr>').join('') +
        '</tbody></table></div>'
      : '<p>نسخهٔ جدید سرور آمادهٔ بارگیری است.</p>';
    dialog('بررسی تعارض نسخه', body + '<p>برای ادامه از نسخهٔ سرور، روی «بارگیری نسخهٔ سرور» بزنید. تغییرات محلی در بخش بازیابی می‌مانند.</p>', () => {
      if (hasChanges(delta)) {
        try {
          localStorage.setItem(recoveryPrefix + crypto.randomUUID() + ':' + p.id, JSON.stringify({
            id:p.id, name:titleOf(p), at:new Date().toISOString(), change:delta,
          }));
        } catch {
          toast('ذخیرهٔ نسخهٔ بازیابی ممکن نیست. تغییرات این تب حفظ شد.');
          return;
        }
      }
      useServer(p, latest);
      conflicts.delete(p.id);
      notices.delete(p.id);
      persistRecovery(p);
      refreshEditor();
    }, 'بارگیری نسخهٔ سرور', 'بازگشت به تغییرات این تب');
  });
}

function recoverEntry(entry) {
  withAction(async () => {
    const p = state.products.find(row => row.id === entry.id);
    if (!p) throw Object.assign(new Error('پروندهٔ این نسخهٔ محلی در دسترس نیست.'), { status:404 });
    const server = await requestPanel(dossierPath(p));
    const body = '<div class="table-wrap"><table><thead><tr><th>فیلد</th><th>سرور</th><th>نسخهٔ بازیابی</th></tr></thead><tbody>' +
      Object.entries(entry.change.fields).map(([key, value]) =>
        '<tr><td>'+esc(labels[key] || key)+'</td><td>'+esc(JSON.stringify(server[key] ?? ''))+'</td><td>'+esc(JSON.stringify(value))+'</td></tr>').join('') +
      (Object.hasOwn(entry.change,'code')?'<tr><td>کد</td><td>'+esc(server.code)+'</td><td>'+esc(entry.change.code)+'</td></tr>':'') +
      '</tbody></table></div><p>با تأیید، فقط فیلدهای نمایش‌داده‌شده روی نسخهٔ فعلی قرار می‌گیرند. پس از بازبینی، «ذخیره پیش‌نویس» را بزنید.</p>';
    dialog('مقایسه و بازیابی تغییرات', body, () => {
      useServer(p, server);
      for (const [key, value] of Object.entries(entry.change.fields)) {
        if (!editableKeys.includes(key)) continue;
        p[key] = key === 'content' ? value.map(item => ({ text:item.text, approved:false })) : value;
      }
      if (Object.hasOwn(entry.change,'code') && !p.reserved) p.code = entry.change.code;
      conflicts.delete(p.id);
      notices.set(p.id, 'تغییرات بازیابی شده‌اند. ذخیرهٔ سرور در انتظار اقدام شماست.');
      if (persistRecovery(p) && entry.key !== recoveryKey(p.id)) {
        try { localStorage.removeItem(entry.key); } catch { /* Keep recovery. */ }
      }
      openPage('editor', { id:p.id });
    }, 'بازیابی در فرم', 'انصراف');
  });
}

async function initPanel() {
  admin.onEnd(message => lockPanel(message));
  lockPanel();
  try { await loadPanel(await admin.restore()); }
  catch { /* The existing sign-in form remains available. */ }
}

document.addEventListener('submit', async event => {
  if (event.target.id !== 'smart-login') return;
  event.preventDefault();
  const input = $('#smart-password');
  const button = $('button[type=submit]', event.target);
  button.disabled = true;
  const password = input.value;
  input.value = '';
  try { await loadPanel(await admin.login(password)); }
  catch (error) {
    if ($('#login-message')) $('#login-message').textContent = error.message || 'ورود انجام نشد.';
  } finally { button.disabled = false; }
});
window.addEventListener('online', () => {
  const p = current();
  if (p && state.auto && !conflicts.has(p.id)) saveDraft(p);
});
window.addEventListener('beforeunload', event => {
  if (loggedIn && state.products.some(p => baseline.has(p.id) && hasChanges(changeSet(p)))) {
    event.preventDefault();
    event.returnValue = '';
  }
});
