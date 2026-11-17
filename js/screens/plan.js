import { GOALS, MUSCLES } from "../constants.js";
import { PLATE_SIZES, gymPlates, parseNum, plateRule } from "../logic.js";
import { blankWorkouts } from "../proposal.js";
import { applyGoal, deleteCustomExercise, newItem } from "../session.js";
import { exportCsv, exportJson } from "../store.js";
import { buildFullBackup, fmtSize, readBackup } from "../backup.js";
import { openPicker } from "../picker.js";
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
import { runningVersion } from "../update.js";

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

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

function itemHtml(it, ctx, i, n) {
  const ex = ctx.lookup(it.exerciseId);
  const rule = plateRule(it, ex);
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
    <label class="setting">Uses plates
      <input type="checkbox" data-field="uses"${rule.on ? " checked" : ""} />
    </label>
    ${rule.on ? `<div class="setting">Empty weight (bar or sled, before plates)
      <span class="rest-in"><input data-field="emptyKg" inputmode="decimal" aria-label="Empty weight in kg" value="${esc(fmtKg(rule.empty))}" /> kg</span>
    </div>` : ""}
  </li>`;
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
    `<div class="row">
      <input class="name-input grow" data-field="wname" value="${esc(w.name)}" aria-label="Workout name" maxlength="40" />
      <button class="icon-btn" data-act="w-up" aria-label="Move workout up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="icon-btn" data-act="w-down" aria-label="Move workout down"${i === n - 1 ? " disabled" : ""}>↓</button>
      <button class="icon-btn warn" data-act="w-del" aria-label="Delete workout">✕</button>
    </div>
    <div class="chips">${MUSCLES.map(
      (m) =>
        `<button class="chip" data-act="w-muscle" data-m="${esc(m)}" aria-pressed="${w.muscles.includes(m)}">${esc(m)}</button>`,
    ).join("")}</div>
    <ul class="items">${w.items.map((it, j) => itemHtml(it, ctx, j, k)).join("") || `<li class="empty muted">No exercises yet. Add one below.</li>`}</ul>
    <button class="btn" data-act="add-ex">+ Add exercise</button>`,
    {
      count: k ? `${k} ${k === 1 ? "exercise" : "exercises"}` : "no exercises",
      attrs: ` data-w="${esc(w.id)}"`,
    },
  );
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
      <p class="muted small" style="margin-top:8px">New exercises use ${GOALS[settings.goal].repMin}–${GOALS[settings.goal].repMax} reps.</p>`;
  root.innerHTML = `<h1 class="title">Plan</h1>
    ${state.workouts.map((w, i) => workoutHtml(w, ctx, i, state.workouts.length)).join("") || `<section class="card empty"><b>No workouts yet.</b><p class="muted">Add a workout below, or redo the setup to get a proposed plan.</p></section>`}
    <button class="btn" data-act="add-workout">+ Add workout</button>
    <a class="card weight-card" href="#/help"><span>How to use this app</span><span class="muted small">Short guide</span></a>
    ${section("g:goal", "Goal", goalHtml)}
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
      `<label class="setting">Show exercise photos
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
      <div class="setting-group" id="rest-sound" role="group" aria-label="Rest-over sound">${soundHtml()}</div>`,
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
      <p class="muted small" id="app-version">${versionText}</p>`,
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
          {
            exclude: new Set(w.items.map((it) => it.exerciseId)),
            muscles: w.muscles,
          },
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
    else if (field === "plate")
      settings.plates = PLATE_SIZES.filter((k) =>
        k === Number(t.dataset.kg) ? t.checked : gymPlates(settings).includes(k),
      );
    else if (field === "uses") {
      const { w, xi } = findIn(ctx.state, t);
      if (w?.items[xi]) w.items[xi].plates = t.checked;
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

const EDITABLE = new Set(["wname", "sets", "repMin", "repMax", "step", "emptyKg"]);

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
    <p class="muted small">Your sound plays while the app is open. Notifications use the iPhone's own sound. It is only in the full backup.</p>`;
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
  if (
    !(await confirmSheet(
      "Replace all your data with this backup? This cannot be undone." +
        (ctx.state.active ? " The workout in progress will be lost." : ""),
      "Replace everything",
    ))
  )
    return;
  // Data first: it is the part that can fail on a full phone, and nothing else is touched until it is saved.
  current = null; // the old screen's fields must not be copied into the imported data
  const previous = ctx.state;
  ctx.state = imported;
  if (!(await ctx.save({ render: false }))) {
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
