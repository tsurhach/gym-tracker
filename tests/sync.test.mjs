import { test } from "node:test";
import assert from "node:assert/strict";
import {
  merge,
  addBackup,
  stampMissing,
  makeEnvelope,
  readEnvelope,
  SYNC_ENABLED,
} from "../js/sync.js";
import { emptyState, isValidState } from "../js/store.js";

const sess = (id, updatedAt, extra = {}) => ({
  id,
  workoutName: "A",
  startedAt: 1000,
  entries: [{ exerciseId: "x", sets: [{ weight: 50, reps: 8, done: true }] }],
  updatedAt,
  ...extra,
});
const st = (o = {}) => ({ ...emptyState(), ...o });
const ids = (s) => s.sessions.map((x) => x.id).sort();

test("sync is available as an opt-in", () => assert.equal(SYNC_ENABLED, true));

test("merge keeps newer record", () => {
  const r = merge(
    st({ sessions: [sess("a", 5, { workoutName: "old" })] }),
    st({ sessions: [sess("a", 9, { workoutName: "new" })] }),
  );
  assert.equal(r.state.sessions[0].workoutName, "new");
  assert.ok(r.changed);
  const back = merge(
    st({ sessions: [sess("a", 9, { workoutName: "new" })] }),
    st({ sessions: [sess("a", 5, { workoutName: "old" })] }),
  );
  assert.equal(back.state.sessions[0].workoutName, "new");
  assert.equal(back.changed, false);
});

test("merge tie is deterministic both ways", () => {
  const a = st({ sessions: [sess("a", 5, { workoutName: "alpha" })] });
  const b = st({ sessions: [sess("a", 5, { workoutName: "beta" })] });
  assert.equal(
    merge(a, b).state.sessions[0].workoutName,
    merge(b, a).state.sessions[0].workoutName,
  );
});

test("union of different records, both orders agree", () => {
  const a = st({ sessions: [sess("a", 1)] });
  const b = st({ sessions: [sess("b", 1)] });
  assert.deepEqual(ids(merge(a, b).state), ["a", "b"]);
  assert.deepEqual(ids(merge(b, a).state), ["a", "b"]);
});

test("tombstone beats older edit and survives merging", () => {
  const a = st({ sessions: [sess("a", 5)] });
  const b = st({ sessions: [], deleted: { a: 9 } });
  const r = merge(a, b);
  assert.deepEqual(r.state.sessions, []);
  assert.equal(r.state.deleted.a, 9);
  assert.deepEqual(merge(b, a).state.sessions, []);
});

test("tombstone beats an equal time, edit after delete survives", () => {
  assert.deepEqual(
    merge(st({ sessions: [sess("a", 9)] }), st({ deleted: { a: 9 } })).state
      .sessions,
    [],
  );
  assert.equal(
    merge(st({ sessions: [sess("a", 10)] }), st({ deleted: { a: 9 } })).state
      .sessions.length,
    1,
  );
});

test("larger deletedAt wins in the union of tombstones", () => {
  assert.equal(
    merge(st({ deleted: { a: 3 } }), st({ deleted: { a: 7 } })).state.deleted.a,
    7,
  );
});

test("settings and swapCounts: whole map, later edit wins; lastExportAt stays local", () => {
  const a = st({
    settings: {
      goal: "muscle",
      showPhotos: true,
      lastExportAt: 111,
      updatedAt: 5,
    },
    swapCounts: { x: 1, updatedAt: 5 },
  });
  const b = st({
    settings: {
      goal: "strength",
      showPhotos: false,
      lastExportAt: 222,
      updatedAt: 9,
    },
    swapCounts: { y: 2, updatedAt: 9 },
  });
  const r = merge(a, b).state;
  assert.equal(r.settings.goal, "strength");
  assert.equal(r.settings.showPhotos, false);
  assert.equal(r.settings.lastExportAt, 111);
  assert.deepEqual(r.swapCounts, { y: 2, updatedAt: 9 }); // not a per-key union
  const r2 = merge(b, a).state;
  assert.equal(r2.settings.goal, "strength");
  assert.equal(r2.settings.lastExportAt, 222);
  assert.equal(
    merge(st(), st({ swapCounts: { z: 1, updatedAt: 1 } })).state.swapCounts.z,
    1,
  );
});

test("active workout stays local", () => {
  const active = { workoutName: "A", startedAt: 5, entries: [] };
  assert.deepEqual(
    merge(st({ active }), st({ active: { ...active, workoutName: "other" } }))
      .state.active,
    active,
  );
  assert.equal(merge(st(), st({ active })).state.active, null);
});

test("first sign-in is a union and deletes nothing", () => {
  const device = st({
    sessions: [sess("a", 0), sess("b", 0)],
    workouts: [{ id: "w1", name: "Push", muscles: [], items: [] }],
  });
  const cloud = st({
    sessions: [sess("c", 4)],
    workouts: [{ id: "w2", name: "Pull", muscles: [], items: [] }],
  });
  const r = merge(device, cloud).state;
  assert.deepEqual(ids(r), ["a", "b", "c"]);
  assert.equal(r.workouts.length, 2);
});

test("merged state passes isValidState and inputs are not mutated", () => {
  const a = st({ sessions: [sess("a", 1)] });
  const b = st({
    sessions: [sess("b", 2)],
    bodyWeights: [{ id: "k", date: "2026-01-01", kg: 80, updatedAt: 2 }],
  });
  const snap = JSON.stringify([a, b]);
  assert.ok(isValidState(merge(a, b).state));
  assert.equal(JSON.stringify([a, b]), snap);
});

test("an invalid merge result is abandoned: local comes back", () => {
  const local = st({ sessions: [sess("a", 1)] });
  const bad = st({ sessions: [{ id: "z", startedAt: 1, entries: "nope" }] });
  const r = merge(local, bad);
  assert.equal(r.error, "invalid");
  assert.equal(r.state, local);
  assert.equal(r.changed, false);
});

test("unknown syncFormat stops sync; bad data is reported", () => {
  assert.equal(readEnvelope({ syncFormat: 2, data: st() }).error, "update");
  assert.equal(readEnvelope(null).error, "update");
  assert.equal(
    readEnvelope({ syncFormat: 1, data: { nope: 1 } }).error,
    "invalid",
  );
  assert.ok(readEnvelope(makeEnvelope(st())).state);
});

test("envelope drops the workout in progress and the export time", () => {
  const e = makeEnvelope(
    st({
      active: { workoutName: "A", startedAt: 1, entries: [] },
      settings: { goal: "muscle", lastExportAt: 99 },
    }),
  );
  assert.equal(e.data.active, null);
  assert.equal(e.data.settings.lastExportAt, null);
});

test("stampMissing gives every untimed record a time, once", () => {
  const s = st({ sessions: [sess("a", undefined), sess("b", 4)] });
  delete s.sessions[0].updatedAt;
  assert.ok(stampMissing(s, 77) >= 2);
  assert.equal(s.sessions[0].updatedAt, 77);
  assert.equal(s.sessions[1].updatedAt, 4);
  assert.equal(stampMissing(s, 99), 0);
});

test("restore with sync on adds and never tombstones", () => {
  const local = st({
    sessions: [sess("keep", 5)],
    deleted: { gone: 7 },
    settings: { goal: "strength", lastExportAt: null, updatedAt: 3 },
  });
  const file = st({
    sessions: [sess("old", 1), sess("gone", 2)],
    settings: { goal: "muscle", lastExportAt: null, updatedAt: 99 },
  });
  const r = addBackup(local, file, 1000).state;
  assert.deepEqual(ids(r), ["gone", "keep", "old"]); // the earlier-deleted one comes back
  assert.equal(r.settings.goal, "strength"); // local settings stay
  assert.deepEqual(Object.keys(r.deleted), ["gone"]);
  assert.ok(r.sessions.find((x) => x.id === "gone").updatedAt > 7);
});

test("settings.schedule survives merge (newer settings record wins whole)", () => {
  const sched = { days: { 1: "w1", 3: "next" } };
  const a = st({ settings: { goal: "muscle", updatedAt: 5 } });
  const b = st({ settings: { goal: "muscle", schedule: sched, updatedAt: 9 } });
  assert.deepEqual(merge(a, b).state.settings.schedule, sched);
  assert.deepEqual(merge(b, a).state.settings.schedule, sched);
});

test("workout supersets survive merge (newer workout record wins whole)", () => {
  const w = (updatedAt, supersets) => ({
    id: "w1",
    name: "A",
    muscles: [],
    items: [],
    updatedAt,
    ...(supersets ? { supersets } : {}),
  });
  const ss = [{ id: "ss-1", ids: ["a", "b"], rest: "each" }];
  const r = merge(st({ workouts: [w(5)] }), st({ workouts: [w(9, ss)] })).state;
  assert.deepEqual(r.workouts[0].supersets, ss);
  assert.deepEqual(
    merge(st({ workouts: [w(9, ss)] }), st({ workouts: [w(5)] })).state
      .workouts[0].supersets,
    ss,
  );
});
