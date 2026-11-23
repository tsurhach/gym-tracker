// #/person/<id>: someone else's shared workouts, read only. Only reachable when SYNC_ENABLED (js/sync.js).
// Their data is cached apart from yours (gymtracker.shared) and never touches your own history or backups.
import { esc, fmtDate, fmtKg } from "../ui.js";
import { exerciseHistory } from "../logic.js";
import {
  chartHtml,
  durationMin,
  exerciseRows,
  progressText,
  setsText,
} from "./history.js";

let tab = "history";

const ago = (ms) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 60
    ? `${m} min ago`
    : m < 2880
      ? `${Math.round(m / 60)} h ago`
      : `${Math.round(m / 1440)} days ago`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function historyHtml(view) {
  const sessions = [...view.sessions].sort((a, b) => b.startedAt - a.startedAt);
  if (!sessions.length)
    return `<section class="card"><p class="muted">No workouts yet.</p></section>`;
  return `${sessions
    .map(
      (
        s,
      ) => `<details class="card"><summary><b class="ex-name">${esc(s.workoutName)}</b> <span class="muted small">${esc(fmtDate(s.startedAt))} · ${plural(s.entries.length, "exercise", "exercises")} · ${durationMin(s)} min</span></summary>
      ${s.entries.map((e) => `<p><b class="ex-name">${esc(e.name)}</b><br /><span class="muted small">${esc(setsText(e.sets))}</span></p>`).join("")}</details>`,
    )
    .join("")}
    <h3>Progress</h3>
    ${exerciseRows(view.sessions)
      .map((r) => {
        const hist = exerciseHistory(view.sessions, r.exerciseId).filter(
          (h) => h.sets.length,
        );
        return `<details class="card"><summary><span class="ex-name">${esc(r.name)}</span> <span class="${r.stuck ? "stuck" : "up"}">${esc(progressText(r))}</span></summary>${chartHtml(hist.map((h) => Math.max(...h.sets.map((s) => s.weight))))}</details>`;
      })
      .join("")}`;
}

function planHtml(view, ctx) {
  const names = new Map(
    [...ctx.library, ...(view.customExercises ?? [])].map((e) => [
      e.id,
      e.name,
    ]),
  );
  return view.workouts
    .map(
      (w) => `<section class="card"><b>${esc(w.name)}</b>
      ${w.items.map((it) => `<div class="row"><span class="grow ex-name">${esc(names.get(it.exerciseId) ?? "Exercise")}</span><span class="muted small">${it.sets} × ${it.repMin}–${it.repMax}</span></div>`).join("")}</section>`,
    )
    .join("");
}

const weightHtml = (view) =>
  `<section class="card list">${
    [...view.bodyWeights]
      .reverse()
      .map(
        (w) =>
          `<div class="li"><span class="grow">${esc(w.date)}</span><b>${esc(fmtKg(w.kg))} kg</b></div>`,
      )
      .join("") || `<p class="muted">Nothing logged.</p>`
  }</section>`;

export function render(root, ctx) {
  const id = ctx.params.id;
  const sh = ctx.share;
  let person = null;
  let view = sh.cached(id)?.view ?? null;
  let at = sh.cached(id)?.updatedAt;
  let gone = false;
  let err = "";
  const draw = () => {
    if (!root.isConnected) return;
    const name = person?.name ?? view?.name ?? "Their";
    const tabs = [
      ["history", "History"],
      ...(view?.workouts ? [["plan", "Plan"]] : []),
      ...(view?.bodyWeights ? [["weight", "Body weight"]] : []),
    ];
    if (!tabs.some(([k]) => k === tab)) tab = "history";
    root.innerHTML = `<div class="row topbar"><a class="back" href="#/people">‹ People</a></div>
      <h1 class="title">${esc(name)}</h1>
      <p class="muted small">${esc(name)}'s workouts · view only${at ? ` · updated ${esc(ago(at))}` : ""}</p>
      ${gone ? `<section class="card"><p>${esc(name)} stopped sharing. What you saw before is gone from this phone.</p><button class="btn" data-leave>Remove from my list</button></section>` : ""}
      ${err ? `<p role="alert">${esc(err)}</p>` : ""}
      ${!gone && !view ? `<p class="muted">Loading…</p>` : ""}
      ${
        !gone && view
          ? `${tabs.length > 1 ? `<div class="row">${tabs.map(([k, l]) => `<button class="btn${k === tab ? " btn-primary" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>` : ""}
        ${tab === "plan" ? planHtml(view, ctx) : tab === "weight" ? weightHtml(view) : historyHtml(view)}`
          : ""
      }`;
    for (const b of root.querySelectorAll("[data-tab]"))
      b.onclick = () => ((tab = b.dataset.tab), draw());
    const l = root.querySelector("[data-leave]");
    if (l)
      l.onclick = async () => {
        try {
          await sh.leave(person);
          ctx.go("#/people");
        } catch (e) {
          err = e.message;
          draw();
        }
      };
  };
  draw();
  (async () => {
    try {
      person = (await sh.list()).canSee.find((c) => c.id === id);
      if (!person) return ctx.go("#/people");
      const v = await sh.fetchView(person);
      if (v) ((view = v), (at = sh.cached(id).updatedAt));
      else ((gone = true), (view = null));
    } catch (e) {
      err = view ? "" : e.message; // offline: keep showing the cached copy
    }
    draw();
  })();
}
