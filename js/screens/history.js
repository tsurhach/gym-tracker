import { exerciseHistory, isPersonalBest, isStuck, validSet } from "../logic.js";
import { deleteSession, removeSet } from "../session.js";
import { confirmSheet, esc, fmtDate, fmtKg } from "../ui.js";
import { applyInputs, pbHtml } from "./exercise.js";

// Whole minutes, at least 1.
export const durationMin = (ses) =>
  Math.max(
    1,
    Math.floor(((ses.finishedAt ?? ses.startedAt) - ses.startedAt) / 60000),
  );

// Totals for the summary card, all computed from saved sets. One best per exercise: heaviest, then most reps.
export function summary(ses, sessions) {
  let sets = 0;
  let volume = 0;
  const bests = [];
  for (const en of ses.entries) {
    sets += en.sets.length;
    volume += en.sets.reduce((n, s) => n + s.weight * s.reps, 0);
    const past = earlier(sessions, ses, en.exerciseId);
    const top = en.sets
      .filter((s) => isPersonalBest(past, s))
      .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
    if (top) bests.push({ name: en.name, weight: top.weight, reps: top.reps });
  }
  return { minutes: durationMin(ses), sets, volume, bests };
}

function summaryHtml(ses, sessions) {
  const m = summary(ses, sessions);
  const lifted = m.volume > 0 ? ` · ${Math.round(m.volume).toLocaleString("en-US")} kg lifted` : "";
  return `<section class="card" aria-label="Workout summary">
      <p class="stat" style="margin:0"><b>${m.minutes} min</b> · ${plural(m.sets, "set", "sets")}${lifted}</p>
      ${m.bests.length ? `<p style="margin:8px 0 0">🏆 ${plural(m.bests.length, "new best", "new bests")}: ${m.bests.map((b) => `${esc(b.name)} ${fmtKg(b.weight)} × ${b.reps}`).join(" · ")}</p>` : ""}
    </section>`;
}

const heaviest = (sets) => Math.max(...sets.map((s) => s.weight));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One row per exercise ever logged, most recently trained first. Names come from the
// newest session's own snapshot, never from the plan or library.
export function exerciseRows(sessions) {
  const newestFirst = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  const rows = [];
  const seen = new Set();
  for (const ses of newestFirst) {
    for (const e of ses.entries) {
      if (seen.has(e.exerciseId)) continue;
      seen.add(e.exerciseId);
      const hist = exerciseHistory(sessions, e.exerciseId).filter(
        (h) => h.sets.length,
      );
      if (!hist.length) continue;
      rows.push({
        exerciseId: e.exerciseId,
        name: e.name,
        sessions: hist.length,
        first: heaviest(hist[0].sets),
        latest: heaviest(hist[hist.length - 1].sets),
        stuck: isStuck(hist.map((h) => h.sets)),
      });
    }
  }
  return rows;
}

// "50 → 60 kg", "30 kg", "30 kg · stuck"
export function progressText(r) {
  if (r.stuck) return `${fmtKg(r.latest)} kg · stuck`;
  if (r.sessions === 1) return `${fmtKg(r.latest)} kg`;
  return `${fmtKg(r.first)} → ${fmtKg(r.latest)} kg`;
}

export const setsText = (sets) =>
  sets.map((s) => `${fmtKg(s.weight)} × ${s.reps}`).join(", ");

const CW = 320;
const CH = 120;
const CPAD = 28;

// Pure: values (oldest first) to chart coordinates. Sessions are spaced evenly, not by date.
// One point sits in the middle; equal values give a flat line in the middle.
export function chartPoints(values, w = CW, h = CH, pad = CPAD) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map((v, i) => ({
    x: values.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (values.length - 1),
    y: hi === lo ? h / 2 : pad + ((hi - v) / (hi - lo)) * (h - 2 * pad),
  }));
}

// Inline SVG of the heaviest weight per session, for looking back only.
export function chartHtml(values) {
  const pts = chartPoints(values);
  const n = values.length;
  const first = pts[0];
  const last = pts[n - 1];
  // Label sits on the side away from the line, so it never covers it.
  const label = (p, v, anchor, other) =>
    `<text x="${p.x}" y="${other && other.y < p.y ? p.y + 18 : p.y - 9}" text-anchor="${anchor}" fill="var(--muted)" font-size="12">${esc(fmtKg(v))} kg</text>`;
  const desc =
    n === 1
      ? `Heaviest weight: ${fmtKg(values[0])} kg in 1 session.`
      : `Heaviest weight per session: ${fmtKg(values[0])} kg first, ${fmtKg(values[n - 1])} kg latest, over ${n} sessions.`;
  return `<svg viewBox="0 0 ${CW} ${CH}" class="chart" role="img" aria-label="${esc(desc)}">
    ${n > 1 ? `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />` : ""}
    ${n <= 30 ? pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--accent)" />`).join("") : ""}
    ${label(first, values[0], n === 1 ? "middle" : "start", pts[1])}${n > 1 ? label(last, values[n - 1], "end", pts[n - 2]) : ""}
  </svg>${n === 1 ? `<p class="muted small">Needs two sessions to draw a line.</p>` : ""}`;
}

function listHtml(state) {
  const sessions = [...state.sessions].sort(
    (a, b) => b.startedAt - a.startedAt,
  );
  if (!sessions.length) {
    return `<section class="card"><p><b>No workouts yet.</b></p><p class="muted">Finish a workout and it shows up here.</p></section>`;
  }
  const rows = exerciseRows(state.sessions);
  return `${sessions
    .map((s) => {
      const sets = s.entries.reduce((n, e) => n + e.sets.length, 0);
      return `<a class="card block" href="#/history/${encodeURIComponent(s.id)}">
        <div class="row"><b class="grow ex-name">${esc(s.workoutName)}</b><span class="muted nowrap">${esc(fmtDate(s.startedAt))}</span></div>
        <div class="muted small">${plural(s.entries.length, "exercise", "exercises")} · ${plural(sets, "set", "sets")} · ${durationMin(s)} min</div>
      </a>`;
    })
    .join("")}
    <h3>Tap an exercise to see its progress</h3>
    <section class="card list">${rows
      .map(
        (
          r,
        ) => `<a class="li" href="#/progress/${encodeURIComponent(r.exerciseId)}">
        <span class="grow ex-name">${esc(r.name)}</span>
        <span class="${r.stuck ? "stuck" : "up"}">${esc(progressText(r))}</span>
      </a>`,
      )
      .join("")}</section>`;
}

// The session screen showing now; the page-hide listeners below read it.
let current = null;

const BAD_MSG =
  "Weight needs a number and reps a whole number. That set was not changed.";

// Rows showing a rejected edit when a set is deleted, so the redraw can put their
// typed text and error state back at their new positions.
let restore = null;

const findSession = (c) => c.ctx.state.sessions.find((s) => s.id === c.id);

// Copy every row's typed values into its set. A row that is not a valid set is not
// saved: it keeps its stored values and shows the error state. Returns false when
// no session screen is showing. iOS taps do not blur the input, so no change event
// can be relied on.
function syncAll() {
  if (!current?.root.isConnected) return false;
  const ses = findSession(current);
  if (!ses) return false;
  let bad = false;
  for (const row of current.root.querySelectorAll(".set[data-e]")) {
    const s = ses.entries[Number(row.dataset.e)]?.sets[Number(row.dataset.i)];
    if (!s) continue;
    const next = applyInputs(
      s,
      row.querySelector('[data-f="weight"]').value,
      row.querySelector('[data-f="reps"]').value,
    );
    const ok = validSet(next.weight, next.reps);
    if (ok) Object.assign(s, next);
    row.classList.toggle("bad", !ok);
    bad ||= !ok;
  }
  current.root.querySelector("[data-err]").textContent = bad
    ? BAD_MSG
    : "";
  paintBadges(ses);
  return true;
}

// Edits can add or remove "New best" on any set. Only the badge elements change, never the inputs.
function paintBadges(ses) {
  for (const row of current.root.querySelectorAll(".set[data-e]")) {
    const en = ses.entries[Number(row.dataset.e)];
    const s = en?.sets[Number(row.dataset.i)];
    if (!s) continue;
    const badge = row.nextElementSibling?.classList.contains("pb")
      ? row.nextElementSibling
      : null;
    const want = isPersonalBest(earlier(current.ctx.state.sessions, ses, en.exerciseId), s);
    if (want && !badge) row.insertAdjacentHTML("afterend", pbHtml);
    else if (!want && badge) badge.remove();
  }
}

function flush() {
  if (syncAll()) current.ctx.save({ render: false });
}
// Registered once for the page, not per render.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  // Capture phase: must run before the shell's render listener, while the old screen is still connected.
  window.addEventListener("hashchange", flush, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function setRow(s, e, i, past) {
  return `<div class="set hist done" data-e="${e}" data-i="${i}">
    <span class="set-n">${i + 1}</span>
    <input data-f="weight" inputmode="decimal" enterkeyhint="next" placeholder="kg" aria-label="Set ${i + 1} weight in kg" value="${esc(fmtKg(s.weight))}" />
    <input data-f="reps" inputmode="numeric" enterkeyhint="done" placeholder="reps" aria-label="Set ${i + 1} reps" value="${esc(s.reps)}" />
    <button class="icon-btn" data-act="del-set" aria-label="Delete set ${i + 1}">✕</button>
  </div>${isPersonalBest(past, s) ? pbHtml : ""}`;
}

// Every set of this exercise logged in workouts before ses.
const earlier = (sessions, ses, id) =>
  exerciseHistory(sessions.filter((x) => x.startedAt < ses.startedAt), id).flatMap((h) => h.sets);

function sessionScreen(root, ctx) {
  const id = ctx.params.id;
  const ses = ctx.state.sessions.find((s) => s.id === id);
  if (!ses) {
    location.replace("#/history");
    return;
  }
  root.innerHTML = `<div class="row topbar"><a class="back" href="#/history">‹ History</a></div>
    <h1 class="title">${esc(ses.workoutName)}</h1>
    <p class="subtitle">${esc(fmtDate(ses.startedAt))}</p>
    ${summaryHtml(ses, ctx.state.sessions)}
    ${ses.entries
      .map(
        (en, e) => `<section class="card">
      <div class="row"><a class="grow ex-name block ex-link" href="#/progress/${encodeURIComponent(en.exerciseId)}">${esc(en.name)}</a>${en.primary ? `<span class="tag">${esc(en.primary)}</span>` : ""}</div>
      ${en.note ? `<p class="muted small">${esc(en.note)}</p>` : ""}
      <div class="set hist set-head muted small"><span></span><span>kg</span><span>Reps</span><span></span></div>
      ${en.sets.map((s, i) => setRow(s, e, i, earlier(ctx.state.sessions, ses, en.exerciseId))).join("")}
    </section>`,
      )
      .join("")}
    <p class="err" role="alert" data-err></p>
    <button class="btn btn-warn" data-act="del-ses">Delete workout</button>`;

  current = { root, id, ctx };

  if (restore) {
    for (const r of restore) {
      const row = root.querySelector(`.set[data-e="${r.e}"][data-i="${r.i}"]`);
      if (!row) continue;
      row.querySelector('[data-f="weight"]').value = r.w;
      row.querySelector('[data-f="reps"]').value = r.r;
      row.classList.add("bad");
    }
    if (restore.length)
      root.querySelector("[data-err]").textContent = BAD_MSG;
    restore = null;
  }

  // Typing saves on change without redrawing, so a tap that blurred the field is never lost.
  root.addEventListener("change", (ev) => {
    if (!ev.target.dataset.f) return;
    if (syncAll()) ctx.save({ render: false });
  });

  root.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act], a");
    if (!t) return;
    syncAll();
    const act = t.dataset.act;
    if (!act) {
      ctx.save({ render: false }); // plain links navigate on their own
      return;
    }
    if (act === "del-set") {
      const row = t.closest(".set");
      const e = Number(row.dataset.e);
      const i = Number(row.dataset.i);
      const name = findSession(current)?.entries[e]?.name ?? "this exercise";
      if (!(await confirmSheet(`Delete set ${i + 1} of ${name}?`, "Delete"))) {
        ctx.save({ render: false });
        return;
      }
      const entryGone = findSession(current)?.entries[e]?.sets.length === 1;
      restore = [...current.root.querySelectorAll(".set.bad[data-e]")]
        .map((r) => ({
          e: Number(r.dataset.e),
          i: Number(r.dataset.i),
          w: r.querySelector('[data-f="weight"]').value,
          r: r.querySelector('[data-f="reps"]').value,
        }))
        .filter((r) => !(r.e === e && r.i === i))
        .map((r) => ({
          ...r,
          i: r.e === e && r.i > i ? r.i - 1 : r.i,
          e: entryGone && r.e > e ? r.e - 1 : r.e,
        }));
      removeSet(ctx.state, id, e, i);
      // a session left empty is gone; the redraw sends us back to History
      await ctx.save();
      restore = null;
    } else if (act === "del-ses") {
      if (
        !(await confirmSheet(
          "Delete this workout? It is removed from History, progress and Muscles.",
          "Delete workout",
        ))
      ) {
        ctx.save({ render: false });
        return;
      }
      deleteSession(ctx.state, id);
      await ctx.save({ render: false });
      ctx.go("#/history");
    }
  });
}

export function renderProgress(root, ctx) {
  const id = ctx.params.id;
  const hist = exerciseHistory(ctx.state.sessions, id).filter(
    (h) => h.sets.length,
  );
  if (!hist.length) {
    location.replace("#/history");
    return;
  }
  const rows = exerciseRows(ctx.state.sessions);
  const name = rows.find((r) => r.exerciseId === id).name;
  const stuck = isStuck(hist.map((h) => h.sets));
  const byStart = new Map(ctx.state.sessions.map((s) => [s.startedAt, s.id]));
  const note = stuck
    ? "Stuck: neither of your last two sessions beat the one before it, in weight or total reps."
    : hist.length < 3
      ? "Not stuck: it takes at least 3 sessions to tell."
      : "Not stuck: one of your last two sessions beat the one before it.";
  root.innerHTML = `<div class="row topbar"><a class="back" href="#/history">‹ History</a></div>
    <h1 class="title">${esc(name)}</h1>
    <p class="${stuck ? "stuck" : "muted"}" style="margin-bottom:var(--gap)">${esc(note)}</p>
    <section class="card">${chartHtml(hist.map((h) => heaviest(h.sets)))}</section>
    ${[...hist]
      .reverse()
      .map((h) => {
        const sid = byStart.get(h.startedAt);
        return `<a class="card block" href="#/history/${encodeURIComponent(sid)}">
        <div class="muted small">${esc(fmtDate(h.startedAt))}</div>
        <div class="last-sets">${esc(setsText(h.sets))}</div>
      </a>`;
      })
      .join("")}`;
}

export function render(root, ctx) {
  if (ctx.params.id) return sessionScreen(root, ctx);
  root.innerHTML = `<h1 class="title">History</h1>
    <p class="subtitle">Every workout, newest first</p>${listHtml(ctx.state)}`;
}
