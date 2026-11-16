import { GOALS, MUSCLES } from "../constants.js";
import { parseNum } from "../logic.js";
import { blankWorkouts } from "../proposal.js";
import { applyGoal, newItem } from "../session.js";
import { exportJson, importJson } from "../store.js";
import { openPicker } from "../picker.js";
import { confirmSheet, esc, fmtKg, showBanner } from "../ui.js";

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

const isoDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function download(filename, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a); // iOS Safari needs the link in the document
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function itemHtml(it, ctx, i, n) {
  const ex = ctx.lookup(it.exerciseId);
  return `<li class="item" data-x="${esc(it.exerciseId)}">
    <div class="row">
      <div class="grow">
        <div class="ex-name">${esc(ex ? ex.name : "Unknown exercise")}</div>
        ${ex ? `<span class="tag">${esc(ex.primary)}</span>` : ""}
      </div>
      <button class="icon-btn" data-act="x-up" aria-label="Move exercise up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="icon-btn" data-act="x-down" aria-label="Move exercise down"${i === n - 1 ? " disabled" : ""}>↓</button>
      <button class="icon-btn warn" data-act="x-del" aria-label="Remove exercise">✕</button>
    </div>
    <div class="fields">
      <label>Sets<input data-field="sets" inputmode="numeric" value="${esc(it.sets)}" /></label>
      <label>Min reps<input data-field="repMin" inputmode="numeric" value="${esc(it.repMin)}" /></label>
      <label>Max reps<input data-field="repMax" inputmode="numeric" value="${esc(it.repMax)}" /></label>
      <label>Step kg<input data-field="step" inputmode="decimal" value="${esc(fmtKg(it.step))}" /></label>
    </div>
  </li>`;
}

function workoutHtml(w, ctx, i, n) {
  return `<section class="card" data-w="${esc(w.id)}">
    <div class="row">
      <input class="name-input grow" data-field="wname" value="${esc(w.name)}" aria-label="Workout name" maxlength="40" />
      <button class="icon-btn" data-act="w-up" aria-label="Move workout up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="icon-btn" data-act="w-down" aria-label="Move workout down"${i === n - 1 ? " disabled" : ""}>↓</button>
      <button class="icon-btn warn" data-act="w-del" aria-label="Delete workout">✕</button>
    </div>
    <div class="chips">${MUSCLES.map(
      (m) =>
        `<button class="chip" data-act="w-muscle" data-m="${esc(m)}" aria-pressed="${w.muscles.includes(m)}">${esc(m)}</button>`,
    ).join("")}</div>
    <ul class="items">${w.items.map((it, k) => itemHtml(it, ctx, k, w.items.length)).join("") || `<li class="empty muted">No exercises yet. Add one below.</li>`}</ul>
    <button class="btn" data-act="add-ex">+ Add exercise</button>
  </section>`;
}

export function render(root, ctx) {
  const { state } = ctx;
  const { settings } = state;

  root.innerHTML = `<h1 class="title">Plan</h1>
    <section class="card">
      <h2>Goal</h2>
      <div class="seg" role="group" aria-label="Training goal">${Object.entries(
        GOALS,
      )
        .map(
          ([key, g]) =>
            `<button class="chip" data-act="goal" data-goal="${key}" aria-pressed="${settings.goal === key}">${esc(g.label)}</button>`,
        )
        .join("")}</div>
      <p class="muted small" style="margin-top:8px">New exercises use ${GOALS[settings.goal].repMin}–${GOALS[settings.goal].repMax} reps.</p>
    </section>
    ${state.workouts.map((w, i) => workoutHtml(w, ctx, i, state.workouts.length)).join("") || `<section class="card empty"><b>No workouts yet.</b><p class="muted">Add a workout below, or redo the setup to get a proposed plan.</p></section>`}
    <button class="btn" data-act="add-workout">+ Add workout</button>
    <button class="btn" data-act="redo">Redo setup</button>
    <section class="card">
      <h2>Settings</h2>
      <label class="setting">Show exercise photos
        <input type="checkbox" data-field="showPhotos"${settings.showPhotos ? " checked" : ""} />
      </label>
      <button class="btn" data-act="export">Export backup</button>
      <label class="btn file-btn">Import backup
        <input type="file" data-field="import" accept="application/json,.json" />
      </label>
    </section>`;

  current = { root, ctx };
  const find = (el) => findIn(state, el);

  root.addEventListener("click", async (e) => {
    syncAll(); // iOS taps do not blur the field, so no change event can be relied on
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const { w, xi } = find(t);
    switch (t.dataset.act) {
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
        move(
          state.workouts,
          state.workouts.indexOf(w),
          t.dataset.act === "w-up" ? -1 : 1,
        );
        break;
      case "w-del":
        if (
          !(await confirmSheet(
            `Delete workout "${w.name}"? Your history is kept.`,
            "Delete",
          ))
        )
          return;
        state.workouts = state.workouts.filter((x) => x !== w);
        break;
      case "w-muscle":
        w.muscles = MUSCLES.filter((m) =>
          m === t.dataset.m ? !w.muscles.includes(m) : w.muscles.includes(m),
        );
        break;
      case "add-ex":
        openPicker(
          ctx,
          (id) => {
            if (w.items.some((it) => it.exerciseId === id)) return;
            w.items.push(newItem(id, settings.goal));
            ctx.save();
          },
          { exclude: new Set(w.items.map((it) => it.exerciseId)), muscles: w.muscles },
        );
        return;
      case "x-up":
      case "x-down":
        move(w.items, xi, t.dataset.act === "x-up" ? -1 : 1);
        break;
      case "x-del":
        w.items.splice(xi, 1);
        break;
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
        download(`gym-tracker-backup-${isoDay()}.json`, exportJson(state));
        break;
      }
      default:
        return;
    }
    const saved = await ctx.save();
    if (saved && t.dataset.act === "export")
      showBanner("Backup file created.", { kind: "ok" });
  });

  root.addEventListener("change", async (e) => {
    const t = e.target;
    const field = t.dataset.field;
    if (!field) return;

    if (field === "showPhotos") settings.showPhotos = t.checked;
    else if (field === "import") return importFile(t, ctx);
    else {
      const msg = applyField(ctx, t);
      if (msg) showBanner(msg);
    }
    ctx.save(); // re-renders, which also puts the old value back after a rejected edit
  });
}

// The screen currently showing; the page-hide listeners below read it.
let current = null;

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
  const v = parseNum(t.value);
  const whole = Number.isInteger(v) && v >= 1;
  let ok = true;
  if (field === "step") {
    ok = v !== null && v > 0;
    if (ok) it.step = v;
  } else if (!whole) ok = false;
  else if (field === "sets") it.sets = v;
  else if (field === "repMin" && v <= it.repMax) it.repMin = v;
  else if (field === "repMax" && v >= it.repMin) it.repMax = v;
  else ok = false;
  if (ok) return null;
  return field === "step"
    ? "Step must be a number above 0, like 2.5 or 1,25."
    : field === "sets"
      ? "Sets must be a whole number, 1 or more."
      : "Reps must be whole numbers, 1 or more, with min no higher than max.";
}

const EDITABLE = new Set(["wname", "sets", "repMin", "repMax", "step"]);

function syncAll() {
  if (!current?.root.isConnected) return;
  for (const el of current.root.querySelectorAll("input[data-field]"))
    if (EDITABLE.has(el.dataset.field)) applyField(current.ctx, el);
}

function flush() {
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

async function importFile(input, ctx) {
  const file = input.files[0];
  input.value = ""; // allow choosing the same file again
  if (!file) return;
  let imported;
  try {
    imported = importJson(await file.text());
  } catch (err) {
    showBanner(err.message);
    return;
  }
  if (
    !(await confirmSheet(
      "Replace all your data with this backup? This cannot be undone." +
        (ctx.state.active ? " The workout in progress will be lost." : ""),
      "Replace everything",
    ))
  )
    return;
  current = null; // the old screen's fields must not be copied into the imported data
  const previous = ctx.state;
  ctx.state = imported;
  if (await ctx.save({ render: false })) {
    window.dispatchEvent(new HashChangeEvent("hashchange")); // app.js re-renders on this
    showBanner("Backup restored.", { kind: "ok" });
  } else {
    ctx.state = previous; // not saved: put the old data back so nothing later persists the import
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    showBanner("Backup was not restored. Your data is unchanged.");
  }
}
