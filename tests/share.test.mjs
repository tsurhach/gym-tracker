// Sharing with the real client code (js/share.js) against the real VaultCore and InviteCore in memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as sc from "../js/synccrypto.js";
import {
  buildView,
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
  const share = createShare({
    link,
    getState: () => st,
    storage: mem(),
    now: () => clock,
    base: "https://x/app/",
  });
  return { a, st, share, id: a.id, key };
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
  const kv = await sc.open(V.key, (await V.a.post("/share/key")).body.sealedPriv);
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

test("sharing back: the joiner is allowed at once and the sharer sees them after Allow", async () => {
  const server = memServer({ now: () => clock });
  const S = await person(server, "Dana");
  const V = await person(server, "Ali");
  const { code } = await S.share.invite("friend", {});
  await V.share.accept(await V.share.peek(code), true);
  await V.share.publish();
  const [p] = (await S.share.list()).pending;
  assert.equal(p.wantsBack, true);
  await S.share.allow(p);
  const back = await S.share.fetchView((await S.share.list()).canSee[0]);
  assert.equal(back.name, "Ali");
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
