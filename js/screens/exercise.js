import {
  advice,
  exerciseHistory,
  isPersonalBest,
  stuckNote,
  parseNum,
  gymPlates,
  plateRule,
  plateText,
  validSet,
} from "../logic.js";
import { confirmSheet, esc, fmtDate, fmtKg, howtoHtml, photoHtml } from "../ui.js";
import { deleteMedia, getMedia, saveMedia } from "../media.js";
import { itemFor, lastSets, lastText } from "./workout.js";
import { cancelRest, startRest } from "../rest.js";

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
    row
      .querySelector(".confirm")
      .setAttribute("aria-pressed", String(!!s.done));
  }
  paintBadges();
}

// The plate line follows the first unconfirmed set (the last set when all are done).
// Only its own element changes, never the inputs.
function paintPlates() {
  const el = current?.root.querySelector("[data-plates]");
  if (!el) return;
  const rows = [...current.root.querySelectorAll(".set[data-i]")];
  const row =
    rows.find((r) => !current.entry.sets[Number(r.dataset.i)]?.done) ??
    rows.at(-1);
  const w = row ? parseNum(row.querySelector('[data-f="weight"]').value) : null;
  const text = w ? plateText(w, current.rule.empty, gymPlates(current.ctx.state.settings)) : "";
  el.hidden = !text;
  el.textContent = text;
  el.setAttribute("aria-label", text.replaceAll(" + ", ", "));
}

// "New best" badges follow the typed values. Only the badge elements change, never the inputs.
function paintBadges() {
  if (!current?.root.isConnected) return;
  paintPlates();
  const { root, entry, past } = current;
  for (const row of root.querySelectorAll(".set[data-i]")) {
    const s = entry.sets[Number(row.dataset.i)];
    if (!s) continue;
    const t = applyInputs(
      s,
      row.querySelector('[data-f="weight"]').value,
      row.querySelector('[data-f="reps"]').value,
    );
    const badge = row.nextElementSibling?.matches(".pb")
      ? row.nextElementSibling
      : null;
    const want = t.done && isPersonalBest(past, t);
    if (want && !badge) row.insertAdjacentHTML("afterend", pbHtml);
    else if (!want && badge) badge.remove();
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

// Object URL of the custom exercise's photo or video; revoked when replaced or the screen goes.
let mediaUrl = null;
const revokeMedia = () => {
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = null;
};
if (typeof window !== "undefined")
  window.addEventListener("hashchange", revokeMedia);

// The set just confirmed: a second tap within 400 ms is a double-tap, not an undo.
let justConfirmed = null;

const val = (n) => (n == null ? "" : fmtKg(n));

export const pbHtml = `<div class="pb" role="note"><span aria-hidden="true">★</span> New best</div>`;

function setHtml(s, i, past) {
  return `<div class="set${s.done ? " done" : ""}" data-i="${i}">
    <span class="set-n">${i + 1}</span>
    <input data-f="weight" inputmode="decimal" enterkeyhint="next" placeholder="kg" aria-label="Set ${i + 1} weight in kg" value="${esc(val(s.weight))}" />
    <input data-f="reps" inputmode="numeric" enterkeyhint="done" placeholder="reps" aria-label="Set ${i + 1} reps" value="${esc(s.reps ?? "")}" />
    <button class="confirm" data-act="confirm" aria-pressed="${!!s.done}" aria-label="${s.done ? "Unconfirm" : "Confirm"} set ${i + 1}">✓</button>
    <button class="icon-btn" data-act="remove" aria-label="Remove set ${i + 1}">✕</button>
  </div>${s.done && isPersonalBest(past, s) ? pbHtml : ""}`;
}

// Only this section is redrawn when sets change, so the photo is never touched.
const setsInner = (
  entry,
  past,
) => `<div class="set set-head muted small"><span></span><span>kg</span><span>Reps</span><span></span><span></span></div>
      ${entry.sets.map((s, i) => setHtml(s, i, past)).join("")}
      <button class="btn" data-act="add" style="margin:8px 0 0">+ Add set</button>`;

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
  const hasPhotos = !!ex && ex.images > 0;
  const showPhotos = hasPhotos && state.settings.showPhotos;
  const prev = lastSets(state, entry.exerciseId);
  const adv = advice(prev, item, ex, state.settings);
  const hist = exerciseHistory(state.sessions, entry.exerciseId).filter(
    (x) => x.sets.length,
  );
  const stuck = stuckNote(hist.map((h) => h.sets), adv, state.settings);
  const past = hist.flatMap((h) => h.sets);
  const tags = ex
    ? [ex.primary, ...ex.secondary]
    : [entry.primary].filter(Boolean);
  const rule = plateRule(item, ex);
  const isCustom = entry.exerciseId.startsWith("custom-");
  revokeMedia();

  root.innerHTML = `<div class="row topbar">
      <a class="back" href="#/workout">‹ ${esc(a.workoutName)}</a>
      <span class="row">${ex?.howto ? `<button class="link-btn" data-act="howto">${state.settings.showHowTo === true ? "Hide how-to" : "Show how-to"}</button>` : ""}
      ${hasPhotos || isCustom ? `<button class="link-btn" data-act="photos"${hasPhotos ? "" : " hidden"}>${state.settings.showPhotos ? "Hide picture" : "Show picture"}</button>` : ""}</span>
    </div>
    <h1 class="title">${esc(entry.name)}</h1>
    <div class="tags">${tags.map((m) => `<span class="tag">${esc(m)}</span>`).join(" ")}</div>
    ${showPhotos ? photoHtml(ex) : ""}
    ${howtoHtml(ex, state.settings)}
    ${isCustom ? `<div data-media></div>` : ""}
    <section class="card">
      <h3 style="margin-top:0">Last time${hist.length ? ` · ${esc(fmtDate(hist[hist.length - 1].startedAt))}` : ""}</h3>
      ${prev ? `<div class="last-sets">${esc(lastText(prev))}</div>` : ""}
      ${adv.message ? `<div class="advice ${adv.kind === "heavier" ? "up" : "muted"}">${esc(adv.message)}</div>` : ""}
      ${stuck ? `<div class="muted small" role="note">${esc(stuck)}</div>` : ""}
      ${rule.on ? `<div class="muted small" role="note" data-plates hidden></div>` : ""}
    </section>
    <section class="card" data-sets>${setsInner(entry, past)}</section>
    <a class="btn btn-primary" href="#/workout">Done, back to list</a>`;

  current = { root, entry, ctx, past, rule };
  paintPlates();

  // Only the media area is redrawn, so typed set values are never disturbed.
  const mediaBox = root.querySelector("[data-media]");
  let mediaGen = 0;
  async function drawMedia() {
    const gen = ++mediaGen;
    const m = await getMedia(entry.exerciseId);
    if (gen !== mediaGen || !root.isConnected) return;
    revokeMedia();
    if (m) mediaUrl = URL.createObjectURL(m.blob);
    root.querySelector('.topbar [data-act="photos"]').hidden = !m;
    const shown = m && state.settings.showPhotos;
    mediaBox.innerHTML = `${shown ? `<div class="photo">${m.kind === "video" ? `<video src="${mediaUrl}" controls playsinline muted loop preload="metadata"></video>` : `<img src="${mediaUrl}" alt="" />`}</div>` : ""}
      <div class="row media-ctl">
        <label class="btn file-btn grow">${m ? "Change" : "Add photo or video"}<input type="file" data-media accept="image/*,video/*" /></label>
        ${m ? `<button class="btn grow" data-act="media-remove">Remove</button>` : ""}
      </div>`;
  }
  if (mediaBox) drawMedia();

  root.addEventListener("input", (e) => e.target.dataset.f && paintBadges());

  // Typing saves on change without redrawing, so a tap that blurred the field is never lost.
  root.addEventListener("change", async (e) => {
    if (e.target.dataset.media !== undefined) {
      syncAll();
      ctx.save({ render: false });
      const f = e.target.files[0];
      if (f && (await saveMedia(entry.exerciseId, f))) drawMedia();
      return;
    }
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
    } else if (act === "howto") {
      state.settings.showHowTo = state.settings.showHowTo !== true;
    } else if (act === "media-remove") {
      if (await confirmSheet("Remove this photo or video?", "Remove")) {
        await deleteMedia(entry.exerciseId);
        drawMedia();
      }
      ctx.save({ render: false });
      return;
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
      if (
        s.done &&
        justConfirmed?.s === s &&
        Date.now() - justConfirmed.at < 400
      )
        return;
      if (s.done) {
        s.done = false;
        cancelRest(ctx);
      } else if (validSet(s.weight, s.reps)) {
        s.done = true;
        justConfirmed = { s, at: Date.now() };
        startRest(ctx, item);
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
    if (act === "photos" || act === "howto") {
      ctx.save(); // the picture appears or disappears: redraw the whole screen
      return;
    }
    root.querySelector("[data-sets]").innerHTML = setsInner(entry, past);
    paintPlates();
    ctx.save({ render: false });
  });
}
