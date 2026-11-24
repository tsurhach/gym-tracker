import { MUSCLES, WEEKDAYS } from "../constants.js";
import { muscleTally, nextWorkoutId, scheduleToday } from "../logic.js";
import { discardSession, startSession } from "../session.js";
import { confirmSheet, esc, fmtKg } from "../ui.js";
import { dayNum, localDate } from "../weight.js";
import { isInstalled, markSeen, seen } from "./help.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function startBtn(w, primary) {
  return `<button class="btn${primary ? " btn-primary start" : ""}" data-act="start" data-w="${esc(w.id)}">Start ${esc(w.name)}</button>`;
}

const tags = (w) =>
  w.muscles.map((m) => `<span class="tag">${esc(m)}</span>`).join(" ");

// "82.4 kg · 3 days ago", "Not logged yet"
function weightText(list) {
  const e = list?.at(-1);
  if (!e) return "Not logged yet";
  const d = dayNum(localDate()) - dayNum(e.date);
  const ago = d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  return `${fmtKg(e.kg)} kg · ${ago}`;
}

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
    const sch = scheduleToday(state);
    const nextId =
      sch.kind === "train" ? sch.workoutId : sch.kind === "rest" ? sch.next.workoutId : nextWorkoutId(state.workouts, state.sessions);
    const next = state.workouts.find((w) => w.id === nextId) ?? state.workouts[0];
    const others = state.workouts.filter((w) => w !== next);
    const heading = { none: "Up next", train: sch.done ? "Done for today ✓" : "Today", rest: "Rest day" }[sch.kind];
    const count = `${next.items.length} ${next.items.length === 1 ? "exercise" : "exercises"}`;
    main = `<section class="card">
        <h3 style="margin-top:0">${heading}</h3>
        ${
          sch.kind === "rest"
            ? `<h2>Next: ${esc(next.name)} on ${WEEKDAYS[sch.next.weekday]}</h2>`
            : `<h2${sch.done ? ` class="muted"` : ""}>${esc(next.name)}</h2>
        <div class="tags">${tags(next)}</div>
        <p class="muted small">${count}</p>`
        }
      </section>
      ${sch.kind === "train" && sch.done ? "" : sch.kind === "rest" ? `<button class="btn" data-act="start" data-w="${esc(next.id)}">Train anyway: Start ${esc(next.name)}</button>` : startBtn(next, true)}
      ${
        others.length
          ? `<h3>Or start another</h3>${others
              .map(
                (w) => `<div class="card row">
          <div class="grow"><div class="ex-name">${esc(w.name)}</div><div class="muted small">${w.items.length} ${w.items.length === 1 ? "exercise" : "exercises"}</div></div>
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
    (state.settings.backupNudgeDismissedAt == null ||
      now - state.settings.backupNudgeDismissedAt > 7 * DAY_MS) &&
    state.sessions.length > 0 &&
    !ctx.sync?.active() &&
    (state.settings.lastExportAt == null ||
      now - state.settings.lastExportAt > 30 * DAY_MS);

  const newHere = !state.sessions.length && !a && !seen("newCard");
  const addApp = !isInstalled() && !seen("installBanner");
  root.innerHTML = `<h1 class="title">Today</h1>
    ${
      addApp
        ? `<div class="card row remind"><a class="grow" href="#/help/install">Add this app to your home screen</a>
          <button class="icon-btn" data-act="hide" data-k="installBanner" aria-label="Dismiss home screen tip">✕</button></div>`
        : ""
    }
    ${
      newHere
        ? `<div class="card row remind"><a class="grow" href="#/help"><b>New here? See how it works</b><br><span class="muted small">A short guide.</span></a>
          <button class="icon-btn" data-act="hide" data-k="newCard" aria-label="Dismiss new here card">✕</button></div>`
        : ""
    }
    ${
      remind
        ? `<div class="card row remind"><a class="grow" href="${ctx.sync ? "#/sync" : "#/plan"}">${ctx.sync ? "Keep your workouts safe: turn on sync or save a backup file." : "Back up your data: export a backup file from Plan."}</a>
          <button class="icon-btn" data-act="dismiss" aria-label="Dismiss reminder">✕</button></div>`
        : ""
    }
    ${main}
    <section class="card">
      <h3 style="margin-top:0">Last 7 days</h3>
      ${
        week.length
          ? `<p class="stat"><b>${week.length}</b> ${week.length === 1 ? "workout" : "workouts"}</p>`
          : `<p class="muted">No workouts in the last 7 days. Start one above.</p>`
      }
      ${
        missing.length
          ? `<p class="muted small" style="margin:8px 0 6px">Not trained yet</p><div class="tags">${missing.map((m) => `<span class="tag">${esc(m)}</span>`).join(" ")}</div>`
          : `<p class="muted small">Every muscle group trained.</p>`
      }
    </section>
    <a class="card weight-card" href="#/weight"><span class="muted small">Body weight</span> <span>${weightText(state.bodyWeights)}</span></a>
    <p class="small" style="text-align:center"><a href="#/help" class="muted" style="display:inline-block;padding:14px 12px">How to use this app</a></p>`;

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
    } else if (t.dataset.act === "hide") {
      markSeen(t.dataset.k);
      t.closest(".card").remove(); // no redraw
    } else if (t.dataset.act === "dismiss") {
      state.settings.backupNudgeDismissedAt = Date.now();
      ctx.save();
    }
  });
}
