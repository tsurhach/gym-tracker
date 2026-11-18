import { test } from "node:test";
import assert from "node:assert/strict";
import { adjust, fmtRest, overDeadline, parseRest, remaining, restLength } from "../js/rest.js";
import { emptyState, isValidState } from "../js/store.js";
import { finishSession, startSession } from "../js/session.js";

test("remaining seconds, clamped at 0", () => {
  assert.equal(remaining(10_000, 0), 10);
  assert.equal(remaining(10_000, 9_001), 1);
  assert.equal(remaining(10_000, 10_000), 0);
  assert.equal(remaining(10_000, 99_000), 0);
});

test("m:ss formatting", () => {
  assert.equal(fmtRest(90), "1:30");
  assert.equal(fmtRest(5), "0:05");
  assert.equal(fmtRest(0), "0:00");
  assert.equal(fmtRest(300), "5:00");
});

test("adjust by 15s never goes below now", () => {
  const r = { endsAt: 100_000, total: 90 };
  assert.deepEqual(adjust(r, 15, 50_000), { endsAt: 115_000, total: 105 });
  assert.deepEqual(adjust(r, -15, 50_000), { endsAt: 85_000, total: 75 });
  assert.equal(adjust(r, -15, 95_000).endsAt, 95_000);
});

test("rest length from settings: missing is 90, 0 is off", () => {
  assert.equal(restLength({}), 90);
  assert.equal(restLength(undefined), 90);
  assert.equal(restLength({ restSeconds: 0 }), 0);
  assert.equal(restLength({ restSeconds: 45 }), 45);
});

test("state validates with and without the rest field, and a finished session drops it", () => {
  const s = emptyState();
  s.workouts.push({ id: "w", name: "A", muscles: [], items: [{ exerciseId: "x", sets: 1, repMin: 5, repMax: 8, step: 2.5 }] });
  startSession(s, "w", (id) => ({ id, name: id, primary: "Chest", secondary: [] }), 1);
  assert.ok(isValidState(s));
  s.active.rest = { endsAt: 5, total: 90 };
  s.settings.restSeconds = 60;
  assert.ok(isValidState(s));
  s.active.entries[0].sets[0].done = true;
  finishSession(s, 9);
  assert.equal(s.sessions[0].rest, undefined);
});

test("typed minutes and seconds become seconds, clamped 0..3600", () => {
  assert.equal(parseRest("1", "30"), 90);
  assert.equal(parseRest("0", "90"), 90);
  assert.equal(parseRest("0", "0"), 0);
  assert.equal(parseRest("7", "05"), 425);
  assert.equal(parseRest("", ""), 0);
  assert.equal(parseRest("abc", "-5"), 0);
  assert.equal(parseRest(" 2 ", undefined), 120);
  assert.equal(parseRest("99", "0"), 3600);
  assert.equal(parseRest("60", "59"), 3600);
});

test("Rest over lasts 5s after the end, or 5s from now when noticed late", () => {
  assert.equal(overDeadline(10_000, 11_000), 15_000);
  assert.equal(overDeadline(10_000, 100_000), 105_000);
});

test("settings.notifyRest is optional in a backup", () => {
  const s = emptyState();
  assert.ok(isValidState(s));
  s.settings.notifyRest = true;
  assert.ok(isValidState(s));
});

import { playSeconds } from "../js/rest.js";
test("custom sound plays at most 6 seconds", () => {
  assert.equal(playSeconds(2.5), 2.5);
  assert.equal(playSeconds(30), 6);
  assert.equal(playSeconds(NaN), 0);
  assert.equal(playSeconds(-1), 0);
});

test("restLength: exercise rest wins, 0 means off, junk or missing falls back", () => {
  const set = { restSeconds: 90 };
  assert.equal(restLength(set, { restSec: 150 }), 150);
  assert.equal(restLength(set, { restSec: 0 }), 0);
  assert.equal(restLength(set, {}), 90);
  assert.equal(restLength(set, undefined), 90);
  assert.equal(restLength(set, { restSec: "x" }), 90);
  assert.equal(restLength(set, { restSec: 99999 }), 90);
  assert.equal(restLength({}, {}), 90);
});
