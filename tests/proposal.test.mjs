import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MUSCLES } from "../js/constants.js";
import {
  PRESETS,
  blankWorkouts,
  proposeItems,
  buildPlan,
} from "../js/proposal.js";

const lib = JSON.parse(
  fs.readFileSync(new URL("../data/exercises.json", import.meta.url)),
);
const byId = new Map(lib.map((e) => [e.id, e]));
const primaryOf = (it) => byId.get(it.exerciseId).primary;

test("blankWorkouts names A, B, C...", () => {
  assert.deepEqual(
    blankWorkouts(4).map((w) => w.name),
    ["A", "B", "C", "D"],
  );
  assert.deepEqual(blankWorkouts(1), [{ name: "A", muscles: [] }]);
  assert.deepEqual(blankWorkouts(0), []);
  assert.equal(blankWorkouts(28).length, 28);
});

test("two muscles get two exercises each", () => {
  const items = proposeItems(["Chest", "Triceps"], lib, "muscle");
  assert.equal(items.length, 4);
  assert.equal(items.filter((i) => primaryOf(i) === "Chest").length, 2);
  assert.equal(items.filter((i) => primaryOf(i) === "Triceps").length, 2);
  for (const i of items) {
    assert.equal(i.sets, 3);
    assert.equal(i.repMin, 8);
    assert.equal(i.repMax, 12);
    assert.equal(i.step, 2.5);
  }
});

test("all muscles get one each, strength reps", () => {
  const items = proposeItems(MUSCLES, lib, "strength");
  assert.equal(items.length, 11);
  assert.deepEqual(items.map(primaryOf), MUSCLES);
  for (const i of items) {
    assert.equal(i.repMin, 4);
    assert.equal(i.repMax, 6);
  }
});

test("upper body covers every listed muscle", () => {
  const upper = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms"];
  const items = proposeItems(upper, lib, "muscle");
  assert.ok(items.length >= 5 && items.length <= 8);
  const primaries = items.map(primaryOf);
  for (const m of upper) assert.ok(primaries.includes(m), m);
});

test("no duplicates; empty muscles gives empty", () => {
  const ids = proposeItems(MUSCLES, lib, "muscle").map((i) => i.exerciseId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(proposeItems([], lib, "muscle"), []);
});

test("buildPlan makes workouts with unique ids and copied muscles", () => {
  const plan = buildPlan(PRESETS[2].workouts, lib, "muscle");
  assert.equal(plan.length, 3);
  assert.equal(new Set(plan.map((w) => w.id)).size, 3);
  assert.deepEqual(
    plan.map((w) => w.name),
    ["Push", "Pull", "Legs"],
  );
  assert.deepEqual(plan[0].muscles, PRESETS[2].workouts[0].muscles);
  assert.notEqual(plan[0].muscles, PRESETS[2].workouts[0].muscles);
  assert.ok(plan.every((w) => w.items.length > 0));
  const full = buildPlan(PRESETS[0].workouts, lib, "muscle");
  assert.notEqual(full[0].muscles, MUSCLES);
});
