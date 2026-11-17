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
