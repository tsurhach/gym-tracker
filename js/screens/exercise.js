import { advice, exerciseHistory, parseNum, validSet } from "../logic.js";
import { confirmSheet, esc, fmtDate, fmtKg } from "../ui.js";
import { itemFor, lastSets, lastText } from "./workout.js";

// Pure: a set plus the two input texts gives the updated set. A confirmed set whose
// values are no longer valid becomes unconfirmed; weight may stay null while unconfirmed.
export function applyInputs(set, weightText, repsText) {
  const reps = parseNum(repsText);
  const next = {
    ...set,
    weight: parseNum(weightText),
    reps: Number.isInteger(reps) ? reps : null,
  };
  if (next.done && !validSet(next.weight, next.reps)) next.done = false;
  return next;
}

// The screen currently showing; the page-hide listeners below read it.
let current = null;

// Copy every row's typed values into the sets. iOS taps do not blur the input,
// so no change event can be relied on.
function syncAll() {
  if (!current?.root.isConnected) return;
  const { root, entry } = current;
  for (const row of root.querySelectorAll(".set[data-i]")) {
    const s = entry.sets[Number(row.dataset.i)];
    if (!s) continue;
    Object.assign(
      s,
      applyInputs(
        s,
        row.querySelector('[data-f="weight"]').value,
        row.querySelector('[data-f="reps"]').value,
      ),
    );
    row.classList.toggle("done", !!s.done);
    row.querySelector(".confirm").setAttribute("aria-pressed", String(!!s.done));
  }
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

// The photo flip element is kept across renders (logging a set redraws the screen),
// so its cross-fade never restarts. Keyed by exercise.
let photo = null;
// The set just confirmed: a second tap within 400 ms is a double-tap, not an undo.
let justConfirmed = null;

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
    ${showPhotos ? `<div class="photo"><img class="a" src="${base}/0.jpg" alt="" /><img class="b" src="${base}/1.jpg" alt="" /></div>` : ""}
    <section class="card">
      <h3 style="margin-top:0">Last time${hist.length ? ` · ${esc(fmtDate(hist[hist.length - 1].startedAt))}` : ""}</h3>
      ${prev ? `<div class="last-sets">${esc(lastText(prev))}</div>` : ""}
      <div class="advice ${adv.kind === "heavier" ? "up" : "muted"}">${esc(adv.message)}</div>
    </section>
    <section class="card">
      <div class="set set-head muted small"><span></span><span>kg</span><span>Reps</span><span></span><span></span></div>
      ${entry.sets.map(setHtml).join("")}
      <button class="btn" data-act="add" style="margin:8px 0 0">+ Add set</button>
    </section>
    <a class="btn btn-primary" href="#/workout">Done, back to list</a>`;

  const slot = root.querySelector(".photo");
  if (!slot) photo = null;
  else if (photo?.id === entry.exerciseId) slot.replaceWith(photo.el);
  else photo = { id: entry.exerciseId, el: slot };

  current = { root, entry, ctx };

  // Typing saves on change without redrawing, so a tap that blurred the field is never lost.
  root.addEventListener("change", (e) => {
    if (!e.target.dataset.f) return;
    syncAll();
    ctx.save({ render: false });
  });

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act], a");
    if (!t) return;
    syncAll();
    const act = t.dataset.act;
    if (!act) {
      ctx.save({ render: false }); // plain links navigate on their own
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
        ctx.save({ render: false });
        return;
      }
      entry.sets.splice(i, 1);
    } else if (act === "confirm") {
      if (s.done && justConfirmed?.s === s && Date.now() - justConfirmed.at < 400)
        return;
      if (s.done) {
        s.done = false;
      } else if (validSet(s.weight, s.reps)) {
        s.done = true;
        justConfirmed = { s, at: Date.now() };
      } else {
        row.classList.add("bad");
        row.classList.remove("shake");
        void row.offsetWidth;
        row.classList.add("shake");
        row
          .querySelector(
            s.weight == null ? '[data-f="weight"]' : '[data-f="reps"]',
          )
          .focus();
        ctx.save({ render: false });
        return;
      }
    } else return;
    ctx.save();
  });
}
