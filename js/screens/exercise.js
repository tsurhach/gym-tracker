import {
  advice,
  exerciseHistory,
  isPersonalBest,
  stuckNote,
  parseNum,
  gymPlates,
  muscleName,
  plateRule,
  plateText,
  validSet,
} from "../logic.js";
import { fmtDate, t, exTwo, exName } from "../i18n/index.js";
import {
  confirmSheet,
  esc,
  fmtKg,
  howtoHtml,
  photoHtml,
} from "../ui.js";
import { deleteMedia, getMedia, saveMedia } from "../media.js";
import { itemFor, lastSets, lastText } from "./workout.js";
import { cancelRest, startRest } from "../rest.js";
import { openSwap } from "../swapsheet.js";
import { afterSupersetSet, carryWeight, nextEntryId, supersetOf } from "../session.js";

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
  const n = root.querySelector("[data-note]");
  if (n) {
    const v = n.value.trim().slice(0, 200);
    if (v) entry.note = v;
    else delete entry.note;
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
  const text = w
    ? plateText(w, current.rule.empty, gymPlates(current.ctx.state.settings))
    : "";
  el.style.visibility = text ? "visible" : "hidden"; // keeps its height: no layout jump
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
    const cur = applyInputs(
      s,
      row.querySelector('[data-f="weight"]').value,
      row.querySelector('[data-f="reps"]').value,
    );
    const badge = row.nextElementSibling?.matches(".pb")
      ? row.nextElementSibling
      : null;
    const want = cur.done && isPersonalBest(past, cur);
    if (want && !badge) row.insertAdjacentHTML("afterend", pbHtml());
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

const base = new WeakMap();

const val = (n) => (n == null ? "" : fmtKg(n));

export const pbHtml = () => `<div class="pb" role="note"><span aria-hidden="true">🏆</span> ${t("exercise.newBest")}</div>`;

function setHtml(s, i, past, next) {
  return `<div class="set${s.done ? " done" : ""}${next ? " next" : ""}" data-i="${i}">
    <span class="set-n">${i + 1}</span>
    <input data-f="weight" inputmode="decimal" enterkeyhint="next" placeholder="${t("exercise.kg")}" aria-label="${t("exercise.setWeight", { n: i + 1 })}" value="${esc(val(s.weight))}" />
    <input data-f="reps" inputmode="numeric" enterkeyhint="done" placeholder="${t("exercise.repsPh")}" aria-label="${t("exercise.setReps", { n: i + 1 })}" value="${esc(s.reps ?? "")}" />
    <button class="confirm" data-act="confirm" aria-pressed="${!!s.done}" aria-label="${s.done ? t("exercise.unconfirmSet", { n: i + 1 }) : t("exercise.confirmSet", { n: i + 1 })}">✓</button>
    <button class="icon-btn" data-act="remove" aria-label="${t("exercise.removeSet", { n: i + 1 })}">✕</button>
  </div>${s.done && isPersonalBest(past, s) ? pbHtml() : ""}`;
}

// Only this section is redrawn when sets change, so the photo is never touched.
const setsInner = (
  entry,
  past,
) => `<div class="set set-head muted small"><span></span><span>${t("exercise.kg")}</span><span>${t("exercise.repsHead")}</span><span></span><span></span></div>
      ${entry.sets.map((s, i) => setHtml(s, i, past, i === entry.sets.findIndex((x) => !x.done))).join("")}
      <button class="btn" data-act="add" style="margin:8px 0 0">${t("exercise.addSet")}</button>`;

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
  const stuck = stuckNote(
    hist.map((h) => h.sets),
    adv,
    state.settings,
  );
  const past = hist.flatMap((h) => h.sets);
  const tags = ex
    ? [ex.primary, ...ex.secondary]
    : [entry.primary].filter(Boolean);
  const rule = plateRule(item, ex);
  const isCustom = entry.exerciseId.startsWith("custom-");
  revokeMedia();

  root.innerHTML = `<div class="row topbar">
      <a class="back" href="#/workout"><span class="flip">‹</span> ${esc(a.workoutName)}</a>
    </div>
    <h1 class="title">${exTwo(entry.exerciseId, entry.name)}</h1>
    <p class="muted" data-ss-line hidden></p>
    <div class="tags">${tags.map((m) => `<span class="tag">${esc(muscleName(m))}</span>`).join(" ")}</div>
    <div class="view-opts">
      ${hasPhotos || isCustom ? `<label class="check" data-photo-opt${hasPhotos ? "" : " hidden"}><input type="checkbox" data-act="photos"${state.settings.showPhotos ? " checked" : ""} /> ${t("exercise.showPicture")}</label>` : ""}
      ${ex?.howto ? `<label class="check"><input type="checkbox" data-act="howto"${state.settings.showHowTo === true ? " checked" : ""} /> ${t("exercise.showHowto")}</label>` : ""}
    </div>
    ${showPhotos ? photoHtml(ex) : ""}
    ${howtoHtml(ex, state.settings)}
    ${isCustom ? `<div data-media></div>` : ""}
    <section class="card">
      <h3 style="margin-top:0">${hist.length ? t("exercise.lastTimeDate", { date: esc(fmtDate(hist[hist.length - 1].startedAt)) }) : t("exercise.lastTime")}</h3>
      ${prev ? `<div class="last-sets">${esc(lastText(prev))}</div>` : ""}
      ${adv.message ? `<div class="advice ${adv.kind === "heavier" ? "up" : "muted"}">${esc(adv.message)}</div>` : ""}
      ${stuck ? `<div class="muted small" role="note">${esc(stuck)}</div>` : ""}
      ${rule.on ? `<div class="muted small" role="note" data-plates style="visibility:hidden"></div>` : ""}
      <input data-note dir="auto" maxlength="200" enterkeyhint="done" placeholder="${t("exercise.notePh")}" aria-label="${t("exercise.note")}" value="${esc(entry.note ?? "")}" style="margin-top:8px" />
    </section>
    <section class="card" data-sets>${setsInner(entry, past)}</section>
    <a class="btn btn-primary" href="#/workout" data-primary>${t("exercise.done")}</a>
    <button class="btn" data-act="swap" style="margin-top:var(--gap)">${t("exercise.swap")}</button>`;

  entry.sets.forEach((x) => base.set(x, x.weight));
  current = { root, entry, ctx, past, rule };
  paintPlates();

  // "Next: <exercise> ›" once every set here is ticked and another exercise still has open sets.
  function paintNext() {
    const link = root.querySelector("[data-primary]");
    const id = entry.sets.length && entry.sets.every((s) => s.done) ? nextEntryId(a, entry.exerciseId) : null;
    const nx = id && a.entries.find((e) => e.exerciseId === id);
    link.innerHTML = nx ? `${t("exercise.next", { name: esc(exName(nx.exerciseId, nx.name)) })} <span class="flip">›</span>` : t("exercise.done");
    link.setAttribute("href", nx ? `#/exercise/${encodeURIComponent(id)}` : "#/workout");
  }
  paintNext();

  // "Superset with Barbell Row · round 2 of 3"
  function paintSs() {
    const el = root.querySelector("[data-ss-line]");
    const g = supersetOf(a, entry.exerciseId);
    el.hidden = !g;
    if (!g) return;
    const others = g.ids
      .filter((id) => id !== entry.exerciseId)
      .map((id) => `<b>${esc(exName(id, a.entries.find((e) => e.exerciseId === id).name))}</b>`);
    const round = Math.min(entry.sets.filter((s) => s.done).length + 1, entry.sets.length);
    el.innerHTML = t("exercise.superset", { others: others.join(" + "), round, total: entry.sets.length });
  }
  paintSs();
  // Arriving mid-workout (superset partner, "Next"): bring the next set above the rest bar.
  if (entry.sets.some((s) => s.done) || supersetOf(a, entry.exerciseId))
    requestAnimationFrame(() => root.querySelector(".set.next")?.scrollIntoView({ block: "nearest" }));

  // Tapping a number box selects it, so typing replaces the value (the timeout beats iOS undoing it on release).
  root.addEventListener("focusin", (e) => {
    const inp = e.target;
    if (!inp.matches?.(".set input")) return;
    inp.select();
    setTimeout(() => inp.setSelectionRange(0, inp.value.length), 0);
  });

  // Only the media area is redrawn, so typed set values are never disturbed.
  const mediaBox = root.querySelector("[data-media]");
  let mediaGen = 0;
  async function drawMedia() {
    const gen = ++mediaGen;
    const m = await getMedia(entry.exerciseId);
    if (gen !== mediaGen || !root.isConnected) return;
    revokeMedia();
    if (m) mediaUrl = URL.createObjectURL(m.blob);
    const opt = root.querySelector("[data-photo-opt]");
    if (opt) opt.hidden = !m;
    const shown = m && state.settings.showPhotos;
    mediaBox.innerHTML = `${shown ? `<div class="photo">${m.kind === "video" ? `<video src="${mediaUrl}" controls playsinline muted loop preload="metadata"></video>` : `<img src="${mediaUrl}" alt="" />`}</div>` : ""}
      <div class="row media-ctl">
        <label class="btn file-btn grow">${m ? t("exercise.mediaChange") : t("exercise.mediaAdd")}<input type="file" data-media accept="image/*,video/*" /></label>
        ${m ? `<button class="btn grow" data-act="media-remove">${t("exercise.mediaRemove")}</button>` : ""}
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
    if (!e.target.dataset.f && e.target.dataset.note === undefined) return;
    syncAll();
    ctx.save({ render: false });
  });

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act], a");
    if (!btn) return;
    let goTo = null; // superset: the member to open after this tick
    syncAll();
    const act = btn.dataset.act;
    if (!act) {
      ctx.save({ render: false }); // plain links navigate on their own
      return;
    }
    const row = btn.closest(".set");
    const i = row ? Number(row.dataset.i) : -1;
    const s = entry.sets[i];
    if (act === "swap") {
      ctx.save({ render: false });
      return openSwap(ctx, entry);
    }
    if (act === "photos") {
      state.settings.showPhotos = !state.settings.showPhotos;
    } else if (act === "howto") {
      state.settings.showHowTo = state.settings.showHowTo !== true;
    } else if (act === "media-remove") {
      if (await confirmSheet(t("exercise.mediaRemoveAsk"), t("exercise.remove"))) {
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
        !(await confirmSheet(t("exercise.removeSetAsk", { n: i + 1 }), t("exercise.remove")))
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
        // base = each set's weight before the last carry: a change event may already have copied the typed one
        const old = base.get(s);
        if (old !== s.weight) carryWeight(entry.sets, i, old);
        entry.sets.forEach((x) => base.set(x, x.weight));
        justConfirmed = { s, at: Date.now() };
        const after = afterSupersetSet(a, entry.exerciseId);
        if (after.rest) startRest(ctx, item);
        if (after.goTo && after.goTo !== entry.exerciseId) goTo = after.goTo;
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
    paintNext();
    paintSs();
    if (act === "confirm") root.querySelector(".set.next")?.scrollIntoView({ block: "nearest" });
    ctx.save({ render: false });
    if (goTo) {
      const here = location.hash; // a moment later, so the tick is seen first; skipped if the user already left
      setTimeout(() => location.hash === here && ctx.go(`#/exercise/${encodeURIComponent(goTo)}`), 350);
    }
  });
}
