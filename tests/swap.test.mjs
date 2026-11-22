import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../js/store.js";
import { alternatives } from "../js/logic.js";
import { startSession, swapEntry } from "../js/session.js";
import { itemFor } from "../js/screens/workout.js";

const ex = (id, equipment, secondary = [], primary = "Chest") => ({ id, name: id, primary, secondary, equipment });
const LIB = [
  ex("bench", "barbell", ["Triceps", "Shoulders"]),
  ex("bench2", "barbell", ["Triceps"]),
  ex("db", "dumbbell", []),
  ex("fly", "cable", ["Shoulders"]),
  ex("dip", "body only", ["Triceps", "Shoulders"]),
  ex("row", "cable", [], "Back"),
  { id: "custom-1", name: "Mine", primary: "Chest", secondary: [] },
];
const by = Object.fromEntries(LIB.map((e) => [e.id, e]));
const lookup = (id) => by[id];
const ses = (id) => ({ startedAt: 1, entries: [{ exerciseId: id, sets: [{ weight: 20, reps: 8, done: true }] }] });
const ids = (l) => l.map((e) => e.id);

test("ranking: history, other equipment, shared secondary, list order", () => {
  assert.deepEqual(ids(alternatives(by.bench, LIB, [])), ["dip", "fly", "db", "custom-1", "bench2"]);
  // history first, even for same equipment
  assert.deepEqual(ids(alternatives(by.bench, LIB, [ses("bench2")], new Set(), 2)), ["bench2", "dip"]);
});
test("exclusion and primary muscle", () => {
  const r = ids(alternatives(by.bench, LIB, [], new Set(["dip", "fly"])));
  assert.deepEqual(r, ["db", "custom-1", "bench2"]);
  assert.ok(!r.includes("bench") && !r.includes("row"));
});

test("swaps count symmetrically and usual ones rank first by count", () => {
  const s = setup();
  swapEntry(s, "bench", "fly", lookup);
  swapEntry(s, "fly", "bench", lookup);
  swapEntry(s, "bench", "db", lookup);
  assert.deepEqual(s.swapCounts, { "bench|fly": 2, "bench|db": 1 });
  const r = ids(alternatives(by.bench, LIB, [], new Set(), 5, s.swapCounts));
  assert.deepEqual(r.slice(0, 3), ["fly", "db", "dip"]);
  const x = ids(alternatives(by.bench, LIB, [], new Set(["fly"]), 5, s.swapCounts));
  assert.deepEqual(x.slice(0, 2), ["db", "dip"]);
  assert.ok(!x.includes("fly"));
  const old = setup();
  delete old.swapCounts;
  swapEntry(old, "bench", "db", lookup);
  assert.equal(old.swapCounts["bench|db"], 1);
});

function setup(plan = ["bench", "row"]) {
  const s = emptyState();
  s.workouts = [{ id: "w", name: "W", items: plan.map((exerciseId) => ({ exerciseId, sets: 4, repMin: 6, repMax: 9, step: 2.5 })) }];
  startSession(s, "w", lookup, 1);
  return s;
}
const todayIds = (s) => ids(s.active.entries.map((e) => ({ id: e.exerciseId })));

test("replaces in place with the old plan targets", () => {
  const s = setup();
  swapEntry(s, "bench", "db", lookup);
  assert.deepEqual(todayIds(s), ["db", "row"]);
  assert.equal(s.active.entries[0].sets.length, 4);
  assert.deepEqual(itemFor(s, "db"), { sets: 4, repMin: 6, repMax: 9, step: 2.5 });
  assert.equal(s.workouts[0].items[0].exerciseId, "bench"); // plan untouched
});
test("splits when some sets are done", () => {
  const s = setup();
  s.active.entries[0].sets[0].done = true;
  s.active.entries[0].sets[1].done = true;
  swapEntry(s, "bench", "db", lookup);
  assert.deepEqual(todayIds(s), ["bench", "db", "row"]);
  assert.equal(s.active.entries[0].sets.length, 2);
  assert.ok(s.active.entries[0].sets.every((x) => x.done));
  assert.equal(s.active.entries[1].sets.length, 2);
  s.active.entries[0].sets.length = 3; // many done: at least 1 left
  s.active.entries[0].sets = Array(4).fill({ weight: 1, reps: 1, done: true });
  const t = setup();
  t.active.entries[0].sets = Array(4).fill({ weight: 1, reps: 1, done: true });
  swapEntry(t, "bench", "fly", lookup);
  assert.equal(t.active.entries[1].sets.length, 1);
});
test("plan tick on and off", () => {
  const on = setup();
  swapEntry(on, "bench", "db", lookup, { inPlan: true });
  assert.deepEqual(on.workouts[0].items[0], { exerciseId: "db", sets: 4, repMin: 6, repMax: 9, step: 2.5 });
  const off = setup();
  swapEntry(off, "bench", "db", lookup, { inPlan: false });
  assert.equal(off.workouts[0].items[0].exerciseId, "bench");
});
test("plan unchanged when the new id is already in the plan", () => {
  const s = setup(["bench", "db"]);
  s.active.entries.pop(); // db is in the plan but not in today's list
  swapEntry(s, "bench", "db", lookup, { inPlan: true });
  assert.deepEqual(s.workouts[0].items.map((i) => i.exerciseId), ["bench", "db"]);
  assert.deepEqual(todayIds(s), ["db"]);
});
test("weights come from the new exercise's history; swapping back works", () => {
  const s = setup();
  s.sessions.push(ses("db"));
  swapEntry(s, "bench", "db", lookup);
  assert.equal(s.active.entries[0].sets[0].weight, 20);
  assert.ok(ids(alternatives(by.db, LIB, s.sessions, new Set(todayIds(s)))).includes("bench"));
  swapEntry(s, "db", "bench", lookup);
  assert.deepEqual(todayIds(s), ["bench", "row"]);
});
