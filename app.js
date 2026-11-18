(() => {
  const R = window.AlmaReminders;
  const CATS = window.ALMA_CATEGORIES;
  const KEY = "alma-eats-v1";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- State ----------
  const defaults = () => ({
    v: 1,
    logs: {},          // foodId -> ["YYYY-MM-DD", ...]
    custom: [],        // user-added foods
    hidden: {},        // built-in foods removed by the user
    rotationOff: {},   // allergens taken out of the weekly rotation
    settings: { enabled: false, time: "13:00", earlyDay: 0, lateDay: 3 },
  });
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 1) return { ...defaults(), ...s, settings: { ...defaults().settings, ...s.settings } };
    } catch (_) {}
    return defaults();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    syncSnapshot();
    syncPushSoon();
  }

  const today = () => R.ymd(new Date());
  const foods = () => [...window.ALMA_FOODS.filter((f) => !state.hidden[f.id]), ...state.custom];
  const foodById = (id) => foods().find((f) => f.id === id);
  const logsOf = (id) => state.logs[id] || [];
  const rotation = () => foods().filter((f) => f.allergen && logsOf(f.id).length && !state.rotationOff[f.id]);
  const shortName = (n) => n.replace(/\s*\(.*\)/, "");

  function addLog(id, date = today()) {
    (state.logs[id] ||= []).push(date);
    state.logs[id].sort();
    save();
  }
  function removeLog(id, date) {
    const arr = logsOf(id);
    const i = arr.lastIndexOf(date);
    if (i > -1) arr.splice(i, 1);
    if (!arr.length) delete state.logs[id];
    save();
  }

  // ---------- Formatting ----------
  const fmt = (s, opts = { month: "short", day: "numeric" }) => R.parseYmd(s).toLocaleDateString(undefined, opts);
  function relDay(s) {
    const diff = Math.round((R.parseYmd(today()) - R.parseYmd(s)) / 864e5);
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff < 7) return `${diff} days ago`;
    return fmt(s);
  }
  function fmtTime(t) {
    const [h, m] = t.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  // ---------- Render: stats ----------
  function renderStats() {
    const all = foods();
    const tried = all.filter((f) => logsOf(f.id).length).length;
    const alls = all.filter((f) => f.allergen);
    const allIn = alls.filter((f) => logsOf(f.id).length).length;
    $("#statFoods").textContent = tried;
    $("#statFoodsLabel").textContent = `of ${all.length} foods tried`;
    $("#barFoods").style.width = `${(tried / Math.max(all.length, 1)) * 100}%`;
    $("#statAllergens").textContent = allIn;
    $("#statAllergensLabel").textContent = `of ${alls.length} allergens in`;
    $("#barAllergens").style.width = `${(allIn / Math.max(alls.length, 1)) * 100}%`;
  }

  // ---------- Render: this week ----------
  function renderWeek() {
    const now = new Date();
    const slots = R.getSlots(now, state.settings);
    const t = today();
    $("#weekRange").textContent = `${fmt(slots[0].start)} – ${fmt(slots[1].end)}`;
    const bell = $("#bellBtn");
    const on = state.settings.enabled && notifPermission() === "granted";
    bell.classList.toggle("on", on);
    $("#bellLabel").textContent = on ? fmtTime(state.settings.time) : "Reminders off";

    const list = rotation();
    if (!list.length) {
      $("#slots").innerHTML = `<p class="empty-week">Once Alma has tried an allergen, it'll show up here to offer twice a week. Tap <strong>+</strong> next to one in the list to get started.</p>`;
      return;
    }
    $("#slots").innerHTML = slots.map((s) => {
      const state_ = t > s.end ? "past" : t < s.start ? "upcoming" : "current";
      const pending = R.pendingInSlot(s, list, state.logs).map((a) => a.id);
      const done = list.length - pending.length;
      const status = state_ === "upcoming"
        ? `<span class="muted">starts ${fmt(s.start, { weekday: "short" })}</span>`
        : done === list.length ? `<span class="done">All done ✓</span>` : `<span class="muted">${done}/${list.length} fed</span>`;
      const pills = list.map((a) => {
        const fed = !pending.includes(a.id);
        return `<button type="button" class="pill ${fed ? "fed" : ""}" data-slot="${s.key}" data-id="${a.id}" ${state_ === "upcoming" ? "disabled" : ""} aria-pressed="${fed}">
          <span class="tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.8 3.8 7.2-8.1"/></svg></span>${esc(shortName(a.name))}</button>`;
      }).join("");
      return `<div class="slot ${state_ === "current" ? "current" : ""}">
        <div class="slot-head"><strong>${s.label} <span class="muted">· ${s.days}</span></strong>${status}</div>
        <div class="pills">${pills}</div></div>`;
    }).join("");
  }

  $("#slots").addEventListener("click", (e) => {
    const b = e.target.closest(".pill");
    if (!b || b.disabled) return;
    const slot = R.getSlots(new Date(), state.settings).find((s) => s.key === b.dataset.slot);
    const id = b.dataset.id;
    const inSlot = logsOf(id).filter((d) => d >= slot.start && d <= slot.end);
    const checking = !inSlot.length;
    if (!checking) {
      removeLog(id, inSlot.at(-1));
    } else {
      const t = today();
      addLog(id, t >= slot.start && t <= slot.end ? t : slot.end);
    }
    haptic();
    render();
    const pill = document.querySelector(`.pill[data-slot="${slot.key}"][data-id="${CSS.escape(id)}"]`);
    if (pill) {
      pill.classList.add(checking ? "just" : "unjust");
      if (checking) burst(pill.querySelector(".tick"), ["var(--sage)", "var(--peach)", "var(--butter-deep)"]);
    }
    if (checking) {
      const slotEl = pill && pill.closest(".slot");
      if (slotEl && slotEl.querySelector(".done")) {
        slotEl.classList.add("celebrate");
        toast(`All allergens done for the ${slot.key === "early" ? "first" : "second"} round 🎉`);
      } else toast(`${shortName(foodById(id).name)} checked off`);
    }
    clearReminderIfDone();
  });

  // ---------- Render: list ----------
  let filter = "all";
  let query = "";
  let untriedOnly = false;

  function renderChips() {
    const opts = [{ id: "all", short: "All" }, ...CATS];
    $("#chips").innerHTML = opts.map((c) =>
      `<button type="button" role="tab" class="chip" data-cat="${c.id}" aria-selected="${c.id === filter}">${c.short}</button>`).join("");
  }
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    if (c.dataset.cat !== filter) haptic();
    filter = c.dataset.cat;
    renderChips();
    renderList();
  });
  $("#search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });
  $("#untried").addEventListener("change", (e) => { untriedOnly = e.target.checked; renderList(); });

  function itemHTML(f) {
    const logs = logsOf(f.id);
    const n = logs.length;
    const dots = [0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    const sub = n ? `<span class="dots">${dots}</span> fed ${relDay(logs.at(-1))}` : f.allergen ? "Allergen · not yet" : "Not tried yet";
    return `<div class="item ${n ? "tried" : ""} ${f.allergen ? "allergen" : ""}" data-id="${f.id}">
      <span class="emo" aria-hidden="true">${esc(f.emoji || "🥄")}</span>
      <span class="info" role="button" tabindex="0" data-open="${f.id}">
        <span class="name">${esc(f.name)}</span>
        <span class="sub">${sub}</span>
      </span>
      <span class="count" title="Times offered">${n ? n + "×" : ""}</span>
      <button type="button" class="plus" data-plus="${f.id}" aria-label="Log ${esc(f.name)} today"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
    </div>`;
  }

  function renderList() {
    const all = foods().filter((f) =>
      (filter === "all" || f.cat === filter) &&
      (!query || f.name.toLowerCase().includes(query)) &&
      (!untriedOnly || !logsOf(f.id).length));
    if (!all.length) {
      $("#list").innerHTML = `<p class="no-results">${untriedOnly && !query ? "Everything here has been tried. Go Alma! 🎉" : "No foods match that."}</p>`;
      return;
    }
    $("#list").innerHTML = CATS.map((c) => {
      const items = all.filter((f) => f.cat === c.id);
      if (!items.length) return "";
      const tried = foods().filter((f) => f.cat === c.id && logsOf(f.id).length).length;
      const total = foods().filter((f) => f.cat === c.id).length;
      return `<section class="group"><h3>${c.label} <small>${tried}/${total}</small></h3>
        <div class="items">${items.map(itemHTML).join("")}</div></section>`;
    }).join("");
  }

  $("#list").addEventListener("click", (e) => {
    const plus = e.target.closest("[data-plus]");
    if (plus) {
      const id = plus.dataset.plus;
      const f = foodById(id);
      const first = !logsOf(id).length;
      addLog(id);
      haptic();
      render();
      const row = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
      if (row) {
        row.classList.add("pop");
        row.querySelector(".count").classList.add("bump");
        const btn = row.querySelector(".plus");
        btn.classList.add("just");
        burst(btn, first ? ["var(--sage)", "var(--peach)", "var(--butter-deep)", "var(--sage)"] : ["var(--sage)"], first ? 12 : 7);
      }
      const n = logsOf(id).length;
      const msg = first
        ? (f.allergen ? `First ${shortName(f.name).toLowerCase()}! Added to the weekly rotation` : `First taste of ${shortName(f.name).toLowerCase()}!`)
        : `${shortName(f.name)} · ${n}×`;
      toast(msg, () => { removeLog(id, today()); render(); });
      clearReminderIfDone();
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) openFood(open.dataset.open);
  });
  $("#list").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.dataset.open) { e.preventDefault(); openFood(e.target.dataset.open); }
  });

  // ---------- Food sheet ----------
  let current = null;
  function openFood(id) {
    current = id;
    fillFood();
    $("#fsDate").value = today();
    $("#fsDate").max = today();
    $("#foodSheet").showModal();
  }
  function fillFood() {
    const f = foodById(current);
    if (!f) return;
    const logs = logsOf(f.id);
    $("#fsEmoji").textContent = f.emoji || "🥄";
    $("#fsEmoji").style.background = f.allergen ? "var(--blush)" : "";
    $("#fsName").textContent = f.name;
    $("#fsMeta").textContent = logs.length
      ? `Offered ${logs.length} ${logs.length === 1 ? "time" : "times"} · first ${fmt(logs[0], { month: "short", day: "numeric", year: "numeric" })}`
      : f.allergen ? "Allergen · not introduced yet" : "Not tried yet";
    $("#fsRotationRow").hidden = !f.allergen;
    $("#fsRotation").checked = !state.rotationOff[f.id];
    $("#fsHistory").innerHTML = logs.length
      ? [...logs].reverse().map((d) => `<li><span>${fmt(d, { weekday: "short", month: "short", day: "numeric" })}</span><button type="button" data-del="${d}" aria-label="Remove">×</button></li>`).join("")
      : `<li class="none">Nothing logged yet.</li>`;
  }
  $("#fsLog").addEventListener("click", () => {
    const d = $("#fsDate").value || today();
    addLog(current, d);
    haptic();
    fillFood();
    render();
    clearReminderIfDone();
  });
  $("#fsHistory").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    removeLog(current, b.dataset.del);
    fillFood();
    render();
  });
  $("#fsRotation").addEventListener("change", (e) => {
    if (e.target.checked) delete state.rotationOff[current];
    else state.rotationOff[current] = true;
    save();
    render();
  });
  $("#fsDelete").addEventListener("click", () => {
    const f = foodById(current);
    if (!confirm(`Remove ${f.name} from the list?`)) return;
    if (state.custom.some((c) => c.id === f.id)) state.custom = state.custom.filter((c) => c.id !== f.id);
    else state.hidden[f.id] = true;
    delete state.logs[f.id];
    save();
    $("#foodSheet").close();
    render();
  });

  // ---------- Add food ----------
  $("#afCat").innerHTML = CATS.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
  $("#addFoodBtn").addEventListener("click", () => {
    $("#addForm").reset();
    $("#afCat").value = filter !== "all" ? filter : "veg";
    $("#afAllergen").checked = filter === "allergens";
    $("#addSheet").showModal();
  });
  $("#afCat").addEventListener("change", (e) => { if (e.target.value === "allergens") $("#afAllergen").checked = true; });
  $("#addForm").addEventListener("submit", (e) => {
    if (e.submitter && e.submitter.value !== "save") return;
    const name = $("#afName").value.trim();
    if (!name) return;
    const id = "c-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
    state.custom.push({ id, name, emoji: $("#afEmoji").value.trim() || "🥄", cat: $("#afCat").value, allergen: $("#afAllergen").checked });
    save();
    render();
    toast(`${name} added`);
  });

  // ---------- Settings & notifications ----------
  const notifPermission = () => ("Notification" in window ? Notification.permission : "unsupported");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;

  const dayOpts = (from, to) => R.DAY_NAMES.slice(from, to + 1).map((d, i) => `<option value="${i + from}">${d}</option>`).join("");
  $("#setEarly").innerHTML = dayOpts(0, 5);
  $("#setLate").innerHTML = dayOpts(1, 6);

  // ---------- Push (server-sent reminders that arrive even when the app is closed) ----------
  const PUSH_URL = (window.ALMA_PUSH_URL || "").replace(/\/$/, "");
  const DEVICE_KEY = "alma-eats-device";
  function pushCapable() { return !!PUSH_URL && "serviceWorker" in navigator && "PushManager" in window; }
  function device() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DEVICE_KEY)); } catch (_) {}
    if (!d || !d.id) {
      const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      d = { id: rand(), token: rand() + rand(), push: false };
      saveDevice(d);
    }
    return d;
  }
  function saveDevice(d) { try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch (_) {} }
  function pushActive() { return pushCapable() && state.settings.enabled && device().push; }

  async function postPush(path, extra = {}) {
    const d = device();
    const res = await fetch(PUSH_URL + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: d.id, token: d.token, ...extra }),
    });
    if (!res.ok) throw new Error(`push server ${res.status}`);
    return res.json();
  }
  function b64ToBytes(s) {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  }
  async function subscribePush() {
    const reg = await swReady();
    if (!reg) throw new Error("no service worker");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await (await fetch(PUSH_URL + "/vapid")).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    }
    return sub;
  }
  async function syncPush() {
    if (!pushCapable() || !state.settings.enabled) return;
    try {
      const sub = await subscribePush();
      await postPush("/sync", {
        subscription: sub.toJSON(),
        snapshot: snapshotData(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const d = device();
      if (!d.push) { d.push = true; saveDevice(d); syncSnapshot(); }
    } catch (err) {
      console.warn("Push sync failed", err);
    }
  }
  let pushTimer;
  function syncPushSoon() { clearTimeout(pushTimer); pushTimer = setTimeout(syncPush, 1200); }
  async function disablePush() {
    const d = device();
    try { if (PUSH_URL) await postPush("/unsubscribe"); } catch (_) {}
    try { const reg = await swReady(); const sub = reg && (await reg.pushManager.getSubscription()); if (sub) await sub.unsubscribe(); } catch (_) {}
    d.push = false; saveDevice(d);
  }

  // ---------- Settings ----------
  function fillSettings() {
    const s = state.settings;
    $("#setEnabled").checked = s.enabled && notifPermission() === "granted";
    $("#setTime").value = s.time;
    $("#setEarly").value = s.earlyDay;
    $("#setLate").value = s.lateDay;
    const p = notifPermission();
    $("#permNote").textContent =
      p === "unsupported" ? (isIOS && !standalone ? "Add to your Home Screen first" : "This browser can't show notifications")
      : p === "denied" ? "Blocked — allow notifications in your phone's settings"
      : !$("#setEnabled").checked ? "Notifications are off"
      : pushActive() ? `On · ${fmtTime(s.time)}, even when the app is closed`
      : `On · ${fmtTime(s.time)} while the app is open`;
    let hint = "";
    if (isIOS && !standalone) hint = "On iPhone: open this page in Safari, tap Share → Add to Home Screen, then open Alma Eats from your home screen to turn on notifications.";
    else if (!PUSH_URL && $("#setEnabled").checked) hint = "The push server isn't set up yet, so reminders only appear while Alma Eats is open or was recently used.";
    $("#installHint").textContent = hint;
  }
  $("#bellBtn").addEventListener("click", () => { fillSettings(); $("#settingsSheet").showModal(); });

  $("#setEnabled").addEventListener("change", async (e) => {
    if (e.target.checked) {
      let p = notifPermission();
      if (p === "default") p = await Notification.requestPermission();
      if (p !== "granted") { e.target.checked = false; state.settings.enabled = false; save(); fillSettings(); renderWeek(); return; }
      state.settings.enabled = true;
      save();
      $("#permNote").textContent = "Connecting…";
      await registerPeriodic();
      await syncPush();
      if (pushCapable() && !device().push) toast("Couldn't reach the reminder server — try again in a bit");
    } else {
      state.settings.enabled = false;
      save();
      await disablePush();
    }
    fillSettings();
    renderWeek();
    checkReminders();
  });
  $("#setTime").addEventListener("change", (e) => { state.settings.time = e.target.value || "13:00"; save(); fillSettings(); renderWeek(); checkReminders(); });
  $("#setEarly").addEventListener("change", (e) => {
    state.settings.earlyDay = +e.target.value;
    if (state.settings.lateDay <= state.settings.earlyDay) { state.settings.lateDay = state.settings.earlyDay + 1; $("#setLate").value = state.settings.lateDay; }
    save(); renderWeek(); checkReminders();
  });
  $("#setLate").addEventListener("change", (e) => {
    state.settings.lateDay = +e.target.value;
    if (state.settings.earlyDay >= state.settings.lateDay) { state.settings.earlyDay = state.settings.lateDay - 1; $("#setEarly").value = state.settings.earlyDay; }
    save(); renderWeek(); checkReminders();
  });
  $("#testNotif").addEventListener("click", async () => {
    let p = notifPermission();
    if (p === "default") p = await Notification.requestPermission();
    if (p !== "granted") { toast("Notifications aren't allowed yet"); fillSettings(); return; }
    if (pushActive()) {
      try {
        const r = await postPush("/test");
        toast(r.ok ? "Sent from the server — it should arrive in a moment" : "The server couldn't deliver it");
      } catch (_) { toast("Couldn't reach the reminder server"); }
      return;
    }
    const reg = await swReady();
    if (reg && reg.active) reg.active.postMessage({ type: "test" });
    else new Notification("Alma Eats 🥄", { body: "Reminders are working!", icon: "img/icon-192.png" });
  });

  // Backup
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `alma-eats-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.v !== 1 || typeof data.logs !== "object") throw new Error();
      if (!confirm("Replace everything on this device with this backup?")) return;
      state = { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
      save(); render(); fillSettings();
      toast("Backup restored");
    } catch (_) { toast("That file isn't an Alma Eats backup"); }
    e.target.value = "";
  });

  // ---------- Service worker bridge ----------
  let regPromise = null;
  function swReady() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return regPromise || Promise.resolve(null);
  }
  function snapshotData() {
    return {
      settings: state.settings,
      allergens: rotation().map((f) => ({ id: f.id, name: f.name })),
      logs: Object.fromEntries(rotation().map((f) => [f.id, logsOf(f.id)])),
    };
  }
  async function syncSnapshot() {
    if (!("caches" in window)) return;
    // When the server is sending reminders, the service worker stays quiet to avoid doubles.
    const snapshot = { ...snapshotData(), push: pushActive() };
    try {
      const c = await caches.open("alma-state");
      await c.put("/__alma_state", new Response(JSON.stringify(snapshot), { headers: { "content-type": "application/json" } }));
    } catch (_) {}
  }
  async function checkReminders() {
    await syncSnapshot();
    const reg = await swReady();
    if (reg && reg.active) reg.active.postMessage("check");
  }
  async function clearReminderIfDone() {
    const slot = R.currentSlot(new Date(), state.settings);
    if (slot && R.pendingInSlot(slot, rotation(), state.logs).length) return;
    const reg = await swReady();
    if (reg && reg.getNotifications) (await reg.getNotifications({ tag: "alma-allergens" })).forEach((n) => n.close());
  }
  async function registerPeriodic() {
    try {
      const reg = await swReady();
      if (reg && "periodicSync" in reg) {
        const st = await navigator.permissions.query({ name: "periodic-background-sync" });
        if (st.state === "granted") await reg.periodicSync.register("alma-reminders", { minInterval: 60 * 60 * 1000 });
      }
    } catch (_) {}
  }

  // ---------- Updates: look for a new version every time the app is opened ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // A new version took over. Reload once so the fresh files are used (not on first install).
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    regPromise = navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready).catch(() => null);
    regPromise.then((reg) => {
      if (reg && state.settings.enabled) registerPeriodic();
      checkReminders();
      syncPush();
    });
  }
  async function checkForUpdate() {
    const reg = await swReady();
    try { if (reg) await reg.update(); } catch (_) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    render();
    checkReminders();
    checkForUpdate();
    syncPush();
  });
  setInterval(checkReminders, 60 * 1000);

  // ---------- Feel: haptics + little bursts ----------
  // Android: vibrate. iPhone (iOS 18+): tapping a hidden native switch gives a light haptic tick.
  const hapticLabel = (() => {
    const l = document.createElement("label");
    l.setAttribute("aria-hidden", "true");
    l.style.cssText = "position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    const i = document.createElement("input");
    i.type = "checkbox";
    i.tabIndex = -1;
    i.setAttribute("switch", "");
    l.appendChild(i);
    document.body.appendChild(l);
    return l;
  })();
  function haptic() {
    try { if (navigator.vibrate && navigator.vibrate(8)) return; } catch (_) {}
    try { hapticLabel.click(); } catch (_) {}
  }
  function burst(el, colors, n = 8) {
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("span");
      p.className = "spark";
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = 22 + Math.random() * 16;
      p.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 650);
    }
  }
  // Lets :active press styles show on iPhone
  document.addEventListener("touchstart", () => {}, { passive: true });

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, undo) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button">Undo</button>` : ""}`;
    if (undo) t.querySelector("button").onclick = () => { undo(); t.classList.remove("show"); };
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // Close dialogs by tapping the backdrop
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  function render() {
    renderStats();
    renderWeek();
    renderList();
  }
  renderChips();
  render();
  syncSnapshot();
  if (location.hash === "#week") $("#week").scrollIntoView({ block: "start" });
})();
