import test from "node:test";
import assert from "node:assert/strict";
import {
  round2,
  parseNum,
  validSet,
  exerciseHistory,
  advice,
  prefill,
  stuckNote,
  beats,
  isStuck,
  isPersonalBest,
  scheduleToday,
  nextWorkoutId,
  muscleTally,
  platesPerSide,
  plateText,
  gymPlates,
  plateRule,
  plateDefault,
  PLATE_SIZES,
} from "../js/logic.js";
import { MUSCLES, GOALS, DEFAULT_STEP } from "../js/constants.js";

const item = { sets: 3, repMin: 8, repMax: 12, step: 2.5 };
const s = (w, ...reps) => reps.map((r) => ({ weight: w, reps: r }));

test("constants", () => {
  assert.equal(MUSCLES.length, 11);
  assert.equal(MUSCLES[0], "Chest");
  assert.equal(MUSCLES[10], "Calves");
  assert.equal(GOALS.muscle.repMax, 12);
  assert.equal(DEFAULT_STEP, 2.5);
});

test("round2", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(56.255), 56.26);
});

test("parseNum / validSet", () => {
  assert.equal(parseNum("57,5"), 57.5);
  assert.equal(parseNum(" 60 "), 60);
  assert.equal(parseNum(""), null);
  assert.equal(parseNum("abc"), null);
  assert.equal(parseNum("-5"), null);
  assert.equal(parseNum("0"), 0);
  assert.equal(validSet(0, 10), true);
  assert.equal(validSet(60, 0), false);
  assert.equal(validSet(null, 10), false);
  assert.equal(validSet(60, 8.5), false);
});

test("advice", () => {
  assert.deepEqual(advice(null, item), {
    kind: "first",
    weight: null,
    message: "First time. Pick a starting weight.",
  });
  let a = advice(s(55, 12, 12, 12), item);
  assert.equal(a.kind, "heavier");
  assert.equal(a.weight, 57.5);
  assert.equal(a.message, "You hit 12 on every set. Try 57.5 kg today.");
  a = advice(s(50, 10, 10, 9), item);
  assert.equal(a.kind, "stay");
  assert.equal(a.weight, 50);
  assert.equal(a.message, "Stay at 50 kg and beat your reps.");
  assert.equal(advice(s(55, 12, 12), item).kind, "stay");
  assert.equal(advice([...s(50, 12), ...s(55, 12, 12, 12)], item).weight, 57.5);
  assert.equal(
    advice(s(55, 12, 12, 12), { ...item, step: 1.25 }).weight,
    56.25,
  );
  assert.equal(
    advice(s(20.1, 12, 12, 12), { ...item, step: 0.2 }).weight,
    20.3,
  );
});

test("prefill", () => {
  assert.deepEqual(prefill(s(50, 10, 10, 9), item), [
    { weight: 50, reps: 10 },
    { weight: 50, reps: 10 },
    { weight: 50, reps: 9 },
  ]);
  assert.deepEqual(prefill(s(55, 12, 12, 12), item), [
    { weight: 57.5, reps: 8 },
    { weight: 57.5, reps: 8 },
    { weight: 57.5, reps: 8 },
  ]);
  assert.deepEqual(prefill(s(50, 10), item), [
    { weight: 50, reps: 10 },
    { weight: 50, reps: 8 },
    { weight: 50, reps: 8 },
  ]);
  assert.deepEqual(prefill(null, item), [
    { weight: null, reps: 8 },
    { weight: null, reps: 8 },
    { weight: null, reps: 8 },
  ]);
});

test("beats / isStuck", () => {
  assert.equal(beats(s(50, 5), s(45, 20)), true);
  assert.equal(beats(s(50, 6, 6), s(50, 6, 5)), true);
  assert.equal(beats(s(50, 6), s(50, 6)), false);
  assert.equal(
    isStuck([s(30, 10, 10, 10), s(30, 10, 10, 10), s(30, 10, 9, 10)]),
    true,
  );
  assert.equal(
    isStuck([s(30, 10, 10, 10), s(30, 10, 10, 10), s(30, 11, 10, 10)]),
    false,
  );
  assert.equal(
    isStuck([s(30, 10, 10, 10), s(32.5, 8, 8, 8), s(32.5, 8, 8, 8)]),
    false,
  );
  assert.equal(isStuck([s(30, 10, 10, 10), s(30, 10, 10, 10)]), false);
});

const sess = (id, workoutId, startedAt, entries = []) => ({
  id,
  workoutId,
  workoutName: workoutId,
  startedAt,
  finishedAt: startedAt + 1,
  entries,
});

test("exerciseHistory", () => {
  const sessions = [
    sess("b", "w1", 200, [
      {
        exerciseId: "x",
        name: "X",
        primary: "Chest",
        sets: [
          { weight: 10, reps: 5, done: true },
          { weight: 12, reps: 5, done: false },
        ],
      },
    ]),
    sess("a", "w1", 100, [
      {
        exerciseId: "x",
        name: "X",
        primary: "Chest",
        sets: [{ weight: 8, reps: 6, done: true }],
      },
    ]),
    sess("c", "w2", 300, [
      { exerciseId: "y", name: "Y", primary: "Back", sets: [] },
    ]),
  ];
  assert.deepEqual(exerciseHistory(sessions, "x"), [
    { startedAt: 100, sets: [{ weight: 8, reps: 6 }], note: "" },
    { startedAt: 200, sets: [{ weight: 10, reps: 5 }], note: "" },
  ]);
  assert.deepEqual(exerciseHistory(sessions, "nope"), []);
});

test("nextWorkoutId", () => {
  const ws = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(nextWorkoutId(ws, []), "a");
  assert.equal(nextWorkoutId([], []), null);
  assert.equal(nextWorkoutId(ws, [sess("1", "a", 1), sess("2", "b", 5)]), "c");
  // most recently started wins regardless of array order
  assert.equal(nextWorkoutId(ws, [sess("2", "b", 5), sess("1", "a", 1)]), "c");
  assert.equal(nextWorkoutId(ws, [sess("1", "c", 9)]), "a"); // wraps
  assert.equal(nextWorkoutId(ws, [sess("1", "gone", 9)]), "a"); // removed workout
});

test("muscleTally", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 100 * DAY;
  const e = (primary, ...done) => ({
    exerciseId: primary,
    name: primary,
    primary,
    sets: done.map((d) => ({ weight: 10, reps: 5, done: d })),
  });
  const sessions = [
    sess("1", "w", now - DAY, [e("Chest", true, true, false), e("Back", true)]),
    sess("2", "w", now - 7 * DAY, [e("Chest", true)]), // exactly 7 days: counted
    sess("3", "w", now - 7 * DAY - 1, [e("Chest", true, true)]), // too old
  ];
  const t = muscleTally(sessions, now);
  assert.deepEqual(Object.keys(t), MUSCLES);
  assert.equal(t.Chest, 3);
  assert.equal(t.Back, 1);
  assert.equal(t.Calves, 0);
});

test("parseNum returns null for a number too large to be finite", () => {
  assert.equal(parseNum("9".repeat(309)), null);
});

test("isPersonalBest: heavier, same weight more reps, same or lower, no history", () => {
  const past = [{ weight: 50, reps: 8 }, { weight: 50, reps: 10 }, { weight: 40, reps: 15 }];
  assert.equal(isPersonalBest(past, { weight: 52.5, reps: 1 }), true);
  assert.equal(isPersonalBest(past, { weight: 50, reps: 11 }), true);
  assert.equal(isPersonalBest(past, { weight: 50, reps: 10 }), false);
  assert.equal(isPersonalBest(past, { weight: 45, reps: 20 }), true); // more reps than every heavier set
  assert.equal(isPersonalBest(past, { weight: 45, reps: 8 }), false);
  assert.equal(isPersonalBest([], { weight: 50, reps: 10 }), false);
});
test("platesPerSide: 72.5 on a 20 kg bar, no 25s, is 20 + 5 + 1.25", () => {
  const r = platesPerSide(72.5, 20, PLATE_SIZES.slice(1));
  assert.deepEqual(r, { each: [20, 5, 1.25], total: 72.5, exact: true, below: false });
});

test("platesPerSide: just the bar, below the bar, bad input", () => {
  assert.deepEqual(platesPerSide(20, 20, PLATE_SIZES).each, []);
  assert.equal(platesPerSide(20, 20, PLATE_SIZES).exact, true);
  const low = platesPerSide(15, 20, PLATE_SIZES);
  assert.equal(low.below, true);
  assert.equal(low.total, 20);
  for (const t of [0, -5, null, undefined, NaN, "x", Infinity, 1e9])
    assert.equal(platesPerSide(t, 20, PLATE_SIZES), null);
});

test("platesPerSide: unreachable weight gives the closest total at or below", () => {
  const r = platesPerSide(72, 20, PLATE_SIZES);
  assert.deepEqual(r.each, [25]);
  assert.equal(r.total, 70);
  assert.equal(r.exact, false);
  const r2 = platesPerSide(21, 20, PLATE_SIZES);
  assert.deepEqual([r2.each, r2.total, r2.exact], [[], 20, false]);
  assert.deepEqual(platesPerSide(60, 20, [20, 5]).each, [20]);
  assert.deepEqual(platesPerSide(100, 20, []).each, []);
});

test("platesPerSide: repeats plates and survives floating point", () => {
  assert.deepEqual(platesPerSide(140, 20, PLATE_SIZES).each, [25, 25, 10]);
  const r = platesPerSide(20 + 2 * 1.1 + 2 * 0.2, 20, [1.1, 0.2]);
  assert.equal(r.exact, true);
  assert.equal(platesPerSide(47.5, 15, PLATE_SIZES).total, 47.5);
});

test("plateText wording", () => {
  const P = PLATE_SIZES;
  assert.equal(plateText(72.5, 20, P), "Each side: 25 + 1.25"); // greedy takes the 25
  assert.equal(plateText(72.5, 20, [20, 10, 5, 2.5, 1.25]), "Each side: 20 + 5 + 1.25");
  assert.equal(plateText(20, 20, P), "Just the bar");
  assert.equal(plateText(72, 20, P), "Closest: 70 kg — each side: 25");
  assert.equal(plateText(21, 20, P), "Closest: 20 kg — just the bar");
  assert.equal(plateText(10, 20, P), "Below the empty weight (20 kg)");
  assert.equal(plateText(0, 20, P), "");
  assert.equal(plateText(60, 15, [20, 10]), "Closest: 55 kg — each side: 20");
  assert.equal(plateText(60, 0, P), "Each side: 25 + 5");
  assert.equal(plateText(1, 0, P), "Closest: 0 kg — no plates");
});

test("gymPlates defaults when settings lack or damage the field", () => {
  assert.deepEqual(gymPlates(undefined), PLATE_SIZES);
  assert.deepEqual(gymPlates({ plates: [10] }), [10]);
  assert.deepEqual(gymPlates({ plates: "bad" }), PLATE_SIZES);
});

test("plateDefault by equipment, Smith and plate-loaded machines", () => {
  const d = (equipment, id = "x", name = "X") => plateDefault({ id, name, equipment });
  assert.equal(d("barbell"), 20);
  assert.equal(d("e-z curl bar"), 0);
  assert.equal(d("trap bar"), 0);
  assert.equal(d("machine", "smith-machine-squat", "Smith Machine Squat"), 0);
  assert.equal(d("machine", "leg-press", "Leg Press"), 0);
  for (const e of ["dumbbell", "cable", "body only", "kettlebells", "other", undefined])
    assert.equal(d(e), null);
  assert.equal(d("machine"), null);
  assert.equal(plateDefault(undefined), null);
});

test("plateRule: overrides win, otherwise the equipment default", () => {
  const bb = { id: "b", name: "B", equipment: "barbell" };
  assert.deepEqual(plateRule({}, bb), { on: true, empty: 20 });
  assert.deepEqual(plateRule({ plates: false }, bb), { on: false, empty: 20 });
  assert.deepEqual(plateRule({ emptyKg: 15 }, bb), { on: true, empty: 15 });
  const custom = { id: "custom-1", name: "C" };
  assert.deepEqual(plateRule({}, custom), { on: false, empty: 0 });
  assert.deepEqual(plateRule({ plates: true, emptyKg: 12 }, custom), { on: true, empty: 12 });
  assert.deepEqual(plateRule({ emptyKg: -3 }, bb), { on: true, empty: 20 });
});

test("body weight: top of the range suggests reps or a little added weight, weight stays 0", () => {
  const a = advice(s(0, 12, 12, 12), item);
  assert.equal(a.kind, "heavier");
  assert.equal(a.weight, 0);
  assert.equal(
    a.message,
    "You hit 12 on every set. Add a rep or two, or add 2.5 kg (belt or vest) if you have it.",
  );
  assert.deepEqual(prefill(s(0, 12, 12, 12), item), s(0, 13, 13, 13));
});

test("body weight: stay message and pre-fill keep last reps at 0", () => {
  const a = advice(s(0, 10, 10, 9), item);
  assert.deepEqual([a.kind, a.weight, a.message], ["stay", 0, "Beat your reps from last time."]);
  assert.deepEqual(prefill(s(0, 10, 10, 9), item), s(0, 10, 10, 9));
});

test("body weight: first time pre-fills 0 for body only, still blank for others", () => {
  const bodyEx = { equipment: "body only" };
  assert.equal(advice(null, item, bodyEx).weight, 0);
  assert.equal(advice(null, item, bodyEx).message, "First time. Body weight. Do as many good reps as you can.");
  assert.deepEqual(prefill(null, item, bodyEx), s(0, 8, 8, 8));
  assert.deepEqual(prefill(null, item, { equipment: "barbell" }), [
    { weight: null, reps: 8 },
    { weight: null, reps: 8 },
    { weight: null, reps: 8 },
  ]);
  assert.equal(advice(null, item).message, "First time. Pick a starting weight.");
});

test("weighted exercises are unchanged, even if the library says body only", () => {
  assert.equal(advice(s(55, 12, 12, 12), item).message, "You hit 12 on every set. Try 57.5 kg today.");
  assert.equal(advice(s(50, 10, 10, 9), item, { equipment: "body only" }).message, "Stay at 50 kg and beat your reps.");
  assert.deepEqual(prefill(s(55, 12, 12, 12), item), s(57.5, 8, 8, 8));
  assert.equal(advice([...s(0, 10), ...s(5, 12, 12, 12)], item).weight, 7.5);
});

test("stuckNote: one gentle sentence after 3 flat sessions, nothing when progressing or heavier", () => {
  const flat = [s(50, 10, 10, 9), s(50, 10, 10, 9), s(50, 10, 10, 9)];
  const adv = advice(flat[2], item);
  assert.equal(
    stuckNote(flat, adv),
    "Same numbers for the last 3 sessions. That happens. Aim for one more rep today.",
  );
  assert.equal(adv.message, "Stay at 50 kg and beat your reps."); // advice itself is unchanged
  assert.equal(stuckNote([flat[0], flat[1]], adv), null);
  assert.equal(stuckNote([s(50, 8, 8, 8), s(50, 9, 9, 9), s(50, 10, 10, 10)], adv), null);
  const top = [s(50, 12, 12, 12), s(50, 12, 12, 12), s(50, 12, 12, 12)];
  assert.equal(stuckNote(top, advice(top[2], item)), null);
});

test("settings: body-weight suggestions off (missing = on) keeps body-weight moves quiet", () => {
  const bodyEx = { equipment: "body only" };
  const top = [{ weight: 0, reps: 12 }, { weight: 0, reps: 12 }, { weight: 0, reps: 12 }];
  const mid = [{ weight: 0, reps: 12 }, { weight: 0, reps: 12 }, { weight: 0, reps: 11 }];
  const off = { bodyAdvice: false };
  for (const on of [undefined, {}, { bodyAdvice: true }]) {
    assert.match(advice(top, item, bodyEx, on).message, /Add a rep or two/);
    assert.equal(advice(mid, item, bodyEx, on).message, "Beat your reps from last time.");
    assert.match(advice(null, item, bodyEx, on).message, /First time/);
  }
  for (const prev of [top, mid]) {
    const a = advice(prev, item, bodyEx, off);
    assert.equal(a.message, "");
    assert.equal(a.kind, "stay");
    assert.equal(a.weight, 0);
    assert.deepEqual(prefill(prev, item, bodyEx, off).map((x) => x.weight), [0, 0, 0]);
    assert.ok(!/2\.5|Try/.test(a.message));
  }
  assert.deepEqual(prefill(top, item, bodyEx, off).map((x) => x.reps), [12, 12, 12]);
  assert.deepEqual(advice(null, item, bodyEx, off), { kind: "first", weight: 0, message: "" });
  assert.deepEqual(prefill(null, item, bodyEx, off).map((x) => x.weight), [0, 0, 0]);
  // Weighted moves are unaffected
  const w = [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }, { weight: 50, reps: 12 }];
  assert.equal(advice(w, item, null, off).message, advice(w, item, null).message);
});

test("settings: stuck reminder off (missing = on)", () => {
  const flat = [s(50, 10, 10, 9), s(50, 10, 10, 9), s(50, 10, 10, 9)];
  const adv = advice(flat[2], item);
  assert.ok(stuckNote(flat, adv, {}));
  assert.ok(stuckNote(flat, adv, { stuckNote: true }));
  assert.equal(stuckNote(flat, adv, { stuckNote: false }), null);
  assert.equal(isStuck(flat), true); // History flag unaffected
});

test("exerciseHistory returns the entry note (empty for old entries)", () => {
  const ses = (t, note) => ({ startedAt: t, entries: [{ exerciseId: "b", sets: [{ weight: 1, reps: 1, done: true }], ...(note ? { note } : {}) }] });
  const h = exerciseHistory([ses(1, "wide grip"), ses(2)], "b");
  assert.deepEqual(h.map((x) => x.note), ["wide grip", ""]);
});

test("scheduleToday: none, fixed, next, deleted id, rest wrap, done, junk", () => {
  const ws = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const mon = new Date(2026, 10, 23, 12); // Monday
  const sat = new Date(2026, 10, 28, 12);
  const st = (days, sessions = []) => ({ workouts: ws, sessions, settings: days === undefined ? {} : { schedule: { days } } });
  assert.deepEqual(scheduleToday(st(undefined), mon), { kind: "none" });
  assert.deepEqual(scheduleToday(st({}), mon), { kind: "none" });
  assert.deepEqual(scheduleToday(st({ 1: "b" }), mon), { kind: "train", workoutId: "b", done: false });
  assert.deepEqual(scheduleToday(st({ 1: "next" }), mon), { kind: "train", workoutId: "a", done: false });
  assert.deepEqual(scheduleToday(st({ 1: "gone" }, [{ startedAt: 1, workoutId: "a" }]), mon), { kind: "train", workoutId: "b", done: false });
  assert.deepEqual(scheduleToday(st({ 1: "next", 3: "c" }), sat), { kind: "rest", next: { workoutId: "a", weekday: 1 } }); // wraps over Sunday
  assert.deepEqual(scheduleToday(st({ 0: "c" }), sat), { kind: "rest", next: { workoutId: "c", weekday: 0 } });
  const did = [{ startedAt: new Date(2026, 10, 23, 8).getTime(), workoutId: "b" }];
  assert.deepEqual(scheduleToday(st({ 1: "b" }, did), mon), { kind: "train", workoutId: "b", done: true });
  assert.deepEqual(scheduleToday(st({ 1: "next" }, did), mon), { kind: "train", workoutId: "b", done: true });
  for (const junk of ["x", [1, 2], 5, null, { 9: "a", z: "b" }])
    assert.deepEqual(scheduleToday({ workouts: ws, sessions: [], settings: { schedule: { days: junk } } }, mon), { kind: "none" });
  assert.deepEqual(scheduleToday({ workouts: ws, sessions: [], settings: { schedule: "oops" } }, mon), { kind: "none" });
});
