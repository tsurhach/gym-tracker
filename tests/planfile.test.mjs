import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MUSCLES } from "../js/constants.js";
import {
  ALIAS_LIST,
  PLAN_FILE_SCHEMA,
  applyPlan,
  buildAiPrompt,
  matchExercise,
  needsMuscle,
  parsePlanText,
  planFromFile,
  validatePlanFile,
} from "../js/planfile.js";
import { emptyState, isValidState } from "../js/store.js";

const lib = JSON.parse(
  fs.readFileSync(new URL("../data/exercises.json", import.meta.url)),
);
const programs = JSON.parse(
  fs.readFileSync(new URL("../data/programs.json", import.meta.url)),
);

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
const bad = (mut) => {
  const p = good();
  mut(p);
  return validatePlanFile(p);
};
const ex0 = (p) => p.days[0].exercises[0];

test("valid file passes; unknown fields ignored", () => {
  const p = good();
  p.extra = { a: 1 };
  ex0(p).foo = 1;
  assert.deepEqual(validatePlanFile(p), { ok: true, errors: [] });
});

test("each kind of invalid input gives a plain error", () => {
  const cases = [
    (p) => (p.format = "x"),
    (p) => (p.version = 2),
    (p) => (p.name = ""),
    (p) => (p.name = "x".repeat(81)),
    (p) => (p.goal = "bulk"),
    (p) => (p.goal = "__proto__"),
    (p) => (p.notes = 5),
    (p) => (p.days = []),
    (p) => (p.days = Array(15).fill(p.days[0])),
    (p) => (p.days[0].name = ""),
    (p) => (p.days[0].exercises = []),
    (p) =>
      (p.days[0].exercises = Array(21).fill({
        name: "a",
        sets: 1,
        reps: [1, 1],
      })),
    (p) => (ex0(p).sets = 0),
    (p) => (ex0(p).sets = 11),
    (p) => (ex0(p).sets = 2.5),
    (p) => (ex0(p).reps = [8, 5]),
    (p) => (ex0(p).reps = [0, 5]),
    (p) => (ex0(p).reps = [1, 101]),
    (p) => (ex0(p).reps = "8-12"),
    (p) => (ex0(p).step = 0.1),
    (p) => (ex0(p).step = 26),
    (p) => (ex0(p).step = "2.5"),
    (p) => (ex0(p).muscle = "Neck"),
    (p) => (ex0(p).name = "y".repeat(81)),
    (p) =>
      p.days[0].exercises.push({
        name: "barbell  squat",
        sets: 3,
        reps: [5, 5],
      }),
    (p) => p.days[0].exercises.push({ name: "Squat", sets: 3, reps: [5, 5] }), // alias of the same exercise
  ];
  for (const [i, c] of cases.entries()) {
    const r = bad(c);
    assert.equal(r.ok, false, `case ${i}`);
    assert.ok(
      r.errors.length &&
        r.errors.every((e) => typeof e === "string" && e.length > 5),
      `case ${i}`,
    );
  }
});

test("hostile input never throws", () => {
  const evil = {
    get name() {
      throw new Error("x");
    },
  };
  const deep = {};
  let c = deep;
  for (let i = 0; i < 5000; i++) c = c.a = {};
  const inputs = [
    null,
    undefined,
    5,
    "s",
    [],
    () => 1,
    evil,
    deep,
    { days: "x" },
    { days: [null, 1, "a", [], { exercises: 5 }] },
    {
      ...good(),
      days: [
        {
          name: "A",
          exercises: [null, [], "x", { name: {}, sets: {}, reps: {} }],
        },
      ],
    },
    { ...good(), days: Array(1e6).fill(0) },
    {
      ...good(),
      name: {
        toString() {
          throw 1;
        },
      },
    },
  ];
  for (const i of inputs) {
    assert.doesNotThrow(() => validatePlanFile(i));
    assert.equal(validatePlanFile(i).ok, false);
    assert.doesNotThrow(() => planFromFile(i, lib, []));
  }
  assert.ok(validatePlanFile({ days: [] }).errors.length <= 20);
});

test("matching: names, spacing, punctuation, aliases", () => {
  const id = (n) => matchExercise(n, lib)?.id;
  assert.equal(id("barbell squat"), "barbell-squat");
  assert.equal(id("  Pull  Up "), "pull-up");
  assert.equal(id("Pull-up"), "pull-up");
  assert.equal(id("Pullup"), "pull-up");
  assert.equal(id("Push-Up"), "push-up");
  assert.equal(id("Bench Press"), "bench-press");
  assert.equal(id("Barbell Bench Press"), "bench-press");
  assert.equal(id("OHP"), "overhead-press");
  assert.equal(id("Overhead Press"), "overhead-press");
  assert.equal(id("RDL"), "romanian-deadlift");
  assert.equal(id("Romanian Deadlift"), "romanian-deadlift");
  assert.equal(id("Deadlift"), "barbell-deadlift");
  assert.equal(id("Lat Pulldown"), "wide-grip-lat-pulldown");
  assert.equal(id("EZ Bar Curl"), "ez-bar-curl");
  for (const aid of Object.keys(ALIAS_LIST))
    assert.ok(
      lib.some((e) => e.id === aid),
      `alias target ${aid}`,
    );
});

test("matching: no guessing", () => {
  for (const n of [
    "Squats",
    "Bench",
    "Leg Curl",
    "Row",
    "Shoulder Press",
    "Curl",
    "",
    "   ",
    null,
    5,
    {},
    "Cable Hip Abduction",
  ])
    assert.equal(matchExercise(n, lib), null, String(n));
  assert.equal(matchExercise("Barbell Squat", null), null);
});

test("preview marks library, existing and new exercises", () => {
  const p = good();
  p.days[0].exercises.push(
    { name: "My Special Move", sets: 3, reps: [8, 12], muscle: "calves" },
    { name: "Mystery", sets: 3, reps: [8, 12] },
    { name: "Mine", sets: 3, reps: [8, 12] },
  );
  const r = planFromFile(p, lib, [{ id: "c1", name: "mine", primary: "Abs" }]);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.days[0].exercises.map((x) => x.kind),
    ["library", "new", "new", "existing"],
  );
  assert.equal(r.days[0].exercises[3].id, "c1");
  assert.deepEqual(
    r.newExercises.map((n) => n.muscle),
    ["Calves", null],
  );
  assert.equal(needsMuscle(r), true);
  assert.equal(r.days[0].exercises[0].step, 2.5);
  assert.equal(planFromFile({}, lib, []).ok, false);
});

test("applyPlan: creates customs, replaces plan, keeps history, guards", () => {
  const p = good();
  p.days.push({
    name: "B",
    exercises: [
      { name: "Mystery", sets: 3, reps: [8, 12] },
      { name: "Barbell Squat", sets: 3, reps: [8, 12] },
    ],
  });
  const prev = planFromFile(p, lib, []);
  const st = emptyState();
  st.workouts = [{ id: "old", name: "Old", muscles: [], items: [] }];
  st.sessions = [
    {
      id: "s",
      startedAt: 1,
      workoutId: "old",
      workoutName: "Old",
      entries: [],
    },
  ];
  const before = JSON.stringify(st);
  assert.equal(applyPlan(st, prev).ok, false); // muscle missing
  assert.equal(JSON.stringify(st), before);
  prev.newExercises[0].muscle = "Chest";
  st.active = { id: "a", workoutName: "x", startedAt: 1, entries: [] };
  const blocked = JSON.stringify(st);
  assert.equal(applyPlan(st, prev).ok, false); // workout in progress
  assert.equal(JSON.stringify(st), blocked);
  st.active = null;
  assert.equal(applyPlan(st, prev).ok, true);
  assert.equal(st.customExercises.length, 1);
  assert.equal(st.customExercises[0].primary, "Chest");
  assert.deepEqual(
    st.workouts.map((w) => w.name),
    ["A", "B"],
  );
  assert.deepEqual(st.workouts[1].muscles, ["Chest", "Quads"]);
  assert.equal(st.workouts[1].items[0].exerciseId, st.customExercises[0].id);
  assert.equal(st.settings.goal, "strength");
  assert.equal(st.sessions.length, 1);
  assert.ok(isValidState(st));
});

test("schema export is a plain object describing the format", () => {
  assert.equal(PLAN_FILE_SCHEMA.properties.format.const, "gym-tracker-plan");
  assert.deepEqual(PLAN_FILE_SCHEMA.properties.goal.enum, [
    "strength",
    "muscle",
    "endurance",
  ]);
  JSON.stringify(PLAN_FILE_SCHEMA);
});

// ---- bundled programs ----
test("all five programs validate, match the library, and apply to valid state", () => {
  assert.equal(programs.length, 5);
  for (const pr of programs) {
    assert.deepEqual(validatePlanFile(pr), { ok: true, errors: [] }, pr.name);
    assert.ok(pr.notes);
    assert.ok(
      !/stronglifts|starting strength|5\/3\/1|phul|phat/i.test(
        pr.name + pr.notes,
      ),
    );
    const r = planFromFile(pr, lib, []);
    for (const d of r.days)
      for (const x of d.exercises)
        assert.equal(x.kind, "library", `${pr.name}: ${x.name}`);
    const st = emptyState();
    assert.ok(applyPlan(st, r).ok);
    assert.ok(isValidState(st));
  }
  const names = programs.map((p) => p.days.map((d) => d.name).join("/"));
  assert.deepEqual(names, [
    "A/B",
    "A/B",
    "Upper A/Lower A/Upper B/Lower B",
    "Push/Pull/Legs",
    "Chest/Back/Shoulders/Legs/Arms",
  ]);
  const dl = programs[1].days[1].exercises.find(
    (x) => x.name === "Barbell Deadlift",
  );
  assert.deepEqual([dl.sets, dl.reps, dl.step], [1, [5, 5], 5]);
});

// ---- reading pasted text ----
const planText = JSON.stringify(good(), null, 2);
const read = (t) => {
  const r = parsePlanText(t);
  return r.ok && validatePlanFile(r.obj).ok;
};

test("paste: plain, fenced, chatter, BOM", () => {
  assert.ok(read(planText));
  assert.ok(read("```json\n" + planText + "\n```"));
  assert.ok(
    read(
      "Sure! Here is your plan:\n\n```\n" +
        planText +
        "\n```\nEnjoy, and tell me if you want changes {really}.",
    ),
  );
  assert.ok(read("Here you go: " + planText + " Hope that helps"));
  assert.ok(read("﻿" + planText));
});

test("paste: two blocks take the first that validates", () => {
  const broken = JSON.stringify({ ...good(), goal: "bulk" });
  assert.ok(
    read(
      "```json\n" + broken + "\n```\nfixed:\n```json\n" + planText + "\n```",
    ),
  );
  assert.ok(read('example {"a":1} then ' + planText));
  const r = parsePlanText("```json\n" + broken + "\n```");
  assert.equal(r.ok, true);
  assert.equal(validatePlanFile(r.obj).ok, false); // validator's plain errors will show
});

test("paste: each ChatGPT-style damage is repaired on its own", () => {
  const nb = JSON.stringify(good(), null, 2).replaceAll("  ", "\u00A0\u00A0");
  assert.ok(read(nb), "nbsp indent");
  for (const sp of ["\u2003", "\u202F", "\u3000", "\u2009"])
    assert.ok(
      read(planText.replaceAll("  ", sp + sp)),
      "space " + sp.charCodeAt(0),
    );
  assert.ok(read(planText.replace('"name"', '"na\u200Bme"')), "zero width");
  assert.ok(read(planText.replace("{", "{\u2060\u200D")), "word joiner");
  const curly = planText.replace(/"([^"]*)"/g, "\u201C$1\u201D");
  assert.ok(read(curly), "curly quotes");
  assert.ok(read(curly.replaceAll("\u201C", "\u201D")), "all closing curly");
  assert.ok(
    read(planText.replace(/"([^"]*)"/g, "\u2018$1\u2019")),
    "curly single",
  );
  assert.ok(read(planText.replace(/\}(\s*)\]/g, "},$1]")), "trailing comma");
  assert.ok(read(planText.replaceAll("\n", "\n// note\n")), "line comments");
  assert.ok(
    read(planText.replace('"name"', '/* x */ "name"')),
    "block comment",
  );
  assert.ok(read("json\n" + planText), "json label");
  assert.ok(read(planText.replaceAll("\n", "\r\n")), "CRLF");
  assert.ok(read(planText.replaceAll("\n", "\r")), "CR");
  assert.ok(
    read("```JSON\n" + planText + "\n```\n```\nthanks\n```"),
    "two blocks",
  );
});

test("paste: realistic ChatGPT answer combining several problems", () => {
  const body = JSON.stringify(good(), null, 2)
    .replaceAll("  ", "\u00A0\u00A0")
    .replace(/\n(\s*)\]/, ",\n$1]");
  const t = `Here\u2019s your plan, ready to paste:\n\n\`\`\`json\n${body}\n\`\`\`\n\nWant me to tweak the volume? {just ask}`;
  assert.ok(read(t));
});

test("paste: // commas and curly quotes inside names stay intact", () => {
  const p = good();
  p.name = "Plan // v2, \u201Cbest\u201D one";
  p.days[0].name = "Push, pull";
  const damaged = JSON.stringify(p, null, 2)
    .replace(/\n(\s*)\]/, ",\n$1]")
    .replaceAll("  ", "\u00A0");
  for (const t of [
    JSON.stringify(p),
    damaged,
    "{ // hi\n" + JSON.stringify(p).slice(1),
  ]) {
    const r = parsePlanText(t);
    assert.equal(r.ok, true);
    assert.equal(r.obj.name, "Plan // v2, \u201Cbest\u201D one");
    assert.equal(r.obj.days[0].name, "Push, pull");
  }
});

test("paste: failure messages", () => {
  const r = parsePlanText('{"a": 1, "b": [1, 2');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /No plan could be read/);
  assert.match(r.errors[0], /reader said/);
  assert.match(r.errors[0], /send this text/);
  const v = parsePlanText(
    "```json\n" + JSON.stringify({ ...good(), goal: "bulk" }) + "\n```",
  );
  assert.equal(v.ok, true); // parsed; the validator's plain errors show next
  assert.equal(validatePlanFile(v.obj).ok, false);
});

test("paste: garbage is rejected and huge input does not hang", () => {
  const t0 = Date.now();
  for (const g of [
    "{,,,,}".repeat(30000),
    "\u00A0{".repeat(90000),
    "// {\n".repeat(30000),
    "\u201C{".repeat(90000),
    "```json\n".repeat(20000),
  ])
    assert.equal(parsePlanText(g).ok, false);
  assert.ok(Date.now() - t0 < 5000, "slow: " + (Date.now() - t0));
  for (const g of [
    "",
    "   ",
    "hello",
    "{",
    "}{",
    "[1,2]",
    "{{{{",
    null,
    5,
    "x".repeat(300000),
  ])
    assert.equal(parsePlanText(g).ok, false);
});

// ---- AI prompt ----
test("buildAiPrompt: both modes, request, format, all names, size", () => {
  const custom = [{ id: "c", name: "Zercher Carry", primary: "Back" }];
  for (const mode of ["describe", "convert"]) {
    const t = buildAiPrompt({
      request: "3 days, bad knees",
      library: lib,
      custom,
      mode,
    });
    assert.ok(t.includes("3 days, bad knees"));
    assert.ok(
      t.includes("gym-tracker-plan") &&
        t.includes('"reps"') &&
        t.includes("ONLY the JSON"),
    );
    for (const e of lib) assert.ok(t.includes(e.name), e.name);
    assert.ok(t.includes("Zercher Carry"));
    for (const m of MUSCLES) assert.ok(t.includes(m));
    assert.ok(/strength, muscle, endurance/.test(t));
    assert.ok(t.length < 9000, `${mode} ${t.length}`);
    console.log(`prompt ${mode}: ${t.length} chars`);
  }
  assert.match(buildAiPrompt({ library: lib, mode: "convert" }), /faithful/i);
  assert.match(
    buildAiPrompt({ library: lib, mode: "describe" }),
    /Design a sound/,
  );
  assert.doesNotThrow(() => buildAiPrompt());
});

// ---- review fixes ----
test("hostile pasted text: deep nesting, proto keys, Infinity, numbers as text", () => {
  const deep = "[".repeat(100_000) + "]".repeat(100_000);
  const nested = "{" + '"a":{'.repeat(60_000) + "}".repeat(60_001);
  for (const t of [deep, nested, "x".repeat(300_000)])
    assert.doesNotThrow(() => parsePlanText(t));
  const g = JSON.stringify(good());
  assert.ok(g.includes('"sets":5'));
  const bad = [
    g.replace('"sets":5', '"sets":"five"'),
    g.replace('"sets":5', '"sets":1e999'),
    g.replace('"goal":"strength"', '"goal":"__proto__"'),
    g.replace('"goal":"strength"', '"goal":"constructor"'),
    `{"__proto__":{"ok":true},"format":"gym-tracker-plan"}`,
  ];
  for (const t of bad) {
    const r = parsePlanText(t);
    assert.ok(!r.ok || !validatePlanFile(r.obj).ok, t.slice(0, 60));
  }
  assert.equal({}.ok, undefined); // no prototype pollution
});

test("matching: ambiguous generic names stay unmatched; Smith squat alias", () => {
  for (const n of ["Chest Fly", "Bicep Curl", "Biceps Curl"])
    assert.equal(matchExercise(n, lib), null, n);
  assert.equal(matchExercise("Smith Squat", lib)?.id, "smith-machine-squat");
});

test("non-Latin names stay distinct; own exercise beats an alias", () => {
  const p = good();
  p.days[0].exercises = [
    { name: "סקוואט", sets: 3, reps: [8, 12], muscle: "Quads" },
    { name: "לחיצת חזה", sets: 3, reps: [8, 12], muscle: "Chest" },
    { name: "Squat", sets: 3, reps: [5, 5] },
  ];
  assert.equal(validatePlanFile(p).ok, true);
  const own = [
    { id: "h1", name: "דדליפט", primary: "Back" },
    { id: "c9", name: "Squat", primary: "Quads" },
  ];
  const r = planFromFile(p, lib, own);
  assert.deepEqual(
    r.days[0].exercises.map((x) => x.kind),
    ["new", "new", "existing"],
  );
  assert.equal(r.days[0].exercises[2].id, "c9");
  assert.equal(r.newExercises.length, 2);
});

test("applyPlan keeps plate settings of exercises in both plans, never duplicates own exercises", () => {
  const p = good();
  p.days[0].exercises = [
    { name: "Smith Machine Squat", sets: 4, reps: [6, 8] },
    { name: "Bench Press", sets: 3, reps: [5, 5] },
    { name: "Cable Hip Abduction", sets: 3, reps: [10, 15], muscle: "Glutes" },
  ];
  const st = emptyState();
  const prev = planFromFile(p, lib, st.customExercises);
  st.workouts = [
    {
      id: "w",
      name: "Old",
      muscles: [],
      items: [
        {
          exerciseId: "smith-machine-squat",
          sets: 3,
          repMin: 8,
          repMax: 12,
          step: 2.5,
          emptyKg: 15,
          plates: true,
        },
        {
          exerciseId: "bench-press",
          sets: 3,
          repMin: 8,
          repMax: 12,
          step: 2.5,
          plates: false,
          restSec: 45,
        },
      ],
    },
  ];
  // made by hand after the preview was built
  st.customExercises.push({
    id: "own",
    name: "cable hip abduction",
    primary: "Glutes",
    secondary: [],
  });
  assert.equal(applyPlan(st, prev).ok, true);
  const [smith, bench, abd] = st.workouts[0].items;
  assert.deepEqual(
    { ...smith },
    {
      exerciseId: "smith-machine-squat",
      sets: 4,
      repMin: 6,
      repMax: 8,
      step: 2.5,
      emptyKg: 15,
      plates: true,
    },
  );
  assert.equal(bench.plates, false);
  assert.equal(bench.emptyKg, undefined);
  assert.equal(bench.restSec, 45); // per-exercise rest follows the exercise
  assert.equal(smith.restSec, undefined);
  assert.equal(bench.repMin, 5);
  assert.equal(abd.exerciseId, "own");
  assert.equal(st.customExercises.length, 1);
  assert.ok(isValidState(st));
});

test("fileKind: json/text, ai documents, unsupported, iOS empty type, uppercase", async () => {
  const { fileKind } = await import("../js/planfile.js");
  const k = fileKind;
  assert.equal(k("plan.json", "application/json"), "json");
  assert.equal(k("plan.json", ""), "json");
  assert.equal(k("notes.TXT", ""), "json");
  assert.equal(k("x", "text/plain"), "json");
  assert.equal(k("Plan.PDF", ""), "ai");
  assert.equal(k("plan", "application/pdf"), "ai");
  assert.equal(k("IMG_1.HEIC", ""), "ai");
  assert.equal(k("a.jpeg", "image/jpeg"), "ai");
  assert.equal(k("a", "image/heic"), "ai");
  assert.equal(k("p.docx", ""), "ai");
  assert.equal(
    k(
      "p",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    "ai",
  );
  assert.equal(k("p.doc", "application/msword"), "ai");
  assert.equal(k("my.plan.v2.pdf", ""), "ai");
  assert.equal(k("a.zip", "application/zip"), "unsupported");
  assert.equal(k("", ""), "unsupported");
  assert.equal(k(), "unsupported");
});
