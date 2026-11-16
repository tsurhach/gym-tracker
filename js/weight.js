// Body weight log: state.bodyWeights = [{ id, date: "YYYY-MM-DD" (local day), kg }]. A missing field means [].
const r1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;

export const validKg = (n) =>
  typeof n === "number" && Number.isFinite(n) && n >= 20 && n <= 400;

// Local calendar day, never UTC: 00:30 on the 5th is still the 5th.
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Whole-day number for a YYYY-MM-DD (UTC arithmetic, so daylight saving cannot shift it).
export const dayNum = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// Local midnight in ms, for the shared fmtDate helper.
export const dateMs = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

// One entry per day: logging an existing day replaces it. The list stays sorted by date.
export function logWeight(state, date, kg) {
  const list = (state.bodyWeights ?? []).filter((e) => e.date !== date);
  list.push({ id: crypto.randomUUID(), date, kg });
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  state.bodyWeights = list;
  return state;
}

export function deleteWeight(state, id) {
  state.bodyWeights = (state.bodyWeights ?? []).filter((e) => e.id !== id);
  return state;
}

export function weightStats(list, today) {
  const e = [...(list ?? [])]
    .filter((x) => !today || x.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const none = {
    latest: null,
    previous: null,
    change: null,
    change30: null,
    min: null,
    max: null,
  };
  if (!e.length) return none;
  const last = e.at(-1);
  const prev = e.length > 1 ? e.at(-2) : null;
  const day = dayNum(last.date);
  let ref = null; // the entry closest to 30 days before latest, at least 14 days before it
  for (const x of e.slice(0, -1)) {
    const gap = day - dayNum(x.date);
    if (
      gap >= 14 &&
      (!ref || Math.abs(gap - 30) < Math.abs(day - dayNum(ref.date) - 30))
    )
      ref = x;
  }
  const kgs = e.map((x) => x.kg);
  return {
    latest: last.kg,
    previous: prev ? prev.kg : null,
    change: prev ? r1(last.kg - prev.kg) : null,
    change30: ref ? r1(last.kg - ref.kg) : null,
    min: Math.min(...kgs),
    max: Math.max(...kgs),
  };
}
