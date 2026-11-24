import { GOALS, MUSCLES, WEEKDAYS } from "../constants.js";
import { PLATE_SIZES, gymPlates, parseNum, plateRule } from "../logic.js";
import { blankWorkouts } from "../proposal.js";
import { applyGoal, deleteCustomExercise } from "../session.js";
import { exportCsv, exportJson } from "../store.js";
import { addBackup } from "../sync.js";
import { buildFullBackup, fmtSize, readBackup } from "../backup.js";
import { openPicker } from "../picker.js";
import { openSwap } from "../swapsheet.js";
import { addMany, duplicateWorkout, moveItem, orderItems, renameInSupersets, summaryText, supersetsOf } from "../planbuild.js";
import { openSuperset, ssLetter } from "../supersheet.js";
import { calHtml, bindCal } from "./calui.js";
import {
  allMediaKeys,
  checkSound,
  deleteMedia,
  getBlob,
  readMedia,
  restoreMedia,
  SOUND_KEY,
} from "../media.js";
import {
  loadCustom,
  MAX_SOUND_SECONDS,
  parseRest,
  restLength,
  setCustomSound,
  testSound,
} from "../rest.js";
import * as push from "../push.js";
import { confirmSheet, esc, fmtKg, showBanner } from "../ui.js";
import { applyLang, heEnabled, lang, t } from "../i18n/index.js";
import { runningVersion } from "../update.js";

const isoDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a); // iOS Safari needs the link in the document
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// The one exercise line that is expanded (`dayId|exerciseId`). In memory only; opening one closes the other.
let openX = null;

function itemHtml(it, ctx, i, n, wid) {
  const ex = ctx.lookup(it.exerciseId);
  const name = ex ? ex.name : "Unknown exercise";
  const open = openX === `${wid}|${it.exerciseId}`;
  const rule = plateRule(it, ex);
  const w = ctx.state.workouts.find((x) => x.id === wid);
  const L = w ? ssLetter(w, it.exerciseId) : "";
  return `<li class="item${L ? " ss" : ""}" data-x="${esc(it.exerciseId)}">
    <div class="xline">
      <button class="handle" data-handle aria-label="Move ${esc(name)}: drag, or use the up and down arrow keys">≡</button>
      <button class="xmain" data-act="x-toggle" aria-expanded="${open}">
        <span class="ex-name">${esc(name)}</span>
        <span class="xsum muted">${esc(summaryText(it))}</span><span class="xchev" aria-hidden="true">›</span>
      </button>
      ${L ? `<button class="tag ss-tag" data-act="ss-edit" aria-label="Edit Superset ${L}">${L}</button>` : ""}
    </div>
    ${
      open
        ? `<div class="xbody">
    <div class="xbtns">
      <button class="icon-btn" data-act="x-up" aria-label="Move exercise up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="icon-btn" data-act="x-down" aria-label="Move exercise down"${i === n - 1 ? " disabled" : ""}>↓</button>
      <button class="btn" data-act="x-swap">Swap</button>
      <button class="icon-btn warn" data-act="x-del" aria-label="Remove exercise">✕</button>
    </div>
    <div class="fields">
      <label>Sets<input data-field="sets" inputmode="numeric" value="${esc(it.sets)}" /></label>
      <label>Min reps<input data-field="repMin" inputmode="numeric" value="${esc(it.repMin)}" /></label>
      <label>Max reps<input data-field="repMax" inputmode="numeric" value="${esc(it.repMax)}" /></label>
      <label>Step kg<input data-field="step" inputmode="decimal" value="${esc(fmtKg(it.step))}" /></label>
    </div>
    <div class="setting">Rest after a set (blank = normal rest)
      <span class="rest-in">
        <input data-field="xRestMin" inputmode="numeric" aria-label="Rest minutes for this exercise" value="${it.restSec == null ? "" : Math.floor(it.restSec / 60)}" /> min
        <input data-field="xRestSec" inputmode="numeric" aria-label="Rest seconds for this exercise" value="${it.restSec == null ? "" : it.restSec % 60}" /> sec
      </span>
    </div>
    <label class="setting">Uses plates
      <input type="checkbox" data-field="uses"${rule.on ? " checked" : ""} />
    </label>
    ${rule.on ? `<div class="setting">Empty weight (bar or sled, before plates)
      <span class="rest-in"><input data-field="emptyKg" inputmode="decimal" aria-label="Empty weight in kg" value="${esc(fmtKg(rule.empty))}" /> kg</span>
    </div>` : ""}
  </div>`
        : ""
    }
  </li>`;
}

const itemsHtml = (w, ctx) =>
  w.items.map((it, j) => itemHtml(it, ctx, j, w.items.length, w.id)).join("") ||
  `<li class="empty muted">No exercises yet. Add some below.</li>`;

const countText = (k) => `· ${k ? `${k} ${k === 1 ? "exercise" : "exercises"}` : "no exercises"}`;
const musclesText = (w) => `Muscles: ${w.muscles.join(", ") || "any (tap to choose)"}`;
const dayEl = (root, wid) => root.querySelector(`[data-w="${CSS.escape(wid)}"]`);
const itemEl = (day, id) => day?.querySelector(`[data-x="${CSS.escape(id)}"]`);

// Redraw one day's list and count in place (no full redraw, so nothing else loses focus or scroll).
function paintDay(root, ctx, w) {
  const d = dayEl(root, w.id);
  if (!d) return;
  d.querySelector(".xlist").innerHTML = itemsHtml(w, ctx);
  d.querySelector(".sec-count").textContent = countText(w.items.length);
}

// Redraw one exercise line in place (open or close it).
function paintItem(root, ctx, w, id) {
  const li = itemEl(dayEl(root, w.id), id);
  const i = w.items.findIndex((x) => x.exerciseId === id);
  if (li && i >= 0) li.outerHTML = itemHtml(w.items[i], ctx, i, w.items.length, w.id);
}

// Drag a line by its handle (Pointer Events: touch, pen and mouse). The line follows the finger and the
// others make room live; the new order is saved on release. Only the handle has touch-action:none, so the page still scrolls.
function startDrag(e, root, ctx) {
  const h = e.target.closest?.("[data-handle]");
  if (!h || (e.pointerType === "mouse" && e.button !== 0)) return;
  const li = h.closest(".item");
  const ul = li.parentElement;
  const { w } = findIn(ctx.state, li);
  if (!w || !ul) return;
  e.preventDefault();
  try {
    h.setPointerCapture(e.pointerId);
  } catch {} // no active pointer (never on a real touch or mouse)
  const grab = e.clientY - li.getBoundingClientRect().top;
  let y = e.clientY;
  let raf = 0;
  let done = false;
  li.classList.add("dragging");
  const mid = (el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  };
  const place = () => {
    li.style.transform = "";
    const top = y - grab;
    const center = top + li.getBoundingClientRect().height / 2;
    for (;;) {
      const p = li.previousElementSibling;
      const n = li.nextElementSibling;
      // Move the neighbour, never the dragged line, so it keeps its pointer capture.
      if (p && center < mid(p)) ul.insertBefore(p, li.nextSibling);
      else if (n && center > mid(n)) ul.insertBefore(n, li);
      else break;
    }
    li.style.transform = `translateY(${top - li.getBoundingClientRect().top}px)`;
  };
  const loop = () => {
    const edge = 90;
    const low = innerHeight - 150; // above the tab bar
    const dy = y < edge ? -Math.ceil((edge - y) / 6) : y > low ? Math.ceil((y - low) / 6) : 0;
    if (dy) {
      scrollBy(0, dy);
      place();
    }
    raf = requestAnimationFrame(loop);
  };
  const end = (commit) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    h.removeEventListener("pointermove", move);
    h.removeEventListener("pointerup", up);
    h.removeEventListener("pointercancel", cancel);
    li.classList.remove("dragging");
    li.style.transform = "";
    const id = li.dataset.x;
    if (commit) {
      const next = orderItems(w.items, [...ul.children].map((c) => c.dataset.x));
      if (next.some((it, i) => it !== w.items[i])) {
        w.items.splice(0, w.items.length, ...next);
        ctx.save({ render: false });
      }
    }
    paintDay(root, ctx, w); // from the plan, so it also undoes a cancelled drag
    itemEl(dayEl(root, w.id), id)?.scrollIntoView({ block: "nearest" });
  };
  const move = (ev) => {
    y = ev.clientY;
    place();
  };
  const up = () => end(true);
  const cancel = () => end(false);
  h.addEventListener("pointermove", move);
  h.addEventListener("pointerup", up);
  h.addEventListener("pointercancel", cancel);
  raf = requestAnimationFrame(loop);
  place();
}

// Which sections are open is a per-viewer preference kept in localStorage (never in the plan data), so a redraw
// while editing keeps them open. Toggling only records the choice: it does not redraw.
const OPEN_KEY = "gymtracker.planOpen";
const openSet = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY));
    return new Set(Array.isArray(v) ? v.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
})();
function rememberOpen(key, on) {
  if (on) openSet.add(key);
  else openSet.delete(key);
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...openSet]));
  } catch {}
}
const section = (key, title, body, { count = "", attrs = "", force = false } = {}) =>
  `<details class="card sec" data-sec="${esc(key)}"${attrs}${force || openSet.has(key) ? " open" : ""}>
    <summary><span class="sec-title">${esc(title)}</span>${count ? `<span class="sec-count muted">· ${esc(count)}</span>` : ""}</summary>
    <div class="sec-body">${body}</div>
  </details>`;

function workoutHtml(w, ctx, i, n) {
  const k = w.items.length;
  return section(
    `w:${w.id}`,
    w.name,
    `<input class="name-input" dir="auto" data-field="wname" value="${esc(w.name)}" aria-label="Workout name" maxlength="40" />
    <div class="row" style="margin-top:8px">
      <button class="icon-btn" data-act="w-up" aria-label="Move workout up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="icon-btn" data-act="w-down" aria-label="Move workout down"${i === n - 1 ? " disabled" : ""}>↓</button>
      <button class="btn grow" style="min-height:44px;margin:0" data-act="w-copy">Duplicate day</button>
      <button class="icon-btn warn" data-act="w-del" aria-label="Delete workout">✕</button>
    </div>
    <details class="muscles-line">
      <summary data-muscles>${esc(musclesText(w))}</summary>
      <div class="chips">${MUSCLES.map(
        (m) =>
          `<button class="chip" data-act="w-muscle" data-m="${esc(m)}" aria-pressed="${w.muscles.includes(m)}">${esc(m)}</button>`,
      ).join("")}</div>
    </details>
    <ul class="items xlist">${itemsHtml(w, ctx)}</ul>
    ${k > 1 ? `<p class="muted small" style="margin-bottom:var(--gap)">Drag ≡ to change the order. Tap a line to edit its sets and reps.</p>` : ""}
    <button class="btn" data-act="add-ex">+ Add exercises</button>
    ${k > 1 ? `<button class="btn" data-act="ss-new">Superset…</button>` : ""}`,
    {
      count: countText(k).slice(2),
      attrs: ` data-w="${esc(w.id)}"`,
    },
  );
}

// Weekly schedule (settings.schedule.days): chips pick the days, a select per day picks the workout.
function scheduleHtml(state) {
  const raw = state.settings.schedule?.days;
  const days = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const on = WEEKDAYS.map((_, d) => d).filter((d) => Object.hasOwn(days, d));
  return `<p class="muted small" style="margin-top:0">Pick your training days. Today will show that day's workout.</p>
    <div class="seg" role="group" aria-label="Training days">${WEEKDAYS.map((n, d) => `<button class="chip" data-sch="day" data-d="${d}" aria-pressed="${on.includes(d)}">${n}</button>`).join("")}</div>
    ${on
      .map(
        (d) => `<label class="setting">${WEEKDAYS[d]}
        <select data-sch="sel" data-d="${d}" aria-label="Workout on ${WEEKDAYS[d]}">
          <option value="next">Next in rotation</option>
          ${state.workouts.map((w) => `<option value="${esc(w.id)}"${days[d] === w.id ? " selected" : ""}>${esc(w.name)}</option>`).join("")}
        </select></label>`,
      )
      .join("")}
    ${on.length ? `<button class="btn" data-sch="clear" style="margin-top:8px">Clear schedule</button>` : ""}
    <div data-calbox>${calHtml(state)}</div>`;
}

let versionText = ""; // last known, so a redraw does not blank the line

export function render(root, ctx) {
  const { state } = ctx;
  const { settings } = state;

  const none = !state.workouts.length;
  // With no plan yet, the way to get one starts open; otherwise everything starts closed.
  const goalHtml = `<div class="seg" role="group" aria-label="Training goal">${Object.entries(
    GOALS,
  )
    .map(
      ([key, g]) =>
        `<button class="chip" data-act="goal" data-goal="${key}" aria-pressed="${settings.goal === key}">${esc(g.label)}</button>`,
    )
    .join("")}</div>
      <p class="muted small" style="margin-top:8px">New exercises start at ${GOALS[settings.goal].sets} sets of ${GOALS[settings.goal].repMin}–${GOALS[settings.goal].repMax} reps. To change one exercise, tap it in a workout.</p>`;
  root.innerHTML = `<h1 class="title">Plan</h1>
    ${state.workouts.map((w, i) => workoutHtml(w, ctx, i, state.workouts.length)).join("") || `<section class="card empty"><b>No workouts yet.</b><p class="muted">Add a workout below, or redo the setup to get a proposed plan.</p></section>`}
    <button class="btn" data-act="add-workout">+ Add workout</button>
    <a class="card weight-card" href="#/help"><span>How to use this app</span><span class="muted small">Short guide</span></a>
    ${ctx.sync ? `<a class="card weight-card" href="#/sync"><span>Sync and sign-in</span><span class="muted small">${esc(ctx.sync.status())}</span></a>` : ""}
    ${ctx.share ? `<a class="card weight-card" href="#/people"><span>People: coach and friends</span><span class="muted small">View only</span></a>` : ""}
    ${section("g:goal", "Default sets and reps", goalHtml)}
    ${section("g:schedule", "Weekly schedule", `<div data-schedule>${scheduleHtml(state)}</div>`)}
    ${section(
      "g:change",
      "Change the whole plan",
      `<button class="btn" data-act="redo">Redo setup</button>
      <a class="btn" href="#/import/programs">Ready-made programs</a>
      <a class="btn" href="#/import/file">Load a plan from a file</a>
      <a class="btn" href="#/import/ai">Build a plan with AI</a>`,
      { force: none },
    )}
    ${
      state.customExercises.length
        ? section(
            "g:own",
            "Your exercises",
            `<ul class="items">${state.customExercises
              .map(
                (c) => `<li class="item"><div class="row">
        <div class="grow"><div class="ex-name">${esc(c.name)}</div><span class="tag">${esc(c.primary)}</span></div>
        <button class="btn" data-act="cx-del" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">Delete</button>
      </div></li>`,
              )
              .join("")}</ul>`,
            { count: String(state.customExercises.length) },
          )
        : ""
    }
    ${section(
      "g:settings",
      "Settings",
      `<div class="setting-group" role="group" aria-label="Appearance">
        <div>Appearance</div>
        <div class="seg">${[["dark", "Dark"], ["light", "Light"], ["auto", "Match phone"]]
          .map(([m, l]) => `<button class="chip" data-act="theme" data-mode="${m}" aria-pressed="${(settings.theme ?? "dark") === m}">${l}</button>`)
          .join("")}</div>
      </div>
      ${languageHtml(settings)}
      <label class="setting">Show exercise photos
        <input type="checkbox" data-field="showPhotos"${settings.showPhotos ? " checked" : ""} />
      </label>
      <label class="setting">Body-weight suggestions
        <input type="checkbox" data-field="bodyAdvice"${settings.bodyAdvice === false ? "" : " checked"} />
      </label>
      <p class="muted small">Tips like "add a rep or two" on push-ups and other body-weight moves.</p>
      <label class="setting">Stuck reminder
        <input type="checkbox" data-field="stuckNote"${settings.stuckNote === false ? "" : " checked"} />
      </label>
      <p class="muted small">A gentle note when your numbers have stayed the same for 3 workouts.</p>
      <div class="setting" role="group" aria-label="Rest between sets">Rest between sets
        <span class="rest-in">
          <input data-field="restMin" inputmode="numeric" aria-label="Rest minutes" value="${Math.floor(restLength(settings) / 60)}" /> min
          <input data-field="restSec" inputmode="numeric" aria-label="Rest seconds" value="${restLength(settings) % 60}" /> sec
        </span>
      </div>
      <p class="muted small">0:00 turns the timer off</p>
      <label class="setting">Notify me when rest is over
        <input type="checkbox" data-field="notifyRest"${settings.notifyRest ? " checked" : ""}${push.supported() ? "" : " disabled"} />
      </label>
      ${push.supported() ? "" : `<p class="muted small">Works when the app is installed on your home screen.</p>`}
      <div class="setting-group" id="rest-sound" role="group" aria-label="Rest-over sound">${soundHtml()}</div>
`,
    )}
    ${section(
      "g:plates",
      "Plate sizes",
      `<div class="setting-group" role="group" aria-label="Plates the gym has">
        <div class="muted small">Plates the gym has (kg, pairs)</div>
        <div class="plate-pick">${PLATE_SIZES.map((k) => `<label><input type="checkbox" data-field="plate" data-kg="${k}"${gymPlates(settings).includes(k) ? " checked" : ""} /> ${k}</label>`).join("")}</div>
      </div>`,
    )}
    ${section(
      "g:backup",
      "Backup and export",
      `<button class="btn" data-act="export">Export backup</button>
      <button class="btn" data-act="export-full">Full backup (with your photos and sound)</button>
      <p class="muted small">The full backup also holds the photos, videos and sound you added. Videos can make the file large.</p>
      <button class="btn" data-act="export-csv">Export to spreadsheet (CSV)</button>
      <p class="muted small">The plain backup leaves out the photos, videos and sound you added.</p>
      <label class="btn file-btn">Import backup
        <input type="file" data-field="import" accept="application/json,.json" />
      </label>
      <p class="muted small" id="app-version">${versionText}</p>
      <p class="muted small" id="credits"><b>Credits.</b> Exercise illustrations: <a href="https://everkinetic.com" target="_blank" rel="noopener">Everkinetic</a> (everkinetic.com) by Greg Priday, <a href="https://github.com/everkinetic/data" target="_blank" rel="noopener">github.com/everkinetic/data</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Some drawings modified or newly drawn in the same style; these are CC BY-SA 4.0 too.</p>`,
    )}`;
  runningVersion().then((v) => {
    versionText = v ? `Version ${v}` : "Version: not installed";
    const el = root.querySelector("#app-version");
    if (el) el.textContent = versionText; // no redraw: typed values stay put
  });

  current = { root, ctx };
  getBlob(SOUND_KEY).then((b) => {
    snd.custom = !!b;
    paintSound();
  });
  const find = (el) => findIn(state, el);

  // "toggle" does not bubble, so listen in the capture phase. Only remembers; never redraws.
  root.addEventListener(
    "toggle",
    (e) => {
      const k = e.target.dataset?.sec;
      if (k) rememberOpen(k, e.target.open);
    },
    true,
  );

  root.addEventListener("click", async (e) => {
    syncAll(); // iOS taps do not blur the field, so no change event can be relied on
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const { w, xi } = find(t);
    switch (t.dataset.act) {
      case "theme": {
        settings.theme = t.dataset.mode;
        globalThis.gymTheme?.(settings.theme);
        for (const b of t.parentElement.children) b.setAttribute("aria-pressed", String(b === t));
        await ctx.save({ render: false }); // no redraw: the owner may be typing in a field
        return;
      }
      case "lang":
      case "gender": {
        settings[t.dataset.act] = t.dataset.mode;
        applyLang(settings); // page language, direction and wording now; the screen redraws below
        await ctx.save();
        return;
      }
      case "goal": {
        const g = t.dataset.goal;
        if (g === settings.goal) return;
        const hasItems = state.workouts.some((x) => x.items.length);
        const all =
          hasItems &&
          (await confirmSheet(
            `Apply ${GOALS[g].repMin}–${GOALS[g].repMax} reps × ${GOALS[g].sets} sets to every exercise in your plan?`,
            "Apply to all",
            "Only new exercises",
          ));
        applyGoal(state, g, all);
        break;
      }
      case "w-up":
      case "w-down":
        moveItem(
          state.workouts,
          state.workouts.indexOf(w),
          t.dataset.act === "w-up" ? -1 : 1,
        );
        break;
      case "w-copy": {
        const copy = duplicateWorkout(state, w);
        rememberOpen(`w:${copy.id}`, true);
        await ctx.save();
        document.querySelector(`[data-w="${CSS.escape(copy.id)}"]`)?.scrollIntoView({ block: "start" }); // the new screen, not the old root
        return;
      }
      case "w-del":
        if (
          !(await confirmSheet(
            `Delete workout "${w.name}"? Your history is kept.`,
            "Delete",
            "Cancel",
            { danger: true },
          ))
        )
          return;
        state.workouts = state.workouts.filter((x) => x !== w);
        break;
      case "w-muscle":
        w.muscles = MUSCLES.filter((m) =>
          m === t.dataset.m ? !w.muscles.includes(m) : w.muscles.includes(m),
        );
        t.setAttribute("aria-pressed", String(w.muscles.includes(t.dataset.m)));
        dayEl(root, w.id).querySelector("[data-muscles]").textContent = musclesText(w);
        ctx.save({ render: false });
        return;
      case "add-ex":
        openPicker(
          ctx,
          (ids) => {
            if (addMany(w, ids, settings.goal)) ctx.save();
          },
          {
            exclude: new Set(w.items.map((it) => it.exerciseId)),
            muscles: w.muscles,
            multi: true,
            title: `Add to ${w.name}`,
          },
        );
        return;
      case "x-toggle": {
        const it = w?.items[xi];
        if (!it) return;
        const key = `${w.id}|${it.exerciseId}`;
        const prev = openX?.split("|");
        openX = openX === key ? null : key;
        if (prev) paintItem(root, ctx, state.workouts.find((x) => x.id === prev[0]) ?? w, prev[1]);
        paintItem(root, ctx, w, it.exerciseId);
        if (openX) itemEl(dayEl(root, w.id), it.exerciseId)?.scrollIntoView({ block: "nearest" });
        return;
      }
      case "x-up":
      case "x-down": {
        const id = w?.items[xi]?.exerciseId;
        moveItem(w.items, xi, t.dataset.act === "x-up" ? -1 : 1);
        paintDay(root, ctx, w);
        itemEl(dayEl(root, w.id), id)?.scrollIntoView({ block: "nearest" });
        ctx.save({ render: false });
        return;
      }
      case "x-del":
        if (openX === `${w.id}|${w.items[xi]?.exerciseId}`) openX = null;
        w.items.splice(xi, 1);
        paintDay(root, ctx, w);
        ctx.save({ render: false });
        return;
      case "ss-new":
      case "ss-edit": {
        const edit = t.dataset.act === "ss-edit";
        const id = w?.items[xi]?.exerciseId;
        const group = edit && supersetsOf(w.supersets, w.items.map((it) => it.exerciseId)).find((g) => g.ids.includes(id));
        if (!w || (edit && !group)) return;
        openSuperset(ctx, w, group || null, () => {
          paintDay(root, ctx, w);
          ctx.save({ render: false });
        });
        return;
      }
      case "x-swap": {
        const it = w?.items[xi];
        if (!it) return;
        const ex = ctx.lookup(it.exerciseId);
        openSwap(
          ctx,
          { exerciseId: it.exerciseId, name: ex?.name ?? "this exercise", primary: ex?.primary },
          {
            taken: new Set(w.items.map((x) => x.exerciseId)),
            onSwap: (id) => {
              if (w.items.some((x) => x.exerciseId === id)) return;
              if (openX === `${w.id}|${it.exerciseId}`) openX = `${w.id}|${id}`;
              if (w.supersets) w.supersets = renameInSupersets(w.supersets, it.exerciseId, id);
              it.exerciseId = id;
              paintDay(root, ctx, w);
              itemEl(dayEl(root, w.id), id)?.scrollIntoView({ block: "nearest" });
              ctx.save({ render: false });
            },
          },
        );
        return;
      }
      case "cx-del": {
        const id = t.dataset.id;
        const c = state.customExercises.find((x) => x.id === id);
        if (!c) return;
        const n = state.workouts.filter((x) =>
          x.items.some((it) => it.exerciseId === id),
        ).length;
        if (
          !(await confirmSheet(
            `Delete "${c.name}"? It will be removed from ${n ? `${n} ${n === 1 ? "workout" : "workouts"} in your plan` : "your exercises"}, and any photo or video you added will be deleted. Past workouts keep their records. This cannot be undone.`,
            "Delete",
          ))
        )
          return;
        deleteCustomExercise(state, id);
        if (await ctx.save()) await deleteMedia(id);
        return;
      }
      case "add-workout":
        state.workouts.push({
          id: crypto.randomUUID(),
          name: blankWorkouts(state.workouts.length + 1).at(-1).name,
          muscles: [],
          items: [],
        });
        break;
      case "redo":
        if (
          await confirmSheet(
            "Redo setup replaces your current plan. Your history is kept.",
            "Redo setup",
          )
        )
          ctx.go("#/setup");
        return;
      case "export": {
        settings.lastExportAt = Date.now();
        download(`gym-tracker-backup-${isoDay()}.json`, new Blob([exportJson(state)], { type: "application/json" }));
        break;
      }
      case "export-full": {
        t.disabled = true;
        const before = settings.lastExportAt;
        settings.lastExportAt = Date.now(); // the file itself then records it, like the plain backup
        let size;
        try {
          const blob = await buildFullBackup(state, await allMediaKeys(), readMedia);
          // Check the file would import, unless it is too big to read back safely on a phone.
          if (blob.size <= VERIFY_MAX) readBackup(await blob.text());
          size = blob.size;
          download(`gym-tracker-full-backup-${isoDay()}.json`, blob);
        } catch {
          settings.lastExportAt = before;
          t.disabled = false;
          showBanner("Could not read your photos and sound. Try the plain backup instead.");
          return;
        }
        await ctx.save({ render: false }); // no redraw: the owner may have started typing meanwhile
        t.disabled = false;
        showBanner(`Full backup created (${fmtSize(size)}).`, { kind: "ok" });
        return;
      }
      case "export-csv":
        download(`gym-tracker-sets-${isoDay()}.csv`, new Blob([exportCsv(state)], { type: "text/csv" }));
        return;
      default:
        return;
    }
    const saved = await ctx.save();
    if (saved && t.dataset.act === "export")
      showBanner("Backup file created.", { kind: "ok" });
  });

  root.addEventListener("pointerdown", (e) => startDrag(e, root, ctx));
  // Tapping a number box selects its content, so typing replaces it.
  root.addEventListener("focusin", (e) => e.target.matches?.(".fields input, .rest-in input") && e.target.select());
  // Keyboard and screen reader fallback for the drag handle.
  root.addEventListener("keydown", (e) => {
    const h = e.target.closest?.("[data-handle]");
    if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const { w, xi } = find(h);
    const id = w?.items[xi]?.exerciseId;
    if (!id) return;
    moveItem(w.items, xi, e.key === "ArrowUp" ? -1 : 1);
    paintDay(root, ctx, w);
    itemEl(dayEl(root, w.id), id)?.querySelector("[data-handle]")?.focus();
    ctx.save({ render: false });
  });

  // Schedule: repaints only its own box, so no full redraw.
  const schedule = (e) => {
    const t = e.target.closest?.("[data-sch]");
    if (!t || (e.type === "click") === (t.dataset.sch === "sel")) return;
    const days = { ...settings.schedule?.days };
    if (t.dataset.sch === "day") {
      if (Object.hasOwn(days, t.dataset.d)) delete days[t.dataset.d];
      else days[t.dataset.d] = "next";
    } else if (t.dataset.sch === "sel") days[t.dataset.d] = t.value;
    if (t.dataset.sch === "clear" || !Object.keys(days).length) delete settings.schedule;
    else settings.schedule = { days };
    if (t.dataset.sch !== "sel") root.querySelector("[data-schedule]").innerHTML = scheduleHtml(state);
    ctx.save({ render: false });
  };
  root.addEventListener("click", schedule);
  root.addEventListener("change", schedule);
  bindCal(root, ctx);

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-snd]");
    if (!b || b.tagName !== "BUTTON") return;
    const k = b.dataset.snd;
    if (k === "test") testSound();
    else if (k === "rec") toggleRec();
    else if (k === "default") removeSound();
  });

  root.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.snd === "file") return chooseSound(t);
    const field = t.dataset.field;
    if (!field) return;

    if (field === "showPhotos") settings.showPhotos = t.checked;
    else if (field === "bodyAdvice" || field === "stuckNote") settings[field] = t.checked;
    else if (field === "plate")
      settings.plates = PLATE_SIZES.filter((k) =>
        k === Number(t.dataset.kg) ? t.checked : gymPlates(settings).includes(k),
      );
    else if (field === "uses") {
      const { w, xi } = findIn(ctx.state, t);
      if (w?.items[xi]) {
        w.items[xi].plates = t.checked;
        paintItem(root, ctx, w, w.items[xi].exerciseId); // shows or hides "Empty weight"
        return ctx.save({ render: false });
      }
    }
    else if (field === "notifyRest") {
      // enable() must start inside this tap, so nothing is awaited before it.
      if (t.checked) {
        settings.notifyRest = await push.enable();
        if (!settings.notifyRest)
          showBanner(
            "Notifications are blocked for this app. Allow them in iPhone Settings → Notifications.",
          );
      } else {
        settings.notifyRest = false;
        push.disable();
      }
    } else if (field === "restMin" || field === "restSec") syncRest(ctx);
    else if (field === "import") return importFile(t, ctx);
    else {
      const msg = applyField(ctx, t);
      if (msg) {
        showBanner(msg);
        t.value = shownValue(ctx, t); // put the old value back; no redraw, so the keyboard stays up
      }
      // No redraw while typing: moving to the next box must keep the keyboard open. Typed rest fields stay as typed.
      if (field === "wname") {
        const w = findIn(state, t).w;
        if (w) t.value = w.name; // blank keeps the old name
        dayEl(root, w?.id ?? "")?.querySelector(".sec-title")?.replaceChildren(w?.name ?? "");
      }
      paintSums();
      return ctx.save({ render: false });
    }
    ctx.save(); // re-renders
  });
}

// The screen currently showing; the page-hide listeners below read it.
let current = null;

// What a field should show, from the saved plan.
function shownValue(ctx, t) {
  const { w, xi } = findIn(ctx.state, t);
  const it = w?.items[xi];
  const f = t.dataset.field;
  if (f === "wname") return w?.name ?? "";
  if (!it) return t.value;
  if (f === "step") return fmtKg(it.step);
  if (f === "emptyKg") return fmtKg(plateRule(it, ctx.lookup(it.exerciseId)).empty);
  return String(it[f] ?? "");
}

// Update every exercise line's "3 × 8–12" from the plan.
function paintSums() {
  if (!current?.root.isConnected) return;
  for (const li of current.root.querySelectorAll(".xlist [data-x]")) {
    const { w, xi } = findIn(current.ctx.state, li);
    const sum = li.querySelector(".xsum");
    if (sum && w?.items[xi]) sum.textContent = summaryText(w.items[xi]);
  }
}

const findIn = (state, el) => {
  const w = state.workouts.find(
    (x) => x.id === el.closest("[data-w]")?.dataset.w,
  );
  const xid = el.closest("[data-x]")?.dataset.x;
  return {
    w,
    xi:
      w && xid != null ? w.items.findIndex((it) => it.exerciseId === xid) : -1,
  };
};

// Copy one editable field into the state. Returns an error message when the value is
// rejected (the stored value is then kept), otherwise null.
function applyField(ctx, t) {
  const field = t.dataset.field;
  const { w, xi } = findIn(ctx.state, t);
  if (!w) return null;
  if (field === "wname") {
    w.name = t.value.trim() || w.name;
    return null;
  }
  const it = w.items[xi];
  if (!it) return null;
  if (field === "xRestMin" || field === "xRestSec") {
    const q = (f) => t.closest("[data-x]").querySelector(`[data-field="${f}"]`).value;
    if (!q("xRestMin").trim() && !q("xRestSec").trim()) delete it.restSec;
    else it.restSec = parseRest(q("xRestMin"), q("xRestSec"));
    return null;
  }
  const v = parseNum(t.value);
  const whole = Number.isInteger(v) && v >= 1;
  let ok = true;
  if (field === "emptyKg") {
    ok = v !== null && v <= 500;
    if (ok) it.emptyKg = v;
  } else if (field === "step") {
    ok = v !== null && v > 0;
    if (ok) it.step = v;
  } else if (!whole) ok = false;
  else if (field === "sets") it.sets = v;
  else if (field === "repMin" && v <= it.repMax) it.repMin = v;
  else if (field === "repMax" && v >= it.repMin) it.repMax = v;
  else ok = false;
  if (ok) return null;
  return field === "emptyKg"
    ? "Empty weight must be a number, 0 or more, like 20 or 0."
    : field === "step"
    ? "Step must be a number above 0, like 2.5 or 1,25."
    : field === "sets"
      ? "Sets must be a whole number, 1 or more."
      : "Reps must be whole numbers, 1 or more, with min no higher than max.";
}

// Language (always bilingual, so a wrong language can be undone) and, in Hebrew, the wording choice. Hidden until Hebrew is enabled.
function languageHtml(settings) {
  if (!heEnabled()) return "";
  const seg = (act, cur, opts) =>
    `<div class="seg">${opts.map(([m, l]) => `<button class="chip" data-act="${act}" data-mode="${m}" aria-pressed="${cur === m}">${l}</button>`).join("")}</div>`;
  const langRow = `<div class="setting-group" role="group" aria-label="Language / שפה">
    <div>Language / שפה</div>
    ${seg("lang", settings.lang ?? "auto", [["auto", "Auto (phone)"], ["en", "English"], ["he", "עברית"]])}
  </div>`;
  if (lang() !== "he") return langRow;
  return `${langRow}<div class="setting-group" role="group" aria-label="${esc(t("settings.wording"))}">
    <div>${esc(t("settings.wording"))}</div>
    ${seg("gender", settings.gender ?? "neutral", [["neutral", t("settings.gender.neutral")], ["male", t("settings.gender.male")], ["female", t("settings.gender.female")]])}
  </div>`;
}

const EDITABLE = new Set(["wname", "sets", "repMin", "repMax", "step", "emptyKg", "xRestMin", "xRestSec"]);

// Rest length from its two fields (blank counts as 0).
function syncRest(ctx) {
  const v = (f) => current.root.querySelector(`[data-field="${f}"]`)?.value;
  if (v("restMin") === undefined) return;
  ctx.state.settings.restSeconds = parseRest(v("restMin"), v("restSec"));
}

function syncAll() {
  if (!current?.root.isConnected) return;
  syncRest(current.ctx);
  for (const el of current.root.querySelectorAll("input[data-field]"))
    if (EDITABLE.has(el.dataset.field)) applyField(current.ctx, el);
  paintSums();
}

function flush() {
  abortRec();
  if (!current?.root.isConnected) return;
  syncAll();
  current.ctx.save({ render: false });
}
// Registered once for the page, not per render.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  // Capture phase: must run before the shell's render listener on hashchange, while the old screen is still connected.
  window.addEventListener("hashchange", flush, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

// ---- Rest-over sound: updates only its own group, never the whole screen ----
const snd = {
  custom: false,
  rec: null,
  secs: 0,
  discard: false,
  tick: 0,
  cap: 0,
};
const MIC_MSG =
  "Recording is not available. Allow the microphone for this app, or choose a saved audio file.";
const canRecord = () =>
  typeof MediaRecorder !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

function soundHtml() {
  return `<div class="row"><b class="grow">Rest-over sound</b><span class="muted small">${snd.custom ? "Your sound" : "Default chime"}</span></div>
    <div class="row">
      <button type="button" class="btn" data-snd="test">Test</button>
      <label class="btn file-btn">Choose audio<input type="file" accept="audio/*" data-snd="file" /></label>
      ${canRecord() ? `<button type="button" class="btn" data-snd="rec">${snd.rec ? `Stop ${snd.secs}s` : "Record"}</button>` : ""}
    </div>
    ${snd.custom ? `<button type="button" class="btn" data-snd="default">Use default chime</button>` : ""}
    <p class="muted small">Your sound plays while the app is open. Notifications use the iPhone's own sound. It is saved in the full backup, and synced if sync is on.</p>`;
}

function paintSound() {
  const g = current?.root.querySelector("#rest-sound");
  if (g) g.innerHTML = soundHtml();
}

async function useSound(blob) {
  if (!(await setCustomSound(blob)))
    showBanner("Could not use that audio. Choose another file.");
  snd.custom = !!(await getBlob(SOUND_KEY));
  paintSound();
}

function chooseSound(input) {
  const file = input.files[0];
  input.value = ""; // allow choosing the same file again
  if (!file) return;
  const chk = checkSound(file);
  if (!chk.ok) return showBanner(chk.message);
  return useSound(file);
}

async function removeSound() {
  if (
    await confirmSheet(
      "Go back to the default chime? Your sound will be deleted.",
      "Use default chime",
    )
  )
    useSound(null);
}

function endRec() {
  clearInterval(snd.tick);
  clearTimeout(snd.cap);
  snd.rec = null;
  paintSound();
}

// Leaving the screen mid-recording: stop and throw the recording away.
function abortRec() {
  if (!snd.rec) return;
  snd.discard = true;
  try {
    snd.rec.stop();
  } catch {}
}

async function toggleRec() {
  if (snd.rec) return snd.rec.stop();
  let stream;
  try {
    try {
      // The chime sets "ambient" (mix with music), a mode iOS cannot record in. The next tick or Test sets it back.
      if (navigator.audioSession) navigator.audioSession.type = "auto";
    } catch {}
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    const release = () => stream.getTracks().forEach((t) => t.stop()); // clears the iOS mic indicator
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = () => {
      release();
      endRec();
      showBanner(MIC_MSG);
    };
    rec.onstop = () => {
      release();
      const discard = snd.discard;
      snd.discard = false;
      endRec();
      if (!discard && chunks.length)
        useSound(new Blob(chunks, { type: rec.mimeType || chunks[0].type }));
    };
    snd.rec = rec;
    snd.secs = 0;
    snd.discard = false;
    rec.start();
    snd.tick = setInterval(() => {
      snd.secs++;
      paintSound();
    }, 1000);
    snd.cap = setTimeout(
      () => rec.state !== "inactive" && rec.stop(),
      MAX_SOUND_SECONDS * 1000,
    );
    paintSound();
  } catch {
    stream?.getTracks().forEach((t) => t.stop());
    snd.rec = null;
    showBanner(MIC_MSG);
  }
}

const VERIFY_MAX = 50e6; // bytes: bigger full backups are not re-read to check them
const BIG_FILE = 150e6; // bytes: warn before reading a backup this big

async function importFile(input, ctx) {
  const file = input.files[0];
  input.value = ""; // allow choosing the same file again
  if (!file) return;
  if (
    file.size > BIG_FILE &&
    !(await confirmSheet(
      `This backup file is very large (${fmtSize(file.size)}). Your phone may not manage to open it.`,
      "Try anyway",
    ))
  )
    return;
  let imported, media;
  try {
    ({ state: imported, media } = readBackup(await file.text()));
  } catch (err) {
    showBanner(err.message);
    return;
  }
  // With sync on, a replace would delete everything missing from the file on every device: add instead.
  const adding = !!ctx.sync?.active();
  if (
    !(await confirmSheet(
      adding
        ? "Add this backup to your data? Nothing you have now is removed."
        : "Replace all your data with this backup? This cannot be undone." +
            (ctx.state.active ? " The workout in progress will be lost." : ""),
      adding ? "Add this backup to your data" : "Replace everything",
    ))
  )
    return;
  // Data first: it is the part that can fail on a full phone, and nothing else is touched until it is saved.
  current = null; // the old screen's fields must not be copied into the imported data
  const previous = ctx.state;
  ctx.state = adding ? addBackup(previous, imported).state : imported;
  if (!(await ctx.save({ render: false, resetSnapshot: true }))) {
    ctx.state = previous; // not saved: put the old data back so nothing later persists the import
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    showBanner("Backup was not restored. Nothing was changed.");
    return;
  }
  let mediaOk = true;
  try {
    if (media?.length) await restoreMedia(media); // one transaction: all or nothing
  } catch {
    mediaOk = false;
  }
  loadCustom(); // pick up a restored rest-over sound
  window.dispatchEvent(new HashChangeEvent("hashchange")); // app.js re-renders on this
  if (mediaOk) showBanner("Backup restored.", { kind: "ok" });
  else
    showBanner(
      "Your data was restored, but the photos and sound from the backup could not be. Your earlier photos and sound were kept.",
    );
}
