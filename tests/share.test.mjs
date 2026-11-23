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
    assert.ok(!dump.includes(plain), plain);
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
import { copyDay, copyPlan } from "../js/share.js";
const hasId = (id) => ["bench", "squat"].includes(id);
const sharedView = () =>
  cleanView({
    name: "Dana",
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
  const view = cleanView({ workouts: [{ id: "x", name: " <img onerror=1>" + "z".repeat(100), muscles: Array(20).fill("m".repeat(99)), items: [
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
