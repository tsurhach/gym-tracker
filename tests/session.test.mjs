import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../js/store.js";
import { muscleTally } from "../js/logic.js";
import {
  newItem,
  startSession,
  addEntry,
  finishSession,
  discardSession,
  deleteSession,
  removeSet,
} from "../js/session.js";

const LIB = {
  bench: { id: "bench", name: "Bench Press", primary: "Chest", secondary: [] },
  row: { id: "row", name: "Row", primary: "Back", secondary: [] },
};
const lookup = (id) => LIB[id];
const item = (exerciseId) => ({
  exerciseId,
  sets: 3,
  repMin: 8,
  repMax: 12,
  step: 2.5,
});
const NOW = 1_700_000_000_000;

function withPlan() {
  const s = emptyState();
  s.workouts.push({
    id: "w1",
    name: "A",
    muscles: ["Chest"],
    items: [item("bench"), item("ghost")],
  });
  return s;
}

test("newItem uses goal reps and default step", () => {
  assert.deepEqual(newItem("bench", "strength"), {
    exerciseId: "bench",
    sets: 3,
    repMin: 4,
    repMax: 6,
    step: 2.5,
  });
});

test("startSession snapshots names and skips unknown exercises", () => {
  const s = startSession(withPlan(), "w1", lookup, NOW);
  assert.equal(s.active.workoutName, "A");
  assert.equal(s.active.startedAt, NOW);
  assert.equal(s.active.finishedAt, null);
  assert.equal(s.active.entries.length, 1);
  assert.equal(s.active.entries[0].name, "Bench Press");
  assert.equal(s.active.entries[0].primary, "Chest");
  assert.deepEqual(s.active.entries[0].sets[0], {
    weight: null,
    reps: 8,
    done: false,
  });
});

test("startSession pre-fills from last logged sets", () => {
  const s = withPlan();
  s.sessions.push({
    id: "old",
    workoutId: "w1",
    workoutName: "A",
    startedAt: 1,
    finishedAt: 2,
    entries: [
      {
        exerciseId: "bench",
        name: "Bench Press",
        primary: "Chest",
        sets: [10, 10, 9].map((reps) => ({ weight: 50, reps, done: true })),
      },
    ],
  });
  startSession(s, "w1", lookup, NOW);
  assert.deepEqual(
    s.active.entries[0].sets,
    [10, 10, 9].map((reps) => ({ weight: 50, reps, done: false })),
  );
});

test("startSession leaves an active session untouched", () => {
  const s = startSession(withPlan(), "w1", lookup, NOW);
  const before = s.active;
  startSession(s, "w1", lookup, NOW + 5);
  assert.equal(s.active, before);
  assert.equal(s.active.startedAt, NOW);
});

test("addEntry adds once, ignores unknown, plan unchanged", () => {
  const s = startSession(withPlan(), "w1", lookup, NOW);
  addEntry(s, "row", lookup);
  addEntry(s, "row", lookup);
  addEntry(s, "ghost", lookup);
  assert.deepEqual(
    s.active.entries.map((e) => e.exerciseId),
    ["bench", "row"],
  );
  assert.equal(s.workouts[0].items.length, 2);
});

test("finishSession keeps done sets, drops empty entries, saves", () => {
  const s = startSession(withPlan(), "w1", lookup, NOW);
  addEntry(s, "row", lookup);
  s.active.entries[0].sets[0] = { weight: 60, reps: 8, done: true };
  finishSession(s, NOW + 100);
  assert.equal(s.active, null);
  assert.equal(s.sessions.length, 1);
  assert.equal(s.sessions[0].finishedAt, NOW + 100);
  assert.equal(s.sessions[0].entries.length, 1);
  assert.deepEqual(s.sessions[0].entries[0].sets, [
    { weight: 60, reps: 8, done: true },
  ]);
});

test("finishSession with no confirmed sets discards", () => {
  const s = startSession(withPlan(), "w1", lookup, NOW);
  finishSession(s, NOW + 100);
  assert.equal(s.active, null);
  assert.equal(s.sessions.length, 0);
});

test("finish and discard do nothing without an active session", () => {
  const s = withPlan();
  finishSession(s, NOW);
  discardSession(s);
  assert.equal(s.active, null);
  assert.equal(s.sessions.length, 0);
});

test("discardSession clears active without saving", () => {
  const s = startSession(withPlan(), "w1", lookup, NOW);
  discardSession(s);
  assert.equal(s.active, null);
  assert.equal(s.sessions.length, 0);
});

test("deleteSession removes by id", () => {
  const s = withPlan();
  s.sessions.push({ id: "a", entries: [] }, { id: "b", entries: [] });
  deleteSession(s, "a");
  assert.deepEqual(
    s.sessions.map((x) => x.id),
    ["b"],
  );
});

test("finished session survives deleting its workout and exercise", () => {
  const s = withPlan();
  s.customExercises.push({
    id: "bench",
    name: "Bench Press",
    primary: "Chest",
    secondary: [],
  });
  startSession(s, "w1", lookup, NOW);
  s.active.entries[0].sets[0] = { weight: 60, reps: 8, done: true };
  finishSession(s, NOW + 100);
  s.workouts = [];
  s.customExercises = [];
  assert.equal(s.sessions[0].workoutName, "A");
  assert.equal(s.sessions[0].entries[0].name, "Bench Press");
  assert.equal(s.sessions[0].entries[0].primary, "Chest");
  assert.equal(muscleTally(s.sessions, NOW + 200).Chest, 1);
});

function twoEntries() {
  const s = emptyState();
  const set = (reps) => ({ weight: 50, reps, done: true });
  s.sessions.push({
    id: "s1",
    entries: [
      { exerciseId: "bench", name: "Bench", primary: "Chest", sets: [set(10), set(9)] },
      { exerciseId: "row", name: "Row", primary: "Back", sets: [set(8)] },
    ],
  });
  return s;
}

test("removeSet removes one set and keeps the entry", () => {
  const s = removeSet(twoEntries(), "s1", 0, 0);
  assert.deepEqual(s.sessions[0].entries[0].sets.map((x) => x.reps), [9]);
  assert.equal(s.sessions[0].entries.length, 2);
});

test("removeSet removes an entry whose last set goes", () => {
  const s = removeSet(twoEntries(), "s1", 1, 0);
  assert.deepEqual(s.sessions[0].entries.map((e) => e.exerciseId), ["bench"]);
});

test("removeSet deletes a session left with no entries", () => {
  const s = twoEntries();
  removeSet(s, "s1", 1, 0);
  removeSet(s, "s1", 0, 0);
  assert.equal(s.sessions.length, 1);
  removeSet(s, "s1", 0, 0);
  assert.equal(s.sessions.length, 0);
});

test("removeSet ignores unknown targets", () => {
  const s = removeSet(twoEntries(), "nope", 0, 0);
  removeSet(s, "s1", 5, 0);
  removeSet(s, "s1", 0, 9);
  assert.equal(s.sessions[0].entries[0].sets.length, 2);
});
