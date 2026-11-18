# Alma Eats

A small, installable web app for tracking Alma's first foods and keeping allergens in the weekly rotation.

- **Food checklist**: ~95 starter foods across allergens, veggies, fruits, grains, proteins and extras. Tap **+** to log a feeding; the app counts how many times each food has been offered. Tap a food's name to see its history, log a past date, or remove entries. Add your own foods with **+ Add a food**.
- **Allergens**: peanut, egg, cow's milk, wheat, soy, sesame, fish, shellfish and six tree nuts.
- **Twice-weekly rotation**: once an allergen has been offered, it appears in *Allergens this week* with two rounds: early week (Mon–Wed) and late week (Thu–Sun). Tap an allergen to check it off; that also logs the feeding.
- **Reminders**: on the day each round starts, at your chosen time (1:00 PM by default), you get a notification listing the allergens still to feed. If any are left, it reminds you again once a day until they're checked off. You can change the time and days under the bell button.

Everything is stored on the device. Use **Export / Import** in the reminder settings to back it up or move it.

## Running it

It's a static site with no build step. Serve the folder over HTTPS (for example with GitHub Pages: *Settings → Pages → Deploy from branch*), open it on your phone, and **Add to Home Screen**. On iPhone, notifications only work after it's added to the Home Screen and opened from there.

Local preview: `python3 -m http.server` and open http://localhost:8000.

## About notifications

The service worker checks for reminders whenever the app is opened and every minute while it's open or running in the background. On Android/Chrome it also uses Periodic Background Sync to check about once an hour while closed. iOS doesn't let web apps wake up in the background without a push server, so iPhone reminders show when the app is open or recently backgrounded. The service worker already handles `push` events, so a small Web Push server can be added later for fully closed-app reminders.
