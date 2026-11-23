// Sharing with a coach or friends (view only). Hidden while SYNC_ENABLED is false (js/sync.js).
// Everything the server stores is sealed here first: names, roles, ticks and every shared workout.
import * as sc from "./synccrypto.js";
import { DEFAULT_STEP } from "./constants.js";

const enc = new TextEncoder();
const dec = new TextDecoder();
const HASH_KEY = "gymtracker.sharehash"; // what was last published (and to whom), so an unchanged view is not sent again
const SHARED_KEY = "gymtracker.shared"; // the viewer's cached copies of other people's workouts, apart from their own data
const LIST_TTL = 5 * 60 * 1000;
const PBKDF2_ROUNDS = 200_000; // makes guessing a short code from what the server stores impractical

// ---------- invite codes: 9 random Crockford characters + 1 check character ----------

const checkChar = (c) =>
  sc.ALPHA[[...c].reduce((n, ch) => n + sc.ALPHA.indexOf(ch), 0) % 32];
export function makeInviteCode(bytes = sc.randomBytes(9)) {
  const c = [...bytes].map((b) => sc.ALPHA[b & 31]).join("");
  return c + checkChar(c);
}
export const showCode = (c) =>
  `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
// Same forgiving rules as the recovery code (case, spaces, dashes, O/I/L). -> the 10 characters, or null on a typo.
export function parseInviteCode(text) {
  const t = String(text)
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (t.length !== 10 || [...t].some((ch) => !sc.ALPHA.includes(ch)))
    return null;
  return checkChar(t.slice(0, 9)) === t[9] ? t : null;
}
// The server indexes an invite by `lookup` only; `secret` wraps the invite key. Both need the code.
export async function codeKeys(code) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode("gym-tracker invite " + code),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: enc.encode("gym-tracker invite v1"),
        iterations: PBKDF2_ROUNDS,
      },
      base,
      512,
    ),
  );
  return {
    lookup: [...bits.slice(0, 32)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    secret: bits.slice(32),
  };
}

// ---------- what a viewer may see (allow-lists: a field not named here never leaves the phone) ----------

const pick = (o, keys) =>
  Object.fromEntries(
    keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]),
  );
const num = (x) => typeof x === "number" && Number.isFinite(x);

// plan: workout days. weight: body weight log (only ever for a coach, only with the switch on).
export function buildView(
  state,
  { plan = false, weight = false, name = "", now = Date.now() } = {},
) {
  const sessions = state.sessions
    .filter((s) => s.finishedAt !== null) // never a workout in progress
    .map((s) => ({
      ...pick(s, ["id", "workoutName", "startedAt", "finishedAt"]),
      entries: s.entries.map((e) => ({
        ...pick(e, ["exerciseId", "name", "primary"]),
        sets: e.sets
          .filter((t) => num(t.weight) && num(t.reps))
          .map((t) => ({ weight: t.weight, reps: t.reps, done: true })), // done: the shared history helpers count done sets only
      })),
    }));
  const workouts = plan
    ? state.workouts.map((w) => ({
        ...pick(w, ["id", "name", "muscles"]),
        items: w.items.map((it) =>
          pick(it, ["exerciseId", "sets", "repMin", "repMax", "step"]),
        ),
      }))
    : null;
  const used = new Set([
    ...sessions.flatMap((s) => s.entries.map((e) => e.exerciseId)),
    ...(workouts ?? []).flatMap((w) => w.items.map((i) => i.exerciseId)),
  ]);
  const view = {
    name,
    updatedAt: now,
    sessions,
    customExercises: state.customExercises
      .filter((c) => used.has(c.id))
      .map((c) => pick(c, ["id", "name", "primary", "secondary", "equipment"])),
  };
  if (workouts) view.workouts = workouts;
  if (weight)
    view.bodyWeights = (state.bodyWeights ?? []).map((w) =>
      pick(w, ["id", "date", "kg"]),
    );
  return view;
}

// What another person's phone sent is data, not trusted: every number is made a number, lists are lists.
// (Strings are escaped where they are drawn; numbers are drawn as they are, so they must be numbers.)
const n0 = (x) => (num(x) ? x : 0);
const arr = (x) => (Array.isArray(x) ? x : []);
export function cleanView(v) {
  const o = v && typeof v === "object" ? v : {};
  const out = {
    name: String(o.name ?? ""),
    updatedAt: n0(o.updatedAt),
    customExercises: arr(o.customExercises).map((c) => ({ id: String(c?.id), name: String(c?.name ?? ""), primary: String(c?.primary ?? ""), secondary: arr(c?.secondary).map(String), equipment: c?.equipment === undefined ? undefined : String(c.equipment) })),
    sessions: arr(o.sessions).map((s) => ({
      id: String(s?.id),
      workoutName: String(s?.workoutName ?? ""),
      startedAt: n0(s?.startedAt),
      finishedAt: n0(s?.finishedAt),
      entries: arr(s?.entries).map((e) => ({
        exerciseId: String(e?.exerciseId),
        name: String(e?.name ?? ""),
        primary: e?.primary === undefined ? undefined : String(e.primary),
        sets: arr(e?.sets).map((t) => ({ weight: n0(t?.weight), reps: n0(t?.reps), done: true })),
      })),
    })),
  };
  if (o.workouts)
    out.workouts = arr(o.workouts).map((w) => ({
      id: String(w?.id),
      name: String(w?.name ?? ""),
      muscles: arr(w?.muscles).map(String),
      items: arr(w?.items).map((it) => ({ exerciseId: String(it?.exerciseId), sets: n0(it?.sets), repMin: n0(it?.repMin), repMax: n0(it?.repMax), step: n0(it?.step) })),
    }));
  if (o.bodyWeights) out.bodyWeights = arr(o.bodyWeights).map((w) => ({ id: String(w?.id), date: String(w?.date ?? ""), kg: n0(w?.kg) }));
  return out;
}

// ---------- copying a shared plan day into my own plan ----------
// Built only from cleanView output. A copy is a plain new workout: new id, no link back; the store stamps it on save.
// has(id) = is this exercise in MY list (library or my customs). The sharer's custom exercises are skipped (not copied).
const clamp = (x, lo, hi, d) => (num(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
const uniqueName = (name, taken) => {
  const t = new Set(taken.map((n) => n.toLowerCase()));
  let out = name;
  for (let i = 1; t.has(out.toLowerCase()); i++) out = `${name} (copy${i > 1 ? ` ${i}` : ""})`;
  return out;
};
// -> { workout | null, skipped }. Does not touch state; the caller pushes the workout and saves.
export function copyDay(view, dayId, state, has) {
  const d = arr(view?.workouts).find((w) => w.id === dayId);
  if (!d) return { workout: null, skipped: 0 };
  const items = [];
  let skipped = 0;
  for (const it of arr(d.items)) {
    if (typeof it.exerciseId !== "string" || !has(it.exerciseId)) { skipped++; continue; }
    const repMin = clamp(it.repMin, 1, 100, 8);
    const step = num(it.step) && it.step > 0 ? Math.min(25, Math.round(it.step * 100) / 100) : DEFAULT_STEP;
    items.push({ exerciseId: it.exerciseId, sets: clamp(it.sets, 1, 20, 3), repMin, repMax: Math.max(repMin, clamp(it.repMax, 1, 100, 12)), step });
  }
  if (!items.length) return { workout: null, skipped };
  const base = String(d.name).trim().slice(0, 40) || "Workout";
  return {
    workout: {
      id: crypto.randomUUID(),
      name: uniqueName(base, state.workouts.map((w) => w.name)),
      muscles: arr(d.muscles).slice(0, 8).map((m) => String(m).slice(0, 30)),
      items,
    },
    skipped,
  };
}
// Every day, one by one (names checked against the days added so far). Adds; never replaces.
export function copyPlan(view, state, has) {
  const added = [];
  let skipped = 0;
  const tmp = { workouts: [...state.workouts] };
  for (const w of arr(view?.workouts)) {
    const r = copyDay(view, w.id, tmp, has);
    skipped += r.skipped;
    if (r.workout) (added.push(r.workout), tmp.workouts.push(r.workout));
  }
  return { added, skipped };
}

// h = friend, hp = friend with plan or coach, hpw = coach with body weight. The weight switch is one setting for any coach.
const OPTS = { h: {}, hp: { plan: true }, hpw: { plan: true, weight: true } };
export const variantOf = (v, weightOn) =>
  v.role === "coach" ? (weightOn ? "hpw" : "hp") : v.ticks?.plan ? "hp" : "h";
const pairKind = (sharer, viewer) => `share ${sharer}>${viewer}`;

export const MSG = {
  404: "That code is not valid, or it has expired.",
  409: "That code was already used.",
  413: "Too many people or open invites.",
  429: "Too many tries. Wait a while and try again.",
};
const NEED_NAME = "Set your name for others first.";
const fail = (r) => {
  throw new Error(
    MSG[r.status] ?? "Could not reach the server. Try again later.",
  );
};

// h: { link: { id, active(), key(), call(path, body) -> { status, json } }, getState(), storage, now?, base? }
export function createShare(h) {
  const now = h.now ?? Date.now;
  const call = (p, b = {}) => h.link.call(p, b);
  const must = async (p, b) => {
    const r = await call(p, b);
    if (r.status !== 200) fail(r);
    return r.json;
  };
  const nameOf = () => (h.getState().settings.shareName ?? "").trim();
  let keys = null; // { pub, priv }, from the Vault (sealed with the data key), so every device has the same pair
  let people = null;
  let peopleAt = 0;

  async function ensureKeys() {
    if (keys) return keys;
    const dk = await h.link.key();
    let r = await call("/share/key");
    if (r.status === 404) {
      const k = await sc.newShareKeyPair();
      r = await call("/share/key", {
        pub: k.pub,
        sealedPriv: await sc.seal(dk, { priv: k.priv, pub: k.pub }), // pub inside too: the plain copy on the server is never trusted
      });
      if (r.status === 200) return (keys = k);
      if (r.status === 409) r = await call("/share/key"); // another device was first
    }
    if (r.status !== 200) fail(r);
    const own = await sc.open(dk, r.json.sealedPriv);
    return (keys = {
      pub: own.pub,
      priv: own.priv,
    });
  }

  // Everything sealed, opened: { viewers, pending, canSee, invites }.
  async function list() {
    const r = await must("/share/list");
    const dk = await h.link.key();
    const open = (k, s) => sc.open(k, s).catch(() => null);
    const out = { viewers: [], pending: [], canSee: [], invites: [] };
    for (const [id, e] of Object.entries(r.viewers ?? {})) {
      const m = await open(dk, e.sealed);
      if (m) out.viewers.push({ id, ...m });
    }
    for (const [id, s] of Object.entries(r.canSee ?? {})) {
      const m = await open(dk, s);
      if (m) out.canSee.push({ ...m, id: m.id ?? id });
    }
    for (const [lookup, e] of Object.entries(r.invites ?? {})) {
      const m = await open(dk, e.sealed);
      if (m) out.invites.push({ lookup, expiresAt: e.expiresAt, ...m });
    }
    for (const [id, p] of Object.entries(r.pending ?? {})) {
      const inv = out.invites.find((i) => i.lookup === p.lookup);
      if (!inv) continue;
      const ki = await crypto.subtle.importKey(
        "raw",
        sc.unb64u(inv.ki),
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
      const j = await open(ki, p.sealedJ);
      // The joiner's own sealed id must match the id the server filed it under, else the server swapped it.
      if (j?.pub && j.id === id)
        out.pending.push({
          id,
          lookup: p.lookup,
          role: inv.role,
          ticks: inv.ticks,
          name: j.name,
          pub: j.pub,
          wantsBack: !!j.wantsBack,
        });
    }
    people = out;
    peopleAt = now();
    return out;
  }

  async function addViewer(p, role, ticks) {
    await must("/share/add", {
      viewerId: p.id,
      sealedMeta: await sc.seal(await h.link.key(), {
        name: p.name,
        role,
        ticks,
        pub: p.pub,
      }),
    });
    people = null;
  }

  async function invite(role, ticks = {}) {
    if (!nameOf()) throw new Error(NEED_NAME);
    const k = await ensureKeys();
    const dk = await h.link.key();
    const code = makeInviteCode();
    const { lookup, secret } = await codeKeys(code);
    const ki = await sc.newDataKey();
    await must("/invite/create", {
      lookup,
      wrapped: await sc.wrapDataKey(ki, secret, "invite"),
      sealedS: await sc.seal(ki, {
        id: h.link.id,
        name: nameOf(),
        pub: k.pub,
        role,
      }),
      sealedMeta: await sc.seal(dk, {
        code,
        role,
        ticks,
        created: now(),
        ki: sc.b64u(await crypto.subtle.exportKey("raw", ki)),
      }),
    });
    people = null;
    const base =
      h.base ??
      (typeof location !== "undefined"
        ? location.origin + location.pathname
        : "");
    return { code, link: `${base}#/join/${code}` };
  }

  // Look at an invite before accepting: who it is from and as what.
  async function peek(text) {
    const code = parseInviteCode(text);
    if (!code) throw new Error("Typo in the code. Check it and try again.");
    const { lookup, secret } = await codeKeys(code);
    const r = await must("/invite/peek", { lookup });
    try {
      const ki = await sc.unwrapDataKey(r.wrapped, secret, "invite");
      const from = await sc.open(ki, r.sealedS);
      if (from?.id && from.pub && from.name) return { lookup, ki, from };
    } catch {}
    fail({ status: 404 });
  }

  async function accept(p, wantsBack) {
    if (!nameOf()) throw new Error(NEED_NAME);
    const k = await ensureKeys();
    const dk = await h.link.key();
    const { id, name, pub, role } = p.from;
    await must("/invite/accept", {
      lookup: p.lookup,
      sealedJ: await sc.seal(p.ki, {
        id: h.link.id,
        name: nameOf(),
        pub: k.pub,
        wantsBack: !!wantsBack,
      }),
      sealedCanSee: await sc.seal(dk, { id, name, pub, role }),
      // Sharing back takes effect only when they Allow: the server adds this viewer then (friend, no plan).
      ...(wantsBack ? { sealedBack: await sc.seal(dk, { name, role: "friend", ticks: {}, pub }) } : {}),
    });
    people = null;
    publish().catch(() => {});
  }

  async function allow(p) {
    const dk = await h.link.key();
    await must("/share/allow", {
      joinerId: p.id,
      sealedMeta: await sc.seal(dk, {
        name: p.name,
        role: p.role,
        ticks: p.ticks,
        pub: p.pub,
      }),
    });
    // They offered to share back: I now see them too (their side already allowed me when they accepted).
    if (p.wantsBack)
      await must("/share/cansee", {
        sharerId: p.id,
        sealed: await sc.seal(dk, {
          id: p.id,
          name: p.name,
          pub: p.pub,
          role: "friend",
        }),
      });
    people = null;
    publish().catch(() => {});
  }

  const hashes = () => {
    try {
      return h.storage.getItem(HASH_KEY);
    } catch {
      return null;
    }
  };
  const saveHash = (v) => {
    try {
      h.storage.setItem(HASH_KEY, v);
    } catch {}
  };

  // Publish what each allowed person may see. One at a time; skipped when nothing they could see has changed.
  async function run(retry = true) {
    if (!h.link.active()) return false;
    const l = people && now() - peopleAt < LIST_TTL ? people : await list();
    const viewers = l.viewers;
    if (!viewers.length) return void saveHash(""); // nothing out there (remove already cleared the server)
    const st = h.getState();
    const weightOn = st.settings.shareWeight === true;
    const kinds = viewers.map((v) => variantOf(v, weightOn));
    const need = [...new Set(kinds)];
    const t = now();
    const views = Object.fromEntries(
      need.map((k) => [
        k,
        buildView(st, { ...OPTS[k], name: nameOf(), now: t }),
      ]),
    );
    const hash = await sc.sha256hex(
      JSON.stringify([
        need.map((k) => [k, { ...views[k], updatedAt: 0 }]),
        viewers.map((v, i) => [v.id, kinds[i], v.pub]).sort(),
      ]),
    );
    if (hash === hashes()) return false;
    const kp = await ensureKeys();
    const kc = {}; // a fresh content key on every publish, so someone removed never gets a key for what comes next
    const blobs = {};
    for (const k of need) {
      kc[k] = await sc.newDataKey();
      blobs[k] = sc.b64u(
        await sc.sealBytes(
          kc[k],
          enc.encode(JSON.stringify(views[k])),
          sc.SHARE_AAD,
        ),
      );
    }
    const envelopes = {};
    for (const [i, v] of viewers.entries())
      envelopes[v.id] = {
        v: kinds[i],
        env: await sc.wrapDataKey(
          kc[kinds[i]],
          await sc.ecdhBits(kp.priv, v.pub),
          pairKind(h.link.id, v.id),
        ),
      };
    const r = await call("/share/publish", { blobs, envelopes });
    if (r.status === 400 && retry) {
      people = null; // the list was stale (someone removed on another device)
      return run(false);
    }
    if (r.status !== 200) fail(r);
    saveHash(hash);
    return true;
  }
  let q = Promise.resolve();
  const publish = () =>
    (q = q.then(
      () => run(),
      () => run(),
    ));

  async function remove(v) {
    await must("/share/remove", { viewerId: v.id });
    people = null;
    publish().catch(() => {});
  }
  const setTicks = async (v, ticks) => {
    await addViewer(v, v.role, ticks);
    publish().catch(() => {});
  };

  const cache = () => {
    try {
      return JSON.parse(h.storage.getItem(SHARED_KEY)) ?? {};
    } catch {
      return {};
    }
  };
  const putCache = (c) => {
    try {
      h.storage.setItem(SHARED_KEY, JSON.stringify(c));
    } catch {}
  };

  // Viewer: fetch and open what a person shares. null = they stopped sharing (the cached copy is dropped).
  async function fetchView(p) {
    const r = await call("/share/get", { from: p.id });
    if (r.status === 404) {
      const c = cache();
      delete c[p.id];
      putCache(c);
      return null;
    }
    if (r.status !== 200) fail(r);
    const kp = await ensureKeys();
    const kc = await sc.unwrapDataKey(
      r.json.env,
      await sc.ecdhBits(kp.priv, p.pub),
      pairKind(p.id, h.link.id),
    ); // their key from my own record, never from the server
    const view = cleanView(
      JSON.parse(dec.decode(await sc.openBytes(kc, sc.unb64u(r.json.blob), sc.SHARE_AAD))),
    );
    const first = !cache()[p.id];
    putCache({ ...cache(), [p.id]: { view, updatedAt: num(r.json.updatedAt) ? r.json.updatedAt : 0 } });
    if (first) {
      people = null; // they may have just allowed my share-back: send them my workouts now
      publish().catch(() => {});
    }
    return view;
  }
  async function leave(p) {
    await must("/share/leave", { sharerId: p.id });
    const c = cache();
    delete c[p.id];
    putCache(c);
    people = null;
  }

  return {
    nameOf,
    list,
    invite,
    peek,
    accept,
    allow,
    decline: async (p) => (
      await must("/share/decline", { joinerId: p.id }),
      void (people = null)
    ),
    cancelInvite: async (i) => (
      await must("/invite/cancel", { lookup: i.lookup }),
      void (people = null)
    ),
    remove,
    setTicks,
    publish,
    fetchView,
    leave,
    cached: (id) => cache()[id] ?? null,
    forget: () => {
      keys = people = null;
      for (const k of [SHARED_KEY, HASH_KEY])
        try {
          h.storage.removeItem(k);
        } catch {}
    },
  };
}
