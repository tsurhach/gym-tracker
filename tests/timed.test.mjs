import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { advice, fmtTime, isPersonalBest, isTimed, parseTime, prefill } from "../js/logic.js";
import { newItem, swapEntry, startSession } from "../js/session.js";
import { summaryText } from "../js/planbuild.js";
import { applyInputs } from "../js/screens/exercise.js";
import { chartHtml, exerciseRows, progressText, setsText, summary } from "../js/screens/history.js";
import { emptyState } from "../js/store.js";

const plank = { id: "plank", name: "Plank", primary: "Abs", equipment: "body only", timed: true };

test("only holds are timed; a missing flag means reps (old data keeps working)", () => {
  const lib = JSON.parse(readFileSync(new URL("../data/exercises.json", import.meta.url)));
  assert.deepEqual(lib.filter((e) => e.timed).map((e) => e.id), ["plank"]);
  assert.equal(isTimed(undefined), false);
  assert.equal(isTimed({ id: "x" }), false);
});

test("time text: plain seconds or m:ss, nothing else", () => {
  assert.equal(parseTime("45"), 45);
  assert.equal(parseTime("1:30"), 90);
  assert.equal(parseTime("0:05"), 5);
  assert.equal(parseTime("1:75"), null);
  assert.equal(parseTime("abc"), null);
  assert.equal(parseTime(""), null);
  assert.equal(fmtTime(45), "0:45");
  assert.equal(fmtTime(90), "1:30");
  assert.equal(applyInputs({ weight: 0, reps: 1, done: true }, "0", "1:05", true).reps, 65);
  assert.equal(applyInputs({ weight: 0, reps: 1, done: true }, "0", "x", true).done, false);
});

test("timed items are 3 x 30-45 seconds; reps items follow the goal", () => {
  assert.deepEqual(newItem("plank", "muscle", plank), { exerciseId: "plank", sets: 3, repMin: 30, repMax: 45, step: 2.5 });
  assert.equal(newItem("x", "muscle").repMin, 8);
  const it = newItem("plank", "muscle", plank);
  assert.match(summaryText(it, plank), /3 × 30–45 /);
  assert.equal(summaryText({ sets: 3, repMin: 8, repMax: 12 }), "3 × 8–12");
});

test("timed advice: hit the top time on every set -> a few seconds more; first time starts at body weight", () => {
  const item = { sets: 3, repMin: 30, repMax: 45, step: 2.5 };
  assert.equal(advice(null, item, plank, {}).weight, 0);
  const prev = [45, 45, 45].map((reps) => ({ weight: 0, reps }));
  assert.equal(advice(prev, item, plank, {}).kind, "heavier");
  assert.deepEqual(prefill(prev, item, plank, {}).map((s) => s.reps), [50, 50, 50]);
  assert.equal(advice([{ weight: 0, reps: 30 }, { weight: 0, reps: 30 }, { weight: 0, reps: 30 }], item, plank, {}).kind, "stay");
});

test("new best for a hold: longer at the same weight, or heavier ever", () => {
  const past = [{ weight: 0, reps: 40 }];
  assert.equal(isPersonalBest(past, { weight: 0, reps: 41 }), true);
  assert.equal(isPersonalBest(past, { weight: 0, reps: 40 }), false);
  assert.equal(isPersonalBest(past, { weight: 5, reps: 10 }), true);
});

test("history shows times, no lifted volume, longest-hold chart", () => {
  const ses = { id: "s", startedAt: 2, entries: [{ exerciseId: "plank", name: "Plank", sets: [{ weight: 0, reps: 65, done: true }] }] };
  const old = { id: "o", startedAt: 1, entries: [{ exerciseId: "plank", name: "Plank", sets: [{ weight: 0, reps: 40, done: true }] }] };
  const m = summary(ses, [old, ses], (id) => id === "plank");
  assert.equal(m.volume, 0);
  assert.equal(m.bests[0].reps, "1:05");
  assert.equal(setsText(ses.entries[0].sets, true), "0 × 1:05");
  const rows = exerciseRows([old, ses], () => true);
  assert.equal(progressText(rows[0]), "0:40 → 1:05");
  assert.match(chartHtml([40, 65], true), />1:05</);
});

test("swapping reps <-> timed takes the new exercise's own range", () => {
  const bench = { id: "bench", name: "Bench", primary: "Chest" };
  const lookup = (id) => (id === "plank" ? plank : bench);
  const s = emptyState();
  s.workouts = [{ id: "w", name: "A", muscles: [], items: [{ exerciseId: "bench", sets: 3, repMin: 8, repMax: 12, step: 2.5 }] }];
  startSession(s, "w", lookup, 1);
  swapEntry(s, "bench", "plank", lookup);
  assert.deepEqual([s.active.entries[0].target.repMin, s.active.entries[0].target.repMax], [30, 45]);
});
