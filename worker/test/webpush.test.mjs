// Encrypt with our WebCrypto implementation, decrypt with the reference http_ece library.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ece from "http_ece";
import { encryptPayload, vapidHeader, generateVapidKeys, b64urlEncode, b64urlDecode } from "../src/webpush.js";

// A fake browser subscription
const ua = crypto.createECDH("prime256v1");
ua.generateKeys();
const auth = crypto.randomBytes(16);
const sub = { endpoint: "https://push.example.com/abc", keys: { p256dh: b64urlEncode(ua.getPublicKey()), auth: b64urlEncode(auth) } };

for (const msg of ["hi", JSON.stringify({ title: "Allergen time for Alma 🥄", body: "Still to feed: egg & peanut." }), "x".repeat(3000)]) {
  const body = await encryptPayload(sub, msg);
  const out = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: ua, authSecret: auth });
  assert.equal(out.toString("utf8"), msg);
}
console.log("✓ aes128gcm payload decrypts with http_ece");

// VAPID JWT verifies with the public key
const keys = await generateVapidKeys();
const h = await vapidHeader("https://web.push.apple.com/xyz", { ...keys, subject: "https://example.com/" });
const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
assert.ok(m, "header shape");
assert.equal(m[4], keys.publicKey);
const claims = JSON.parse(Buffer.from(b64urlDecode(m[2])).toString());
assert.equal(claims.aud, "https://web.push.apple.com");
assert.ok(claims.exp > Date.now() / 1000);
const pub = await crypto.webcrypto.subtle.importKey("raw", b64urlDecode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
const ok = await crypto.webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64urlDecode(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
assert.ok(ok, "signature verifies");
assert.equal(b64urlDecode(m[3]).length, 64, "raw r||s signature");
console.log("✓ VAPID JWT is valid ES256");
