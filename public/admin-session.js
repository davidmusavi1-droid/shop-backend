"use strict";
window.MotifAdminSession = (() => {
  const base = "/api/admin/session";
  const expired = "نشست مدیریت شما به پایان رسیده است. لطفاً دوباره وارد شوید.";
  const interval = 30_000;
  let csrf, generation = 0, expiryTimer, activityTimer, statusRequest, touching = false;
  let lastActivity = 0, pending = false, loggingOut = false, onEnd = () => {};

  function reset() {
    csrf = null;
    generation++;
    clearTimeout(expiryTimer);
    clearTimeout(activityTimer);
    statusRequest = null;
    touching = pending = false;
    lastActivity = 0;
  }

  function end() {
    if (!csrf) return;
    reset();
    onEnd(expired);
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (!["GET", "HEAD"].includes(options.method || "GET") && csrf)
      headers.set("X-Admin-CSRF", csrf);
    const current = generation;
    const response = await fetch(path, {
      ...options, headers, cache: "no-store", credentials: "same-origin",
      signal: options.signal || AbortSignal.timeout(25_000),
    });
    if (response.status === 401 && csrf && current === generation && path !== base + "/logout") {
      if (!loggingOut) end();
      throw Error(expired);
    }
    return response;
  }

  function accept(state) {
    if (typeof state?.csrf !== "string" || typeof state.recoveryKey !== "string" ||
        !Number.isFinite(state.remainingMs)) throw Error("پاسخ نشست مدیریت نامعتبر است.");
    csrf = state.csrf;
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(check, Math.max(1_000, state.remainingMs));
    return state;
  }

  async function readState(response) {
    const data = await response.json();
    if (!response.ok) throw Object.assign(Error(data.error), { code: data.code });
    return data;
  }

  async function login(password) {
    const response = await request(base + "/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const state = await readState(response);
    reset();
    return accept(state);
  }

  async function restore() {
    return accept(await readState(await request(base)));
  }

  async function check() {
    if (!csrf || loggingOut || document.hidden || statusRequest) return;
    const current = generation;
    statusRequest = (async () => {
      try {
        const state = await readState(await request(base));
        if (current === generation) accept(state);
      } catch {
        if (current === generation) {
          clearTimeout(expiryTimer);
          expiryTimer = setTimeout(check, interval);
        }
      } finally {
        if (current === generation) statusRequest = null;
      }
    })();
    await statusRequest;
  }

  async function touch(hiding = false) {
    clearTimeout(activityTimer);
    if (!csrf || loggingOut || !pending || touching || (document.hidden && !hiding)) return;
    const current = generation;
    pending = false;
    touching = true;
    lastActivity = Date.now();
    try {
      const state = await readState(await request(base + "/activity", { method: "POST", keepalive: hiding }));
      if (current === generation) accept(state);
    } catch {
      // A failed request must neither simulate activity nor end the local session.
    } finally {
      if (current === generation) {
        touching = false;
        schedule();
      }
    }
  }

  function schedule() {
    clearTimeout(activityTimer);
    if (csrf && !loggingOut && pending && !touching && !document.hidden)
      activityTimer = setTimeout(touch, Math.max(0, interval - (Date.now() - lastActivity)));
  }

  async function logout() {
    loggingOut = true;
    pending = false;
    clearTimeout(activityTimer);
    try {
      const response = await request(base + "/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) await readState(response);
      reset();
    } finally {
      loggingOut = false;
      if (csrf) check();
    }
  }

  for (const event of ["pointerdown", "keydown", "input", "wheel"])
    document.addEventListener(event, e => {
      if (!csrf || loggingOut || !e.isTrusted || document.hidden) return;
      pending = true;
      schedule();
    }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (touching) pending = false;
      touch(true);
    }
    else { check(); schedule(); }
  });
  window.addEventListener("pageshow", check);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);

  return { login, restore, logout, request, expired, onEnd: fn => { onEnd = fn; } };
})();
