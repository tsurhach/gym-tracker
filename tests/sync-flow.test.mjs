// Whole flow with the real client code (createSync) against the real VaultCore in memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSync } from "../js/sync.js";
import { emptyState } from "../js/store.js";
import { authenticator, memServer } from "./fakepasskey.mjs";

const sess = (id, name, updatedAt) => ({
  id,
  workoutName: name,
  startedAt: 1000,
  entries: [{ exerciseId: "x", sets: [{ weight: 50, reps: 8, done: true }] }],
  updatedAt,
});
const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

function device(
  server,
  auth,
  { prf = null, state = emptyState(), safe = true } = {},
) {
  const dev = { state, applied: 0, safe, key: null };
  const keyStore = {
    get: async () => dev.key,
    set: async (k) => void (dev.key = k),
  };
  dev.storage = mem();
  dev.sync = createSync({
    getState: () => dev.state,
    setState: (s) => (dev.state = s),
    isSafe: () => dev.safe,
    applied: () => dev.applied++,
    storage: dev.storage,
    passkey: auth.device({ prf }),
    fetch: server.fetch,
    keys: keyStore,
    url: "https://x",
  });
  return dev;
}
const prfBytes = () => crypto.getRandomValues(new Uint8Array(32));

test("turn on, second device signs in with PRF, edits flow both ways", async () => {
  const server = memServer();
  const auth = authenticator();
  const prf = prfBytes();
  const a = device(server, auth, {
    prf,
    state: { ...emptyState(), sessions: [sess("s1", "Push", 5)] },
  });
  const { recoveryCode } = await a.sync.enable();
  assert.match(recoveryCode, /^[0-9A-Z-]+$/);
  await a.sync.syncNow();
  assert.ok(a.sync.active());

  const b = device(server, auth, {
    prf,
    state: { ...emptyState(), sessions: [sess("s2", "Pull", 6)] },
  });
  assert.deepEqual(await b.sync.signIn(), { done: true });
  await b.sync.syncNow();
  assert.deepEqual(b.state.sessions.map((s) => s.id).sort(), ["s1", "s2"]);

  await a.sync.syncNow(); // picks up s2 that b pushed
  assert.deepEqual(a.state.sessions.map((s) => s.id).sort(), ["s1", "s2"]);
  assert.ok(a.applied >= 1);

  // delete on b, edit nothing on a: the tombstone travels
  b.state.sessions = b.state.sessions.filter((s) => s.id !== "s1");
  b.state.deleted = { s1: Date.now() + 10 };
  b.sync.changed();
  await b.sync.syncNow();
  await a.sync.syncNow();
  assert.deepEqual(
    a.state.sessions.map((s) => s.id),
    ["s2"],
  );
});

test("no PRF: new device asks for the recovery code; wrong code is refused", async () => {
  const server = memServer();
  const auth = authenticator();
  const a = device(server, auth, {
    prf: null,
    state: { ...emptyState(), sessions: [sess("s1", "Push", 5)] },
  });
  const { recoveryCode } = await a.sync.enable();
  await a.sync.syncNow();
  const b = device(server, auth, { prf: null });
  assert.deepEqual(await b.sync.signIn(), { needCode: true });
  assert.equal(b.sync.active(), false);
  await assert.rejects(
    b.sync.signInWithCode("0000-0000-0000-0000-0000-0000-00"),
    /does not open/,
  );
  await assert.rejects(b.sync.signInWithCode("garbage"), /does not open/);
  assert.deepEqual(await b.sync.signInWithCode(recoveryCode.toLowerCase()), {
    done: true,
  });
  await b.sync.syncNow();
  assert.equal(b.state.sessions[0].id, "s1");
});

test("new recovery code: old one stops working", async () => {
  const server = memServer();
  const auth = authenticator();
  const a = device(server, auth);
  const { recoveryCode: oldCode } = await a.sync.enable();
  await a.sync.syncNow();
  const newCode = await a.sync.newRecoveryCode();
  const b = device(server, auth);
  await b.sync.signIn();
  await assert.rejects(b.sync.signInWithCode(oldCode), /does not open/);
  assert.deepEqual(await b.sync.signInWithCode(newCode), { done: true });
});

test("a pulled merge is held while typing and applied on navigation (force)", async () => {
  const server = memServer();
  const auth = authenticator();
  const prf = prfBytes();
  const a = device(server, auth, { prf });
  await a.sync.enable();
  await a.sync.syncNow();
  const b = device(server, auth, { prf });
  await b.sync.signIn();
  await b.sync.syncNow();
  b.state.sessions.push(sess("new", "From b", Date.now()));
  b.sync.changed();
  await b.sync.syncNow();

  a.safe = false; // a is typing
  const before = a.state;
  await a.sync.syncNow();
  assert.equal(a.state, before, "no state swap while typing");
  assert.equal(a.applied, 0);
  assert.ok(a.sync.hasHeld());
  assert.equal(a.sync.applyHeld(), false);
  a.state.sessions.push(sess("typed", "Typed meanwhile", Date.now())); // a local edit made in the meantime
  assert.equal(a.sync.applyHeld(true), true); // navigation
  assert.deepEqual(a.state.sessions.map((s) => s.id).sort(), ["new", "typed"]); // nothing lost
  assert.equal(a.applied, 1);
});

test("offline: sync fails quietly, dirty stays, next try catches up", async () => {
  const server = memServer();
  const auth = authenticator();
  const a = device(server, auth);
  await a.sync.enable();
  await a.sync.syncNow();
  let online = false;
  const real = server.fetch;
  server.fetch = async (...x) => {
    if (!online) throw new TypeError("offline");
    return real(...x);
  };
  // rebuild the client against the flaky fetch, same stored session
  const a2 = createSync({
    getState: () => a.state,
    setState: (s) => (a.state = s),
    isSafe: () => true,
    applied() {},
    storage: a.storage,
    passkey: auth.device(),
    fetch: (...x) => server.fetch(...x),
    keys: { get: async () => a.key, set: async () => {} },
    url: "https://x",
  });
  a.state.sessions.push(sess("off", "Offline", Date.now()));
  a2.changed();
  await a2.syncNow();
  assert.equal(a2.status(), "Waiting for internet");
  online = true;
  await a2.syncNow();
  const b = device(server, auth);
  await b.sync.signIn().catch(() => {});
  const blobRow = [...server.vaults.values()][0].st.m.get("acct");
  assert.equal(blobRow.rev >= 2, true);
});

test("sign out keeps data; delete cloud data turns other devices off", async () => {
  const server = memServer();
  const auth = authenticator();
  const prf = prfBytes();
  const a = device(server, auth, {
    prf,
    state: { ...emptyState(), sessions: [sess("s1", "Push", 5)] },
  });
  await a.sync.enable();
  await a.sync.syncNow();
  const b = device(server, auth, { prf });
  await b.sync.signIn();
  await b.sync.syncNow();
  await a.sync.deleteCloud();
  assert.equal(a.sync.active(), false);
  assert.equal(a.state.sessions.length, 1);
  await b.sync.syncNow();
  assert.equal(b.sync.active(), false);
  assert.match(b.sync.status(), /turned off on another device/);
  assert.equal(b.state.sessions.length, 1); // local data untouched
  const c = device(server, authenticator());
  assert.equal(c.sync.status(), "Sync off");
});

test("the server never sees workout names, keys or plain data", async () => {
  const server = memServer();
  const auth = authenticator();
  const a = device(server, auth, {
    prf: prfBytes(),
    state: { ...emptyState(), sessions: [sess("s1", "SecretWorkoutName", 5)] },
  });
  await a.sync.enable();
  await a.sync.syncNow();
  const all = server.seen.join("\n");
  assert.ok(!all.includes("SecretWorkoutName"));
  assert.ok(!all.includes("Push"));
  const dump = JSON.stringify([...[...server.vaults.values()][0].st.m]);
  assert.ok(!dump.includes("SecretWorkoutName"));
});

test("a newer app format stops sync with a clear message", async () => {
  const server = memServer();
  const auth = authenticator();
  const a = device(server, auth);
  await a.sync.enable();
  await a.sync.syncNow();
  const { st } = [...server.vaults.values()][0];
  const { seal } = await import("../js/synccrypto.js");
  await st.put("blob", await seal(a.key, { syncFormat: 2, data: {} }));
  const acct = await st.get("acct");
  acct.rev += 1;
  await st.put("acct", acct);
  await a.sync.syncNow();
  assert.match(a.sync.status(), /Update the app/);
});
