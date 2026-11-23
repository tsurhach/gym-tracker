// Sharing with the real client code (js/share.js) against the real VaultCore and InviteCore in memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planHtml } from "../js/screens/person.js";
import * as sc from "../js/synccrypto.js";
import {
  buildView,
  cleanView,
  createShare,
  makeInviteCode,
  parseInviteCode,
  codeKeys,
  variantOf,
} from "../js/share.js";
import { emptyState, isValidState } from "../js/store.js";
import { memServer, newAccount } from "./fakepasskey.mjs";

const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const ses = (id, extra = {}) => ({
  id,
  workoutName: "Push",
  startedAt: 1000,
  finishedAt: 2000,
  entries: [
    {
      exerciseId: "bench",
      name: "Bench",
      primary: "Chest",
      sets: [{ weight: 60, reps: 8, done: true, photo: "x" }],
    },
  ],
  updatedAt: 5,
  ...extra,
});
const fullState = () => ({
  ...emptyState(),
  settings: {
    goal: "muscle",
    showPhotos: true,
    lastExportAt: null,
    shareName: "Dana",
  },
  sessions: [ses("s1"), ses("s2", { finishedAt: null })],
  active: { id: "a", workoutName: "Live", startedAt: 3, entries: [] },
  workouts: [
    {
      id: "w1",
      name: "Push day",
      muscles: ["Chest"],
      items: [
        {
          exerciseId: "custom-1",
          sets: 3,
          repMin: 8,
          repMax: 12,
          step: 2.5,
          secret: "no",
        },
      ],
    },
  ],
  customExercises: [
    {
      id: "custom-1",
      name: "Odd press",
      primary: "Chest",
      secondary: [],
      images: 2,
      mediaRef: "m1",
      ext: "jpg",
    },
    { id: "custom-2", name: "Unused", primary: "Back", secondary: [] },
  ],
  bodyWeights: [{ id: "b1", date: "2026-11-01", kg: 80, updatedAt: 9 }],
  deleted: { gone: 5 },
  mediaRefs: { k: { id: "f", updatedAt: 1 } },
});

test("history view holds only finished sessions", () => {
  const v = buildView(fullState());
  assert.deepEqual(
    v.sessions.map((s) => s.id),
    ["s1"],
  );
  assert.deepEqual(v.sessions[0].entries[0].sets, [
    { weight: 60, reps: 8, done: true },
  ]);
});

test("views never include active, media, settings or tombstones", () => {
  const v = buildView(fullState(), { plan: true, weight: true });
  const text = JSON.stringify(v);
  for (const bad of [
    "Live",
    "mediaRefs",
    "deleted",
    "goal",
    "showPhotos",
    "shareName",
    'updatedAt":9',
    "photo",
    "secret",
  ])
    assert.ok(!text.includes(bad), bad);
});

test("friend view has no plan unless ticked; coach view has plan", () => {
  const st = fullState();
  assert.equal(variantOf({ role: "friend", ticks: {} }, false), "h");
  assert.equal(
    variantOf({ role: "friend", ticks: { plan: true } }, false),
    "hp",
  );
  assert.equal(variantOf({ role: "coach" }, false), "hp");
  assert.equal(buildView(st).workouts, undefined);
  assert.equal(buildView(st, { plan: true }).workouts[0].name, "Push day");
});

test("body weight only in coach view with the tick", () => {
  assert.equal(variantOf({ role: "coach" }, true), "hpw");
  assert.equal(
    variantOf({ role: "friend", ticks: { plan: true } }, true),
    "hp",
  ); // friends never get it, switch or not
  assert.equal(buildView(fullState(), { plan: true }).bodyWeights, undefined);
  assert.deepEqual(
    buildView(fullState(), { plan: true, weight: true }).bodyWeights,
    [{ id: "b1", date: "2026-11-01", kg: 80 }],
  );
});

test("custom exercises in a view have no photo or media fields", () => {
  const v = buildView(fullState(), { plan: true });
  assert.deepEqual(v.customExercises, [
    { id: "custom-1", name: "Odd press", primary: "Chest", secondary: [] },
  ]); // used ones only
});

test("old saved state still loads and the new settings are checked", () => {
  assert.ok(isValidState(emptyState()));
  const s = emptyState();
  s.settings.shareName = "Dana";
  s.settings.shareWeight = true;
  assert.ok(isValidState(s));
  s.settings.shareWeight = "yes";
  assert.equal(isValidState(s), false);
});

test("invite code round-trips, folds look-alikes, rejects a typo", () => {
  const c = makeInviteCode();
  assert.equal(c.length, 10);
  assert.equal(parseInviteCode(c), c);
  assert.equal(parseInviteCode(c.toLowerCase().replace(/(.{4})/g, "$1 - ")), c);
  const fold = makeInviteCode(Uint8Array.from([0, 1, 0, 1, 0, 1, 0, 1, 0])); // "010101010" + check
  assert.equal(
    parseInviteCode(fold.replace(/0/g, "O").replace(/1/g, "l")),
    fold,
  );
  const bad = (c[0] === "2" ? "3" : "2") + c.slice(1);
  assert.equal(parseInviteCode(bad), null);
  assert.equal(parseInviteCode("short"), null);
});

test("sealedS opens only with the code", async () => {
  const code = makeInviteCode();
  const { secret } = await codeKeys(code);
  const ki = await sc.newDataKey();
  const wrapped = await sc.wrapDataKey(ki, secret, "invite");
  const sealedS = await sc.seal(ki, { name: "Dana" });
  const other = await codeKeys(makeInviteCode());
  await assert.rejects(sc.unwrapDataKey(wrapped, other.secret, "invite"));
  assert.deepEqual(
    await sc.open(await sc.unwrapDataKey(wrapped, secret, "invite"), sealedS),
    { name: "Dana" },
  );
});

test("share blob does not open as a state blob; envelope kind binds both ids", async () => {
  const kc = await sc.newDataKey();
  const blob = await sc.sealBytes(
    kc,
    new TextEncoder().encode("{}"),
    sc.SHARE_AAD,
  );
  await assert.rejects(sc.openBytes(kc, blob)); // default (state) AAD
  await assert.rejects(
    sc.openBytes(kc, blob, new TextEncoder().encode("gym-tracker media v1")),
  );
  const a = await sc.newShareKeyPair();
  const b = await sc.newShareKeyPair();
  const c = await sc.newShareKeyPair();
  const pair = await sc.ecdhBits(a.priv, b.pub);
  assert.deepEqual(pair, await sc.ecdhBits(b.priv, a.pub)); // same from both sides
  const env = await sc.wrapDataKey(kc, pair, "share S>V");
  await sc.unwrapDataKey(env, pair, "share S>V");
  await assert.rejects(sc.unwrapDataKey(env, pair, "share S>W")); // bound to the two ids
  await assert.rejects(
    sc.unwrapDataKey(env, await sc.ecdhBits(c.priv, a.pub), "share S>V"),
  ); // another viewer's secret
});

// ---- the whole flow ----

let clock = 1_800_000_000_000;
async function person(server, name, state = fullState()) {
  const a = await newAccount(server);
  const key = await sc.newDataKey();
  const st = state;
  st.settings.shareName = name;
  const link = {
    id: a.id,
    active: () => true,
    key: async () => key,
    call: async (p, b) => {
      const r = await a.post(p, b);
      return { status: r.status, json: r.body };
    },
  };
  const storage = mem();
  const share = createShare({
    link,
    getState: () => st,
    storage,
    now: () => clock,
    base: "https://x/app/",
  });
  return { a, st, share, id: a.id, key, storage };
}
async function connect(S, V, role = "coach", ticks = {}) {
  const { code } = await S.share.invite(role, ticks);
  await V.share.accept(await V.share.peek(code), false);
  const [p] = (await S.share.list()).pending;
  await S.share.allow(p);
  await S.share.publish();
  return code;
}
const seeS = async (V, S) =>
  (await V.share.list()).canSee.find((c) => c.id === S.id);

test("viewer with an envelope opens the view; the invite works once", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali", emptyState());
  const code = await connect(S, V);
  const view = await V.share.fetchView(await seeS(V, S));
  assert.equal(view.name, "Dana");
  assert.deepEqual(
    view.sessions.map((s) => s.id),
    ["s1"],
  );
  assert.ok(view.workouts);
  assert.ok(V.share.cached(S.id).view);
  // the code is used up and the link is made from the base
  await assert.rejects(V.share.peek(code), /not valid|expired/);
  assert.match(
    (await S.share.invite("friend")).link,
    /^https:\/\/x\/app\/#\/join\/[0-9A-Z]{10}$/,
  );
});

test("another viewer cannot read it, and the server never sees names, roles or content", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Zebra Dana");
  const V = await person(server, "Ali");
  const W = await person(server, "Walt");
  await connect(S, V, "coach");
  const stranger = await W.a.post("/share/get", { from: S.id });
  assert.equal(stranger.status, 404);
  const dump =
    JSON.stringify(server.seen) +
    JSON.stringify([...server.vaults.values()].map((v) => [...v.st.m])) +
    JSON.stringify([...server.invites.values()].map((v) => [...v.st.m]));
  // Short words can appear inside random base64 by chance, so look for them as whole JSON strings:
  // quotes never occur in base64, so a hit means a real leak (plain or inside an escaped string).
  for (const plain of [
    "Zebra",
    "Dana",
    "Ali",
    "coach",
    "friend",
    "Push",
    "Bench",
    "Odd press",
    "Push day",
  ])
    assert.ok(!dump.includes(`"${plain}"`) && !dump.includes(`\\"${plain}\\"`), plain);
  assert.ok(!dump.includes("Odd press") && !dump.includes("Zebra Dana"));
});

test("body weight reaches a coach only with the switch on; a friend never gets it", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const C = await person(server, "Coach", emptyState());
  const F = await person(server, "Friend", emptyState());
  await connect(S, C, "coach");
  await connect(S, F, "friend", { plan: true });
  assert.equal(
    (await C.share.fetchView(await seeS(C, S))).bodyWeights,
    undefined,
  );
  S.st.settings.shareWeight = true;
  clock += 1000;
  await S.share.publish();
  assert.equal(
    (await C.share.fetchView(await seeS(C, S))).bodyWeights.length,
    1,
  );
  const fv = await F.share.fetchView(await seeS(F, S));
  assert.equal(fv.bodyWeights, undefined);
  assert.ok(fv.workouts); // the plan tick
  S.st.settings.shareWeight = false; // off again: the next publish carries none
  clock += 1000;
  await S.share.publish();
  assert.equal(
    (await C.share.fetchView(await seeS(C, S))).bodyWeights,
    undefined,
  );
});

test("removed viewer cannot read the next publish", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali", emptyState());
  const W = await person(server, "Walt", emptyState());
  await connect(S, V);
  await connect(S, W);
  const mine = await seeS(V, S);
  const oldGet = await V.a.post("/share/get", { from: S.id }); // what V could still hold
  S.st.sessions.push(ses("s3", { startedAt: 5000, finishedAt: 6000 }));
  const { viewers } = await S.share.list();
  await S.share.remove(viewers.find((v) => v.name === "Ali"));
  await S.share.publish();
  assert.equal(await V.share.fetchView(mine), null); // 404: stopped sharing
  assert.equal(V.share.cached(S.id), null);
  const fresh = (await W.share.fetchView(await seeS(W, S))).sessions.map(
    (s) => s.id,
  );
  assert.ok(fresh.includes("s3"));
  // the key V held opens the old blob only, never the new one, and the new envelope is not for V
  const kv = (await sc.open(V.key, (await V.a.post("/share/key")).body.sealedPriv)).priv;
  const pair = await sc.ecdhBits(kv, mine.pub);
  const kind = `share ${S.id}>${V.id}`;
  const oldKc = await sc.unwrapDataKey(oldGet.body.env, pair, kind);
  await sc.openBytes(oldKc, sc.unb64u(oldGet.body.blob), sc.SHARE_AAD);
  const next = (await W.a.post("/share/get", { from: S.id })).body;
  await assert.rejects(sc.openBytes(oldKc, sc.unb64u(next.blob), sc.SHARE_AAD));
  await assert.rejects(sc.unwrapDataKey(next.env, pair, `share ${S.id}>${W.id}`));
});

test("unchanged view is not republished", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali", emptyState());
  await connect(S, V);
  const at = server.core(S.id).st.m.get("share").sharedAt;
  clock += 5000;
  assert.equal(await S.share.publish(), false);
  assert.equal(server.core(S.id).st.m.get("share").sharedAt, at);
  S.st.sessions.push(ses("s9", { startedAt: 9000, finishedAt: 9500 }));
  assert.equal(await S.share.publish(), true);
  assert.ok(server.core(S.id).st.m.get("share").sharedAt > at);
});

test("sharing back takes effect only on Allow, never on decline or cancel", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali");
  const { code } = await S.share.invite("friend", {});
  await V.share.accept(await V.share.peek(code), true);
  await V.share.publish();
  assert.equal((await V.share.list()).viewers.length, 0); // nothing granted yet
  assert.equal((await S.a.post("/share/get", { from: V.id })).status, 404);
  const [p] = (await S.share.list()).pending;
  assert.equal(p.wantsBack, true);
  await S.share.allow(p);
  assert.equal((await V.share.list()).viewers[0].name, "Dana"); // granted now
  await V.share.publish();
  const back = await S.share.fetchView((await S.share.list()).canSee[0]);
  assert.equal(back.name, "Ali");
  // declined: nothing is ever granted
  const X = await person(server, "Xena");
  const c2 = await S.share.invite("friend", {});
  await X.share.accept(await X.share.peek(c2.code), true);
  await S.share.decline((await S.share.list()).pending[0]);
  assert.equal((await X.share.list()).viewers.length, 0);
  // cancelled while waiting: same
  const Y = await person(server, "Yan");
  const c3 = await S.share.invite("friend", {});
  await Y.share.accept(await Y.share.peek(c3.code), true);
  await S.share.cancelInvite((await S.share.list()).invites[0]);
  assert.equal((await Y.share.list()).viewers.length, 0);
});

test("a server that swaps my plain public key changes nothing I send", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali");
  assert.equal((await S.share.invite("coach", {})).code.length, 10); // makes the pair
  const real = (await S.a.post("/share/key")).body;
  const st = server.core(S.id).st;
  const d = st.m.get("share");
  d.shareKey.pub = (await sc.newShareKeyPair()).pub; // the server's own key
  st.m.set("share", d);
  const again = createShare({ link: { id: S.id, active: () => true, key: async () => S.key, call: async (p, b) => { const r = await S.a.post(p, b); return { status: r.status, json: r.body }; } }, getState: () => S.st, storage: mem(), now: () => clock });
  const { code } = await again.invite("coach", {});
  const peeked = await V.share.peek(code);
  assert.equal(peeked.from.pub, real.pub); // what V is told is my real key
});

test("a view from another person is made of numbers and lists, and the plan is escaped", async () => {
  const evil = "<img src=x onerror=alert(1)>";
  const v = cleanView({ name: evil, sessions: [{ id: "s", startedAt: evil, entries: [{ exerciseId: "x", name: evil, sets: [{ weight: evil, reps: "9" }] }] }], workouts: [{ id: "w", name: "d", items: [{ exerciseId: "x", sets: evil, repMin: evil, repMax: evil }] }], bodyWeights: [{ date: "d", kg: evil }], customExercises: "no" });
  assert.equal(v.sessions[0].startedAt, 0);
  assert.deepEqual(v.sessions[0].entries[0].sets, [{ weight: 0, reps: 0, done: true }]);
  assert.deepEqual(v.workouts[0].items[0], { exerciseId: "x", sets: 0, repMin: 0, repMax: 0, step: 0 });
  assert.equal(v.bodyWeights[0].kg, 0);
  assert.deepEqual(v.customExercises, []);
  const html = planHtml({ workouts: [{ name: evil, items: [{ exerciseId: "x", sets: evil, repMin: evil, repMax: evil }] }] }, { library: [] });
  assert.ok(!html.includes("<img"));
});

test("a stored view is made safe when opened", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  S.st.workouts[0].items[0].repMin = "<b>x</b>";
  const V = await person(server, "Ali", emptyState());
  await connect(S, V);
  const view = await V.share.fetchView(await seeS(V, S));
  assert.equal(view.workouts[0].items[0].repMin, 0);
  assert.equal(V.share.cached(S.id).view.workouts[0].items[0].repMin, 0);
});

test("signing out wipes other people's cached workouts and the publish hash", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali", emptyState());
  await connect(S, V);
  await V.share.fetchView(await seeS(V, S));
  await S.share.publish();
  V.share.forget();
  S.share.forget();
  assert.equal(V.share.cached(S.id), null);
  assert.equal(S.storage.getItem("gymtracker.sharehash"), null);
});

test("a joiner id the server swapped is ignored", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali");
  const { code } = await S.share.invite("coach", {});
  await V.share.accept(await V.share.peek(code), false);
  const st = server.core(S.id).st;
  const d = st.m.get("share");
  d.pending = { ["x".repeat(22)]: Object.values(d.pending)[0] }; // filed under another id
  st.m.set("share", d);
  assert.equal((await S.share.list()).pending.length, 0);
});

// ---------- phase 6: copying a shared plan day ----------
import { copyDay, copyPlan, dayFromSession, newCopy } from "../js/share.js";
const hasId = (id) => ["bench", "squat"].includes(id);
const sharedView = () =>
  cleanView({
    name: "Dana",
    canCopy: true,
    bodyWeights: [{ id: "b", date: "2026-01-01", kg: 80 }],
    workouts: [
      { id: "d1", name: "Push", muscles: ["Chest"], items: [
        { exerciseId: "bench", sets: 4, repMin: 6, repMax: 10, step: 2.5 },
        { exerciseId: "dana-custom", sets: 3, repMin: 8, repMax: 12, step: 2.5 },
      ] },
      { id: "d2", name: "Legs", muscles: [], items: [{ exerciseId: "squat", sets: 3, repMin: 5, repMax: 5, step: 5 }] },
    ],
  });

test("copied day gets new ids and is independent of the view", () => {
  const view = sharedView();
  const st = emptyState();
  const { workout, skipped } = copyDay(view, "d1", st, hasId);
  assert.notEqual(workout.id, "d1");
  assert.equal(skipped, 1); // unknown exercise skipped, no crash
  assert.equal(workout.items.length, 1);
  workout.items[0].sets = 9;
  workout.name = "Mine";
  assert.equal(view.workouts[0].items[0].sets, 4);
  assert.equal(view.workouts[0].name, "Push");
  view.workouts[0].items[0].repMax = 99;
  assert.equal(workout.items[0].repMax, 10);
  st.workouts.push(workout);
  assert.equal(isValidState(st), true);
});

test("copy has no body weight, no link back, only allowed fields", () => {
  const { workout } = copyDay(sharedView(), "d1", emptyState(), hasId);
  assert.deepEqual(Object.keys(workout).sort(), ["id", "items", "muscles", "name"]);
  assert.ok(!JSON.stringify(workout).includes("80"));
});

test("copy coerces hostile values and caps names", () => {
  const view = cleanView({ canCopy: true, workouts: [{ id: "x", name: " <img onerror=1>" + "z".repeat(100), muscles: Array(20).fill("m".repeat(99)), items: [
    { exerciseId: "bench", sets: "9e9", repMin: 500, repMax: -5, step: -1 },
    { exerciseId: "squat", sets: 1e9, repMin: 20, repMax: 3, step: NaN },
  ] }] });
  const { workout } = copyDay(view, "x", emptyState(), hasId);
  assert.ok(workout.name.length <= 40 && workout.muscles.length <= 8 && workout.muscles.every((m) => m.length <= 30));
  for (const it of workout.items) {
    for (const k of ["sets", "repMin", "repMax", "step"]) assert.ok(Number.isFinite(it[k]) && it[k] > 0);
    assert.ok(it.sets <= 20 && it.repMin <= it.repMax && it.repMax <= 100 && it.step <= 25);
  }
  assert.equal(copyDay(view, "nope", emptyState(), hasId).workout, null);
});

test("name clash adds (copy), never overwrites", () => {
  const st = emptyState();
  st.workouts.push({ id: "mine", name: "push", muscles: [], items: [] });
  const a = copyDay(sharedView(), "d1", st, hasId).workout;
  assert.equal(a.name, "Push (copy)");
  st.workouts.push(a);
  assert.equal(copyDay(sharedView(), "d1", st, hasId).workout.name, "Push (copy 2)");
  assert.equal(st.workouts.length, 2);
  assert.equal(st.workouts[0].id, "mine");
});

test("copy plan adds and never replaces; day of only unknown exercises is skipped", () => {
  const st = emptyState();
  st.workouts.push({ id: "mine", name: "Legs", muscles: [], items: [] });
  const r = copyPlan(sharedView(), st, hasId);
  assert.deepEqual(r.added.map((w) => w.name), ["Push", "Legs (copy)"]);
  assert.equal(st.workouts.length, 1);
  assert.equal(copyPlan(sharedView(), st, () => false).added.length, 0);
});

test("old saved state still loads (no new fields needed)", () => {
  assert.equal(isValidState(emptyState()), true);
});

const withCustoms = () =>
  cleanView({
    canCopy: true,
    customExercises: [
      { id: "c1", name: "Odd press", primary: "Chest", secondary: ["Triceps", "Nonsense", "Chest"], equipment: "<b>bar</b>" + "e".repeat(99), images: 5, ext: "mp4", photo: "data:x" },
      { id: "c2", name: "<img src=x onerror=1>" + "n".repeat(200), primary: "NotAMuscle" },
    ],
    workouts: [{ id: "d", name: "Mix", items: [
      { exerciseId: "c1", sets: 3, repMin: 8, repMax: 12, step: 2.5 },
      { exerciseId: "bench", sets: 3, repMin: 8, repMax: 12, step: 2.5 },
      { exerciseId: "c2", sets: 3, repMin: 8, repMax: 12, step: 2.5 },
    ] }, { id: "e", name: "Again", items: [{ exerciseId: "c1", sets: 2, repMin: 5, repMax: 5, step: 5 }] }],
    sessions: [{ id: "s", workoutName: "Heavy", startedAt: 1, finishedAt: 2, entries: [
      { exerciseId: "bench", name: "Bench", sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 6 }, { weight: 60, reps: 8 }] },
      { exerciseId: "c1", name: "Odd press", sets: [{ weight: 1, reps: 1e9 }] },
      { exerciseId: "squat", name: "Squat", sets: [] },
      { exerciseId: "ghost", name: "G", sets: [{ weight: 1, reps: 5 }] },
    ] }],
  });

test("copy refused when the tick is off, for day, plan and workout", () => {
  const v = withCustoms();
  v.canCopy = false;
  for (const r of [copyDay(v, "d", emptyState(), hasId), dayFromSession(v, "s", emptyState(), hasId)]) assert.equal(r.workout, null);
  assert.equal(copyPlan(v, emptyState(), hasId).added.length, 0);
  assert.equal(cleanView({ ...v, canCopy: "yes" }).canCopy, false);
});

test("the tick is a sealed part of the view: only the right variant carries it", () => {
  const st = fullState();
  assert.equal(variantOf({ role: "friend", ticks: { plan: true, copy: true } }, false), "hpc");
  assert.equal(variantOf({ role: "coach", ticks: {} }, true), "hpw");
  assert.equal(variantOf({ role: "friend", ticks: { copy: true } }, false), "hc");
  assert.equal(buildView(st, { plan: true }).canCopy, undefined);
  assert.equal(buildView(st, { plan: true, copy: true }).canCopy, true);
});

test("sharer's custom exercises are re-made as mine: new id, capped, no media, reused by name", () => {
  const view = withCustoms();
  const st = emptyState();
  const cx = newCopy();
  const r = copyPlan(view, st, hasId, cx);
  assert.equal(r.skipped, 1); // bad custom (not a muscle) skipped
  assert.equal(cx.fresh.length, 1); // c1 made once, shared by both days
  const c = cx.fresh[0];
  assert.ok(c.id.startsWith("custom-") && c.id !== "c1");
  assert.deepEqual(c.secondary, ["Triceps"]);
  assert.equal(c.images, 0);
  assert.ok(!("ext" in c) && !("photo" in c) && c.equipment.length <= 30);
  assert.deepEqual(r.added[0].items.map((i) => i.exerciseId), [c.id, "bench"]);
  assert.equal(r.added[1].items[0].exerciseId, c.id);
  // I already have one with that name: reuse it, add nothing
  const mine = { id: "custom-mine", name: "odd PRESS", primary: "Chest", secondary: [], images: 0 };
  const st2 = { ...emptyState(), customExercises: [mine] };
  const cx2 = newCopy();
  const r2 = copyDay(view, "d", st2, hasId, cx2);
  assert.equal(r2.workout.items[0].exerciseId, "custom-mine");
  assert.equal(cx2.fresh.length, 0);
  st.customExercises.push(...cx.fresh);
  st.workouts.push(...r.added);
  assert.equal(isValidState(st), true);
});

test("day from a shared workout: order, sets done, reps done, name with clash", () => {
  const view = withCustoms();
  const st = emptyState();
  st.workouts.push({ id: "m", name: "Heavy (copy)", muscles: [], items: [] });
  const cx = newCopy();
  const { workout, skipped } = dayFromSession(view, "s", st, hasId, cx);
  assert.equal(skipped, 1); // ghost
  assert.equal(workout.name, "Heavy (copy 2)");
  assert.deepEqual(workout.items.map((i) => i.exerciseId), ["bench", cx.fresh[0].id]); // empty squat entry dropped
  assert.deepEqual([workout.items[0].sets, workout.items[0].repMin, workout.items[0].repMax], [3, 6, 10]);
  assert.deepEqual([workout.items[1].sets, workout.items[1].repMax], [1, 100]); // hostile reps bounded
  assert.equal(dayFromSession(view, "nope", st, hasId).workout, null);
  assert.equal(st.workouts.length, 1);
});

test("changing the copy tick republishes: the viewer sees canCopy only while it is on", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali", emptyState());
  await connect(S, V, "friend", { plan: true });
  const p = await seeS(V, S);
  assert.equal((await V.share.fetchView(p)).canCopy, false);
  const [v] = (await S.share.list()).viewers;
  await S.share.setTicks(v, { ...v.ticks, copy: true });
  await S.share.publish();
  assert.equal((await V.share.fetchView(p)).canCopy, true);
  await S.share.setTicks(v, { ...v.ticks, copy: false });
  await S.share.publish();
  assert.equal((await V.share.fetchView(p)).canCopy, false);
});

// ---------- phase 6 review fixes ----------
import { plateDefault } from "../js/logic.js";
const mk = (items, extra = {}) => cleanView({ canCopy: true, workouts: [{ id: "d", name: "D", muscles: ["Chest", "Bogus"], items }], ...extra });
const it = (exerciseId, o = {}) => ({ exerciseId, sets: 3, repMin: 8, repMax: 12, step: 2.5, ...o });

test("S1: equipment named like an Object property never counts as plate-loaded equipment", () => {
  for (const e of ["constructor", "toString", "__proto__", "hasOwnProperty"])
    assert.equal(plateDefault({ id: "c", name: "X", equipment: e }), null);
  assert.equal(plateDefault({ id: "c", name: "X", equipment: "barbell" }), 20);
});

test("S2: counts and bounds follow the plan limits", () => {
  const many = Array.from({ length: 60 }, (_, i) => it(i % 2 ? "bench" : "squat"));
  const days = Array.from({ length: 50 }, (_, i) => ({ id: `d${i}`, name: `Day ${i}`, items: [it("bench", { sets: 99 })] }));
  const r = copyPlan(cleanView({ canCopy: true, workouts: days }), emptyState(), hasId);
  assert.equal(r.added.length, 14);
  assert.ok(r.added.every((w) => w.items[0].sets <= 10));
  assert.ok(copyDay(mk(many), "d", emptyState(), hasId).workout.items.length <= 20);
});

test("S3: the same exercise twice in a day is copied once", () => {
  const w = copyDay(mk([it("bench"), it("bench", { sets: 5 }), it("squat")]), "d", emptyState(), hasId);
  assert.deepEqual(w.workout.items.map((i) => i.exerciseId), ["bench", "squat"]);
  assert.equal(w.skipped, 1);
  const v = mk([it("c1"), it("c2")], { customExercises: [{ id: "c1", name: "Odd", primary: "Chest" }, { id: "c2", name: "odd", primary: "Chest" }] });
  assert.equal(copyDay(v, "d", emptyState(), hasId).workout.items.length, 1); // two customs, one name
});

test("S4: step never becomes 0 or below the app minimum", () => {
  for (const step of [0.004, 0.1, 0])
    assert.ok(copyDay(mk([it("bench", { step })]), "d", emptyState(), hasId).workout.items[0].step >= 0.25);
});

test("N1/N3/N4: muscles filtered, duplicate day ids both copied, library name reused", () => {
  const v = cleanView({ canCopy: true, customExercises: [{ id: "c", name: "Bench Press!", primary: "Chest" }], workouts: [
    { id: "same", name: "A", muscles: ["Chest", "Bogus"], items: [it("c")] },
    { id: "same", name: "B", items: [it("squat")] },
  ] });
  const cx = newCopy([{ id: "bench", name: "Bench Press" }]);
  const r = copyPlan(v, emptyState(), hasId, cx);
  assert.deepEqual(r.added.map((w) => w.name), ["A", "B"]);
  assert.deepEqual(r.added[0].muscles, ["Chest"]);
  assert.equal(r.added[0].items[0].exerciseId, "bench");
  assert.equal(cx.fresh.length, 0);
});
