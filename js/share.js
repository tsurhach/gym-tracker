// Sharing with a coach or friends (view only). Hidden while SYNC_ENABLED is false (js/sync.js).
// Everything the server stores is sealed here first: names, roles, ticks and every shared workout.
import * as sc from "./synccrypto.js";

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
        sealedPriv: await sc.seal(dk, k.priv),
      });
      if (r.status === 200) return (keys = k);
      if (r.status === 409) r = await call("/share/key"); // another device was first
    }
    if (r.status !== 200) fail(r);
    return (keys = {
      pub: r.json.pub,
      priv: await sc.open(dk, r.json.sealedPriv),
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
    });
    if (wantsBack) await addViewer({ id, name, pub }, "friend", {}); // sharing back: they see me as a friend, no plan
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
    const view = JSON.parse(
      dec.decode(await sc.openBytes(kc, sc.unb64u(r.json.blob), sc.SHARE_AAD)),
    );
    putCache({ ...cache(), [p.id]: { view, updatedAt: r.json.updatedAt } });
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
    },
  };
}
