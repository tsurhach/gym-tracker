import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchExercise } from "../js/planfile.js";
import { linkCustomsToLibrary } from "../js/migrate.js";

const lib = JSON.parse(readFileSync(new URL("../data/exercises.json", import.meta.url), "utf8"));
const id = (n) => matchExercise(n, lib)?.id ?? null;

// Real-world spellings (Hevy/Strong style "Name (Equipment)", wger, free-exercise-db, everkinetic, ChatGPT plans).
const SAME = {
  "Bench Press (Barbell)": "bench-press",
  "Bench Press (Dumbbell)": "dumbbell-bench-press",
  "Incline Bench Press (Barbell)": "incline-bench-press",
  "Incline Bench Press - Dumbbell": "incline-dumbbell-press",
  "Decline Bench Press (Barbell)": "decline-barbell-bench-press",
  "Flat DB Bench Press": "dumbbell-bench-press",
  "Chest Press (Machine)": "leverage-chest-press",
  "Leverage Chest Press": "leverage-chest-press",
  "Push Ups (Bodyweight)": "push-up",
  "Chest Fly (Dumbbell)": "dumbbell-flyes",
  "Fly With Dumbbells": "dumbbell-flyes",
  "Pec Deck": "pec-deck-fly",
  "Butterfly (Pec Deck)": "pec-deck-fly",
  "Chest Fly (Machine)": "pec-deck-fly",
  "Cable Fly": "cable-crossover",
  "Lat Pulldown (Cable)": "wide-grip-lat-pulldown",
  "Lat Pulldown - Close Grip (Cable)": "close-grip-front-lat-pulldown",
  "Straight Arm Pulldown (Cable)": "straight-arm-pulldown",
  "Pull Up (Bodyweight)": "pull-up",
  "Chin Up (Bodyweight)": "chin-up",
  "Bent Over Row (Barbell)": "bent-over-barbell-row",
  "Bent Over Row with Barbell": "bent-over-barbell-row",
  "Seated Row (Cable)": "seated-cable-row",
  "Single Arm Dumbbell Row": "one-arm-dumbbell-row",
  "T Bar Row": "t-bar-row",
  "Deadlift (Barbell)": "barbell-deadlift",
  "Romanian Deadlift (Barbell)": "romanian-deadlift",
  "RDL (Barbell)": "romanian-deadlift",
  "SLDL": "stiff-leg-deadlift",
  "Stiff-Legged Deadlift (Barbell)": "stiff-leg-deadlift",
  "Good Morning (Barbell)": "good-morning",
  "Hyperextensions (Back Extensions)": "back-extension",
  "Shrug (Barbell)": "barbell-shrug",
  "Shrugs, Dumbbells": "dumbbell-shrug",
  "Overhead Press (Barbell)": "overhead-press",
  "Shoulder Press (Dumbbell)": "dumbbell-shoulder-press",
  "DB Shoulder Press": "dumbbell-shoulder-press",
  "Overhead Press (Dumbbell)": "dumbbell-shoulder-press",
  "Arnold Press (Dumbbell)": "arnold-dumbbell-press",
  "Shoulder Press (Machine)": "machine-shoulder-military-press",
  "Lateral Raise (Dumbbell)": "lateral-raise",
  "Front Raise (Dumbbell)": "front-dumbbell-raise",
  "Face Pull (Cable)": "face-pull",
  "Reverse Fly (Dumbbell)": "rear-delt-fly",
  "Reverse Fly (Machine)": "reverse-machine-flyes",
  "Upright Row (Barbell)": "upright-row",
  "Bicep Curl (Barbell)": "barbell-curl",
  "Bicep Curl (Dumbbell)": "dumbbell-bicep-curl",
  "Hammer Curl (Dumbbell)": "hammer-curl",
  "Preacher Curl (Barbell)": "preacher-curl",
  "Bicep Curl (Cable)": "cable-curl",
  "Curl (EZ Bar)": "ez-bar-curl",
  "Concentration Curl (Dumbbell)": "concentration-curl",
  "Triceps Pushdown (Cable)": "triceps-pushdown",
  "Triceps Pushdown (Rope)": "rope-triceps-pushdown",
  "Skullcrusher (Barbell)": "skullcrusher",
  "Skull Crusher (EZ Bar)": "skullcrusher",
  "Overhead Triceps Extension (Cable)": "cable-rope-overhead-triceps-extension",
  "Triceps Extension (Machine)": "machine-triceps-extension",
  "Wrist Curl (Barbell)": "barbell-wrist-curl",
  "Reverse Wrist Curl (Dumbbell)": "dumbbell-reverse-wrist-curl",
  "Crunch (Cable)": "cable-crunch",
  "Hanging Leg Raise (Bodyweight)": "hanging-leg-raise",
  "Ab Wheel": "ab-roller",
  "Pallof Press (Cable)": "pallof-press",
  "Squat (Barbell)": "barbell-squat",
  "Squat (Smith Machine)": "smith-machine-squat",
  "Front Squat (Barbell)": "front-squat",
  "Leg Press (Machine)": "leg-press",
  "Leg Extension (Machine)": "leg-extension",
  "Hack Squat (Machine)": "hack-squat",
  "Goblet Squat (Kettlebell)": "goblet-squat",
  "Lunge (Dumbbell)": "dumbbell-lunges",
  "Lunge (Barbell)": "barbell-lunge",
  "Step Up (Dumbbell)": "dumbbell-step-ups",
  "Lying Leg Curl (Machine)": "lying-leg-curl",
  "Seated Leg Curl (Machine)": "seated-leg-curl",
  "Hip Thrust (Barbell)": "barbell-hip-thrust",
  "Hip Abduction (Machine)": "hip-abduction-machine",
  "Standing Calf Raise (Machine)": "standing-calf-raise",
  "Seated Calf Raise (Machine)": "seated-calf-raise",
  "Calf Raise (Smith Machine)": "smith-machine-calf-raise",
  "Cable Pull Through": "pull-through",
  "Bench Press (Smith Machine)": "smith-machine-bench-press",
  "Incline Bench Press (Smith Machine)": "smith-machine-incline-bench-press",
  "Zottman Curl": "zottman-curl",
  "Skullcrusher (Dumbbell)": "dumbbell-skullcrusher",
  "Lunge (Walking)": "walking-lunge",
  "Squat (Dumbbell)": "dumbbell-squat",
};

test("real-world names from Hevy, Strong, wger, free-exercise-db and everkinetic map to the library", () => {
  assert.ok(Object.keys(SAME).length >= 60);
  for (const [n, e] of Object.entries(SAME)) {
    assert.ok(lib.some((x) => x.id === e), `unknown id ${e}`);
    assert.equal(id(n), e, n);
  }
});

// Different equipment or a different movement: these must NOT be linked (a wrong drawing is worse than none).
test("near-misses with other equipment or another movement stay unmatched", () => {
  for (const n of [
    "Incline Bench Press (Barbell) Close Grip",
    "Romanian Deadlift (Dumbbell)",
    "Deadlift (Dumbbell)",
    "Bent Over Row (Dumbbell)",
    "Lat Pulldown (Machine)",
    "Seated Row (Machine)",
    "Bodyweight Squat",
    "Bulgarian Split Squat",
    "Hip Thrust (Smith Machine)",
    "Glute Kickback (Machine)",
    "Hammer Curl (Machine)",
    "Preacher Curl (Dumbbell)",
    "Triceps Extension (Dumbbell)",
    "Weighted Pull Up",
    "Weighted Dips",
    "Dips",
    "Front Raise",
    "Shrug",
    "Leg Curl (Machine)",
    "Calf Raise (Seated, Dumbbell)",
    "Hack Squat (Barbell)",
    "Reverse Curl (Barbell)",
    "Cable Crunch Twist",
    "Single Leg Romanian Deadlift",
  ])
    assert.equal(id(n), null, n);
});

// ---- full name pass (wger, free-exercise-db, everkinetic): docs/exercise-aliases.md ----
const TABLE = JSON.parse(readFileSync(new URL("./alias-table.json", import.meta.url), "utf8"));

test("every source name classed as the same exercise maps to its library exercise", () => {
  const entries = Object.entries(TABLE);
  assert.ok(entries.length >= 375, `${entries.length}`);
  for (const [n, e] of entries) {
    assert.ok(lib.some((x) => x.id === e), `unknown id ${e}`);
    assert.equal(id(n), e, n);
  }
});

// Other equipment, another movement, a grip or stance variant, or a bare name that fits two exercises.
test("different or ambiguous source names stay unmatched", () => {
  for (const n of [
    "Pullover",
    "Air Bike", // also a cardio machine
    "Calf Press", // could be a calf press machine
    "Seated Leg Press", // a different machine from the 45 degree sled
    "Lower Back Extensions", // machine or bench
    "Seated Military Press", // barbell, dumbbell or machine
    "Reverse lunges",
    "Dumbbell Rear Lunge",
    "Barbell Walking Lunge",
    "Dumbbell Front Squat",
    "Wide-Grip Barbell Bench Press",
    "Wide Grip Bench Press",
    "Low Cable Crossover",
    "Decline Dumbbell Flyes",
    "Incline Close Grip Barbell Bench Press",
    "Close Grip EZ Bar Curl with Barbell",
    "Dumbbell Prone Incline Curl",
    "Seated Dumbbell Curl",
    "Standing Bicep Curl",
    "Alternating bicep curls",
    "Dumbbell Romanian Deadlift",
    "Dumbbell Deadlift",
    "Dumbbell Raise",
    "Front Raises",
    "Side bend",
    "Barbell Side Bend",
    "Glute Bridge",
    "Shoulder Shrug",
    "Pendelay Rows",
    "Sumo Deadlift",
    "Pistol Squat",
    "Bulgarian Split Squat (Custom)",
    "Pull-Ups (Wide Grip)",
    "Weighted Pull Ups",
    "Assisted Pull-Up",
    "Push-Ups | Incline",
    "Wide Push-Up",
    "TRX Rows",
    "Bodyweight Walking Lunge",
    "Seated Dumbbell Calf Raise",
    "Cable Seated Crunch",
    "Smith Machine Close Grip Bench Press",
    "Smith Machine Hack Squat",
    "Single-arm Preacher Curl",
    "Kettlebell Arnold Press",
    "Triceps Dips (Assisted)",
    "Lying T-Bar Row",
    "Seated Row (Machine)",
    "Reverse Barbell Curl",
    "Landmine press",
    "Flutter Kicks",
    "Side Plank",
  ])
    assert.equal(id(n), null, n);
});

test("custom exercises named like the new names are linked, including a new library exercise", () => {
  const s = {
    customExercises: [
      { id: "c1", name: "Barbell Step Back Lunge", primary: "Quads", secondary: [] },
      { id: "c2", name: "Dips Between Two Benches", primary: "Triceps", secondary: [] },
      { id: "c3", name: "Smith Bench Press", primary: "Chest", secondary: [] },
      { id: "c4", name: "Landmine press", primary: "Shoulders", secondary: [] },
    ],
    workouts: [{ id: "w", name: "A", muscles: [], items: ["c1", "c2", "c3", "c4"].map((x) => ({ exerciseId: x, sets: 3, repMin: 8, repMax: 10, step: 2 })) }],
    active: null,
    sessions: [],
  };
  const links = linkCustomsToLibrary(s, lib, new Set());
  assert.deepEqual(links.map((l) => l.to), ["Barbell Reverse Lunge", "Bench Dips", "Smith Machine Bench Press"]);
  assert.deepEqual(s.customExercises.map((c) => c.id), ["c4"]);
  assert.deepEqual(s.workouts[0].items.map((i) => i.exerciseId), ["barbell-reverse-lunge", "bench-dips", "smith-machine-bench-press", "c4"]);
});
