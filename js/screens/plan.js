import { GOALS, MUSCLES } from "../constants.js";
import { parseNum } from "../logic.js";
import { blankWorkouts } from "../proposal.js";
import { newItem } from "../session.js";
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
    <ul class="items">${w.items.map((it, k) => itemHtml(it, ctx, k, w.items.length)).join("")}</ul>
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
      <p class="muted small" style="margin-top:8px">New exercises use ${GOALS[settings.goal].repMin}–${GOALS[settings.goal].repMax} reps. Existing ones keep their own.</p>
    </section>
    ${state.workouts.map((w, i) => workoutHtml(w, ctx, i, state.workouts.length)).join("")}
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

  const find = (el) => {
    const w = state.workouts.find(
      (x) => x.id === el.closest("[data-w]")?.dataset.w,
    );
    const xid = el.closest("[data-x]")?.dataset.x;
    return {
      w,
      xi:
        w && xid != null
          ? w.items.findIndex((it) => it.exerciseId === xid)
          : -1,
    };
  };

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const { w, xi } = find(t);
    switch (t.dataset.act) {
      case "goal":
        settings.goal = t.dataset.goal;
        break;
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
          { exclude: new Set(w.items.map((it) => it.exerciseId)) },
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
        showBanner("Backup file created.", { kind: "ok" });
        break;
      }
      default:
        return;
    }
    ctx.save();
  });

  root.addEventListener("change", async (e) => {
    const t = e.target;
    const field = t.dataset.field;
    if (!field) return;
    const { w, xi } = find(t);

    if (field === "showPhotos") settings.showPhotos = t.checked;
    else if (field === "wname") w.name = t.value.trim() || w.name;
    else if (field === "import") return importFile(t, ctx);
    else {
      const it = w.items[xi];
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
      if (!ok) {
        showBanner(
          field === "step"
            ? "Step must be a number above 0, like 2.5 or 1,25."
            : field === "sets"
              ? "Sets must be a whole number, 1 or more."
              : "Reps must be whole numbers, 1 or more, with min no higher than max.",
        );
      }
    }
    ctx.save(); // re-renders, which also puts the old value back after a rejected edit
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
      "Replace all your data with this backup? This cannot be undone.",
      "Replace everything",
    ))
  )
    return;
  ctx.state = imported;
  ctx.save();
  showBanner("Backup restored.", { kind: "ok" });
}
