// End-to-end: /sync a device, run the cron at various times, check pushes sent.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ece from "http_ece";
import worker, { runReminders, localDate } from "../src/index.js";
import { generateVapidKeys, b64urlEncode } from "../src/webpush.js";

const kv = new Map();
const ALMA = {
  async get(k, t) { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
  async put(k, v) { kv.set(k, v); },
  async delete(k) { kv.delete(k); },
  async list({ prefix }) { return { keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
};
const v = await generateVapidKeys();
const env = { ALMA, VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(v.privateJwk), VAPID_SUBJECT: "https://example.com/", ALLOWED_ORIGINS: "https://ktocatly.github.io" };

const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
const auth = crypto.randomBytes(16);
const sent = [];
let pushStatus = 201;
globalThis.fetch = async (url, init) => {
  const msg = ece.decrypt(Buffer.from(init.body), { version: "aes128gcm", privateKey: ua, authSecret: auth }).toString();
  sent.push({ url, msg: JSON.parse(msg), headers: init.headers });
  return new Response(null, { status: pushStatus });
};

const call = (path, body) => worker.fetch(new Request("https://w.example" + path, {
  method: "POST", headers: { Origin: "https://ktocatly.github.io", "content-type": "application/json" }, body: JSON.stringify(body),
}), env);

const device = { id: "d".repeat(20), token: "t".repeat(32) };
const sync = (logs) => call("/sync", {
  ...device,
  tz: "America/New_York",
  subscription: { endpoint: "https://web.push.apple.com/abc", keys: { p256dh: b64urlEncode(ua.getPublicKey()), auth: b64urlEncode(auth) } },
  snapshot: { settings: { enabled: true, time: "13:00", earlyDay: 0, lateDay: 3 }, allergens: [{ id: "peanut", name: "Peanut" }, { id: "egg", name: "Egg" }], logs },
});

let r = await sync({ peanut: ["2026-11-10"], egg: ["2026-11-12"] });
assert.equal(r.status, 200);
assert.equal(r.headers.get("access-control-allow-origin"), "https://ktocatly.github.io");

// Wrong token can't overwrite
r = await call("/sync", { ...device, token: "x".repeat(32), subscription: { endpoint: "https://evil", keys: { p256dh: "a", auth: "b" } } });
assert.equal(r.status, 403);

// Monday Nov 16 2026, 12:50 New York (17:50 UTC): before 1 PM -> nothing
await runReminders(env, new Date("2026-11-16T17:50:00Z"));
assert.equal(sent.length, 0);
// 13:00 New York -> reminder for both
await runReminders(env, new Date("2026-11-16T18:00:00Z"));
assert.equal(sent.length, 1);
assert.match(sent[0].msg.body, /peanut & egg/);
assert.equal(sent[0].headers.TTL, "86400");
// Later the same day -> no repeat
await runReminders(env, new Date("2026-11-16T22:00:00Z"));
assert.equal(sent.length, 1);
// Feed peanut, next day -> only egg
await sync({ peanut: ["2026-11-10", "2026-11-16"], egg: ["2026-11-12"] });
await runReminders(env, new Date("2026-11-17T18:05:00Z"));
assert.equal(sent.length, 2);
assert.match(sent[1].msg.body, /Still to feed: egg\./);
// Feed egg Wednesday morning -> nothing Wed
await sync({ peanut: ["2026-11-16"], egg: ["2026-11-18"] });
await runReminders(env, new Date("2026-11-18T19:00:00Z"));
assert.equal(sent.length, 2);
// Thursday -> second round, both due again
await runReminders(env, new Date("2026-11-19T18:10:00Z"));
assert.equal(sent.length, 3);
assert.match(sent[2].msg.title, /Second allergen round/);
// Late evening in New York is already the next day in UTC: Thursday 11pm NY = Fri 04:00 UTC -> still Thursday locally, already sent
await runReminders(env, new Date("2026-11-20T04:00:00Z"));
assert.equal(sent.length, 3);
assert.equal(localDate(new Date("2026-11-20T04:00:00Z"), "America/New_York").getDate(), 19);

// Test endpoint
r = await call("/test", device);
assert.equal((await r.json()).ok, true);
assert.equal(sent.length, 4);

// Expired subscription gets removed
pushStatus = 410;
await runReminders(env, new Date("2026-11-20T18:10:00Z"));
assert.equal(kv.size, 0);
console.log("✓ sync, schedule, time zones, de-duplication, test push and cleanup all behave");
