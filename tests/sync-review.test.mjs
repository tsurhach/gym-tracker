// Fixes from the Opus review of phase 3: each test below failed before its fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSync, merge } from "../js/sync.js";
import { createStore, emptyState } from "../js/store.js";
import { VaultCore } from "../server/src/vault.js";
import { b64u } from "../server/src/syncauth.js";
import {
  authenticator,
  memServer,
  memStorage,
  ORIGIN,
  SECRET,
} from "./fakepasskey.mjs";

const sess = (id, name = "A", updatedAt = 5) => ({
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
const prfBytes = () => crypto.getRandomValues(new Uint8Array(32));

function device(
  server,
  auth,
  { prf = null, state = emptyState(), safe = true, fetch = server.fetch } = {},
) {
  const d = { state, safe, key: null, storage: mem(), applied: 0 };
  d.keys = { get: async () => d.key, set: async (k) => void (d.key = k) };
  d.make = () =>
    createSync({
      getState: () => d.state,
      setState: (s) => (d.state = s),
      isSafe: () => d.safe,
      applied: () => d.applied++,
      storage: d.storage,
      passkey: auth.device({ prf }),
      fetch: (...a) => fetch(...a),
      keys: d.keys,
      url: "https://x",
    });
  d.sync = d.make();
  return d;
}
const ids = (d) => d.state.sessions.map((s) => s.id).sort();

async function pair(opts = {}) {
  const server = memServer();
  const auth = authenticator();
  const prf = prfBytes();
  const a = device(server, auth, { prf, ...(opts.a ?? {}) });
  await a.sync.enable();
  await a.sync.syncNow();
  const b = device(server, auth, { prf, ...(opts.b ?? {}) });
  await b.sync.signIn();
  await b.sync.syncNow();
  return { server, auth, a, b };
}
// A pushes a session while B is "typing", so B holds it.
async function heldOnB(p) {
  p.a.state.sessions.push(sess("from-a", "A made this", Date.now()));
  p.a.sync.changed();
  await p.a.sync.syncNow();
  p.b.safe = false;
  await p.b.sync.syncNow();
  assert.ok(p.b.sync.hasHeld());
}
const serverHas = async (p, id) => {
  // A fresh phone: empty data, no remembered rev, so it must download whatever the server holds.
  p.a.state = emptyState();
  const ses = JSON.parse(p.a.storage.getItem("gymtracker.sync"));
  p.a.storage.setItem("gymtracker.sync", JSON.stringify({ ...ses, rev: 0, dirty: false }));
  p.a.sync = p.a.make();
  await p.a.sync.syncNow();
  return ids(p.a).includes(id);
};

test("B1: a flush while remote data is held does not erase it from the server", async () => {
  const p = await pair();
  await heldOnB(p);
  p.b.sync.changed(); // B edits something, then the app is hidden
  await p.b.sync.flush();
  assert.ok(await serverHas(p, "from-a"));
});

test("B1: closing the app with held data does not erase it either (reload pulls it again)", async () => {
  const p = await pair();
  await heldOnB(p);
  p.b.sync = p.b.make(); // app killed and reopened: memory is gone, storage stays
  p.b.safe = true;
  await p.b.sync.syncNow();
  assert.ok(ids(p.b).includes("from-a"), "applied after reload");
  assert.ok(await serverHas(p, "from-a"));
});

test("B2: two pushes at the same rev cannot both win", async () => {
  const st = memStorage();
  const slow = {
    ...st,
    get: async (k) => (await Promise.resolve(), await st.get(k)),
  };
  const core = new VaultCore(slow, {
    secret: SECRET,
    origins: [ORIGIN],
    now: () => Date.now(),
  });
  await st.put("acct", {
    credentials: {},
    tokens: {
      [await (await import("../server/src/syncauth.js")).sha256b64u("tok")]:
        Date.now(),
    },
    rev: 5,
    touchedAt: 1,
  });
  const push = () =>
    core.handle("/sync/push", { token: "tok", rev: 5, blob: "abc" });
  const r = await Promise.all([push(), push()]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  assert.equal((await st.get("acct")).rev, 6);
});

test("B3: deleting a record stamped by a fast clock stays deleted", () => {
  const future = Date.now() + 1e9;
  const storage = mem();
  const store = createStore(storage);
  const state = { ...emptyState(), sessions: [sess("s", "A", future)] };
  storage.setItem("gymtracker.v1", JSON.stringify(state));
  const { state: loaded } = store.load();
  loaded.sessions = [];
  store.save(loaded);
  assert.ok(loaded.deleted.s > future);
  const remote = { ...emptyState(), sessions: [sess("s", "A", future)] };
  assert.deepEqual(merge(loaded, remote).state.sessions, []);
});

test("S1: a save during a running sync is pushed afterwards", async () => {
  const server = memServer();
  const auth = authenticator();
  let gate;
  const slow = async (...a) => {
    if (gate) await gate;
    return server.fetch(...a);
  };
  const a = device(server, auth, { fetch: slow });
  await a.sync.enable();
  await a.sync.syncNow();
  let release;
  gate = new Promise((r) => (release = r));
  const running = a.sync.syncNow();
  a.state.sessions.push(sess("late", "Late", Date.now()));
  a.sync.changed(); // arrives while the sync is in flight
  gate = null;
  release();
  await running;
  await new Promise((r) => setTimeout(r, 3300)); // the follow-up run the fix schedules
  const b = device(server, auth);
  b.key = a.key; // same account, shortcut sign-in for the check
  const check = [...server.vaults.values()][0].st.m.get("blob");
  assert.ok(check);
  const { open } = await import("../js/synccrypto.js");
  assert.ok(
    (await open(a.key, check)).data.sessions.some((s) => s.id === "late"),
  );
});

test("S2: foregrounding with nothing changed does not push", async () => {
  const p = await pair();
  const rev = () => [...p.server.vaults.values()][0].st.m.get("acct").rev;
  const before = rev();
  await p.a.sync.syncNow();
  await p.b.sync.syncNow();
  assert.equal(rev(), before);
});

test("S3: rate-limit binding is declared and covers push and invite code entry", () => {
  const w = readFileSync(
    new URL("../server/wrangler.jsonc", import.meta.url),
    "utf8",
  );
  assert.match(w, /"ratelimits"[\s\S]*"name": "RL"/);
  assert.match(
    readFileSync(new URL("../server/src/index.js", import.meta.url), "utf8"),
    /RL_PATHS\.has\(path\)\)\s*\{\s*const \{ success \} = await env\.RL/,
  );
});

test("S4: a captured sign-in assertion works once", async () => {
  const server = memServer();
  const auth = authenticator();
  const a = device(server, auth, { prf: prfBytes() });
  await a.sync.enable();
  const acctId = [...server.vaults.keys()][0];
  const ch = (
    await (
      await server.fetch("https://x/auth/challenge", { body: "{}" })
    ).json()
  ).challenge;
  const as = await auth.device().assert({ challenge: ch });
  const send = async () =>
    (
      await server.fetch("https://x/auth/signin", {
        body: JSON.stringify({ ...as, challenge: ch, accountId: acctId }),
      })
    ).status;
  assert.equal(await send(), 200);
  assert.equal(await send(), 404);
});

test("S5: too big and unreadable cloud data say so, not 'Waiting for internet'", async () => {
  const p = await pair();
  const real = p.server.fetch;
  const big = device(p.server, p.auth, {
    fetch: async (u, o) =>
      u.endsWith("/sync/push")
        ? { status: 413, json: async () => ({}) }
        : real(u, o),
  });
  big.key = p.a.key;
  big.storage = p.a.storage;
  big.sync = big.make();
  big.state.sessions.push(sess("x", "X", Date.now()));
  big.sync.changed();
  await big.sync.syncNow();
  assert.match(big.sync.status(), /Too much data/);
  // tampered blob
  const row = [...p.server.vaults.values()][0].st;
  row.m.set("blob", "AAAAAAAAAAAAAAAAAAAAAAAA");
  const acct = row.m.get("acct");
  acct.rev += 1;
  row.m.set("acct", acct);
  await p.a.sync.syncNow();
  assert.match(p.a.sync.status(), /could not be read/);
});

test("S6: a sheet on screen blocks applying a held merge", () => {
  assert.match(
    readFileSync(new URL("../js/app.js", import.meta.url), "utf8"),
    /!typing && !document\.querySelector\("\.sheet"\)/,
  );
});

test("plan-day order syncs: the later reorder wins, both ways", () => {
  const w = (id) => ({ id, name: id, muscles: [], items: [] });
  const storage = mem();
  const store = createStore(storage);
  storage.setItem(
    "gymtracker.v1",
    JSON.stringify({ ...emptyState(), workouts: [w("a"), w("b"), w("c")] }),
  );
  const { state } = store.load();
  const other = structuredClone(state);
  state.workouts.reverse(); // this device moves things around
  store.save(state);
  assert.deepEqual(state.workoutOrder.ids, ["c", "b", "a"]);
  assert.deepEqual(
    merge(other, state).state.workouts.map((x) => x.id),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    merge(state, other).state.workouts.map((x) => x.id),
    ["c", "b", "a"],
  );
  // a day added elsewhere is appended, not lost
  const added = {
    ...structuredClone(other),
    workouts: [...other.workouts, w("d")],
  };
  assert.deepEqual(
    merge(state, added).state.workouts.map((x) => x.id),
    ["c", "b", "a", "d"],
  );
});
