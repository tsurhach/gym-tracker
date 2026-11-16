import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBody, vapidJwt, authHeader, pushUrl, SUBJECT } from "../server/src/lib.js";

const now = 1_000_000_000_000;
const ep = "https://web.push.apple.com/abc123";
const sched = (o) => parseBody(JSON.stringify({ endpoint: ep, at: now + 90_000, ...o }), { needAt: true, now });

test("valid schedule and cancel bodies", () => {
  assert.deepEqual(sched({}), { endpoint: ep, at: now + 90_000 });
  assert.deepEqual(parseBody(JSON.stringify({ endpoint: ep }), { needAt: false, now }), { endpoint: ep });
});

test("endpoint must be https on a known push host", () => {
  for (const h of ["https://web.push.apple.com/x", "https://x.push.apple.com/x", "https://fcm.googleapis.com/fcm/send/x",
    "https://updates.push.services.mozilla.com/x", "https://db5p.notify.windows.com/x"])
    assert.ok(pushUrl(h), h);
  for (const h of ["http://web.push.apple.com/x", "https://evil.com/x", "https://push.apple.com.evil.com/x",
    "https://evilpush.apple.com.x.test/", "https://a.notify.windows.com.evil.com/", "https://127.0.0.1/x",
    "https://web.push.apple.com:8443/x", "https://u:p@web.push.apple.com/x", "javascript:alert(1)", "nope", "", 5, null])
    assert.equal(pushUrl(h), null, String(h));
});

test("at must be finite, at most 2h ahead, and not older than a minute", () => {
  assert.ok(sched({ at: now + 2 * 3600_000 }));
  assert.equal(sched({ at: now + 2 * 3600_000 + 1 }), null);
  assert.equal(sched({ at: now - 61_000 }), null);
  assert.equal(sched({ at: now - 30_000 }).at, now); // fires immediately
  for (const at of [NaN, Infinity, "5", null, undefined]) assert.equal(sched({ at }), null);
});

test("bad bodies are rejected", () => {
  const p = (t) => parseBody(t, { needAt: true, now });
  for (const t of ["", "not json", "[]", "null", "5", JSON.stringify({ at: now }), "x".repeat(3000)])
    assert.equal(p(t), null);
});

test("VAPID JWT: three parts, header and claims, verifies against the public key", async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const jwt = await vapidJwt(ep, jwk, now);
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);
  const dec = (s) => JSON.parse(Buffer.from(s, "base64url").toString());
  assert.deepEqual(dec(parts[0]), { typ: "JWT", alg: "ES256" });
  const c = dec(parts[1]);
  assert.equal(c.aud, "https://web.push.apple.com");
  assert.equal(c.sub, SUBJECT);
  assert.ok(!c.sub.includes("@"));
  assert.equal(c.exp, Math.floor(now / 1000) + 12 * 3600);
  const sig = Buffer.from(parts[2], "base64url");
  assert.equal(sig.length, 64);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`)));
  assert.equal(authHeader("J", "K"), "vapid t=J, k=K");
});
