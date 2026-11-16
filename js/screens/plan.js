import { GOALS, MUSCLES } from "../constants.js";
import { parseNum } from "../logic.js";
import { blankWorkouts } from "../proposal.js";
import { applyGoal, deleteCustomExercise, newItem } from "../session.js";
import { exportJson, importJson } from "../store.js";
import { openPicker } from "../picker.js";
import { checkSound, deleteMedia, getBlob, SOUND_KEY } from "../media.js";
import { MAX_SOUND_SECONDS, parseRest, restLength, setCustomSound, testSound } from "../rest.js";
import * as push from "../push.js";
import { confirmSheet, esc, fmtKg, showBanner } from "../ui.js";
import { runningVersion } from "../update.js";

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

let versionText = ""; // last known, so a redraw does not blank the line

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
    ${state.customExercises.length ? `<section class="card">
      <h2>Your exercises</h2>
      <ul class="items">${state.customExercises.map((c) => `<li class="item"><div class="row">
        <div class="grow"><div class="ex-name">${esc(c.name)}</div><span class="tag">${esc(c.primary)}</span></div>
        <button class="btn" data-act="cx-del" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">Delete</button>
      </div></li>`).join("")}</ul>
    </section>` : ""}
    <section class="card">
      <h2>Settings</h2>
      <label class="setting">Show exercise photos
        <input type="checkbox" data-field="showPhotos"${settings.showPhotos ? " checked" : ""} />
      </label>
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
      <button class="btn" data-act="export">Export backup</button>
      <p class="muted small">Photos and videos you added to custom exercises are not part of the backup.</p>
      <label class="btn file-btn">Import backup
        <input type="file" data-field="import" accept="application/json,.json" />
      </label>
      <p class="muted small" id="app-version">${versionText}</p>
    </section>`;
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
    }
    else if (field === "restMin" || field === "restSec") syncRest(ctx);
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
const snd = { custom: false, rec: null, secs: 0, discard: false, tick: 0, cap: 0 };
const MIC_MSG =
  "Recording is not available. Allow the microphone for this app, or choose a saved audio file.";
const canRecord = () =>
  typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

function soundHtml() {
  return `<div class="row"><b class="grow">Rest-over sound</b><span class="muted small">${snd.custom ? "Your sound" : "Default chime"}</span></div>
    <div class="row">
      <button type="button" class="btn" data-snd="test">Test</button>
      <label class="btn file-btn">Choose audio<input type="file" accept="audio/*" data-snd="file" /></label>
      ${canRecord() ? `<button type="button" class="btn" data-snd="rec">${snd.rec ? `Stop ${snd.secs}s` : "Record"}</button>` : ""}
    </div>
    ${snd.custom ? `<button type="button" class="btn" data-snd="default">Use default chime</button>` : ""}
    <p class="muted small">Your sound plays while the app is open. Notifications use the iPhone's own sound. It is not part of the backup.</p>`;
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
  if (await confirmSheet("Go back to the default chime? Your sound will be deleted.", "Use default chime"))
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
    snd.cap = setTimeout(() => rec.state !== "inactive" && rec.stop(), MAX_SOUND_SECONDS * 1000);
    paintSound();
  } catch {
    stream?.getTracks().forEach((t) => t.stop());
    snd.rec = null;
    showBanner(MIC_MSG);
  }
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
