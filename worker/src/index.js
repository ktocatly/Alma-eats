// Alma Eats push server (Cloudflare Worker).
//
// The app sends a small snapshot (reminder settings, allergens in rotation and
// their feeding dates, time zone) whenever something changes. A cron trigger
// runs every 10 minutes, works out whether a reminder is due in the device's
// own time zone, and sends a Web Push. One reminder per device per day max.

import "../../reminders.js";
import { sendPush } from "./webpush.js";

const R = globalThis.AlmaReminders;
const MAX_BODY = 32 * 1024;

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });

    try {
      if (req.method === "GET" && url.pathname === "/vapid") return json({ publicKey: env.VAPID_PUBLIC_KEY });
      if (req.method === "GET" && url.pathname === "/") return json({ ok: true, service: "alma-eats-push" });
      if (req.method !== "POST") return json({ error: "not found" }, 404);

      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);
      const body = JSON.parse(raw);
      if (!/^[a-zA-Z0-9-]{16,64}$/.test(body.id || "") || typeof body.token !== "string" || body.token.length < 16)
        return json({ error: "bad device" }, 400);

      const key = `dev:${body.id}`;
      const existing = await env.ALMA.get(key, "json");
      const tokenHash = await sha256(body.token);
      if (existing && existing.tokenHash !== tokenHash) return json({ error: "forbidden" }, 403);

      if (url.pathname === "/sync") {
        const sub = body.subscription;
        if (!sub || typeof sub.endpoint !== "string" || !(/^https:\/\//.test(sub.endpoint) || (env.DEV_ALLOW_HTTP === "1" && /^http:\/\/localhost[:/]/.test(sub.endpoint))) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
          return json({ error: "bad subscription" }, 400);
        const record = {
          tokenHash,
          sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          snap: cleanSnapshot(body.snapshot),
          tz: validTz(body.tz) ? body.tz : "UTC",
          last: existing ? existing.last : body.lastNotified || null,
          updated: Date.now(),
        };
        await env.ALMA.put(key, JSON.stringify(record));
        return json({ ok: true });
      }

      if (url.pathname === "/unsubscribe") {
        if (existing) await env.ALMA.delete(key);
        return json({ ok: true });
      }

      if (url.pathname === "/test") {
        if (!existing) return json({ error: "not registered" }, 404);
        try {
          const res = await sendPush(existing.sub, {
            title: "Alma Eats 🥄",
            body: "Push reminders are working, even when the app is closed.",
            tag: "alma-test",
          }, vapid(env), { ttl: 600 });
          return json({ ok: res.ok, status: res.status });
        } catch (_) {
          return json({ ok: false, status: 0 });
        }
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: "server error" }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
};

export async function runReminders(env, now = new Date()) {
  let cursor;
  do {
    const page = await env.ALMA.list({ prefix: "dev:", cursor });
    for (const { name } of page.keys) {
      const rec = await env.ALMA.get(name, "json");
      if (!rec) continue;
      const local = localDate(now, rec.tz);
      const due = R.dueReminder(local, rec.snap, rec.last);
      if (!due) continue;
      const { title, body } = R.reminderText(due);
      let res;
      try {
        res = await sendPush(rec.sub, { title, body, tag: "alma-allergens", url: "./#week" }, vapid(env));
      } catch (_) {
        continue; // push service unreachable; try again next run
      }
      if (res.status === 404 || res.status === 410) {
        await env.ALMA.delete(name); // subscription is gone
      } else if (res.ok) {
        rec.last = R.ymd(local);
        await env.ALMA.put(name, JSON.stringify(rec));
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

// A Date whose local getters (the Worker runs in UTC) read as wall-clock time in `tz`.
export function localDate(now, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
}

function cleanSnapshot(s) {
  s = s || {};
  const st = s.settings || {};
  const allergens = Array.isArray(s.allergens) ? s.allergens.slice(0, 60).map((a) => ({ id: String(a.id).slice(0, 80), name: String(a.name).slice(0, 80) })) : [];
  const logs = {};
  for (const a of allergens) {
    const l = s.logs && s.logs[a.id];
    logs[a.id] = Array.isArray(l) ? l.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-30) : [];
  }
  return {
    settings: {
      enabled: !!st.enabled,
      time: /^\d{2}:\d{2}$/.test(st.time) ? st.time : "13:00",
      earlyDay: Math.min(Math.max(+st.earlyDay || 0, 0), 5),
      lateDay: Math.min(Math.max(+st.lateDay || 3, 1), 6),
    },
    allergens,
    logs,
  };
}

function validTz(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return typeof tz === "string"; } catch (_) { return false; }
}

function vapid(env) {
  return { privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), publicKey: env.VAPID_PUBLIC_KEY, subject: env.VAPID_SUBJECT };
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return ok
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" }
    : { Vary: "Origin" };
}

async function sha256(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
