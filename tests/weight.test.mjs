import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteWeight,
  localDate,
  logWeight,
  validKg,
  weightStats,
} from "../js/weight.js";
import { summary } from "../js/screens/weight.js";
import { emptyState, importJson, isValidState } from "../js/store.js";

const e = (date, kg) => ({ id: date, date, kg });

test("logWeight inserts sorted and replaces the same day", () => {
  const s = emptyState();
  logWeight(s, "2026-03-05", 80);
  logWeight(s, "2026-03-01", 81);
  logWeight(s, "2026-03-05", 79.5);
  assert.deepEqual(
    s.bodyWeights.map((x) => [x.date, x.kg]),
    [
      ["2026-03-01", 81],
      ["2026-03-05", 79.5],
    ],
  );
  assert.ok(s.bodyWeights[0].id);
});

test("deleteWeight removes by id and tolerates a missing field", () => {
  const s = emptyState();
  deleteWeight(s, "x");
  assert.deepEqual(s.bodyWeights, []);
  logWeight(s, "2026-03-05", 80);
  deleteWeight(s, s.bodyWeights[0].id);
  assert.deepEqual(s.bodyWeights, []);
});

test("validKg: finite, 20 to 400", () => {
  for (const n of [20, 82.4, 400]) assert.ok(validKg(n));
  for (const n of [19.9, 400.1, NaN, Infinity, null, "80"])
    assert.ok(!validKg(n));
});

test("localDate is local time, not UTC, around midnight", () => {
  assert.equal(localDate(new Date(2026, 2, 5, 0, 30)), "2026-03-05");
  assert.equal(localDate(new Date(2026, 2, 5, 23, 59, 59)), "2026-03-05");
  assert.equal(localDate(new Date(2026, 0, 1, 0, 0, 0)), "2026-01-01");
});

test("weightStats: empty, one entry, change, min/max", () => {
  assert.equal(weightStats([], "2026-03-05").latest, null);
  const one = weightStats([e("2026-03-05", 80)], "2026-03-05");
  assert.deepEqual(
    [one.latest, one.previous, one.change, one.change30],
    [80, null, null, null],
  );
  const s = weightStats(
    [e("2026-03-04", 83.6), e("2026-03-05", 82.4)],
    "2026-03-05",
  );
  assert.deepEqual(
    [s.latest, s.previous, s.change, s.min, s.max],
    [82.4, 83.6, -1.2, 82.4, 83.6],
  );
});

test("weightStats: change30 uses the entry closest to 30 days back, at least 14 days before", () => {
  const list = [
    e("2026-01-01", 90),
    e("2026-02-03", 85),
    e("2026-02-20", 84),
    e("2026-03-05", 83.8),
  ];
  // latest 03-05; 30 days back = 02-03 (exact)
  assert.equal(weightStats(list, "2026-03-05").change30, -1.2);
  const near = [e("2026-02-25", 84), e("2026-03-05", 83.5)]; // only 8 days back: not enough
  assert.equal(weightStats(near, "2026-03-05").change30, null);
  const edge = [e("2026-02-19", 84), e("2026-03-05", 83.5)]; // exactly 14 days
  assert.equal(weightStats(edge, "2026-03-05").change30, -0.5);
});

test("summary wording", () => {
  assert.equal(summary([], "2026-03-05"), "No entries yet.");
  const list = [
    e("2026-02-03", 85),
    e("2026-03-04", 83.6),
    e("2026-03-05", 83.6),
  ];
  assert.equal(
    summary(list, "2026-03-05"),
    "Latest: 83.6 kg. No change since the previous entry. Down 1.4 kg in the last 30 days.",
  );
  assert.match(
    summary([e("2026-03-04", 80), e("2026-03-05", 81)], "2026-03-05"),
    /Up 1 kg since/,
  );
});

test("state validation: missing field ok, malformed rejected, old backups import", () => {
  const s = emptyState();
  assert.ok(isValidState(s));
  assert.ok(isValidState({ ...s, bodyWeights: [e("2026-03-05", 80)] }));
  for (const bad of [
    "x",
    {},
    [{ id: "a", date: "2026-3-5", kg: 80 }],
    [{ id: "a", date: "2026-03-05", kg: "80" }],
    [{ date: "2026-03-05", kg: 80 }],
    [null],
  ])
    assert.ok(!isValidState({ ...s, bodyWeights: bad }));
  assert.deepEqual(importJson(JSON.stringify(s)).bodyWeights, undefined);
});
