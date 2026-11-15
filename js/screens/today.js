import { MUSCLES } from "../constants.js";
import { muscleTally, nextWorkoutId } from "../logic.js";
import { discardSession, startSession } from "../session.js";
import { confirmSheet, esc } from "../ui.js";

const DAY_MS = 24 * 60 * 60 * 1000;
let reminderDismissed = false; // until the page is reloaded

function startBtn(w, primary) {
  return `<button class="btn${primary ? " btn-primary start" : ""}" data-act="start" data-w="${esc(w.id)}">Start ${esc(w.name)}</button>`;
}

const tags = (w) =>
  w.muscles.map((m) => `<span class="tag">${esc(m)}</span>`).join(" ");

export function render(root, ctx) {
  const { state } = ctx;
  const now = Date.now();
  const a = state.active;
  let main;

  if (a) {
    const all = a.entries.flatMap((e) => e.sets);
    const done = all.filter((s) => s.done).length;
    const mins = Math.max(0, Math.floor((now - a.startedAt) / 60000));
    main = `<section class="card">
        <h3 style="margin-top:0">Workout in progress</h3>
        <h2>${esc(a.workoutName)}</h2>
        <p class="muted">${mins} min · ${done} ${done === 1 ? "set" : "sets"} logged</p>
      </section>
      <a class="btn btn-primary start" href="#/workout">Resume workout</a>
      <button class="btn btn-warn" data-act="discard">Discard workout</button>`;
  } else {
    const nextId = nextWorkoutId(state.workouts, state.sessions);
    const next = state.workouts.find((w) => w.id === nextId);
    const others = state.workouts.filter((w) => w !== next);
    main = `<section class="card">
        <h3 style="margin-top:0">Up next</h3>
        <h2>${esc(next.name)}</h2>
        <div class="tags">${tags(next)}</div>
        <p class="muted small">${next.items.length} ${next.items.length === 1 ? "exercise" : "exercises"}</p>
      </section>
      ${startBtn(next, true)}
      ${
        others.length
          ? `<h3>Or start another</h3>${others
              .map(
                (w) => `<div class="card row">
          <div class="grow"><div class="ex-name">${esc(w.name)}</div><div class="muted small">${w.items.length} exercises</div></div>
          <button class="btn inline" data-act="start" data-w="${esc(w.id)}">Start</button>
        </div>`,
              )
              .join("")}`
          : ""
      }`;
  }

  const week = state.sessions.filter((s) => s.startedAt >= now - 7 * DAY_MS);
  const tally = muscleTally(state.sessions, now);
  const missing = MUSCLES.filter((m) => !tally[m]);
  const remind =
    !reminderDismissed &&
    state.sessions.length > 0 &&
    (state.settings.lastExportAt == null ||
      now - state.settings.lastExportAt > 30 * DAY_MS);

  root.innerHTML = `<h1 class="title">Today</h1>
    ${
      remind
        ? `<div class="card row remind"><a class="grow" href="#/plan">Back up your data: export a backup file from Plan.</a>
          <button class="icon-btn" data-act="dismiss" aria-label="Dismiss reminder">✕</button></div>`
        : ""
    }
    ${main}
    <section class="card">
      <h3 style="margin-top:0">Last 7 days</h3>
      <p><b>${week.length}</b> ${week.length === 1 ? "workout" : "workouts"}</p>
      ${
        missing.length
          ? `<p class="muted small" style="margin:8px 0 6px">Not trained yet</p><div class="tags">${missing.map((m) => `<span class="tag">${esc(m)}</span>`).join(" ")}</div>`
          : `<p class="muted small">Every muscle group trained.</p>`
      }
    </section>`;

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    if (t.dataset.act === "start") {
      startSession(state, t.dataset.w, ctx.lookup, Date.now());
      ctx.go("#/workout");
      ctx.save();
    } else if (t.dataset.act === "discard") {
      if (
        !(await confirmSheet(
          "Discard this workout? Everything logged in it is lost.",
          "Discard",
        ))
      )
        return;
      discardSession(state);
      ctx.save();
    } else if (t.dataset.act === "dismiss") {
      reminderDismissed = true;
      ctx.save();
    }
  });
}
