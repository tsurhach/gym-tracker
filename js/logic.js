import { MUSCLES } from "./constants.js";

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
    });
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
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

export function advice(prevSets, item) {
  if (!prevSets || prevSets.length === 0) {
    return {
      kind: "first",
      weight: null,
      message: "First time. Pick a starting weight.",
    };
  }
  const { W, heavier } = analyse(prevSets, item);
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

export function prefill(prevSets, item) {
  const rows = Array.from({ length: item.sets }, (_, i) => i);
  if (!prevSets || prevSets.length === 0) {
    return rows.map(() => ({ weight: null, reps: item.repMin }));
  }
  const a = advice(prevSets, item);
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

export function isStuck(history) {
  if (history.length < 3) return false;
  const [a, b, c] = history.slice(-3);
  return !beats(b, a) && !beats(c, b);
}

export function nextWorkoutId(workouts, sessions) {
  if (workouts.length === 0) return null;
  if (sessions.length === 0) return workouts[0].id;
  const last = sessions.reduce((m, x) => (x.startedAt > m.startedAt ? x : m));
  const i = workouts.findIndex((w) => w.id === last.workoutId);
  return i === -1 ? workouts[0].id : workouts[(i + 1) % workouts.length].id;
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
