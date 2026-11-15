// Builds data/exercises.json and img/ex/<id>/{0,1}.jpg from yuhonas/free-exercise-db.
// Re-runnable: images already on disk are skipped. Usage: node tools/build-library.mjs
import { mkdir, writeFile, access } from "node:fs/promises";
import { MUSCLES } from "../js/constants.js";

const RAW = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
const ROOT = new URL("../", import.meta.url);

const MAP = {
  abdominals: "Abs",
  biceps: "Biceps",
  calves: "Calves",
  chest: "Chest",
  forearms: "Forearms",
  glutes: "Glutes",
  abductors: "Glutes",
  hamstrings: "Hamstrings",
  lats: "Back",
  "middle back": "Back",
  "lower back": "Back",
  traps: "Back",
  quadriceps: "Quads",
  adductors: "Quads",
  shoulders: "Shoulders",
  neck: "Shoulders",
  triceps: "Triceps",
};

// Source name, or [source name, display name], or [source name, display name, id] when the id
// must stay as an older value (saved data and image folders reference it). Order matters: per muscle, the most standard movement
// first, because workout proposals take exercises per muscle in this order.
const PICKS = [
  // Chest
  ["Barbell Bench Press - Medium Grip", "Bench Press"],
  ["Barbell Incline Bench Press - Medium Grip", "Incline Bench Press"],
  "Dumbbell Bench Press",
  "Incline Dumbbell Press",
  ["Pushups", "Push-Up"],
  "Dumbbell Flyes",
  "Cable Crossover",
  "Decline Barbell Bench Press",
  ["Leverage Chest Press", "Machine Chest Press", "leverage-chest-press"],
  ["Dips - Chest Version", "Chest Dip"],
  "Incline Cable Flye",
  ["Butterfly", "Pec Deck Fly"],
  // Back
  ["Pullups", "Pull-Up"],
  "Bent Over Barbell Row",
  ["Seated Cable Rows", "Seated Cable Row"],
  "Wide-Grip Lat Pulldown",
  "Barbell Deadlift",
  "One-Arm Dumbbell Row",
  "Chin-Up",
  ["T-Bar Row with Handle", "T-Bar Row"],
  "Close-Grip Front Lat Pulldown",
  "Straight-Arm Pulldown",
  "Bent Over Two-Dumbbell Row",
  ["Leverage High Row", "Machine High Row", "leverage-high-row"],
  ["Hyperextensions (Back Extensions)", "Back Extension"],
  "Barbell Shrug",
  "Dumbbell Shrug",
  // Shoulders
  ["Standing Military Press", "Overhead Press"],
  ["Side Lateral Raise", "Lateral Raise"],
  "Dumbbell Shoulder Press",
  "Arnold Dumbbell Press",
  "Face Pull",
  "Front Dumbbell Raise",
  ["Reverse Flyes", "Rear Delt Fly"],
  "Machine Shoulder (Military) Press",
  ["Upright Barbell Row", "Upright Row"],
  [
    "Cable Seated Lateral Raise",
    "Seated Cable Lateral Raise",
    "cable-seated-lateral-raise",
  ],
  "Reverse Machine Flyes",
  // Biceps
  "Barbell Curl",
  "Dumbbell Bicep Curl",
  ["Hammer Curls", "Hammer Curl"],
  ["Preacher Curl", "Preacher Curl"],
  "Incline Dumbbell Curl",
  ["Standing Biceps Cable Curl", "Cable Curl"],
  "EZ-Bar Curl",
  ["Concentration Curls", "Concentration Curl"],
  "Machine Bicep Curl",
  ["Cable Hammer Curls - Rope Attachment", "Cable Rope Hammer Curl"],
  // Triceps
  "Triceps Pushdown",
  "Close-Grip Barbell Bench Press",
  ["Dips - Triceps Version", "Triceps Dip"],
  ["EZ-Bar Skullcrusher", "Skullcrusher"],
  ["Triceps Pushdown - Rope Attachment", "Rope Triceps Pushdown"],
  "Cable Rope Overhead Triceps Extension",
  "Tricep Dumbbell Kickback",
  "Bench Dips",
  "Machine Triceps Extension",
  "Dumbbell One-Arm Triceps Extension",
  // Forearms
  ["Palms-Up Barbell Wrist Curl Over A Bench", "Barbell Wrist Curl"],
  ["Palms-Down Wrist Curl Over A Bench", "Reverse Barbell Wrist Curl"],
  ["Seated Dumbbell Palms-Up Wrist Curl", "Dumbbell Wrist Curl"],
  ["Seated Dumbbell Palms-Down Wrist Curl", "Dumbbell Reverse Wrist Curl"],
  "Wrist Roller",
  "Cable Wrist Curl",
  // Abs
  ["Crunches", "Crunch"],
  "Cable Crunch",
  "Hanging Leg Raise",
  "Plank",
  "Ab Crunch Machine",
  "Russian Twist",
  "Reverse Crunch",
  "Ab Roller",
  "Sit-Up",
  "Pallof Press",
  // Quads
  "Barbell Squat",
  "Leg Press",
  ["Front Barbell Squat", "Front Squat"],
  ["Leg Extensions", "Leg Extension"],
  "Hack Squat",
  "Dumbbell Lunges",
  "Goblet Squat",
  "Barbell Lunge",
  "Dumbbell Step Ups",
  "Split Squat with Dumbbells",
  "Smith Machine Squat",
  // Hamstrings
  "Romanian Deadlift",
  ["Lying Leg Curls", "Lying Leg Curl"],
  "Seated Leg Curl",
  ["Stiff-Legged Barbell Deadlift", "Stiff-Leg Deadlift"],
  "Good Morning",
  "Stiff-Legged Dumbbell Deadlift",
  "Glute Ham Raise",
  "Standing Leg Curl",
  // Glutes
  "Barbell Hip Thrust",
  "Barbell Glute Bridge",
  "Glute Kickback",
  "One-Legged Cable Kickback",
  "Pull Through",
  ["Thigh Abductor", "Hip Abduction Machine"],
  "Single Leg Glute Bridge",
  // Calves
  ["Standing Calf Raises", "Standing Calf Raise"],
  "Seated Calf Raise",
  "Calf Press On The Leg Press Machine",
  "Standing Barbell Calf Raise",
  "Standing Dumbbell Calf Raise",
  "Smith Machine Calf Raise",
  ["Donkey Calf Raises", "Donkey Calf Raise"],
].map((p) => (Array.isArray(p) ? p : [p, p]));

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const exists = (u) =>
  access(u).then(
    () => true,
    () => false,
  );

const source = await (await fetch(`${RAW}/dist/exercises.json`)).json();
const byName = new Map(source.map((e) => [e.name, e]));

const missing = PICKS.filter(([n]) => !byName.has(n)).map(([n]) => n);
const unmapped = new Set();
for (const [n] of PICKS) {
  for (const m of byName
    .get(n)
    ?.primaryMuscles.concat(byName.get(n).secondaryMuscles) ?? []) {
    if (!MAP[m]) unmapped.add(m);
  }
}
if (missing.length || unmapped.size) {
  console.error("Names not found in source:", missing);
  console.error("Source muscles with no mapping:", [...unmapped]);
  process.exit(1);
}

const library = PICKS.map(([src, name, id]) => {
  const e = byName.get(src);
  const primary = MAP[e.primaryMuscles[0]];
  const secondary = [...new Set(e.secondaryMuscles.map((m) => MAP[m]))].filter(
    (m) => m !== primary,
  );
  return {
    id: id ?? slug(name),
    name,
    primary,
    secondary,
    equipment: e.equipment ?? "other",
    images: 0,
    _src: e,
  };
});

const bad = library.filter((e) => !MUSCLES.includes(e.primary));
if (bad.length) {
  console.error(
    "Unknown primary muscle:",
    bad.map((e) => e.id),
  );
  process.exit(1);
}
const ids = library.map((e) => e.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) {
  console.error("Duplicate ids:", dupes);
  process.exit(1);
}

const jobs = [];
for (const e of library) {
  if (e._src.images.length < 2) continue;
  e.images = 2;
  for (const n of [0, 1]) jobs.push({ id: e.id, n, path: e._src.images[n] });
}

let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { id, n, path } = jobs[next++];
    const file = new URL(`img/ex/${id}/${n}.jpg`, ROOT);
    if (await exists(file)) continue;
    const res = await fetch(
      `${RAW}/exercises/${path.split("/").map(encodeURIComponent).join("/")}`,
    );
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    await mkdir(new URL(`img/ex/${id}/`, ROOT), { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

await mkdir(new URL("data/", ROOT), { recursive: true });
const out = library.map(({ _src, ...e }) => e);
await writeFile(
  new URL("data/exercises.json", ROOT),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`${out.length} exercises, ${jobs.length} images`);
