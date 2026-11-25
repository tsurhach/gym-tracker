// End-of-workout rating, stored on the workout record as session.rating = { lifts, effort, during, after, reasons[], note }.
// Every field is optional; a missing rating means "not rated". Private: share.js copies named fields only, so it never leaves the phone that way.
// Pure helpers (no DOM). Anything read from storage or sync goes through clean() first.
export const FACES = ["😫", "😕", "😐", "🙂", "😄"]; // lifts felt, weak -> strong
export const REASONS = ["sleep", "tired", "stress", "sick", "time", "food"];
export const DAY = 86400000;
const WEEK = 7 * DAY;
const int = (x, hi) => (Number.isInteger(x) && x >= 1 && x <= hi ? x : undefined);

// Plain, safe rating or null when nothing is set.
export function clean(r) {
  if (!r || typeof r !== "object") return null;
  const o = {};
  for (const [k, hi] of [["lifts", 5], ["effort", 5], ["during", 3], ["after", 3]]) {
    const v = int(r[k], hi);
    if (v) o[k] = v;
  }
  const reasons = Array.isArray(r.reasons) ? REASONS.filter((x) => r.reasons.includes(x)) : [];
  if (reasons.length) o.reasons = reasons;
  const note = typeof r.note === "string" ? r.note.trim().slice(0, 200) : "";
  if (note) o.note = note;
  return Object.keys(o).length ? o : null;
}

// Reason chips appear only for a weak lifting day or a very hard one.
export function needsWhy(r) {
  if (r?.lifts < 3) return true;
  return r?.effort > 3;
}

// "How do you feel now?" may be answered up to 7 days after the workout (like TrainerRoad).
export function afterOpen(ses, now) {
  return now - (ses.finishedAt || ses.startedAt) <= WEEK;
}

const rated = (sessions) => sessions.map((s) => ({ at: s.startedAt, r: clean(s.rating) })).filter((x) => x.r);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Weekly averages of a field ("effort" | "lifts"), oldest week first; null for a week with no rating.
export function weekly(sessions, field, now, weeks = 8) {
  const out = Array.from({ length: weeks }, () => []);
  for (const { at, r } of rated(sessions)) {
    const k = weeks - 1 - Math.floor((now - at) / WEEK);
    if (k >= 0 && k < weeks && r[field] && at <= now) out[k].push(r[field]);
  }
  return out.map(avg);
}

// Last 7 days against the last 28 days (which include them): { last, avg28 } or null when either has no data.
export function recent(sessions, field, now) {
  const a = [];
  const b = [];
  for (const { at, r } of rated(sessions)) {
    if (!r[field] || at > now) continue;
    if (now - at < 28 * DAY) b.push(r[field]);
    if (now - at < WEEK) a.push(r[field]);
  }
  return a.length && b.length ? { last: avg(a), avg28: avg(b) } : null;
}

// Most common reason among weak workouts (lifts felt 1-2) in the last 90 days; needs 3 weak workouts and 2 with that reason.
export function weakCause(sessions, now) {
  const weak = rated(sessions).filter((x) => {
    return x.r.lifts < 3 && now - x.at < 90 * DAY;
  });
  if (weak.length < 3) return null;
  const counts = REASONS.map((k) => ({ k, n: weak.filter((x) => x.r.reasons?.includes(k)).length }));
  const top = counts.sort((a, b) => b.n - a.n)[0];
  return top.n >= 2 ? { reason: top.k, n: top.n, total: weak.length } : null;
}

// Whether to show the trend card at all.
export const anyRated = (sessions) => rated(sessions).length > 0;
