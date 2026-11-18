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

## Updates

Every time the app is opened (or brought back to the foreground) it checks for a new version and, if there is one, reloads itself once. You never need to remove and re-add the home-screen app to get changes. The only exception is the home-screen **icon**, which iPhones capture once when the app is added.

## Push reminders

Reminders that arrive even when the app is closed come from a tiny free server on Cloudflare Workers (`worker/`). The app sends it the reminder settings and the allergens in rotation (with feeding dates) whenever they change. Every 10 minutes it checks, in your own time zone, whether a reminder is due, and sends a Web Push. Nothing else leaves the phone.

Without the server, reminders still show while the app is open or was recently used.

### One-time setup (about 5 minutes)

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up.
2. **Copy your Account ID**: in the dashboard, open **Workers & Pages**. The Account ID is shown on the right (or use the ⋯ menu next to your account name → *Copy account ID*).
3. **Create an API token**: profile icon → **My Profile → API Tokens → Create Token** → use the **Edit Cloudflare Workers** template. Under *Account Resources* pick your account and under *Zone Resources* pick *All zones*. Then **Continue → Create Token** and copy it.
4. **Add both to GitHub**: this repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: the token
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID
5. **Deploy**: **Actions** tab → **Push server** → **Run workflow**.

The workflow creates the storage, a `workers.dev` address and the signing keys, deploys the server, and writes its address into `push-config.js`. After a minute the site updates. Open Alma Eats from your home screen: if reminders are on, it connects automatically (otherwise tap the bell and turn them on). **Send a test notification** then goes through the server.

Later changes to the server deploy automatically when pushed to `main`.

### Developing the server

```
cd worker
npm install
npm test          # encryption checked against http_ece, plus the reminder schedule
npx wrangler dev  # needs a .dev.vars with VAPID_PRIVATE_JWK and VAPID_PUBLIC_KEY
```
