import { MUSCLES } from "./constants.js";
import { localDate } from "./weight.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseNum(text) {
  const t = String(text ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const validSet = (weight, reps) =>
  typeof weight === "number" &&
  Number.isFinite(weight) &&
  weight >= 0 &&
  Number.isInteger(reps) &&
  reps >= 1;

export function exerciseHistory(sessions, exerciseId) {
  const out = [];
  for (const ses of sessions) {
    const entry = ses.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    out.push({
      startedAt: ses.startedAt,
      sets: entry.sets
        .filter((x) => x.done)
        .map(({ weight, reps }) => ({ weight, reps })),
      note: typeof entry.note === "string" ? entry.note : "",
    });
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

// Swap candidates: same main muscle, not the current one, not in excludeIds.
// Ranked: swapped to before (counts, most first; state.swapCounts "idA|idB" sorted, created on first swap), done before, then different equipment (custom counts as different), then shared secondary muscles; ties keep list order.
export const pairKey = (a, b) => [a, b].sort().join("|");

export function alternatives(current, all, sessions, excludeIds = new Set(), limit = 5, counts = {}) {
  const sec = new Set(current.secondary ?? []);
  const used = (e) => counts[pairKey(current.id, e.id)] ?? 0;
  const rank = (e) => [
    exerciseHistory(sessions, e.id).some((h) => h.sets.length) ? 0 : 1,
    e.equipment && e.equipment === current.equipment ? 1 : 0,
    -(e.secondary ?? []).filter((m) => sec.has(m)).length,
  ];
  return all
    .filter((e) => e.primary === current.primary && e.id !== current.id && !excludeIds.has(e.id))
    .map((e, i) => ({ e, i, r: rank(e) }))
    .sort((a, b) => used(b.e) - used(a.e) || a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.e);
}

const topWeight = (sets) => Math.max(...sets.map((x) => x.weight));

// Heaviest weight W, and whether every planned set was done at W with reps >= repMax.
function analyse(prevSets, item) {
  const W = topWeight(prevSets);
  const atW = prevSets.filter((x) => x.weight === W);
  const heavier =
    atW.length >= item.sets && atW.every((x) => x.reps >= item.repMax);
  return { W, heavier };
}

// Body weight: library equipment "body only" (first time, no history yet), or last time's
// heaviest set was 0 kg (also covers custom exercises). A session mixing 0 and 5 kg is weighted.
const isBodyOnly = (ex) => ex?.equipment === "body only";

// settings.bodyAdvice === false: body-weight moves get no sentence (missing setting = on).
export function advice(prevSets, item, ex, settings) {
  const quiet = settings?.bodyAdvice === false;
  if (!prevSets || prevSets.length === 0) {
    if (isBodyOnly(ex))
      return quiet
        ? { kind: "first", weight: 0, message: "" }
        : {
        kind: "first",
        weight: 0,
        message: "First time. Body weight. Do as many good reps as you can.",
      };
    return {
      kind: "first",
      weight: null,
      message: "First time. Pick a starting weight.",
    };
  }
  const { W, heavier } = analyse(prevSets, item);
  if (W === 0) {
    if (quiet) return { kind: "stay", weight: 0, message: "" };
    return heavier
      ? {
          kind: "heavier",
          weight: 0,
          message: `You hit ${item.repMax} on every set. Add a rep or two, or add ${round2(item.step)} kg (belt or vest) if you have it.`,
        }
      : { kind: "stay", weight: 0, message: "Beat your reps from last time." };
  }
  if (heavier) {
    const weight = round2(W + item.step);
    return {
      kind: "heavier",
      weight,
      message: `You hit ${item.repMax} on every set. Try ${weight} kg today.`,
    };
  }
  return {
    kind: "stay",
    weight: W,
    message: `Stay at ${round2(W)} kg and beat your reps.`,
  };
}

export function prefill(prevSets, item, ex, settings) {
  const rows = Array.from({ length: item.sets }, (_, i) => i);
  if (!prevSets || prevSets.length === 0) {
    return rows.map(() => ({ weight: isBodyOnly(ex) ? 0 : null, reps: item.repMin }));
  }
  const a = advice(prevSets, item, ex, settings);
  if (a.kind === "heavier" && a.weight === 0) {
    // Body weight at the top of the range: same weight, one more rep than last time.
    return rows.map((i) => ({
      weight: 0,
      reps: (prevSets[i] ?? prevSets[prevSets.length - 1]).reps + 1,
    }));
  }
  if (a.kind === "heavier") {
    return rows.map(() => ({ weight: a.weight, reps: item.repMin }));
  }
  return rows.map((i) => ({
    weight: a.weight,
    reps: prevSets[i] ? prevSets[i].reps : item.repMin,
  }));
}

export function beats(curr, prev) {
  const cw = topWeight(curr);
  const pw = topWeight(prev);
  if (cw !== pw) return cw > pw;
  const total = (sets) => sets.reduce((n, x) => n + x.reps, 0);
  return total(curr) > total(prev);
}

// No past sets, no record.
// Heavier than ever, or more reps than ever at a weight used before (so warm-ups and back-off sets get no badge).
export const isPersonalBest = (pastSets, { weight, reps }) =>
  pastSets.length > 0 &&
  (weight > Math.max(...pastSets.map((p) => p.weight)) ||
    (pastSets.some((p) => p.weight === weight) && !pastSets.some((p) => p.weight >= weight && p.reps >= reps)));

export function isStuck(history) {
  if (history.length < 3) return false;
  const [a, b, c] = history.slice(-3);
  return !beats(b, a) && !beats(c, b);
}

// One gentle sentence for the exercise screen, or null. Advice only: nothing else changes.
// "Go heavier" wins over stuck.
export function stuckNote(history, adv, settings) {
  if (settings?.stuckNote === false) return null;
  if (adv?.kind === "heavier" || !isStuck(history)) return null;
  return "Same numbers for the last 3 sessions. That happens. Aim for one more rep today.";
}

export function nextWorkoutId(workouts, sessions) {
  if (workouts.length === 0) return null;
  if (sessions.length === 0) return workouts[0].id;
  const last = sessions.reduce((m, x) => (x.startedAt > m.startedAt ? x : m));
  const i = workouts.findIndex((w) => w.id === last.workoutId);
  return i === -1 ? workouts[0].id : workouts[(i + 1) % workouts.length].id;
}

// Weekly schedule: settings.schedule = { days: { 1: "<workoutId>", 3: "next" } } (key = JS weekday 0 Sun..6 Sat).
// "next", an unknown id or junk = the next day in rotation. No usable days = { kind: "none" } (rotation UI as before).
// -> none | { kind: "train", workoutId, done } | { kind: "rest", next: { workoutId, weekday } }
export function scheduleToday(state, date = new Date()) {
  const raw = state?.settings?.schedule?.days;
  const days = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const set = new Set(Object.keys(days).filter((k) => /^[0-6]$/.test(k)).map(Number));
  const ws = Array.isArray(state?.workouts) ? state.workouts : [];
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  if (!set.size || !ws.length) return { kind: "none" };
  const rotation = () => nextWorkoutId(ws, sessions);
  const resolve = (wd) => (ws.some((w) => w.id === days[wd]) ? days[wd] : rotation());
  const wd = date.getDay();
  if (set.has(wd)) {
    const today = localDate(date);
    const did = sessions.filter((s) => localDate(new Date(s.startedAt)) === today);
    const fixed = ws.some((w) => w.id === days[wd]);
    const hit = fixed ? did.find((s) => s.workoutId === days[wd]) : did.at(-1);
    return { kind: "train", workoutId: hit ? hit.workoutId : resolve(wd), done: !!hit };
  }
  for (let n = 1; n <= 7; n++) {
    const d = (wd + n) % 7;
    if (set.has(d)) return { kind: "rest", next: { workoutId: resolve(d), weekday: d } };
  }
  return { kind: "none" };
}

export function muscleTally(sessions, now) {
  const tally = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  for (const ses of sessions) {
    if (ses.startedAt < now - WEEK_MS) continue;
    for (const e of ses.entries) {
      if (!(e.primary in tally)) continue;
      tally[e.primary] += e.sets.filter((x) => x.done).length;
    }
  }
  return tally;
}

// ---- Plate calculator (kg, pairs, unlimited count; whole grams so sums stay exact) ----
export const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];

// Plate sizes the gym has; defaults keep data saved before this existed working.
export function gymPlates(settings) {
  const p = settings?.plates;
  return Array.isArray(p) && p.every((x) => Number.isFinite(x) && x > 0) ? p : PLATE_SIZES;
}

// Library exercises loaded with plates, by equipment (empty weight in kg). Only a standard bar is 20;
// everything else defaults to 0 and the owner types the real figure in Plan.
const EMPTY_BY_EQUIPMENT = { barbell: 20, "e-z curl bar": 0, "trap bar": 0 };
const PLATE_MACHINES = new Set(["leg-press", "hack-squat", "calf-press-on-the-leg-press-machine"]);

// Default empty weight for an exercise, or null when it is not plate-loaded (custom: null).
export function plateDefault(ex) {
  if (!ex) return null;
  if (/smith/i.test(ex.name ?? "")) return 0;
  if (PLATE_MACHINES.has(ex.id)) return 0;
  return Object.hasOwn(EMPTY_BY_EQUIPMENT, ex.equipment) ? EMPTY_BY_EQUIPMENT[ex.equipment] : null; // own keys only: "constructor" is not an equipment
}

// Per-item overrides (it.plates, it.emptyKg) on top of the equipment default.
export function plateRule(item, ex) {
  const d = plateDefault(ex);
  const on = typeof item?.plates === "boolean" ? item.plates : d !== null;
  const e = item?.emptyKg;
  return { on, empty: Number.isFinite(e) && e >= 0 ? e : (d ?? 0) };
}

// Plates for ONE side, largest first. Greedy: fine for normal plate sets, but an odd set
// (say only 20 and 15) can miss a closer total. ponytail: switch to a small DP if ever needed.
// Not reachable exactly: the closest total at or below the target. null for no usable target.
export function platesPerSide(target, bar, plates) {
  const g = (x) => Math.round(x * 1000);
  const t = g(target);
  const b = g(bar);
  if (!(t > 0 && t <= 1e6) || !(b >= 0)) return null;
  if (t < b) return { each: [], total: bar, exact: false, below: true };
  let side = Math.floor((t - b) / 2);
  const each = [];
  for (const p of [...new Set(plates.map(g))].filter((x) => x > 0).sort((x, y) => y - x))
    for (let n = Math.floor(side / p); n > 0; n--) {
      each.push(p / 1000);
      side -= p;
    }
  const total = (b + 2 * (Math.floor((t - b) / 2) - side)) / 1000;
  return { each, total, exact: g(total) === t, below: false };
}

// The one quiet line on the exercise screen; "" when there is nothing to say.
export function plateText(target, empty, plates) {
  const r = platesPerSide(target, empty, plates);
  if (!r) return "";
  if (r.below) return `Below the empty weight (${round2(empty)} kg)`;
  const side = r.each.length
    ? `each side: ${r.each.join(" + ")}`
    : empty > 0
      ? "just the bar"
      : "no plates";
  if (r.exact) return side[0].toUpperCase() + side.slice(1);
  return `Closest: ${round2(r.total)} kg — ${side}`;
}

// ---------- calendar subscription (settings.calendar) ----------

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Typical workout length in minutes: median of your last 8 finished workouts, skipping ones under 10 min or over 5 h,
// rounded to 5 and kept within 20-180. Fewer than 3 usable workouts -> null (the chosen minutes stay).
export function avgMins(sessions) {
  const last = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => typeof s?.finishedAt === "number" && typeof s.startedAt === "number")
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 8)
    .map((s) => (s.finishedAt - s.startedAt) / 60000)
    .filter((m) => m >= 10 && m <= 300);
  if (last.length < 3) return null;
  return Math.min(180, Math.max(20, Math.round(median(last) / 5) * 5));
}

// The minutes the calendar uses: the workout-length average when asked for (and enough data), else the chosen value.
export const calMins = (state) => {
  const c = state.settings.calendar;
  return (c.autoMins && avgMins(state.sessions)) || c.mins;
};

// What the phone sends: names + training days + the time choice. Nothing else leaves the phone.
// `today` = local date "YYYY-MM-DD". A day that is "next in rotation" (or a deleted workout) is just "Workout".
export function calendarBody(state, today, tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const c = state.settings.calendar;
  const raw = state.settings.schedule?.days;
  const days = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const name = (id) => {
    const w = (state.workouts ?? []).find((x) => x.id === id);
    return Array.from(String(w?.name ?? "").trim()).slice(0, 60).join("") || "Workout";
  };
  return {
    from: today,
    tz: tz || null,
    time: c.time ?? null,
    mins: calMins(state),
    alarm: c.alarm === true,
    days: Object.keys(days)
      .filter((k) => /^[0-6]$/.test(k))
      .map(Number)
      .sort((a, b) => a - b)
      .map((d) => ({ d, t: name(days[d]) })),
  };
}
