/* Alma Eats service worker: offline shell + allergen reminders */
importScripts("./reminders.js");

const SHELL = "alma-shell";
const STATE = "alma-state";
const FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./foods.js", "./reminders.js", "./push-config.js",
  "./manifest.webmanifest", "./img/alma-cutout.webp", "./img/icon-192.png", "./img/icon-512.png", "./img/favicon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, skipping the browser's HTTP cache, so every open gets the latest
// version; the cached copy is only used when offline.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

async function readJSON(key) {
  const c = await caches.open(STATE);
  const r = await c.match(key);
  return r ? r.json() : null;
}
async function writeJSON(key, val) {
  const c = await caches.open(STATE);
  await c.put(key, new Response(JSON.stringify(val), { headers: { "content-type": "application/json" } }));
}

async function checkAndNotify() {
  const snapshot = await readJSON("/__alma_state");
  // When the push server handles reminders, don't send duplicates from here.
  if (!snapshot || snapshot.push) return;
  const meta = (await readJSON("/__alma_notified")) || {};
  const now = new Date();
  const due = AlmaReminders.dueReminder(now, snapshot, meta.last);
  if (!due) return;
  const { title, body } = AlmaReminders.reminderText(due);
  await self.registration.showNotification(title, {
    body,
    tag: "alma-allergens",
    renotify: true,
    icon: "./img/icon-192.png",
    badge: "./img/icon-192.png",
    data: { url: "./#week" },
  });
  await writeJSON("/__alma_notified", { last: AlmaReminders.ymd(now) });
}

// Chrome/Android installed app: wakes roughly hourly in the background.
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "alma-reminders") e.waitUntil(checkAndNotify());
});

// The page asks for a check whenever it is opened / on a timer.
self.addEventListener("message", (e) => {
  if (e.data === "check") e.waitUntil(checkAndNotify());
  if (e.data && e.data.type === "test") {
    e.waitUntil(self.registration.showNotification("Alma Eats 🥄", {
      body: "Reminders are working! You'll get a nudge on allergen days.",
      tag: "alma-test", icon: "./img/icon-192.png",
    }));
  }
});

// Reminders sent by the push server (works even when the app is closed).
self.addEventListener("push", (e) => {
  let data = {};
  try { data = (e.data && e.data.json()) || {}; } catch (_) {}
  const title = data.title || "Alma Eats 🥄";
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: data.body || "Time to check on this week's allergens.",
      tag: data.tag || "alma-allergens",
      renotify: true,
      icon: "./img/icon-192.png",
      badge: "./img/icon-192.png",
      data: { url: data.url || "./#week" },
    }),
    data.tag === "alma-test" ? null : writeJSON("/__alma_notified", { last: AlmaReminders.ymd(new Date()) }),
  ]));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
