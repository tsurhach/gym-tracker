// Rest alarm server: Web Push encryption (RFC 8291 vector), validation, alarm lifecycle, route limits.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptPayload,
  fromB64u,
  toB64u,
  sendPush,
} from "../server/src/webpush.js";
import {
  RestAlarmCore,
  restRoute,
  checkSub,
  EXPIRE,
  MAX_AHEAD,
  MESSAGE,
} from "../server/src/restalarm.js";

// RFC 8291 section 5 and appendix A.
const UA_PUB =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AS_PRIV = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const AS_PUB =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const SALT = "DGv6ra1nlYgDCS1FRnbzlw";
const EXPECTED =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

const asKeys = async () => {
  const pub = fromB64u(AS_PUB);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: AS_PRIV,
    x: toB64u(pub.slice(1, 33)),
    y: toB64u(pub.slice(33)),
  };
  return {
    privateKey: await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    ),
    publicRaw: pub,
  };
};

test("RFC 8291 test vector: the encrypted body matches byte for byte", async () => {
  const body = await encryptPayload(
    new TextEncoder().encode("When I grow up, I want to be a watermelon"),
    fromB64u(UA_PUB),
    fromB64u(AUTH),
    {
      asKeys: await asKeys(),
      salt: fromB64u(SALT),
    },
  );
  assert.equal(toB64u(body), EXPECTED);
});

test("random keys and salt: the receiver can decrypt what we send", async () => {
  const ua = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const uaPub = new Uint8Array(
    await crypto.subtle.exportKey("raw", ua.publicKey),
  );
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const body = await encryptPayload(
    new TextEncoder().encode(MESSAGE),
    uaPub,
    auth,
  );
  assert.equal(body[20], 65); // key id length
  const salt = body.slice(0, 16);
  const asPub = body.slice(21, 86);
  const enc = new TextEncoder();
  const hk = async (s, ikm, info, n) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: s, info },
        await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
          "deriveBits",
        ]),
        n * 8,
      ),
    );
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: await crypto.subtle.importKey(
          "raw",
          asPub,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          [],
        ),
      },
      ua.privateKey,
      256,
    ),
  );
  const info = new Uint8Array([
    ...enc.encode("WebPush: info\0"),
    ...uaPub,
    ...asPub,
  ]);
  const prk = await hk(auth, secret, info, 32);
  const key = await crypto.subtle.importKey(
    "raw",
    await hk(salt, prk, enc.encode("Content-Encoding: aes128gcm\0"), 16),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: await hk(salt, prk, enc.encode("Content-Encoding: nonce\0"), 12),
      },
      key,
      body.slice(86),
    ),
  );
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), MESSAGE);
  assert.equal(plain.at(-1), 2);
});

const SUB = {
  endpoint: "https://web.push.apple.com/abc",
  keys: { p256dh: UA_PUB, auth: AUTH },
};
const T0 = Date.UTC(2026, 10, 25, 12, 0, 0);

test("checkSub: https on a known push host, real key sizes", () => {
  assert.deepEqual(checkSub(SUB), SUB);
  const bad = [
    null,
    {},
    { ...SUB, endpoint: "http://web.push.apple.com/x" },
    { ...SUB, endpoint: "https://evil.com/x" },
    { ...SUB, keys: { p256dh: UA_PUB } },
    { ...SUB, keys: { p256dh: "AAAA", auth: AUTH } },
    { ...SUB, keys: { p256dh: UA_PUB, auth: "AAAA" } },
    { ...SUB, keys: { p256dh: UA_PUB, auth: 5 } },
  ];
  for (const b of bad) assert.equal(checkSub(b), null, JSON.stringify(b));
  assert.ok(
    checkSub({ ...SUB, endpoint: "https://fcm.googleapis.com/fcm/send/x" }),
  );
  assert.ok(
    checkSub({
      ...SUB,
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x",
    }),
  );
});

function mem() {
  const m = new Map();
  return {
    m,
    alarm: null,
    get: async (k) => structuredClone(m.get(k)),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    deleteAll: async function () {
      m.clear();
      this.alarm = null;
    },
    setAlarm: async function (t) {
      this.alarm = t;
    },
    deleteAlarm: async function () {
      this.alarm = null;
    },
  };
}
function core(status = 201) {
  const st = mem();
  const sent = [];
  const o = { t: T0, status };
  const c = new RestAlarmCore(st, {
    now: () => o.t,
    send: async (sub, text) => (sent.push({ sub, text }), o.status),
  });
  return { c, st, sent, o };
}

test("register, schedule sets the alarm, cancel clears the fire time", async () => {
  const { c, st } = core();
  assert.equal(
    (await c.run("/rest/schedule", { endsAt: T0 + 5000 })).status,
    404,
  ); // not registered
  assert.equal((await c.run("/rest/register", { sub: SUB })).status, 200);
  assert.equal(st.alarm, T0 + EXPIRE);
  assert.equal(
    (await c.run("/rest/schedule", { endsAt: T0 + 90_000 })).status,
    200,
  );
  assert.equal(st.alarm, T0 + 90_000);
  assert.equal(
    (await c.run("/rest/schedule", { endsAt: T0 + 105_000 })).status,
    200,
  ); // +15 s: replaces
  assert.equal(st.alarm, T0 + 105_000);
  await c.run("/rest/cancel", {});
  assert.equal(st.alarm, T0 + EXPIRE);
  assert.equal(st.m.get("rec").fireAt, null);
});

test("endsAt must be within the next 15 minutes", async () => {
  const { c } = core();
  await c.run("/rest/register", { sub: SUB });
  assert.equal(
    (await c.run("/rest/schedule", { endsAt: T0 + MAX_AHEAD })).status,
    200,
  );
  for (const endsAt of [
    T0 + MAX_AHEAD + 1,
    T0 - 61_000,
    NaN,
    "5",
    null,
    undefined,
    Infinity,
  ])
    assert.equal(
      (await c.run("/rest/schedule", { endsAt })).status,
      400,
      String(endsAt),
    );
});

test("alarm sends the generic message once, then waits for the clean-up", async () => {
  const { c, st, sent, o } = core();
  await c.run("/rest/register", { sub: SUB });
  await c.run("/rest/schedule", { endsAt: T0 + 90_000 });
  o.t = T0 + 90_000;
  await c.alarm();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, MESSAGE);
  assert.equal(sent[0].sub.endpoint, SUB.endpoint);
  assert.equal(st.alarm, T0 + EXPIRE);
  await c.alarm(); // a retry of the same alarm
  assert.equal(sent.length, 1);
});

test("404 or 410 from the push service deletes everything; other errors keep it", async () => {
  for (const status of [404, 410]) {
    const { c, st, o } = core(status);
    await c.run("/rest/register", { sub: SUB });
    await c.run("/rest/schedule", { endsAt: T0 + 1000 });
    o.t = T0 + 1000;
    await c.alarm();
    assert.equal(st.m.size, 0);
    assert.equal(st.alarm, null);
  }
  const { c, st, o } = core(503);
  await c.run("/rest/register", { sub: SUB });
  await c.run("/rest/schedule", { endsAt: T0 + 1000 });
  o.t = T0 + 1000;
  await c.alarm();
  assert.equal(st.m.size, 1);
});

test("unused for 60 days: deleted by the clean-up alarm", async () => {
  const { c, st, sent, o } = core();
  await c.run("/rest/register", { sub: SUB });
  o.t = T0 + EXPIRE - 1;
  await c.alarm();
  assert.equal(st.m.size, 1);
  o.t = T0 + EXPIRE;
  await c.alarm();
  assert.equal(st.m.size, 0);
  assert.equal(sent.length, 0);
});

test("unregister deletes; register with a bad subscription is refused", async () => {
  const { c, st } = core();
  assert.equal(
    (
      await c.run("/rest/register", {
        sub: { endpoint: "https://evil.com/x", keys: SUB.keys },
      })
    ).status,
    400,
  );
  await c.run("/rest/register", { sub: SUB });
  await c.run("/rest/unregister", {});
  assert.equal(st.m.size, 0);
  assert.equal(st.alarm, null);
});

test("sendPush: encrypted body, VAPID header, TTL 60, status returned", async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  let seen;
  const status = await sendPush(SUB, MESSAGE, {
    privateJwk,
    publicKey: "PUB",
    fetchFn: async (url, init) => ((seen = { url, init }), { status: 201 }),
  });
  assert.equal(status, 201);
  assert.equal(seen.url, SUB.endpoint);
  const h = seen.init.headers;
  assert.equal(h.TTL, "60");
  assert.equal(h["Content-Encoding"], "aes128gcm");
  assert.match(h.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=PUB$/);
  assert.ok(seen.init.body.length > 86);
  assert.equal(
    await sendPush(SUB, MESSAGE, {
      privateJwk,
      publicKey: "P",
      fetchFn: async () => {
        throw new Error("offline");
      },
    }),
    0,
  );
});

// ---- route ----
const DEV = "abcdefghijklmnopqrstuv";
function env({ limit = 1000 } = {}) {
  const cores = new Map();
  const e = {
    touched: 0,
    ALARM: {
      idFromName: (n) => n,
      get: (n) => ({
        run: (p, b) => {
          e.touched++;
          if (!cores.has(n))
            cores.set(
              n,
              new RestAlarmCore(mem(), {
                now: () => T0,
                send: async () => 201,
              }),
            );
          return cores.get(n).run(p, b);
        },
      }),
    },
    RL: { calls: 0, limit: async () => ({ success: ++e.RL.calls <= limit }) },
  };
  return e;
}
const post = (path, body) =>
  new Request("https://x" + path, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("route: register then schedule works; bad device id, bad JSON, big body never reach the object", async () => {
  const e = env();
  assert.equal(
    (
      await restRoute(
        post("/rest/register", { device: DEV, sub: SUB }),
        e,
        "/rest/register",
        {},
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await restRoute(
        post("/rest/schedule", { device: DEV, endsAt: T0 + 5000 }),
        e,
        "/rest/schedule",
        {},
      )
    ).status,
    200,
  );
  const n = e.touched;
  for (const body of [
    { device: "short", endsAt: 1 },
    { endsAt: 1 },
    "not json",
    "[]",
    "null",
  ])
    assert.equal(
      (await restRoute(post("/rest/schedule", body), e, "/rest/schedule", {}))
        .status,
      400,
    );
  assert.equal(
    (
      await restRoute(
        post("/rest/schedule", { device: DEV, pad: "x".repeat(3000) }),
        e,
        "/rest/schedule",
        {},
      )
    ).status,
    413,
  );
  assert.equal(
    (await restRoute(post("/rest/nope", {}), e, "/rest/nope", {})).status,
    404,
  );
  assert.equal(e.touched, n);
});

test("route: per-IP rate limit answers 429", async () => {
  const e = env({ limit: 2 });
  const go = () =>
    restRoute(post("/rest/cancel", { device: DEV }), e, "/rest/cancel", {});
  assert.equal((await go()).status, 404);
  assert.equal((await go()).status, 404);
  assert.equal((await go()).status, 429);
});
