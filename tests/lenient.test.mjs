import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildAiPrompt,
  normalizePlanFile,
  parsePlanText,
  planFromFile,
  validatePlanFile,
} from "../js/planfile.js";

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const lib = read("../data/exercises.json");
const programs = read("../data/programs.json");

const good = () => ({
  format: "gym-tracker-plan",
  version: 1,
  name: "Test",
  goal: "strength",
  notes: "n",
  days: [
    {
      name: "A",
      exercises: [{ name: "Barbell Squat", sets: 5, reps: [5, 5], step: 2.5 }],
    },
  ],
});
const ex = (o) => ({ name: "Barbell Squat", sets: 3, reps: [8, 12], ...o });
const planWith = (e, extra = {}) => ({
  ...good(),
  days: [{ name: "Full Body", exercises: [e] }],
  ...extra,
});
const norm1 = (e, extra) => normalizePlanFile(planWith(e, extra));
const first = (r) => r.obj.days[0].exercises[0];
const repsFor = (v) => first(norm1(ex({ reps: v }))).reps;

test("normalize: valid plans and all bundled programs unchanged, no fixes", () => {
  for (const p of [good(), ...programs]) {
    const copy = structuredClone(p);
    const r = normalizePlanFile(p);
    assert.deepEqual(r.obj, copy, p.name);
    assert.deepEqual(r.fixes, []);
    assert.deepEqual(p, copy, "input not mutated");
    assert.deepEqual(parsePlanText(JSON.stringify(p)).fixes, []);
  }
});

test("normalize: reps forms", () => {
  for (const [v, want] of [
    [10, [10, 10]],
    ["10", [10, 10]],
    ["8-12", [8, 12]],
    ["8–12", [8, 12]],
    ["8 - 12", [8, 12]],
    ["8 to 12", [8, 12]],
    ["10 each side", [10, 10]],
    ["10/leg", [10, 10]],
    ["10 per arm", [10, 10]],
    ["12 reps", [12, 12]],
    ["8-10 reps each side", [8, 10]],
    [{ min: 8, max: 12 }, [8, 12]],
    [{ low: "6", high: "8" }, [6, 8]],
    [
      [12, 8],
      [8, 12],
    ],
    [
      ["8", "12"],
      [8, 12],
    ],
    [[10], [10, 10]],
    ["12-8", [8, 12]],
  ])
    assert.deepEqual(repsFor(v), want, JSON.stringify(v));
  const r = norm1(ex({ reps: "8-12" }));
  assert.match(
    r.fixes[0],
    /Full Body, "Barbell Squat": reps "8-12" read as \[8, 12\]/,
  );
});

test("normalize: unreadable reps stay for the validator", () => {
  for (const v of [
    "AMRAP",
    "to failure",
    "30 sec",
    "1 min",
    "",
    null,
    8.5,
    true,
    {},
    [1, 2, 3],
  ])
    assert.deepEqual(repsFor(v), v, JSON.stringify(v));
});

test("normalize: sets", () => {
  const sets = (v, more) => first(norm1(ex({ sets: v, ...more })));
  assert.equal(sets("4").sets, 4);
  assert.equal(sets("3-4").sets, 3);
  assert.equal(sets("3–5").sets, 3);
  assert.equal(sets("3 sets").sets, 3);
  assert.match(norm1(ex({ sets: "3-4" })).fixes[0], /lower number/);
  const l = sets([{ reps: 10 }, { reps: 10 }, { reps: 8 }], {
    reps: undefined,
  });
  assert.deepEqual([l.sets, l.reps], [3, [8, 10]]);
  const keep = sets([{ reps: 10 }, { reps: 8 }], { reps: [5, 5] });
  assert.deepEqual([keep.sets, keep.reps], [2, [5, 5]]);
  assert.equal(sets("many").sets, "many");
  assert.deepEqual(sets([{ weight: 5 }]).sets, [{ weight: 5 }]);
});

test("normalize: step", () => {
  const step = (v) => first(norm1(ex({ step: v })));
  assert.equal(step("5").step, 5);
  assert.equal(step("2.5 kg").step, 2.5);
  for (const v of [0, 999, "heavy", null, -1])
    assert.equal("step" in step(v), false, String(v));
  assert.equal(norm1(ex()).fixes.length, 0);
  assert.equal("step" in first(norm1(ex({ step: undefined }))), false);
});

test("normalize: goal", () => {
  const goal = (g) => {
    const p = good();
    if (g === undefined) delete p.goal;
    else p.goal = g;
    return normalizePlanFile(p);
  };
  assert.equal(goal(undefined).obj.goal, "muscle");
  assert.match(goal(undefined).fixes[0], /No goal.*"muscle"/);
  for (const [g, w] of [
    ["Strength", "strength"],
    [" MUSCLE ", "muscle"],
    ["Hypertrophy", "muscle"],
    ["size", "muscle"],
    ["bodybuilding", "muscle"],
    ["power", "strength"],
    ["Powerlifting", "strength"],
    ["conditioning", "endurance"],
    ["stamina", "endurance"],
  ])
    assert.equal(goal(g).obj.goal, w, g);
  assert.equal(goal("weight loss").obj.goal, "weight loss");
  assert.equal(goal("__proto__").obj.goal, "__proto__");
  assert.deepEqual(goal("strength").fixes, []);
});

test("normalize: shapes of days, names and wrappers", () => {
  const exs = [
    { exercise: " Squat ", sets: 3, reps: "8-12" },
    { title: "Bench Press", sets: "3", reps: 10 },
  ];
  for (const key of ["workouts", "routines", "sessions", "plan"]) {
    const r = normalizePlanFile({
      name: "P",
      goal: "muscle",
      [key]: [{ title: "Day A", exercises: exs }],
    });
    assert.equal(validatePlanFile(r.obj).ok, true, key);
    assert.ok(!(key in r.obj));
    assert.ok(
      r.fixes.some((f) => f.includes(`"${key}"`)),
      key,
    );
  }
  for (const k of ["movements", "lifts"]) {
    const r = normalizePlanFile({
      name: "P",
      goal: "muscle",
      days: [{ day: "Monday", [k]: exs }],
    });
    assert.equal(validatePlanFile(r.obj).ok, true, k);
    assert.equal(r.obj.days[0].name, "Monday");
  }
  const arr = normalizePlanFile([{ name: "A", exercises: [ex()] }]);
  assert.equal(arr.obj.days.length, 1);
  assert.equal(arr.obj.format, "gym-tracker-plan");
  const inner = normalizePlanFile({
    name: "Outer",
    plan: { goal: "strength", workouts: [{ name: "A", exercises: [ex()] }] },
  });
  assert.equal(inner.obj.name, "Outer");
  assert.equal(inner.obj.goal, "strength");
  assert.equal(validatePlanFile(inner.obj).ok, true);
  const t = normalizePlanFile({
    title: "From PDF",
    days: [{ name: "A", exercises: [ex()] }],
    format: "workout",
    version: "1",
  });
  assert.deepEqual(
    [t.obj.name, t.obj.format, t.obj.version],
    ["From PDF", "gym-tracker-plan", 1],
  );
  for (const x of [{ workouts: [1, 2] }, { a: 1 }, [1, 2], [], "x", null, 5]) {
    const r = normalizePlanFile(x);
    assert.equal(r.obj, x);
    assert.deepEqual(r.fixes, []);
  }
});

test("normalize: empty exercises and days dropped with a note; names trimmed", () => {
  const p = planWith(ex());
  p.days[0].exercises.push(
    null,
    {},
    { name: "  " },
    ex({ name: "  Bench Press  " }),
  );
  p.days.push({ name: "Rest", exercises: [] });
  const r = normalizePlanFile(p);
  assert.equal(r.obj.days.length, 1);
  assert.deepEqual(
    r.obj.days[0].exercises.map((e) => e.name),
    ["Barbell Squat", "Bench Press"],
  );
  assert.ok(r.fixes.some((f) => /Rest had no exercises/.test(f)));
  assert.ok(
    r.fixes.some((f) => /Empty exercises were left out \(3 times/.test(f)),
  );
  assert.equal(validatePlanFile(r.obj).ok, true);
});

test("the owner's real failures now read", () => {
  const invented = {
    title: "Converted Plan",
    workouts: [
      {
        title: "Full Body",
        exercises: [
          { exercise: "Barbell Squat", sets: 3, reps: 10 },
          { exercise: "Bench Press", sets: "3-4", reps: "8-12" },
        ],
      },
    ],
  };
  const r = parsePlanText(
    "Here you go!\n```json\n" + JSON.stringify(invented) + "\n```",
  );
  assert.equal(r.ok, true);
  assert.ok(r.fixes.length >= 3);
  assert.equal(validatePlanFile(r.obj).ok, true);
  const p = planFromFile(r.obj, lib, []);
  assert.equal(p.ok, true);
  assert.deepEqual(
    p.days[0].exercises.map((e) => [e.repMin, e.repMax]),
    [
      [10, 10],
      [8, 12],
    ],
  );
  invented.workouts[0].exercises.push({
    exercise: "Pull-Up",
    sets: 3,
    reps: "AMRAP",
  });
  const bad = parsePlanText(JSON.stringify(invented));
  assert.equal(bad.ok, true);
  const v = validatePlanFile(bad.obj);
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 1);
  assert.match(v.errors[0], /Full Body, "Pull-Up": reps "AMRAP" can't be used/);
});

test("errors name the exercise and the value", () => {
  const msg = (e) => validatePlanFile(planWith(ex(e))).errors[0];
  assert.match(
    msg({ reps: "AMRAP" }),
    /^Full Body, "Barbell Squat": reps "AMRAP" can't be used\. Use two numbers like \[8, 12\]/,
  );
  assert.match(
    msg({ reps: "30 sec" }),
    /Timed exercises \(seconds or minutes\) are not supported/,
  );
  assert.match(msg({ reps: "1 min" }), /Timed exercises/);
  assert.doesNotMatch(msg({ reps: "AMRAP" }), /Timed/);
  assert.match(msg({ reps: [8] }), /reps \[8\] can't be used/);
  assert.match(msg({ reps: undefined }), /reps is missing/);
  assert.match(
    msg({ reps: [12, 8] }),
    /reps \[12,8\] can't be used\. The first number/,
  );
  assert.match(
    msg({ sets: 0 }),
    /sets 0 can't be used\. Use a whole number from 1 to 10/,
  );
  assert.match(msg({ sets: "many" }), /sets "many" can't be used/);
  assert.match(msg({ step: 999 }), /step 999 can't be used/);
  assert.match(msg({ muscle: "Wings" }), /muscle "Wings" can't be used/);
  assert.match(msg({ reps: "x".repeat(500) }), /… can.t be used/);
});

test("normalize: hostile input never throws or hangs and cannot pollute", () => {
  const t0 = Date.now();
  const many = {
    days: Array(200_000).fill({
      name: "A",
      exercises: [{ name: "x", sets: 1, reps: 1 }],
    }),
  };
  const nasty = JSON.parse(
    '{"__proto__":{"polluted":1},"name":"N","days":[{"__proto__":{"p":2},"name":"A","exercises":[{"__proto__":{"q":3},"name":"X","sets":"3","reps":"8-12"}]}]}',
  );
  for (const x of [
    many,
    nasty,
    { days: [{ exercises: [{ reps: { min: {}, max: [] } }] }] },
    { days: [{ exercises: [{ name: "x", reps: "9".repeat(100_000) }] }] },
  ])
    assert.doesNotThrow(() => normalizePlanFile(x));
  const r = normalizePlanFile(nasty);
  assert.equal({}.polluted, undefined);
  assert.equal({}.p, undefined);
  assert.equal({}.q, undefined);
  assert.equal(validatePlanFile(r.obj).ok, true);
  const cyc = {
    days: [{ name: "A", exercises: [{ name: "x", sets: 1, reps: 1 }] }],
  };
  cyc.self = cyc;
  assert.doesNotThrow(() => normalizePlanFile(cyc));
  assert.ok(Date.now() - t0 < 5000, "slow");
});

test("prompt: convert mode is robust for long files; field-name reminder", () => {
  const c = buildAiPrompt({ library: lib, mode: "convert" });
  assert.match(c, /ONLY the weekly workout routines/);
  assert.match(c, /nutrition, cardio, warm-ups, mobility/);
  assert.match(c, /AMRAP/);
  for (const mode of ["describe", "convert"]) {
    const t = buildAiPrompt({ library: lib, mode });
    assert.ok(
      t.indexOf("copy the field names exactly") < t.indexOf("FORMAT (example"),
    );
    assert.ok(t.length < 9000, String(t.length));
  }
});
