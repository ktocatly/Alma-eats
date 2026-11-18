// Shared allergen-rotation logic, used by both the page (app.js) and the
// service worker (sw.js). Plain script, no modules, so importScripts() works.
(function (g) {
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Local YYYY-MM-DD
  function ymd(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function parseYmd(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  // 0 = Monday ... 6 = Sunday
  function weekdayIdx(d) {
    return (d.getDay() + 6) % 7;
  }
  function weekStart(d) {
    return addDays(d, -weekdayIdx(d));
  }

  // The week runs Monday–Sunday and is split into two feeding windows:
  //   early: Monday .. (lateDay - 1)   — reminders begin on earlyDay
  //   late:  lateDay .. Sunday         — reminders begin on lateDay
  function getSlots(now, settings) {
    const ws = weekStart(now);
    const late = Math.min(Math.max(settings.lateDay, 1), 6);
    const early = Math.min(settings.earlyDay, late - 1);
    return [
      {
        key: "early",
        label: "Early week",
        start: ymd(ws),
        end: ymd(addDays(ws, late - 1)),
        remindFrom: ymd(addDays(ws, early)),
        days: `${DAY_NAMES[0].slice(0, 3)}–${DAY_NAMES[late - 1].slice(0, 3)}`,
      },
      {
        key: "late",
        label: "Late week",
        start: ymd(addDays(ws, late)),
        end: ymd(addDays(ws, 6)),
        remindFrom: ymd(addDays(ws, late)),
        days: `${DAY_NAMES[late].slice(0, 3)}–Sun`,
      },
    ];
  }

  function currentSlot(now, settings) {
    const today = ymd(now);
    return getSlots(now, settings).find((s) => today >= s.start && today <= s.end);
  }

  // allergens: [{id, name}] already filtered to those "in rotation"
  function pendingInSlot(slot, allergens, logs) {
    return allergens.filter((a) => !(logs[a.id] || []).some((d) => d >= slot.start && d <= slot.end));
  }

  // Returns {slot, pending} if a reminder should fire right now, else null.
  // lastNotified: YYYY-MM-DD of the last reminder shown (one per day max).
  function dueReminder(now, snapshot, lastNotified) {
    const { settings, allergens, logs } = snapshot;
    if (!settings || !settings.enabled || !allergens || !allergens.length) return null;
    const today = ymd(now);
    if (lastNotified === today) return null;
    const slot = currentSlot(now, settings);
    if (!slot || today < slot.remindFrom) return null;
    const [hh, mm] = (settings.time || "13:00").split(":").map(Number);
    if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return null;
    const pending = pendingInSlot(slot, allergens, logs);
    return pending.length ? { slot, pending } : null;
  }

  function reminderText(due) {
    const names = due.pending.map((a) => a.name.replace(/\s*\(.*\)/, "").toLowerCase());
    const list = names.length > 1 ? names.slice(0, -1).join(", ") + " & " + names.at(-1) : names[0];
    return {
      title: due.slot.key === "early" ? "Allergen time for Alma 🥄" : "Second allergen round this week 🥄",
      body: `Still to feed: ${list}. Tap to check off.`,
    };
  }

  g.AlmaReminders = { DAY_NAMES, ymd, parseYmd, addDays, weekStart, getSlots, currentSlot, pendingInSlot, dueReminder, reminderText };
})(typeof globalThis !== "undefined" ? globalThis : self);
