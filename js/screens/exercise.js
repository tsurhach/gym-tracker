import { advice, exerciseHistory, parseNum, validSet } from "../logic.js";
import { confirmSheet, esc, fmtDate, fmtKg } from "../ui.js";
import { itemFor, lastSets, lastText } from "./workout.js";

const val = (n) => (n == null ? "" : fmtKg(n));

function setHtml(s, i) {
  return `<div class="set${s.done ? " done" : ""}" data-i="${i}">
    <span class="set-n">${i + 1}</span>
    <input data-f="weight" inputmode="decimal" enterkeyhint="next" placeholder="kg" aria-label="Set ${i + 1} weight in kg" value="${esc(val(s.weight))}" />
    <input data-f="reps" inputmode="numeric" enterkeyhint="done" placeholder="reps" aria-label="Set ${i + 1} reps" value="${esc(s.reps ?? "")}" />
    <button class="confirm" data-act="confirm" aria-pressed="${!!s.done}" aria-label="${s.done ? "Unconfirm" : "Confirm"} set ${i + 1}">✓</button>
    <button class="icon-btn" data-act="remove" aria-label="Remove set ${i + 1}">✕</button>
  </div>`;
}

export function render(root, ctx) {
  const { state } = ctx;
  const a = state.active;
  const entry = a?.entries.find((e) => e.exerciseId === ctx.params.id);
  if (!entry) {
    location.replace(a ? "#/workout" : "#/today");
    return;
  }
  const ex = ctx.lookup(entry.exerciseId);
  const item = itemFor(state, entry.exerciseId);
  const hasPhotos = !!ex && ex.images === 2;
  const showPhotos = hasPhotos && state.settings.showPhotos;
  const prev = lastSets(state, entry.exerciseId);
  const adv = advice(prev, item);
  const hist = exerciseHistory(state.sessions, entry.exerciseId).filter(
    (x) => x.sets.length,
  );
  const tags = ex
    ? [ex.primary, ...ex.secondary]
    : [entry.primary].filter(Boolean);
  const base = `./img/ex/${encodeURIComponent(entry.exerciseId)}`;

  root.innerHTML = `<div class="row topbar">
      <a class="back" href="#/workout">‹ ${esc(a.workoutName)}</a>
      ${hasPhotos ? `<button class="link-btn" data-act="photos">${showPhotos ? "Hide picture" : "Show picture"}</button>` : ""}
    </div>
    <h1 class="title">${esc(entry.name)}</h1>
    <div class="tags">${tags.map((m) => `<span class="tag">${esc(m)}</span>`).join(" ")}</div>
    ${showPhotos ? `<div class="photo"><img class="a" src="${base}/0.jpg" alt="" loading="lazy" /><img class="b" src="${base}/1.jpg" alt="" loading="lazy" /></div>` : ""}
    <section class="card">
      <h3 style="margin-top:0">Last time${hist.length ? ` · ${esc(fmtDate(hist[hist.length - 1].startedAt))}` : ""}</h3>
      ${prev ? `<div class="last-sets">${esc(lastText(prev))}</div>` : ""}
      <div class="${adv.kind === "heavier" ? "up" : "muted"}">${esc(adv.message)}</div>
    </section>
    <section class="card">
      <div class="set set-head muted small"><span></span><span>kg</span><span>Reps</span><span></span><span></span></div>
      ${entry.sets.map(setHtml).join("")}
      <button class="btn" data-act="add" style="margin:8px 0 0">+ Add set</button>
    </section>
    <a class="btn btn-primary" href="#/workout">Done, back to list</a>`;

  // A tap on a button can land after an input's change event has already re-rendered the page
  // and swallowed the click. While a button is being pressed, input edits are kept in memory
  // and saved by the click (or flushed if the press turns into a scroll).
  let pressing = false;
  let dirty = false;
  let pressTimer = 0;
  const persist = () => {
    dirty = false;
    ctx.save();
  };
  const endPress = () => {
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressing = false;
      if (dirty) persist();
    }, 600);
  };
  for (const type of ["pointerdown", "mousedown", "touchstart"]) {
    root.addEventListener(
      type,
      (e) => {
        if (e.target.closest("button, a")) {
          pressing = true;
          clearTimeout(pressTimer);
        }
      },
      { passive: true },
    );
  }
  root.addEventListener("pointercancel", () => {
    pressing = false;
    if (dirty) persist();
  });
  root.addEventListener("pointerup", endPress);
  root.addEventListener("mouseup", endPress);

  const readRow = (row) => {
    const w = parseNum(row.querySelector('[data-f="weight"]').value);
    const r = parseNum(row.querySelector('[data-f="reps"]').value);
    return { weight: w, reps: Number.isInteger(r) ? r : null };
  };

  root.addEventListener("change", (e) => {
    const row = e.target.closest(".set");
    const s = row && entry.sets[Number(row.dataset.i)];
    if (!s || !e.target.dataset.f) return;
    Object.assign(s, readRow(row));
    if (s.done && !validSet(s.weight, s.reps)) s.done = false;
    if (pressing) dirty = true;
    else persist();
  });

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act], a");
    if (!t) return;
    pressing = false;
    clearTimeout(pressTimer);
    const act = t.dataset.act;
    if (!act) {
      if (dirty) persist(); // plain links navigate on their own
      return;
    }
    const row = t.closest(".set");
    const i = row ? Number(row.dataset.i) : -1;
    const s = entry.sets[i];
    if (act === "photos") {
      state.settings.showPhotos = !state.settings.showPhotos;
    } else if (act === "add") {
      const last = entry.sets[entry.sets.length - 1];
      entry.sets.push(
        last
          ? { weight: last.weight, reps: last.reps, done: false }
          : { weight: null, reps: item.repMin, done: false },
      );
    } else if (act === "remove") {
      if (
        s.done &&
        !(await confirmSheet(`Remove confirmed set ${i + 1}?`, "Remove"))
      ) {
        if (dirty) persist();
        return;
      }
      entry.sets.splice(i, 1);
    } else if (act === "confirm") {
      if (s.done) {
        s.done = false;
      } else {
        const v = readRow(row); // read the inputs now: blur may not have fired yet
        if (!validSet(v.weight, v.reps)) {
          row.classList.add("bad");
          row.classList.remove("shake");
          void row.offsetWidth;
          row.classList.add("shake");
          row
            .querySelector(
              v.weight == null ? '[data-f="weight"]' : '[data-f="reps"]',
            )
            .focus();
          if (dirty) endPress(); // keep the shake visible, save a moment later
          return;
        }
        Object.assign(s, v, { done: true });
      }
    } else return;
    persist();
  });
}
