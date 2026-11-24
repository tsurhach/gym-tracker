import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GOALS } from "../js/constants.js";
import { addMany, duplicateWorkout, matchRank, moveItem, orderItems, recentIds, searchExercises, summaryText } from "../js/planbuild.js";

const lib = JSON.parse(readFileSync(new URL("../data/exercises.json", import.meta.url), "utf8"));
const LIB = Array.isArray(lib) ? lib : lib.exercises;
const top = (q) => searchExercises(LIB, q)[0]?.name;

test("search understands gym words", () => {
  assert.equal(top("ohp"), "Overhead Press");
  assert.equal(top("rdl"), "Romanian Deadlift");
  assert.equal(top("pullup"), "Pull-Up");
  assert.equal(top("pull up"), "Pull-Up");
  assert.equal(top("chin up"), "Chin-Up");
  assert.equal(top("chin"), "Chin-Up"); // not "Machine ..."
  assert.match(top("incline db"), /^Incline Dumbbell/);
  assert.match(top("bb row"), /Barbell Row/);
  assert.match(top("lat raise"), /Lateral Raise/);
  assert.match(top("push down"), /Pushdown/);
});
test("search ignores case, punctuation, spaces and word order", () => {
  assert.notEqual(matchRank("Pull-Up", "PULL  up!"), null);
  assert.notEqual(matchRank("Incline Dumbbell Press", "press incline"), null);
  assert.equal(matchRank("Bench Press", "squat"), null);
  assert.equal(searchExercises(LIB, "  ").length, LIB.length);
});
test("search ranks names that start with the query first", () => {
  const r = searchExercises([{ name: "Incline Bench Press" }, { name: "Bench Press" }], "bench").map((e) => e.name);
  assert.deepEqual(r, ["Bench Press", "Incline Bench Press"]);
});

test("addMany adds in tick order, no duplicates, goal defaults", () => {
  const w = { items: [{ exerciseId: "a", sets: 3, repMin: 8, repMax: 12, step: 2.5 }] };
  assert.equal(addMany(w, ["c", "a", "b", "c"], "strength"), 2);
  assert.deepEqual(w.items.map((i) => i.exerciseId), ["a", "c", "b"]);
  const g = GOALS.strength;
  assert.deepEqual(w.items[1], { exerciseId: "c", sets: g.sets, repMin: g.repMin, repMax: g.repMax, step: 2.5 });
  assert.equal(addMany(w, [], "muscle"), 0);
  assert.equal(summaryText({ sets: 3, repMin: 8, repMax: 12 }), "3 × 8–12");
  assert.equal(summaryText({ sets: 5, repMin: 5, repMax: 5 }), "5 × 5");
});

test("duplicateWorkout: new id, free name, independent items, placed after", () => {
  const s = { workouts: [{ id: "1", name: "Push", muscles: ["Chest"], items: [{ exerciseId: "a", sets: 3 }] }, { id: "2", name: "Pull", muscles: [], items: [] }] };
  const c = duplicateWorkout(s, s.workouts[0], "9");
  assert.deepEqual(s.workouts.map((w) => w.id), ["1", "9", "2"]);
  assert.equal(c.name, "Push copy");
  assert.equal(duplicateWorkout(s, s.workouts[0], "10").name, "Push copy 2");
  c.items[0].sets = 9;
  c.muscles.push("Back");
  assert.equal(s.workouts[0].items[0].sets, 3);
  assert.deepEqual(s.workouts[0].muscles, ["Chest"]);
  assert.ok(duplicateWorkout(s, { ...s.workouts[0], name: "x".repeat(40) }).name.length <= 40);
});

test("reorder: moveItem and orderItems", () => {
  const a = [1, 2, 3];
  moveItem(a, 2, -1);
  assert.deepEqual(a, [1, 3, 2]);
  moveItem(a, 0, -1);
  moveItem(a, 2, 1);
  assert.deepEqual(a, [1, 3, 2]);
  const items = ["a", "b", "c", "d"].map((exerciseId) => ({ exerciseId }));
  assert.deepEqual(orderItems(items, ["d", "a", "b", "c"]).map((i) => i.exerciseId), ["d", "a", "b", "c"]);
  assert.deepEqual(orderItems(items, ["c", "a"]).map((i) => i.exerciseId), ["c", "a", "b", "d"]); // unknown ids keep order at the end
});

test("recentIds: newest first, distinct, muscle-limited", () => {
  const ses = [
    { entries: [{ exerciseId: "x", primary: "Back" }, { exerciseId: "a", primary: "Chest" }] },
    { entries: [{ exerciseId: "b", primary: "Chest" }, { exerciseId: "a", primary: "Chest" }] },
  ];
  assert.deepEqual(recentIds(ses, ["Chest"]), ["b", "a"]);
  assert.deepEqual(recentIds(ses, []), ["b", "a", "x"]);
  assert.deepEqual(recentIds(ses, [], 2), ["b", "a"]);
});
