import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY, afterOpen, anyRated, clean, needsWhy, recent, weakCause, weekly } from "../js/rating.js";
import { badgesHtml } from "../js/ratesheet.js";
import { trendHtml } from "../js/screens/history.js";
import { buildView, cleanView } from "../js/share.js";
import { emptyState, exportJson, importJson } from "../js/store.js";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";

const NOW = 100 * DAY;
const ses = (id, daysAgo, rating) => ({
  id, workoutName: "A", startedAt: NOW - daysAgo * DAY, finishedAt: NOW - daysAgo * DAY + 3600000, entries: [], ...(rating ? { rating } : {}),
});

test("clean keeps only valid fields; empty or junk is null", () => {
  assert.equal(clean(undefined), null);
  assert.equal(clean({ lifts: 9, effort: 0, note: "  " }), null);
  assert.deepEqual(clean({ lifts: 2, effort: 5, during: 3, after: 4, reasons: ["sleep", "x", "tired"], note: " hi ", junk: 1 }), { lifts: 2, effort: 5, during: 3, reasons: ["sleep", "tired"], note: "hi" });
});

test("reason chips only for weak lifts or very hard / max effort", () => {
  assert.equal(needsWhy({ lifts: 2 }), true);
  assert.equal(needsWhy({ lifts: 3, effort: 3 }), false);
  assert.equal(needsWhy({ effort: 4 }), true);
  assert.equal(needsWhy({}), false);
});

test("after can be filled in for 7 days", () => {
  const s = ses("a", 0);
  assert.equal(afterOpen(s, s.finishedAt + 6 * DAY), true);
  assert.equal(afterOpen(s, s.finishedAt + 8 * DAY), false);
});

test("weekly averages, last 7 days vs 28 days, cause line", () => {
  const sessions = [
    ses("a", 1, { lifts: 1, effort: 5, reasons: ["sleep"] }),
    ses("b", 3, { lifts: 2, effort: 4, reasons: ["sleep", "tired"] }),
    ses("c", 10, { lifts: 2, effort: 4, reasons: ["sleep"] }),
    ses("d", 20, { lifts: 5, effort: 2 }),
    ses("e", 30, { lifts: 5, effort: 1 }),
    ses("f", 2),
  ];
  const w = weekly(sessions, "effort", NOW);
  assert.equal(w.length, 8);
  assert.deepEqual([w[7], w[6], w[5], w[4]], [4.5, 4, 2, null]);
  assert.deepEqual(recent(sessions, "effort", NOW), { last: 4.5, avg28: 3.75 });
  assert.equal(recent([ses("x", 50, { effort: 3 })], "effort", NOW), null);
  assert.deepEqual(weakCause(sessions, NOW), { reason: "sleep", n: 3, total: 3 });
  assert.equal(weakCause(sessions.slice(0, 2), NOW), null);
  assert.equal(anyRated([ses("z", 1)]), false);
});

test("badges and trend draw from clean data, text is escaped", () => {
  const b = badgesHtml({ lifts: 1, effort: 3, note: "x", reasons: ["sleep"] });
  assert.match(b, /😫/);
  assert.match(b, /Hard/);
  assert.equal(badgesHtml(undefined), "");
  const html = trendHtml([ses("a", 1, { lifts: 4, effort: 3, note: "<b>" })], NOW);
  assert.match(html, /How your workouts felt/);
  assert.equal(trendHtml([ses("a", 1)], NOW), "");
});

test("the rating survives export/import and is never put in a shared view", () => {
  const st = emptyState();
  st.sessions.push(ses("a", 1, { lifts: 2, effort: 4, note: "slept badly" }));
  assert.deepEqual(importJson(exportJson(st)).sessions[0].rating, st.sessions[0].rating);
  const view = buildView(st, { now: NOW });
  assert.equal(JSON.stringify(view).includes("slept badly"), false);
  assert.equal("rating" in view.sessions[0], false);
  assert.equal("rating" in cleanView(view).sessions[0], false);
});

test("every rate.* key has an English and a Hebrew string", () => {
  const keys = Object.keys(en).filter((k) => k.startsWith("rate."));
  assert.ok(keys.length > 40);
  for (const k of keys) assert.ok(k in he, k);
});
