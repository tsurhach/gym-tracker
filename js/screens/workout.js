import { advice, exerciseHistory, minHtml } from "../logic.js";
import { ltr, ltrText, t } from "../i18n/index.js";
import { addEntry, finishSession, newItem } from "../session.js";
import { groupItems, supersetsOf } from "../planbuild.js";
import { openPicker } from "../picker.js";
import { confirmSheet, esc, fmtKg } from "../ui.js";

// "50 kg × 10, 10, 9". Mixed weights: "50 × 10, 52.5 × 8".
export function lastText(sets) {
  if (!sets || !sets.length) return "";
  const kg = (w) => fmtKg(w);
  if (sets.every((s) => s.weight === 0))
    return t("workout.lastBody", { reps: ltrText(sets.map((s) => s.reps).join(", ")) });
  if (sets.every((s) => s.weight === sets[0].weight)) {
    return ltrText(t("workout.lastSame", { kg: kg(sets[0].weight), reps: sets.map((s) => s.reps).join(", ") }));
  }
  return ltrText(t("workout.lastMixed", { sets: sets.map((s) => `${kg(s.weight)} × ${s.reps}`).join(", ") }));
}

// The plan item (sets, rep range, step) behind an entry (a swapped-in entry carries the old one's). Added-on exercises use goal defaults.
export function itemFor(state, exerciseId) {
  const w = state.workouts.find((x) => x.id === state.active?.workoutId);
  return (
    state.active?.entries.find((e) => e.exerciseId === exerciseId)?.target ??
    w?.items.find((it) => it.exerciseId === exerciseId) ??
    newItem(exerciseId, state.settings.goal)
  );
}

// Sets from the most recent finished session of this exercise, or null.
export function lastSets(state, exerciseId) {
  const h = exerciseHistory(state.sessions, exerciseId).filter(
    (x) => x.sets.length,
  );
  return h.length ? h[h.length - 1].sets : null;
}

function rowHtml(e, ctx) {
  const { state } = ctx;
  const done = e.sets.filter((s) => s.done).length;
  const total = e.sets.length;
  let status = `<span class="st st-no" aria-label="${t("workout.notStarted")}"></span>`;
  let sub;
  if (total > 0 && done === total) {
    status = `<span class="st st-ok" aria-label="${t("workout.done")}">✓</span>`;
    sub = `<div class="muted small">${t("workout.setsDone", { n: done })}</div>`;
  } else if (done > 0) {
    status = `<span class="st st-part" aria-label="${t("workout.partial", { done, total })}">${ltr(`${done}/${total}`)}</span>`;
    sub = `<div class="muted small">${t("workout.partial", { done, total })}</div>`;
  } else {
    const prev = lastSets(state, e.exerciseId);
    const a = advice(prev, itemFor(state, e.exerciseId), ctx.lookup(e.exerciseId), state.settings);
    if (a.kind === "heavier")
      sub = `<div class="up small">↑ ${esc(a.message)}</div>`;
    else if (prev)
      sub = `<div class="muted small">${t("workout.last", { text: esc(lastText(prev)) })}</div>`;
    else sub = "";
  }
  return `<a class="li" href="#/exercise/${encodeURIComponent(e.exerciseId)}">
    <div class="grow"><div class="ex-name">${esc(e.name)}</div>${sub}</div>${status}
  </a>`;
}

// Entries as list blocks: members of a superset together (alternation order, where the first member was),
// every other run of entries as one plain block.
function blocks(a) {
  const groups = supersetsOf(a.supersets, a.entries.map((e) => e.exerciseId));
  let list = a.entries;
  for (const g of groups) list = groupItems(list, g.ids);
  const out = [];
  for (const e of list) {
    const g = groups.find((x) => x.ids.includes(e.exerciseId));
    const last = out.at(-1);
    if (last && last.g === g) last.rows.push(e);
    else out.push({ g, rows: [e] });
  }
  return out;
}

export function render(root, ctx) {
  const { state } = ctx;
  const a = state.active;
  if (!a) {
    location.replace("#/today");
    return;
  }
  const listHtml = blocks(a)
    .map(({ g, rows }) =>
      g
        ? `<div class="card list ss-group"><div class="muted small ss-head">${g.rest === "each" ? t("workout.ssEach") : t("workout.ssRound")}</div>${rows.map((e) => rowHtml(e, ctx)).join("")}</div>`
        : `<div class="card list">${rows.map((e) => rowHtml(e, ctx)).join("")}</div>`,
    )
    .join("");
  const mins = Math.max(0, Math.floor((Date.now() - a.startedAt) / 60000));
  root.innerHTML = `<div class="row">
      <h1 class="title grow">${esc(a.workoutName)}</h1>
      <span class="muted">${minHtml(mins)}</span>
    </div>
    <p class="subtitle">${t("workout.subtitle")}</p>
    ${listHtml || `<div class="card list"><div class="empty"><b>${t("workout.empty")}</b><p class="muted">${t("workout.emptyHint")}</p></div></div>`}
    <button class="btn" data-act="add">${t("workout.add")}</button>
    <button class="btn btn-primary" data-act="finish">${t("workout.finish")}</button>`;

  root.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "add") {
      openPicker(
        ctx,
        (id) => {
          addEntry(state, id, ctx.lookup);
          ctx.save();
        },
        {
          exclude: new Set(a.entries.map((e) => e.exerciseId)),
          muscles: state.workouts.find((x) => x.id === state.active?.workoutId)?.muscles,
        },
      );
      return;
    }
    const sets = a.entries.flatMap((e) => e.sets);
    const open = sets.filter((s) => !s.done).length;
    const anyDone = sets.length - open > 0;
    let msg = null;
    if (!anyDone)
      msg = t("workout.noneConfirmed");
    else if (open > 0)
      msg = t("workout.openAsk", { n: open });
    if (msg && !(await confirmSheet(msg, t("workout.finish")))) return;
    const id = a.id;
    finishSession(state, Date.now());
    ctx.go(state.sessions.some((s) => s.id === id) ? `#/history/${id}` : "#/today");
    ctx.save();
  });
}

