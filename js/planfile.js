// Plan file format: a whole training plan as plain JSON (names only, no ids), so a person or an AI
// can write one. Pure module: no DOM, no storage.
import { DEFAULT_STEP, GOALS, MUSCLES } from "./constants.js";

export const FORMAT = "gym-tracker-plan";
export const VERSION = 1;
export const LIMITS = {
  days: [1, 14],
  exercises: [1, 20],
  sets: [1, 10],
  reps: [1, 100],
  step: [0.25, 25],
  name: 80,
  dayName: 40, // the Plan screen's own limit for a workout name
  notes: 500,
};

export const PLAN_FILE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Gym Tracker plan",
  type: "object",
  required: ["format", "version", "name", "goal", "days"],
  properties: {
    format: { const: FORMAT },
    version: { const: VERSION },
    name: { type: "string", minLength: 1, maxLength: LIMITS.name },
    goal: {
      enum: Object.keys(GOALS),
      description: "strength, muscle or endurance",
    },
    notes: { type: "string", maxLength: LIMITS.notes },
    days: {
      type: "array",
      minItems: LIMITS.days[0],
      maxItems: LIMITS.days[1],
      items: {
        type: "object",
        required: ["name", "exercises"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: LIMITS.dayName },
          exercises: {
            type: "array",
            minItems: LIMITS.exercises[0],
            maxItems: LIMITS.exercises[1],
            items: {
              type: "object",
              required: ["name", "sets", "reps"],
              properties: {
                name: {
                  type: "string",
                  minLength: 1,
                  maxLength: LIMITS.name,
                  description: "Plain exercise name, e.g. Barbell Squat",
                },
                sets: {
                  type: "integer",
                  minimum: LIMITS.sets[0],
                  maximum: LIMITS.sets[1],
                },
                reps: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: {
                    type: "integer",
                    minimum: LIMITS.reps[0],
                    maximum: LIMITS.reps[1],
                  },
                  description: "[lowest, highest] reps, lowest <= highest",
                },
                step: {
                  type: "number",
                  minimum: LIMITS.step[0],
                  maximum: LIMITS.step[1],
                  description: `kg added when ready for more; default ${DEFAULT_STEP}`,
                },
                muscle: {
                  enum: MUSCLES,
                  description:
                    "Only needed for exercises that are not common gym exercises",
                },
              },
            },
          },
        },
      },
    },
  },
};

// ---- names ----
// Lowercase letters and digits only: "Pull-Up", "pull up" and "PULLUP" are one name.
export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Other common names -> library exercise id. Exact only; anything else is a new custom exercise.
export const ALIAS_LIST = {
  "bench-press": [
    "barbell bench press",
    "flat bench press",
    "flat barbell bench press",
    "bb bench press",
  ],
  "dumbbell-bench-press": ["db bench press", "flat dumbbell press"],
  "incline-dumbbell-press": ["db incline press", "incline db press"],
  "overhead-press": [
    "ohp",
    "military press",
    "barbell overhead press",
    "standing overhead press",
    "barbell shoulder press",
    "standing barbell press",
  ],
  "romanian-deadlift": ["rdl", "barbell romanian deadlift"],
  "barbell-deadlift": ["deadlift", "conventional deadlift"],
  "barbell-squat": ["squat", "back squat", "barbell back squat"],
  "bent-over-barbell-row": [
    "barbell row",
    "bent over row",
    "barbell bent over row",
    "bb row",
  ],
  "wide-grip-lat-pulldown": ["lat pulldown", "lat pull down"],
  "seated-cable-row": ["seated row", "cable row"],
  "pull-up": ["pullup", "pull ups", "pullups"],
  "chin-up": ["chinup", "chin ups", "chinups"],
  "push-up": ["pushup", "push ups", "pushups"],
  "dumbbell-flyes": ["dumbbell fly", "dumbbell flies", "chest fly"],
  "leverage-chest-press": ["chest press", "machine chest press"],
  "dumbbell-bicep-curl": [
    "dumbbell curl",
    "db curl",
    "bicep curl",
    "biceps curl",
  ],
  "triceps-pushdown": ["tricep pushdown", "cable pushdown", "pushdown"],
  "triceps-dip": ["tricep dip", "tricep dips", "triceps dips"],
  skullcrusher: [
    "skull crusher",
    "skull crushers",
    "skullcrushers",
    "lying triceps extension",
  ],
  "close-grip-barbell-bench-press": [
    "close grip bench press",
    "close grip bench",
  ],
  "lateral-raise": ["lateral raises", "side raise", "dumbbell lateral raise"],
  "face-pull": ["face pulls"],
  "barbell-hip-thrust": ["hip thrust", "hip thrusts"],
  "standing-calf-raise": ["calf raise", "calf raises"],
  "back-extension": ["hyperextension", "back extensions"],
  "ez-bar-curl": ["ez curl", "ez bar curl", "ez curl bar curl"],
};
const ALIASES = new Map();
for (const [id, names] of Object.entries(ALIAS_LIST))
  for (const n of [id, ...names]) ALIASES.set(norm(n), id);

// The library exercise this name means, or null. Name or alias only; never a guess.
export function matchExercise(name, library) {
  const k = norm(name);
  if (!k || !Array.isArray(library)) return null;
  const byName = library.find((e) => norm(e.name) === k);
  if (byName) return byName;
  const id = ALIASES.get(k);
  return (id && library.find((e) => e.id === id)) || null;
}

// ---- validation ----
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const int = (x, [lo, hi]) => Number.isInteger(x) && x >= lo && x <= hi;
const plain = (s) => typeof s === "string" && s.trim().length > 0;
const clean = (s) => s.trim().replace(/\s+/g, " ");
const muscleOf = (m) =>
  MUSCLES.find((x) => x.toLowerCase() === String(m).trim().toLowerCase()) ??
  null;
// Two names that mean the same exercise (alias or spelling) share a key.
const canonicalKey = (name) => ALIASES.get(norm(name)) ?? norm(name);

export function validatePlanFile(obj) {
  const errors = [];
  try {
    if (!isObj(obj))
      return { ok: false, errors: ["The plan must be a JSON object."] };
    if (obj.format !== FORMAT) errors.push(`"format" must be "${FORMAT}".`);
    if (obj.version !== VERSION) errors.push(`"version" must be ${VERSION}.`);
    if (!plain(obj.name) || obj.name.trim().length > LIMITS.name)
      errors.push(`"name" must be text, 1 to ${LIMITS.name} characters.`);
    if (typeof obj.goal !== "string" || !Object.hasOwn(GOALS, obj.goal))
      errors.push(`"goal" must be one of: ${Object.keys(GOALS).join(", ")}.`);
    if (
      obj.notes !== undefined &&
      (typeof obj.notes !== "string" || obj.notes.length > LIMITS.notes)
    )
      errors.push(
        `"notes" must be text of at most ${LIMITS.notes} characters.`,
      );
    const days = obj.days;
    if (
      !Array.isArray(days) ||
      days.length < LIMITS.days[0] ||
      days.length > LIMITS.days[1]
    )
      errors.push(
        `"days" must be a list of ${LIMITS.days[0]} to ${LIMITS.days[1]} workouts.`,
      );
    else
      days.forEach((d, i) => {
        const at = `Day ${i + 1}`;
        if (!isObj(d)) return errors.push(`${at} must be an object.`);
        if (!plain(d.name) || d.name.trim().length > LIMITS.dayName)
          errors.push(
            `${at}: "name" must be text, 1 to ${LIMITS.dayName} characters.`,
          );
        const label = plain(d.name)
          ? `${at} (${clean(d.name).slice(0, 40)})`
          : at;
        const ex = d.exercises;
        if (
          !Array.isArray(ex) ||
          ex.length < LIMITS.exercises[0] ||
          ex.length > LIMITS.exercises[1]
        )
          return errors.push(
            `${label}: "exercises" must be a list of ${LIMITS.exercises[0]} to ${LIMITS.exercises[1]} exercises.`,
          );
        const seen = new Set();
        ex.forEach((x, j) => {
          const e = `${label}, exercise ${j + 1}`;
          if (!isObj(x)) return errors.push(`${e} must be an object.`);
          if (!plain(x.name) || x.name.trim().length > LIMITS.name)
            errors.push(
              `${e}: "name" must be text, 1 to ${LIMITS.name} characters.`,
            );
          else {
            const key = canonicalKey(x.name);
            if (seen.has(key))
              errors.push(
                `${e}: "${clean(x.name)}" appears twice in the same workout.`,
              );
            seen.add(key);
          }
          if (!int(x.sets, LIMITS.sets))
            errors.push(
              `${e}: "sets" must be a whole number from ${LIMITS.sets[0]} to ${LIMITS.sets[1]}.`,
            );
          const r = x.reps;
          if (
            !Array.isArray(r) ||
            r.length !== 2 ||
            !r.every((n) => int(n, LIMITS.reps))
          )
            errors.push(
              `${e}: "reps" must be two whole numbers from ${LIMITS.reps[0]} to ${LIMITS.reps[1]}, like [8, 12].`,
            );
          else if (r[0] > r[1])
            errors.push(
              `${e}: the first "reps" number must not be higher than the second.`,
            );
          if (
            x.step !== undefined &&
            !(
              typeof x.step === "number" &&
              x.step >= LIMITS.step[0] &&
              x.step <= LIMITS.step[1]
            )
          )
            errors.push(
              `${e}: "step" must be a number from ${LIMITS.step[0]} to ${LIMITS.step[1]} (kg).`,
            );
          if (
            x.muscle !== undefined &&
            !(typeof x.muscle === "string" && muscleOf(x.muscle))
          )
            errors.push(
              `${e}: "muscle" must be one of: ${MUSCLES.join(", ")}.`,
            );
        });
      });
  } catch {
    return { ok: false, errors: ["This plan could not be read."] };
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

// ---- preview ----
// kind: "library" | "existing" (one of the owner's own exercises) | "new" (will be created).
// newExercises lists each new exercise once; the screen sets .muscle on those that have none.
export function planFromFile(obj, library, customExercises = []) {
  const v = validatePlanFile(obj);
  if (!v.ok) return { ok: false, errors: v.errors };
  const news = new Map();
  const days = obj.days.map((d) => ({
    name: clean(d.name),
    exercises: d.exercises.map((x) => {
      const name = clean(x.name);
      const [repMin, repMax] = x.reps;
      const base = {
        name,
        sets: x.sets,
        repMin,
        repMax,
        step: x.step ?? DEFAULT_STEP,
      };
      const lib = matchExercise(name, library);
      if (lib)
        return {
          ...base,
          kind: "library",
          id: lib.id,
          name: lib.name,
          primary: lib.primary,
        };
      const own = customExercises.find((c) => norm(c.name) === norm(name));
      if (own)
        return {
          ...base,
          kind: "existing",
          id: own.id,
          name: own.name,
          primary: own.primary,
        };
      const key = norm(name);
      if (!news.has(key))
        news.set(key, {
          key,
          name,
          muscle: x.muscle === undefined ? null : muscleOf(x.muscle),
        });
      return { ...base, kind: "new", key };
    }),
  }));
  return {
    ok: true,
    name: clean(obj.name),
    notes: typeof obj.notes === "string" ? clean(obj.notes) : "",
    goal: obj.goal,
    days,
    newExercises: [...news.values()],
  };
}

export const needsMuscle = (preview) =>
  preview.newExercises.some((n) => !muscleOf(n.muscle));

// Put the preview into state: create new custom exercises, replace the plan, keep everything else.
// Refuses (returns { ok:false, error }) while a workout is in progress or a muscle is missing; state is only
// touched once everything has been checked.
export function applyPlan(state, preview) {
  if (!preview?.ok) return { ok: false, error: "This plan is not valid." };
  if (state.active)
    return {
      ok: false,
      error:
        "A workout is in progress. Finish or discard it, then load the plan.",
    };
  if (needsMuscle(preview))
    return {
      ok: false,
      error: "Choose a muscle group for each new exercise first.",
    };
  const made = new Map(
    preview.newExercises.map((n) => [
      n.key,
      {
        id: crypto.randomUUID(),
        name: n.name,
        primary: muscleOf(n.muscle),
        secondary: [],
      },
    ]),
  );
  const workouts = preview.days.map((d) => {
    const prim = new Set();
    const items = d.exercises.map((x) => {
      const c = x.kind === "new" ? made.get(x.key) : null;
      prim.add(c ? c.primary : x.primary);
      return {
        exerciseId: c ? c.id : x.id,
        sets: x.sets,
        repMin: x.repMin,
        repMax: x.repMax,
        step: x.step,
      };
    });
    return {
      id: crypto.randomUUID(),
      name: d.name,
      muscles: MUSCLES.filter((m) => prim.has(m)),
      items,
    };
  });
  state.customExercises.push(...made.values());
  state.workouts = workouts;
  state.settings.goal = preview.goal;
  return { ok: true };
}


// ---- reading text ----
export const MAX_PLAN_TEXT = 200_000;

// Every top-level {...} in the text (string-aware), so chatter around or between objects is skipped.
function topObjects(t) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = depth > 0;
    else if (c === "{") {
      if (depth++ === 0) start = i;
    } else if (c === "}" && depth > 0 && --depth === 0) out.push(t.slice(start, i + 1));
  }
  return out;
}

// JSON from a file or a chat paste: also finds it inside chatter or code fences. Takes the first
// candidate that is a valid plan; if none is, the first that parses (so the plain errors show).
// Smart quotes are not repaired.
export function parsePlanText(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, errors: ["There is no text to read."] };
  if (text.length > MAX_PLAN_TEXT) return { ok: false, errors: ["This is too long to be a plan."] };
  const t = text.replace(/^\uFEFF/, "");
  const fenced = [...t.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const tries = [t, ...fenced, ...topObjects(t), ...fenced.flatMap(topObjects)];
  let first = null;
  for (const s of tries) {
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    if (!isObj(obj)) continue;
    if (validatePlanFile(obj).ok) return { ok: true, obj };
    first ??= obj;
  }
  if (first) return { ok: true, obj: first };
  return {
    ok: false,
    errors: ['No valid JSON was found. If the answer has curly quotes, ask the AI to "use straight quotes and reply with only the JSON".'],
  };
}

// ---- the AI prompt ----
const EXAMPLE = {
  format: FORMAT,
  version: VERSION,
  name: "Full Body Beginner",
  goal: "muscle",
  notes: "Two workouts, alternate them, three sessions a week.",
  days: [
    {
      name: "A",
      exercises: [
        { name: "Barbell Squat", sets: 3, reps: [6, 10], step: 2.5 },
        { name: "Bench Press", sets: 3, reps: [6, 10], step: 2.5 },
        { name: "Cable Hip Abduction", sets: 3, reps: [10, 15], step: 2.5, muscle: "Glutes" },
      ],
    },
  ],
};

// Prompt for the owner's own AI chat app (also reused by a later in-app version).
// mode: "describe" (design a plan from the request) or "convert" (convert an attached plan faithfully).
export function buildAiPrompt({ request = "", library = [], custom = [], mode = "describe" } = {}) {
  const groups = MUSCLES.map((m) => {
    const names = [...library, ...custom].filter((e) => e.primary === m).map((e) => e.name);
    return names.length ? `${m}: ${names.join("; ")}` : "";
  }).filter(Boolean);
  const ask = String(request).trim() || "(nothing specific; use sensible defaults for a general trainee)";
  const task =
    mode === "convert"
      ? `TASK: Convert the training plan I have attached (a file or photo) into this app's format. Be faithful: keep its days, its exercises, its sets and its reps exactly as written. Do not improve it, add to it or remove from it. Map each exercise to the closest name in the exercise list below. Only when nothing in the list fits, use the original name and add a "muscle". If the plan gives reps as a single number, use it twice, like [5, 5]. If it gives no weight steps, leave "step" out.`
      : `TASK: Design a sound, conventional plan that matches my request: the number of days, the session length, my experience, my goal and any injuries or limits I mention. Balance the muscle groups across the week, put the big lifts first in each workout and keep to a sensible number of exercises per day. Choose exercises from the list below wherever possible. Only when nothing in the list fits, use another plain name and add a "muscle".`;
  return `You are a strength coach building a training plan for a personal gym-tracker app. The app reads one JSON object, so follow the format exactly.

${task}

MY REQUEST: ${ask}

RULES
- Weights are in kg only. "step" is the kg to add when the person is ready for more (default ${DEFAULT_STEP}; use 5 for deadlift or leg press, 1 to 2 for small dumbbell lifts).
- "goal" must be one of: ${Object.keys(GOALS).join(", ")}.
- "muscle" is allowed only for exercises that are NOT in the list below, and must be one of: ${MUSCLES.join(", ")}.
- Limits: ${LIMITS.days[0]} to ${LIMITS.days[1]} days; ${LIMITS.exercises[0]} to ${LIMITS.exercises[1]} exercises per day; sets ${LIMITS.sets[0]} to ${LIMITS.sets[1]}; reps ${LIMITS.reps[0]} to ${LIMITS.reps[1]} as [lowest, highest]; step ${LIMITS.step[0]} to ${LIMITS.step[1]}; names up to ${LIMITS.name} characters (day names up to ${LIMITS.dayName}); no exercise twice in one day.
- Use plain straight quotes. "notes" is optional: one or two sentences.

FORMAT (example; yours will differ):
${JSON.stringify(EXAMPLE, null, 1)}

EXERCISE LIST (use these names exactly), grouped by main muscle:
${groups.join("\n")}

Reply with ONLY the JSON object. No other text, no explanation, no code fence.`;
}
