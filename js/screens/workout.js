import { advice, exerciseHistory } from "../logic.js";
import { addEntry, finishSession, newItem } from "../session.js";
import { openPicker } from "../picker.js";
import { confirmSheet, esc, fmtKg } from "../ui.js";

// "50 kg × 10, 10, 9". Mixed weights: "50 × 10, 52.5 × 8".
export function lastText(sets) {
  if (!sets || !sets.length) return "";
  const kg = (w) => fmtKg(w);
  if (sets.every((s) => s.weight === sets[0].weight)) {
    return `${kg(sets[0].weight)} kg × ${sets.map((s) => s.reps).join(", ")}`;
  }
  return `${sets.map((s) => `${kg(s.weight)} × ${s.reps}`).join(", ")} kg`;
}

// The plan item (sets, rep range, step) behind an entry. Added-on exercises use goal defaults.
export function itemFor(state, exerciseId) {
  const w = state.workouts.find((x) => x.id === state.active?.workoutId);
  return (
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
  let status = `<span class="st st-no" aria-label="Not started"></span>`;
  let sub;
  if (total > 0 && done === total) {
    status = `<span class="st st-ok" aria-label="Done">✓</span>`;
    sub = `<div class="muted small">${done} ${done === 1 ? "set" : "sets"} done</div>`;
  } else if (done > 0) {
    status = `<span class="st st-part" aria-label="${done} of ${total} sets">${done}/${total}</span>`;
    sub = `<div class="muted small">${done} of ${total} sets</div>`;
  } else {
    const prev = lastSets(state, e.exerciseId);
    const a = advice(prev, itemFor(state, e.exerciseId));
    if (a.kind === "heavier")
      sub = `<div class="up small">↑ ${esc(a.message)}</div>`;
    else if (prev)
      sub = `<div class="muted small">Last: ${esc(lastText(prev))}</div>`;
    else sub = "";
  }
  return `<a class="li" href="#/exercise/${encodeURIComponent(e.exerciseId)}">
    <div class="grow"><div class="ex-name">${esc(e.name)}</div>${sub}</div>${status}
  </a>`;
}

export function render(root, ctx) {
  const { state } = ctx;
  const a = state.active;
  if (!a) {
    location.replace("#/today");
    return;
  }
  const mins = Math.max(0, Math.floor((Date.now() - a.startedAt) / 60000));
  root.innerHTML = `<div class="row">
      <h1 class="title grow">${esc(a.workoutName)}</h1>
      <span class="muted">${mins} min</span>
    </div>
    <p class="subtitle">Tap any exercise. Do them in any order.</p>
    <div class="card list">${a.entries.map((e) => rowHtml(e, ctx)).join("") || `<div class="empty"><b>No exercises yet.</b><p class="muted">Tap "Add another exercise" below to build this workout.</p></div>`}</div>
    <button class="btn" data-act="add">+ Add another exercise</button>
    <button class="btn btn-primary" data-act="finish">Finish workout</button>`;

  root.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act]");
    if (!t) return;
    if (t.dataset.act === "add") {
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
      msg =
        "No sets are confirmed, so nothing will be saved and this workout will be discarded.";
    else if (open > 0)
      msg = `${open} ${open === 1 ? "set is" : "sets are"} not confirmed and will be dropped. Finish anyway?`;
    if (msg && !(await confirmSheet(msg, "Finish workout"))) return;
    finishSession(state, Date.now());
    ctx.go("#/today");
    ctx.save();
  });
}

