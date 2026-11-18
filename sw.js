/* Alma Eats service worker: offline shell + allergen reminders */
importScripts("./reminders.js");

const SHELL = "alma-shell-v1";
const STATE = "alma-state";
const FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./foods.js", "./reminders.js",
  "./manifest.webmanifest", "./img/alma.jpg", "./img/icon-192.png", "./img/icon-512.png", "./img/favicon.png",
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

// Network first for the app files so updates land; fall back to cache offline.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
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
  if (!snapshot) return;
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

// Ready for a server-sent Web Push later: show whatever payload arrives, or run the check.
self.addEventListener("push", (e) => {
  let data = null;
  try { data = e.data && e.data.json(); } catch (_) {}
  e.waitUntil(data && data.title
    ? self.registration.showNotification(data.title, { body: data.body, icon: "./img/icon-192.png", tag: "alma-allergens" })
    : checkAndNotify());
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
