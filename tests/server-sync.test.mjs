import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeChallenge,
  checkChallenge,
  derToRaw,
  verifyAssertion,
  parseSyncBody,
  MAX_BLOB,
  b64u,
} from "../server/src/syncauth.js";
import { VaultCore, IDLE_DELETE } from "../server/src/vault.js";
import {
  authenticator,
  memStorage,
  memServer,
  rawToDer,
  ORIGIN,
  SECRET,
} from "./fakepasskey.mjs";

const T0 = 1_800_000_000_000;
const origins = [ORIGIN];
const wrap = "A".repeat(48);
const accountId = b64u(crypto.getRandomValues(new Uint8Array(16)));

test("challenge expires after 2 minutes", async () => {
  const c = await makeChallenge(SECRET, T0);
  assert.ok(await checkChallenge(SECRET, c, T0 + 119_000));
  assert.equal(await checkChallenge(SECRET, c, T0 + 121_000), false);
});

test("forged challenge rejected", async () => {
  const c = await makeChallenge(SECRET, T0);
  assert.equal(await checkChallenge("other-secret", c, T0), false);
  const [t, r, m] = c.split(".");
  assert.equal(
    await checkChallenge(
      SECRET,
      `${(parseInt(t, 36) + 1).toString(36)}.${r}.${m}`,
      T0,
    ),
    false,
  );
  for (const bad of ["", "a.b", "a.b.c", null, 5])
    assert.equal(await checkChallenge(SECRET, bad, T0), false);
});

test("DER signature converts to raw, including sign padding and short integers", async () => {
  for (let i = 0; i < 20; i++) {
    const raw = crypto.getRandomValues(new Uint8Array(64));
    if (i === 0) raw.fill(0xff); // high bits set: DER adds 0x00 padding
    if (i === 1) raw.fill(0, 0, 3); // leading zeros stripped by DER
    assert.deepEqual(derToRaw(rawToDer(raw)), raw);
  }
  assert.throws(() => derToRaw(new Uint8Array([0x31, 0])));
  assert.throws(() => derToRaw(new Uint8Array([0x30, 5, 0x02, 1, 1])));
});

async function setup() {
  const auth = authenticator();
  const dev = auth.device();
  const challenge = await makeChallenge(SECRET, T0);
  const reg = await dev.register({ challenge, accountId });
  return { dev, reg, auth };
}
const verifyArgs = async (dev, reg, o = {}) => {
  const challenge = o.challenge ?? (await makeChallenge(SECRET, T0));
  const a = await dev.assert({ challenge, credentialId: reg.credentialId });
  return { spki: reg.publicKey, ...a };
};
const opts = { secret: SECRET, origins, now: T0 };

test("valid ES256 assertion accepted", async () => {
  const { dev, reg } = await setup();
  assert.equal(await verifyAssertion(await verifyArgs(dev, reg), opts), true);
});

test("assertion with a stale or foreign challenge is rejected", async () => {
  const { dev, reg } = await setup();
  const old = await makeChallenge(SECRET, T0 - 200_000);
  assert.equal(
    await verifyAssertion(await verifyArgs(dev, reg, { challenge: old }), opts),
    false,
  );
  const foreign = await makeChallenge("someone-else", T0);
  assert.equal(
    await verifyAssertion(
      await verifyArgs(dev, reg, { challenge: foreign }),
      opts,
    ),
    false,
  );
});

test("wrong origin rejected", async () => {
  const { reg } = await setup();
  const evil = authenticator().device({ origin: "https://evil.example" });
  const other = await evil.register({
    challenge: await makeChallenge(SECRET, T0),
    accountId,
  });
  assert.equal(
    await verifyAssertion(await verifyArgs(evil, other), opts),
    false,
  );
  assert.ok(reg);
});

test("wrong rpId hash, missing user-verified flag, bad signature rejected", async () => {
  const { dev, reg } = await setup();
  const good = await verifyArgs(dev, reg);
  const ad = Buffer.from(
    good.authenticatorData.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  const flip = (fn) => {
    const c = Buffer.from(ad);
    fn(c);
    return { ...good, authenticatorData: c.toString("base64url") };
  };
  assert.equal(
    await verifyAssertion(
      flip((c) => (c[0] ^= 1)),
      opts,
    ),
    false,
  ); // rpIdHash
  assert.equal(
    await verifyAssertion(
      flip((c) => (c[32] = 0x01)),
      opts,
    ),
    false,
  ); // no user verification
  assert.equal(
    await verifyAssertion(
      flip((c) => (c[32] = 0x04)),
      opts,
    ),
    false,
  ); // no user presence
  assert.equal(
    await verifyAssertion({ ...good, signature: "AAAA" }, opts),
    false,
  );
  const { reg: other } = await setup();
  assert.equal(
    await verifyAssertion({ ...good, spki: other.publicKey }, opts),
    false,
  );
});

test("parseSyncBody and size limits", () => {
  assert.deepEqual(parseSyncBody('{"a":1}'), { a: 1 });
  for (const t of ["[]", "null", "x", "", "x".repeat(2_200_000)])
    assert.equal(parseSyncBody(t), null);
});

// ---- the vault ----

async function account(server, o = {}) {
  const auth = authenticator();
  const dev = auth.device(o);
  const id = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const ch = (
    await (
      await server.fetch("https://x/auth/challenge", { body: "{}" })
    ).json()
  ).challenge;
  const reg = await dev.register({ challenge: ch, accountId: id });
  const post = async (path, body) => {
    const r = await server.fetch("https://x" + path, {
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const r = await post("/auth/register", {
    ...reg,
    challenge: ch,
    accountId: id,
    wrapCode: wrap,
    wrapPrf: "B".repeat(48),
  });
  return { dev, reg, id, post, token: r.body.token, status: r.status, auth };
}

test("register then sign in returns wrapped keys", async () => {
  const server = memServer({ now: () => T0 });
  const a = await account(server);
  assert.equal(a.status, 200);
  const ch = (
    await (
      await server.fetch("https://x/auth/challenge", { body: "{}" })
    ).json()
  ).challenge;
  const as = await a.dev.assert({
    challenge: ch,
    credentialId: a.reg.credentialId,
  });
  const r = await a.post("/auth/signin", {
    ...as,
    challenge: ch,
    accountId: a.id,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.wrapCode, wrap);
  assert.equal(r.body.wrapPrf, "B".repeat(48));
  assert.notEqual(r.body.token, a.token);
  // a replayed registration cannot take over the account
  const again = await a.post("/auth/register", {
    ...a.reg,
    accountId: a.id,
    wrapCode: wrap,
  });
  assert.equal(again.status, 409);
});

test("registration with a bad challenge, alg or key is rejected", async () => {
  const server = memServer({ now: () => T0 });
  const dev = authenticator().device();
  const ch = await makeChallenge("not-ours", T0);
  const reg = await dev.register({ challenge: ch, accountId });
  const post = (b) =>
    server.fetch("https://x/auth/register", { body: JSON.stringify(b) });
  assert.equal(
    (await post({ ...reg, challenge: ch, accountId, wrapCode: wrap })).status,
    400,
  );
  const good = await makeChallenge(SECRET, T0);
  const reg2 = await dev.register({ challenge: good, accountId });
  assert.equal(
    (await post({ ...reg2, alg: -257, accountId, wrapCode: wrap })).status,
    400,
  );
  assert.equal(
    (await post({ ...reg2, publicKey: "AAAA", accountId, wrapCode: wrap }))
      .status,
    400,
  );
});

test("wrong token gets the same 404 as a missing account", async () => {
  const server = memServer({ now: () => T0 });
  const a = await account(server);
  const wrong = await a.post("/sync/pull", {
    accountId: a.id,
    token: "nope",
    rev: 0,
  });
  const missing = await a.post("/sync/pull", {
    accountId: b64u(crypto.getRandomValues(new Uint8Array(16))),
    token: a.token,
    rev: 0,
  });
  assert.equal(wrong.status, 404);
  assert.deepEqual(wrong, missing);
});

test("push with stale rev gets 409, pull returns what was pushed", async () => {
  const server = memServer({ now: () => T0 });
  const a = await account(server);
  const auth = { accountId: a.id, token: a.token };
  assert.deepEqual((await a.post("/sync/pull", { ...auth, rev: 0 })).body, {
    rev: 0,
  });
  const p1 = await a.post("/sync/push", {
    ...auth,
    rev: 0,
    blob: "abc_DEF-123",
  });
  assert.deepEqual(p1.body, { rev: 1 });
  const stale = await a.post("/sync/push", { ...auth, rev: 0, blob: "zzz" });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.rev, 1);
  assert.deepEqual((await a.post("/sync/pull", { ...auth, rev: 0 })).body, {
    rev: 1,
    blob: "abc_DEF-123",
  });
  assert.deepEqual((await a.post("/sync/pull", { ...auth, rev: 1 })).body, {
    rev: 1,
  }); // nothing new
});

test("oversize or malformed blob rejected", async () => {
  const server = memServer({ now: () => T0 });
  const a = await account(server);
  const auth = { accountId: a.id, token: a.token };
  for (const blob of ["A".repeat(MAX_BLOB + 1), "", 5, "has space", null])
    assert.equal(
      (await a.post("/sync/push", { ...auth, rev: 0, blob })).status,
      413,
    );
  assert.equal(
    (
      await a.post("/sync/push", {
        ...auth,
        rev: 0,
        blob: "A".repeat(MAX_BLOB),
      })
    ).status,
    200,
  );
});

test("rewrap replaces the recovery wrap; rejects junk", async () => {
  const server = memServer({ now: () => T0 });
  const a = await account(server);
  const auth = { accountId: a.id, token: a.token };
  assert.equal(
    (await a.post("/account/rewrap", { ...auth, wrapCode: "C".repeat(48) }))
      .status,
    200,
  );
  assert.equal(
    (
      await a.post("/account/rewrap", {
        ...auth,
        wrapCode: "no spaces allowed!",
      })
    ).status,
    400,
  );
  const ch = (
    await (
      await server.fetch("https://x/auth/challenge", { body: "{}" })
    ).json()
  ).challenge;
  const as = await a.dev.assert({
    challenge: ch,
    credentialId: a.reg.credentialId,
  });
  assert.equal(
    (await a.post("/auth/signin", { ...as, challenge: ch, accountId: a.id }))
      .body.wrapCode,
    "C".repeat(48),
  );
});

test("sign out kills the token; delete removes everything", async () => {
  const server = memServer({ now: () => T0 });
  const a = await account(server);
  const auth = { accountId: a.id, token: a.token };
  await a.post("/sync/push", { ...auth, rev: 0, blob: "abc" });
  assert.equal((await a.post("/account/signout", auth)).status, 200);
  assert.equal((await a.post("/sync/pull", { ...auth, rev: 0 })).status, 404);
  const b = await account(server);
  const authB = { accountId: b.id, token: b.token };
  await b.post("/sync/push", { ...authB, rev: 0, blob: "abc" });
  assert.equal((await b.post("/account/delete", authB)).status, 200);
  assert.equal(server.core(b.id).st.m.size, 0);
  assert.equal((await b.post("/sync/pull", { ...authB, rev: 0 })).status, 404);
});

test("alarm deletes after 36 months idle; activity resets it", async () => {
  let now = T0;
  const server = memServer({ now: () => now });
  const a = await account(server);
  const { core, st } = server.core(a.id);
  assert.equal(st.alarm, T0 + IDLE_DELETE);
  now = T0 + IDLE_DELETE - 1000;
  await core.alarm(); // not yet idle long enough
  assert.ok(st.m.has("acct"));
  now = T0 + 10 * 30 * 24 * 3600 * 1000;
  await a.post("/sync/pull", { accountId: a.id, token: a.token, rev: 0 }); // the owner's device
  assert.equal(st.alarm, now + IDLE_DELETE);
  now = T0 + IDLE_DELETE + 1000; // 36 months after the first visit, but only 26 after the last
  await core.alarm();
  assert.ok(st.m.has("acct"));
  now += 10 * 30 * 24 * 3600 * 1000;
  await core.alarm();
  assert.equal(st.m.size, 0);
});

test("an idle token expires after 12 months", async () => {
  let now = T0;
  const server = memServer({ now: () => now });
  const a = await account(server);
  now += 13 * 30 * 24 * 3600 * 1000;
  assert.equal(
    (await a.post("/sync/pull", { accountId: a.id, token: a.token, rev: 0 }))
      .status,
    404,
  );
});

test("per-account rate limit", async () => {
  const st = memStorage();
  const core = new VaultCore(st, { secret: SECRET, origins, now: () => T0 });
  let last;
  for (let i = 0; i < 61; i++)
    last = await core.handle("/sync/pull", { token: "x" });
  assert.equal(last.status, 429);
});

test("the server only stores keys it cannot use and one sealed blob", async () => {
  const server = memServer({ now: () => T0 });
  const a = await account(server);
  await a.post("/sync/push", {
    accountId: a.id,
    token: a.token,
    rev: 0,
    blob: "sealedstuff",
  });
  const dump = JSON.stringify([...server.core(a.id).st.m]);
  assert.ok(!dump.includes(a.token)); // only its hash is kept
  assert.deepEqual([...server.core(a.id).st.m.keys()].sort(), ["acct", "blob"]);
});
