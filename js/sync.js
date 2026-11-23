import { isValidState } from "./store.js";
import { SERVER } from "./push.js";
import * as sc from "./synccrypto.js";

// Hidden by default: while false nothing below runs, no route, no link, no network.
export const SYNC_ENABLED = false;
export const SYNC_URL = SERVER; // the same Worker; sync adds routes to it
export const SYNC_FORMAT = 1;
const COLLECTIONS = ["customExercises", "workouts", "sessions", "bodyWeights"];
const sig = (r) => JSON.stringify(r);
const upd = (r) => (r && typeof r.updatedAt === "number" ? r.updatedAt : 0);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// ---------- pure merge ----------

// Larger updatedAt wins; equal -> the larger JSON string, so every device picks the same one.
function newer(a, b, f = sig) {
  if (!a) return b;
  if (!b) return a;
  if (upd(a) !== upd(b)) return upd(a) > upd(b) ? a : b;
  return f(a) >= f(b) ? a : b;
}
const settingsSig = (s) => sig({ ...s, lastExportAt: undefined });

// merge(local, remote) -> { state, changed, error? }. Never mutates its inputs.
// A merged result that is not a valid state is abandoned: local comes back untouched.
export function merge(local, remote) {
  const deleted = { ...(local.deleted ?? {}) };
  for (const [id, t] of Object.entries(remote.deleted ?? {}))
    deleted[id] = Math.max(t, deleted[id] ?? 0);
  // Top-level keys not handled here stay local-only: a new synced collection needs a SYNC_FORMAT bump.
  const out = { ...local };
  for (const c of COLLECTIONS) {
    if (!local[c] && !remote[c]) continue;
    const byId = new Map();
    const loose = []; // records without an id cannot be matched: keep the local ones as they are
    for (const r of local[c] ?? []) r?.id ? byId.set(r.id, r) : loose.push(r);
    for (const r of remote[c] ?? [])
      if (r?.id) byId.set(r.id, newer(byId.get(r.id), r));
    out[c] = [...byId.values()]
      .filter((r) => !(r.id in deleted && deleted[r.id] >= upd(r)))
      .concat(loose);
  }
  if (local.deleted || Object.keys(deleted).length) out.deleted = deleted;
  // Plan-day order: the later reorder wins; days it does not list keep their place at the end.
  const wo = newer(local.workoutOrder, remote.workoutOrder);
  if (wo && out.workouts) {
    out.workoutOrder = wo;
    const at = new Map(wo.ids.map((id, i) => [id, i]));
    out.workouts = out.workouts.map((w, i) => [w, i]).sort((a, b) => (at.get(a[0].id) ?? 1e9) - (at.get(b[0].id) ?? 1e9) || a[1] - b[1]).map((x) => x[0]);
  }
  // Whole-map records: the later edit wins. lastExportAt stays this device's own.
  out.settings = {
    ...newer(local.settings, remote.settings, settingsSig),
    lastExportAt: local.settings.lastExportAt ?? null,
  };
  const sw = newer(local.swapCounts, remote.swapCounts);
  if (sw) out.swapCounts = sw;
  out.active = local.active; // the workout in progress never syncs
  if (!isValidState(out))
    return { state: local, changed: false, error: "invalid" };
  return { state: out, changed: sig(out) !== sig(local) };
}

// Restore-from-file while sync is on: add the file to the data. Nothing is deleted, local settings
// stay, and a record the user deleted earlier comes back (newer than its tombstone).
export function addBackup(local, imported, now = Date.now()) {
  const deleted = local.deleted ?? {};
  const add = {
    ...imported,
    deleted: {},
    settings: local.settings,
    swapCounts: local.swapCounts,
  };
  for (const c of COLLECTIONS)
    if (add[c])
      add[c] = add[c].map((r) =>
        r?.id in deleted
          ? { ...r, updatedAt: Math.max(now, deleted[r.id] + 1) }
          : r,
      );
  return merge(local, add);
}

// First upload of a new account: every record without a time gets one.
export function stampMissing(state, now = Date.now()) {
  let n = 0;
  const one = (r) => {
    if (r && typeof r === "object" && r.updatedAt === undefined) {
      r.updatedAt = now;
      n++;
    }
  };
  one(state.settings);
  if (state.swapCounts) one(state.swapCounts);
  for (const c of COLLECTIONS) (state[c] ?? []).forEach(one);
  return n;
}

// What leaves the phone (before sealing): no workout in progress, no per-device export time.
export const makeEnvelope = (state) => ({
  syncFormat: SYNC_FORMAT,
  data: {
    ...state,
    active: null,
    settings: { ...state.settings, lastExportAt: null },
  },
});
// -> { state } or { error: "update" | "invalid" } ("update": a newer app wrote it).
export function readEnvelope(env) {
  if (!isObj(env) || env.syncFormat !== SYNC_FORMAT) return { error: "update" };
  return isValidState(env.data) ? { state: env.data } : { error: "invalid" };
}

// ---------- controller (best effort: never throws into a screen, never renders) ----------

const SESSION_KEY = "gymtracker.sync";
const KEEPALIVE_MAX = 60 * 1024;
const PUSH_DELAY = 3000;

function idb(fn) {
  return new Promise((res, rej) => {
    const r = indexedDB.open("gym-sync", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => rej(r.error);
    r.onsuccess = () => fn(r.result, res, rej);
  });
}
const idbKeys = {
  get: () =>
    idb((db, res, rej) => {
      const g = db.transaction("kv").objectStore("kv").get("dataKey");
      g.onsuccess = () => res(g.result ?? null);
      g.onerror = () => rej(g.error);
    }),
  set: (key) =>
    idb((db, res, rej) => {
      const t = db.transaction("kv", "readwrite");
      if (key) t.objectStore("kv").put(key, "dataKey");
      else t.objectStore("kv").delete("dataKey");
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    }),
};

// hooks: { getState, setState(state) (saves the merged state without stamping), isSafe(), applied(),
//   storage (localStorage-like), passkey ({register, assert, usePrf}), fetch?, keys?, now?, url? }
export function createSync(h) {
  const url = h.url ?? SYNC_URL;
  const doFetch = h.fetch ?? ((...a) => fetch(...a));
  const keys = h.keys ?? idbKeys;
  const now = h.now ?? Date.now;
  let session = null; // { accountId, token, rev, dirty, lastSyncAt }
  let dataKey = null;
  let held = null; // remote state waiting for a safe moment
  let timer = 0;
  let running = null;
  let again = false; // a save happened while a sync was running
  let pending = null; // sign-in waiting for the recovery code
  let status = "";

  try {
    session = JSON.parse(h.storage.getItem(SESSION_KEY));
  } catch {}
  const persist = () => {
    try {
      if (session) h.storage.setItem(SESSION_KEY, JSON.stringify(session));
      else h.storage.removeItem(SESSION_KEY);
    } catch {}
  };

  async function post(path, body, keepalive = false) {
    const res = await doFetch(url + path, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(body),
      keepalive,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json: json ?? {} };
  }
  const auth = () => ({ accountId: session.accountId, token: session.token });
  async function ensureKey() {
    if (!dataKey) dataKey = await keys.get();
    return dataKey;
  }

  function gone() {
    session = null;
    dataKey = null;
    held = null;
    persist();
    keys.set(null).catch(() => {});
    status = "Sync was turned off on another device.";
  }

  // Local state plus any remote data we hold but have not applied yet (what the cloud copy must contain).
  const withHeld = () => (held ? merge(h.getState(), held).state : h.getState());

  // Merge what the other devices left into this one, but only when it cannot disturb typing.
  function applyHeld(force = false) {
    if (!held || !(force || h.isSafe())) return false;
    const r = merge(h.getState(), held);
    held = null;
    if (session) {
      session.needFull = false;
      persist();
    }
    if (!r.changed) return false;
    h.setState(r.state);
    h.applied();
    return true;
  }

  async function syncNow() {
    if (running) return running;
    running = (async () => {
      const d0 = session?.dirty;
      again = false;
      let ok = false;
      try {
        if (!session || !(await ensureKey())) return;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          const need = session.dirty;
          session.dirty = false; // before reading local state: a save during the sync marks it dirty again
          // needFull: remote data was held but never applied (app closed): ask for the blob again.
          const p = await post("/sync/pull", { ...auth(), rev: session.needFull ? -1 : session.rev });
          if (p.status === 404) return gone();
          if (p.status !== 200) throw new Error("pull");
          let remoteDoc = null;
          if (p.json.blob) {
            let env;
            try {
              env = readEnvelope(await sc.open(dataKey, p.json.blob));
            } catch {
              status = "Sync stopped: the cloud copy could not be read.";
              return;
            }
            if (env.error) {
              status = env.error === "update" ? "Update the app to keep syncing." : "Sync stopped: the cloud copy could not be read.";
              return;
            }
            remoteDoc = env.state;
            const m = merge(h.getState(), remoteDoc);
            if (m.error) {
              status = "Sync stopped: the cloud copy could not be combined.";
              return;
            }
            if (m.changed) {
              held = held ? merge(held, remoteDoc).state : remoteDoc;
              session.needFull = true;
              applyHeld();
            }
          }
          session.rev = p.json.rev;
          const mine = makeEnvelope(withHeld());
          // Push only when we have something the cloud lacks.
          if (!(need || p.json.rev === 0 || (remoteDoc && sig(mine.data) !== sig(makeEnvelope(remoteDoc).data)))) {
            ok = true;
            break;
          }
          const q = await post("/sync/push", { ...auth(), rev: session.rev, blob: await sc.seal(dataKey, mine) });
          if (q.status === 409) {
            session.dirty = true;
            session.rev = q.json.rev;
            continue; // someone pushed in between: pull, merge, push once more
          }
          if (q.status === 404) return gone();
          if (q.status === 413) {
            status = "Too much data to sync. Make a backup file.";
            return;
          }
          if (q.status !== 200) throw new Error("push");
          session.rev = q.json.rev;
          ok = true;
        }
        if (ok) {
          session.lastSyncAt = now();
          status = "";
        }
      } catch {
        if (session) {
          session.dirty = session.dirty || d0;
          status = "Waiting for internet";
        }
      } finally {
        persist();
        running = null;
        if (again && session) {
          clearTimeout(timer);
          timer = setTimeout(syncNow, PUSH_DELAY);
        }
      }
    })();
    return running;
  }

  // Called after every successful save (never awaited).
  function changed() {
    if (!session) return;
    session.dirty = true;
    again = true;
    persist();
    clearTimeout(timer);
    timer = setTimeout(syncNow, PUSH_DELAY);
  }

  // Page hidden: push now if small enough, using keepalive. Best effort.
  async function flush() {
    try {
      if (!session || !session.dirty || !(await ensureKey())) return;
      const blob = await sc.seal(dataKey, makeEnvelope(withHeld()));
      if (blob.length > KEEPALIVE_MAX) return;
      const q = await post("/sync/push", { ...auth(), rev: session.rev, blob }, true);
      if (q.status === 200) {
        session.rev = q.json.rev;
        session.dirty = false;
      }
      persist();
    } catch {}
  }

  async function finish(accountId, token, key) {
    dataKey = key;
    await keys.set(key);
    session = { accountId, token, rev: 0, dirty: true, lastSyncAt: null };
    persist();
    status = "";
    syncNow();
  }

  // Turn on (first device). Returns { recoveryCode }.
  async function enable() {
    const accountId = sc.b64u(sc.randomBytes(16));
    const { challenge } = (await post("/auth/challenge", {})).json;
    const reg = await h.passkey.register({ challenge, accountId });
    const key = await sc.newDataKey();
    const codeBytes = sc.randomBytes(16);
    const body = {
      challenge,
      accountId,
      credentialId: reg.credentialId,
      publicKey: reg.publicKey,
      alg: reg.alg,
      clientDataJSON: reg.clientDataJSON,
      wrapCode: await sc.wrapDataKey(key, codeBytes, "code"),
    };
    // Face ID once more to read the PRF output; trusted only if it really unwraps the key.
    if (h.passkey.usePrf()) {
      try {
        const prf =
          reg.prf ??
          (
            await h.passkey.assert({
              challenge: sc.b64u(sc.randomBytes(16)),
              credentialId: reg.credentialId,
            })
          ).prf;
        if (prf?.length === 32) {
          const w = await sc.wrapDataKey(key, prf, "prf");
          await sc.unwrapDataKey(w, prf, "prf");
          body.wrapPrf = w;
        }
      } catch {}
    }
    const r = await post("/auth/register", body);
    if (r.status !== 200)
      throw new Error("Could not create the account. Try again later.");
    if (stampMissing(h.getState())) h.setState(h.getState());
    await finish(accountId, r.json.token, key);
    return { recoveryCode: sc.makeRecoveryCode(codeBytes) };
  }

  async function done(key, codeUsed = false) {
    const p = pending;
    pending = null;
    await finish(p.accountId, p.token, key);
    // A device that opened with the code but can do PRF teaches the server its PRF wrap.
    if (codeUsed && p.prf?.length === 32) {
      try {
        const wrapPrf = await sc.wrapDataKey(key, p.prf, "prf");
        await sc.unwrapDataKey(wrapPrf, p.prf, "prf");
        await post("/account/rewrap", { ...auth(), wrapPrf });
      } catch {}
    }
    return { done: true };
  }

  // Sign in (new or second device). Resolves { done: true } or { needCode: true }.
  async function signIn() {
    const { challenge } = (await post("/auth/challenge", {})).json;
    const a = await h.passkey.assert({ challenge });
    const r = await post("/auth/signin", {
      challenge,
      accountId: a.userHandle,
      credentialId: a.credentialId,
      clientDataJSON: a.clientDataJSON,
      authenticatorData: a.authenticatorData,
      signature: a.signature,
    });
    if (r.status !== 200) throw new Error("Sign-in failed. Try again.");
    const { token, wrapPrf, wrapCode } = r.json;
    pending = { accountId: a.userHandle, token, wrapCode, prf: a.prf };
    if (a.prf?.length === 32 && wrapPrf) {
      try {
        return await done(await sc.unwrapDataKey(wrapPrf, a.prf, "prf"));
      } catch {} // PRF said yes but did not unlock: fall back to the code
    }
    return { needCode: true };
  }

  async function signInWithCode(text) {
    const bytes = sc.parseRecoveryCode(text);
    let key = null;
    try {
      if (bytes && pending)
        key = await sc.unwrapDataKey(pending.wrapCode, bytes, "code");
    } catch {}
    if (!key)
      throw new Error(
        "That code does not open this data. Check it and try again.",
      );
    return done(key, true);
  }

  async function newRecoveryCode() {
    const key = await ensureKey();
    if (!session || !key) throw new Error("Not signed in.");
    const bytes = sc.randomBytes(16);
    const r = await post("/account/rewrap", {
      ...auth(),
      wrapCode: await sc.wrapDataKey(key, bytes, "code"),
    });
    if (r.status !== 200)
      throw new Error("Could not make a new code. Try again later.");
    return sc.makeRecoveryCode(bytes);
  }

  async function signOut() {
    if (session) await post("/account/signout", auth()).catch(() => {});
    gone();
    status = "";
  }
  async function deleteCloud() {
    const r = await post("/account/delete", auth());
    if (r.status !== 200) throw new Error("Could not delete. Try again later.");
    gone();
    status = "";
  }

  return {
    active: () => !!session,
    status: () =>
      status ||
      (session
        ? session.lastSyncAt
          ? `Last synced ${Math.max(0, Math.round((now() - session.lastSyncAt) / 60000))} min ago`
          : "Not synced yet"
        : "Sync off"),
    hasHeld: () => !!held,
    changed,
    syncNow,
    flush,
    applyHeld,
    enable,
    signIn,
    signInWithCode,
    newRecoveryCode,
    signOut,
    deleteCloud,
  };
}
