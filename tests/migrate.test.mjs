import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchExercise, planFromFile } from "../js/planfile.js";
import { linkCustomsToLibrary } from "../js/migrate.js";

const lib = JSON.parse(readFileSync(new URL("../data/exercises.json", import.meta.url), "utf8"));
const id = (n) => matchExercise(n, lib)?.id ?? null;

test("owner's names and common spellings match the library", () => {
  const want = {
    "close-grip lat pulldown": "close-grip-front-lat-pulldown",
    "Close Grip Lat Pull Down": "close-grip-front-lat-pulldown",
    "dumbbell lateral raises": "lateral-raise",
    "dumbbell bicep curls": "dumbbell-bicep-curl",
    "DB Biceps Curls": "dumbbell-bicep-curl",
    crunches: "crunch",
    "rope triceps pushdown": "rope-triceps-pushdown",
    "Rope Tricep Pushdowns": "rope-triceps-pushdown",
    "rope pushdown": "rope-triceps-pushdown",
    "BB bench press": "bench-press",
    "Bench Press Barbell": "bench-press",
    "hammer curls": "hammer-curl",
    "sit ups": "sit-up",
    "pull down wide grip lat": "wide-grip-lat-pulldown",
    "incline cable flyes": "incline-cable-flye",
  };
  for (const [n, e] of Object.entries(want)) assert.equal(id(n), e, n);
});

test("names that are not in the library stay custom", () => {
  for (const n of ["bicep curl", "curl", "Bicep Curls", "Reverse Curl Machine", "פשט", "נשיאה", "Cable Crunch Twist"])
    assert.equal(id(n), null, n);
  const p = planFromFile(
    { format: "gym-tracker-plan", version: 1, name: "P", goal: "muscle", days: [{ name: "D", exercises: [{ name: "Bicep Curls", sets: 3, reps: [8, 10] }] }] },
    lib,
  );
  if (p.ok) assert.equal(p.days[0].exercises[0].kind, "new");
});

const set = (reps) => ({ weight: 10, reps, done: true });
const base = () => ({
  version: 1,
  settings: { goal: "muscle" },
  customExercises: [
    { id: "c1", name: "Dumbbell Bicep Curls", primary: "Biceps", secondary: [] },
    { id: "c2", name: "Landmine Press", primary: "Biceps", secondary: [] },
    { id: "c3", name: "Crunches", primary: "Abs", secondary: [] },
  ],
  workouts: [
    { id: "w", name: "A", muscles: [], items: [
      { exerciseId: "c1", sets: 3, repMin: 8, repMax: 10, step: 2, restSec: 90, plates: false },
      { exerciseId: "c2", sets: 3, repMin: 8, repMax: 10, step: 2 },
      { exerciseId: "crunch", sets: 3, repMin: 8, repMax: 10, step: 2 },
      { exerciseId: "c3", sets: 3, repMin: 8, repMax: 10, step: 2 },
    ] },
  ],
  active: { workoutName: "A", startedAt: 1, entries: [{ exerciseId: "c1", name: "x", primary: "Biceps", sets: [set(5)] }] },
  sessions: [
    { id: "s", startedAt: 1, entries: [
      { exerciseId: "c1", name: "x", primary: "Biceps", sets: [set(8)] },
      { exerciseId: "c3", name: "y", primary: "Abs", sets: [set(12)] },
      { exerciseId: "crunch", name: "Crunch", primary: "Abs", sets: [set(15)] },
    ] },
  ],
});

test("migration rewrites ids everywhere, merges duplicates, keeps every set", () => {
  const s = base();
  assert.deepEqual(linkCustomsToLibrary(s, lib, new Set()), [
    { from: "Dumbbell Bicep Curls", to: "Dumbbell Bicep Curl" },
    { from: "Crunches", to: "Crunch" },
  ]);
  assert.deepEqual(s.customExercises.map((c) => c.id), ["c2"]);
  assert.deepEqual(s.workouts[0].items.map((i) => i.exerciseId), ["dumbbell-bicep-curl", "c2", "crunch"]);
  assert.equal(s.workouts[0].items[0].restSec, 90);
  assert.equal(s.active.entries[0].exerciseId, "dumbbell-bicep-curl");
  assert.equal(s.active.entries[0].name, "Dumbbell Bicep Curl");
  const e = s.sessions[0].entries;
  assert.deepEqual(e.map((x) => x.exerciseId), ["dumbbell-bicep-curl", "crunch"]);
  assert.deepEqual(e[1].sets.map((t) => t.reps), [12, 15]);
});

test("migration is a no-op the second time, skips customs with media, and ignores plain data", () => {
  const s = base();
  linkCustomsToLibrary(s, lib, new Set());
  const once = JSON.stringify(s);
  assert.deepEqual(linkCustomsToLibrary(s, lib, new Set()), []);
  assert.equal(JSON.stringify(s), once);

  const m = base();
  assert.deepEqual(linkCustomsToLibrary(m, lib, new Set(["c1", "c3"])), []);
  assert.deepEqual(m, base());

  const none = { version: 1, settings: {}, customExercises: [], workouts: [], active: null, sessions: [] };
  assert.deepEqual(linkCustomsToLibrary(none, lib, new Set()), []);
  assert.deepEqual(none.workouts, []);
});

test("a custom exactly named like an old alias (Squat) is left alone", () => {
  const s = base();
  s.customExercises.push({ id: "c9", name: "Squat", primary: "Quads", secondary: [] });
  linkCustomsToLibrary(s, lib, new Set());
  assert.ok(s.customExercises.some((c) => c.id === "c9"));
});

test("customs named like an alias added in the forgiving-match release are still linked, history moves", () => {
  const s = {
    version: 1, settings: {},
    customExercises: [
      { id: "k1", name: "Close-Grip Lat Pulldown", primary: "Back", secondary: [] },
      { id: "k2", name: "Rope Pushdown", primary: "Triceps", secondary: [] },
    ],
    workouts: [{ id: "w", name: "W", items: [{ exerciseId: "k1" }, { exerciseId: "k2" }] }],
    active: null,
    sessions: [{ id: "s", startedAt: 1, entries: [
      { exerciseId: "k1", name: "x", primary: "Back", sets: [set(8)] },
      { exerciseId: "k2", name: "y", primary: "Triceps", sets: [set(12)] },
    ] }],
  };
  assert.deepEqual(linkCustomsToLibrary(s, lib, new Set()), [
    { from: "Close-Grip Lat Pulldown", to: "Close-Grip Front Lat Pulldown" },
    { from: "Rope Pushdown", to: lib.find((e) => e.id === "rope-triceps-pushdown").name },
  ]);
  assert.deepEqual(s.customExercises, []);
  assert.deepEqual(s.workouts[0].items.map((i) => i.exerciseId), ["close-grip-front-lat-pulldown", "rope-triceps-pushdown"]);
  assert.deepEqual(s.sessions[0].entries.map((e) => e.exerciseId), ["close-grip-front-lat-pulldown", "rope-triceps-pushdown"]);
  assert.deepEqual(linkCustomsToLibrary(s, lib, new Set()), []);
});

test("every alias added after the legacy set re-links a matching custom (Pec Deck, Bench Press (Barbell)); legacy names stay", () => {
  const s = base();
  s.customExercises.push(
    { id: "p1", name: "Pec Deck", primary: "Chest", secondary: [] },
    { id: "p2", name: "Squat (Barbell)", primary: "Quads", secondary: [] },
    { id: "p3", name: "Deadlift", primary: "Back", secondary: [] }, // legacy alias: deliberate, kept
  );
  const done = linkCustomsToLibrary(s, lib, new Set()).map((l) => l.from);
  assert.ok(done.includes("Pec Deck") && done.includes("Squat (Barbell)"));
  assert.ok(s.customExercises.some((c) => c.id === "p3"));
});

test("old plank plans (8-12 reps) become 30-45 s once; other items and later edits are left alone", async () => {
  const { fixTimedPlans } = await import("../js/migrate.js");
  const s = {
    settings: {},
    workouts: [{ items: [
      { exerciseId: "plank", sets: 3, repMin: 8, repMax: 12 },
      { exerciseId: "crunch", sets: 3, repMin: 8, repMax: 12 },
    ] }],
    active: { entries: [{ exerciseId: "plank", target: { sets: 3, repMin: 8, repMax: 12 } }] },
  };
  assert.equal(fixTimedPlans(s, lib), 2);
  assert.deepEqual(s.workouts[0].items.map((i) => [i.repMin, i.repMax]), [[30, 45], [8, 12]]);
  assert.deepEqual([s.active.entries[0].target.repMin, s.active.entries[0].target.repMax], [30, 45]);
  s.workouts[0].items[0].repMax = 15; // the owner's own short hold afterwards
  assert.equal(fixTimedPlans(s, lib), 0);
  assert.equal(s.workouts[0].items[0].repMax, 15);
});
