import { test } from "node:test";
import assert from "node:assert/strict";
import { durationMin, exerciseRows, progressText } from "../js/screens/history.js";

const set = (weight, reps) => ({ weight, reps, done: true });
const ses = (id, startedAt, entries, finishedAt = startedAt + 45 * 60000) => ({
  id,
  workoutName: "A",
  startedAt,
  finishedAt,
  entries,
});
const en = (exerciseId, name, sets) => ({ exerciseId, name, primary: "Chest", sets });

test("durationMin is whole minutes, at least 1", () => {
  assert.equal(durationMin(ses("a", 0, [], 45 * 60000 + 30000)), 45);
  assert.equal(durationMin(ses("a", 0, [], 10000)), 1);
  assert.equal(durationMin(ses("a", 0, [], null)), 1);
});

test("exerciseRows: newest name, first and latest heaviest, recent first, stuck", () => {
  const sessions = [
    ses("s1", 1000, [en("bench", "Old Name", [set(50, 10)]), en("row", "Row", [set(40, 8)])]),
    ses("s2", 2000, [en("bench", "Bench", [set(55, 8)])]),
    ses("s3", 3000, [en("bench", "Bench", [set(60, 8), set(55, 9)])]),
  ];
  const rows = exerciseRows(sessions);
  assert.deepEqual(rows.map((r) => r.exerciseId), ["bench", "row"]);
  assert.equal(rows[0].name, "Bench");
  assert.equal(progressText(rows[0]), "50 → 60 kg");
  assert.equal(progressText(rows[1]), "40 kg");
});

test("exerciseRows flags stuck", () => {
  const sessions = [3, 2, 1].map((n, i) => ses("s" + i, 1000 * (i + 1), [en("sp", "SP", [set(30, 10)])]));
  const [r] = exerciseRows(sessions);
  assert.equal(r.stuck, true);
  assert.equal(progressText(r), "30 kg · stuck");
});

test("chartPoints: one point, equal values, increasing values", async () => {
  const { chartPoints } = await import("../js/screens/history.js");
  assert.deepEqual(chartPoints([50], 320, 120, 28), [{ x: 160, y: 60 }]);
  assert.deepEqual(chartPoints([50, 50, 50], 320, 120, 28).map((p) => p.y), [60, 60, 60]);
  const up = chartPoints([40, 50, 60], 320, 120, 28);
  assert.deepEqual(up.map((p) => p.x), [28, 160, 292]);
  assert.deepEqual(up.map((p) => p.y), [92, 60, 28]); // heavier is higher (smaller y)
});

test("summary: totals, volume, one best per exercise, no bests on the first-ever session, old session minutes", async () => {
  const { summary } = await import("../js/screens/history.js");
  const s1 = ses("s1", 1000, [en("bench", "Bench", [set(50, 10), set(50, 8)]), en("bw", "Dips", [set(0, 12)])]);
  const first = summary(s1, [s1]);
  assert.deepEqual(first.bests, []);
  assert.equal(first.sets, 3);
  assert.equal(first.volume, 900);
  assert.equal(first.minutes, 45);
  const s2 = ses("s2", 2000, [en("bench", "Bench", [set(52.5, 6), set(55, 5), set(50, 11)]), en("bw", "Dips", [set(0, 12)])], null);
  const m = summary(s2, [s1, s2]);
  assert.deepEqual(m.bests, [{ name: "Bench", weight: 55, reps: 5 }]); // dips 12 equals the old 12: not a best
  assert.equal(m.minutes, 1);
});
