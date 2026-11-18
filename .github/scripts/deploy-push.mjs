// Sets up and deploys the Alma Eats push server on Cloudflare Workers.
// Idempotent: safe to run on every push. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { generateVapidKeys } from "../../worker/src/webpush.js";

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const SCRIPT = "alma-eats-push";
const KV_TITLE = "alma-eats-push";
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;

async function cf(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.success !== false, status: res.status, data };
}
function fail(msg, r) {
  console.error(`✗ ${msg}`, r ? JSON.stringify(r.data && r.data.errors) : "");
  process.exit(1);
}

// 1. KV namespace
let r = await cf("/storage/kv/namespaces?per_page=100");
if (!r.ok) fail("Could not list KV namespaces. Check the API token has 'Workers KV Storage: Edit'.", r);
let ns = r.data.result.find((n) => n.title === KV_TITLE);
if (!ns) {
  r = await cf("/storage/kv/namespaces", { method: "POST", body: JSON.stringify({ title: KV_TITLE }) });
  if (!r.ok) fail("Could not create KV namespace.", r);
  ns = r.data.result;
  console.log("✓ Created KV namespace");
}
const tomlPath = new URL("../../worker/wrangler.toml", import.meta.url);
writeFileSync(tomlPath, readFileSync(tomlPath, "utf8").replace("__KV_ID__", ns.id));

// 2. workers.dev subdomain (new accounts don't have one yet)
r = await cf("/workers/subdomain");
let sub = r.ok && r.data.result && r.data.result.subdomain;
if (!sub) {
  const want = `alma-eats-${Math.random().toString(36).slice(2, 8)}`;
  r = await cf("/workers/subdomain", { method: "PUT", body: JSON.stringify({ subdomain: want }) });
  if (!r.ok) fail("Could not register a workers.dev subdomain. Open Workers & Pages in the Cloudflare dashboard once, then re-run.", r);
  sub = r.data.result.subdomain;
  console.log(`✓ Registered ${sub}.workers.dev`);
}

// 3. Deploy
execSync("npx wrangler deploy", { cwd: new URL("../../worker", import.meta.url).pathname, stdio: "inherit" });

// 4. VAPID keys (generated once, kept as Worker secrets)
r = await cf(`/workers/scripts/${SCRIPT}/secrets`);
if (!r.ok) fail("Could not list Worker secrets.", r);
const have = new Set(r.data.result.map((s) => s.name));
if (!have.has("VAPID_PRIVATE_JWK") || !have.has("VAPID_PUBLIC_KEY")) {
  const keys = await generateVapidKeys();
  for (const [name, text] of [["VAPID_PRIVATE_JWK", JSON.stringify(keys.privateJwk)], ["VAPID_PUBLIC_KEY", keys.publicKey]]) {
    r = await cf(`/workers/scripts/${SCRIPT}/secrets`, { method: "PUT", body: JSON.stringify({ name, text, type: "secret_text" }) });
    if (!r.ok) fail(`Could not save secret ${name}.`, r);
  }
  console.log("✓ Generated VAPID keys");
}

// 5. Tell the app where the server lives
const url = `https://${SCRIPT}.${sub}.workers.dev`;
const cfgPath = new URL("../../push-config.js", import.meta.url);
writeFileSync(cfgPath, `// Written by the push-server workflow. Where the app registers for push reminders.\nwindow.ALMA_PUSH_URL = "${url}";\n`);

for (let i = 0; i < 12; i++) {
  try {
    const res = await fetch(url + "/vapid");
    if (res.ok && (await res.json()).publicKey) { console.log(`✓ Push server is live at ${url}`); break; }
  } catch (_) {}
  await new Promise((s) => setTimeout(s, 5000));
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Push server: ${url}\n`);
