import { MUSCLES } from "../constants.js";
import { kgHtml, minHtml, muscleName, muscleTally, nextWorkoutId, scheduleToday } from "../logic.js";
import { t, weekday } from "../i18n/index.js";
import { discardSession, startSession } from "../session.js";
import { confirmSheet, esc, fmtKg } from "../ui.js";
import { dayNum, localDate } from "../weight.js";
import { isInstalled, markSeen, seen } from "./help.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function startBtn(w, primary) {
  return `<button class="btn${primary ? " btn-primary start" : ""}" data-act="start" data-w="${esc(w.id)}">${t("today.start", { name: esc(w.name) })}</button>`;
}

const tags = (w) =>
  w.muscles.map((m) => `<span class="tag">${esc(muscleName(m))}</span>`).join(" ");

// "82.4 kg · 3 days ago", "Not logged yet"
function weightText(list) {
  const e = list?.at(-1);
  if (!e) return t("today.notLogged");
  const d = dayNum(localDate()) - dayNum(e.date);
  const ago = d <= 0 ? t("today.agoToday") : d === 1 ? t("today.agoYesterday") : t("today.agoDays", { n: d });
  return t("today.weightLine", { kg: kgHtml(fmtKg(e.kg)), ago });
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
        <h3 style="margin-top:0">${t("today.inProgress")}</h3>
        <h2>${esc(a.workoutName)}</h2>
        <p class="muted">${t("today.progressLine", { n: done, mins: minHtml(mins) })}</p>
      </section>
      <a class="btn btn-primary start" href="#/workout">${t("today.resume")}</a>
      <button class="btn btn-warn" data-act="discard">${t("today.discardBtn")}</button>`;
  } else {
    const sch = scheduleToday(state);
    const nextId =
      sch.kind === "train" ? sch.workoutId : sch.kind === "rest" ? sch.next.workoutId : nextWorkoutId(state.workouts, state.sessions);
    const next = state.workouts.find((w) => w.id === nextId) ?? state.workouts[0];
    const others = state.workouts.filter((w) => w !== next);
    const heading = { none: t("today.upNext"), train: sch.done ? t("today.doneToday") : t("today.today"), rest: t("today.restDay") }[sch.kind];
    const count = t("today.exercises", { n: next.items.length });
    main = `<section class="card">
        <h3 style="margin-top:0">${heading}</h3>
        ${
          sch.kind === "rest"
            ? `<h2>${t("today.nextOn", { name: esc(next.name), day: weekday(sch.next.weekday) })}</h2>`
            : `<h2${sch.done ? ` class="muted"` : ""}>${esc(next.name)}</h2>
        <div class="tags">${tags(next)}</div>
        <p class="muted small">${count}</p>`
        }
      </section>
      ${sch.kind === "train" && sch.done ? "" : sch.kind === "rest" ? `<button class="btn" data-act="start" data-w="${esc(next.id)}">${t("today.trainAnyway", { name: esc(next.name) })}</button>` : startBtn(next, true)}
      ${
        others.length
          ? `<h3>${t("today.another")}</h3>${others
              .map(
                (w) => `<div class="card row">
          <div class="grow"><div class="ex-name">${esc(w.name)}</div><div class="muted small">${t("today.exercises", { n: w.items.length })}</div></div>
          <button class="btn inline" data-act="start" data-w="${esc(w.id)}">${t("today.startShort")}</button>
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
  root.innerHTML = `<h1 class="title">${t("today.title")}</h1>
    ${
      addApp
        ? `<div class="card row remind"><a class="grow" href="#/help/install">${t("today.addApp")}</a>
          <button class="icon-btn" data-act="hide" data-k="installBanner" aria-label="${t("today.dismissTip")}">✕</button></div>`
        : ""
    }
    ${
      newHere
        ? `<div class="card row remind"><a class="grow" href="#/help"><b>${t("today.newHere")}</b><br><span class="muted small">${t("today.shortGuide")}</span></a>
          <button class="icon-btn" data-act="hide" data-k="newCard" aria-label="${t("today.dismissNew")}">✕</button></div>`
        : ""
    }
    ${
      remind
        ? `<div class="card row remind"><a class="grow" href="${ctx.sync ? "#/sync" : "#/plan"}">${ctx.sync ? t("today.remindSync") : t("today.remindBackup")}</a>
          <button class="icon-btn" data-act="dismiss" aria-label="${t("today.dismissReminder")}">✕</button></div>`
        : ""
    }
    ${main}
    <section class="card">
      <h3 style="margin-top:0">${t("today.last7")}</h3>
      ${
        week.length
          ? `<p class="stat">${t("today.workouts", { n: week.length, count: `<b>${week.length}</b>` })}</p>`
          : `<p class="muted">${t("today.noWorkouts")}</p>`
      }
      ${
        missing.length
          ? `<p class="muted small" style="margin:8px 0 6px">${t("today.notTrained")}</p><div class="tags">${missing.map((m) => `<span class="tag">${esc(muscleName(m))}</span>`).join(" ")}</div>`
          : `<p class="muted small">${t("today.allTrained")}</p>`
      }
    </section>
    <a class="card weight-card" href="#/weight"><span class="muted small">${t("today.bodyWeight")}</span> <span>${weightText(state.bodyWeights)}</span></a>
    <p class="small" style="text-align:center"><a href="#/help" class="muted" style="display:inline-block;padding:14px 12px">${t("today.howTo")}</a></p>`;

  root.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "start") {
      startSession(state, el.dataset.w, ctx.lookup, Date.now());
      ctx.go("#/workout");
      ctx.save();
    } else if (el.dataset.act === "discard") {
      if (
        !(await confirmSheet(
          t("today.discardAsk"),
          t("today.discard"),
        ))
      )
        return;
      discardSession(state);
      ctx.save();
    } else if (el.dataset.act === "hide") {
      markSeen(el.dataset.k);
      el.closest(".card").remove(); // no redraw
    } else if (el.dataset.act === "dismiss") {
      state.settings.backupNudgeDismissedAt = Date.now();
      ctx.save();
    }
  });
}
