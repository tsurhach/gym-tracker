// Rest timer: one bar fixed to the bottom of the page, outside the per-render screen root.
import * as push from "./push.js";
import { ltr, ltrText, t } from "./i18n/index.js";
import { deleteBlob, getBlob, putBlob, SOUND_KEY } from "./media.js";

// State lives in state.active.rest = { endsAt, total } (ms timestamp, seconds) so it survives a kill.
// Everything is drawn from endsAt vs Date.now(), never from counting ticks (iOS freezes timers in the background).
// Hook for a future server push: set in startRest() and adjust (click handler in build()); cleared in clear().
// push.schedule(endsAt) / push.cancel() are already called at exactly those points.

export const DEFAULT_REST = 90;
const OVER_MS = 5000; // how long "Rest over" stays
const PUSH_CUT_MS = 3000; // visible this close to the end: the bar is enough, drop the push
const MAX_REST = 3600; // longest rest you can set: 60 minutes
const LATE_MS = 3000; // noticed this long after the end: show "Rest over", do not blast a late sound

// A rest that ended more than LATE_MS ago is only shown, never sounded.
export const isLate = (endsAt, now) => now - endsAt > LATE_MS;

// Minutes and seconds as typed -> whole seconds, 0..3600. Blank or junk counts as 0;
// seconds above 59 carry into minutes simply by being added.
export const parseRest = (minText, secText) => {
  const n = (t) => {
    const v = parseInt(String(t ?? "").trim(), 10);
    return v > 0 ? v : 0;
  };
  return Math.min(MAX_REST, n(minText) * 60 + n(secText));
};

// When "Rest over" goes away: normally OVER_MS after it ended; if we only notice later
// (back from the background), OVER_MS from now.
export const overDeadline = (endsAt, now) =>
  now >= endsAt + OVER_MS ? now + OVER_MS : endsAt + OVER_MS;

// Seconds to rest from settings: missing -> 90, 0 -> off.
// An exercise's own restSec (0..3600) wins over the setting.
export const restLength = (settings, item) =>
  Number.isFinite(item?.restSec) && item.restSec >= 0 && item.restSec <= MAX_REST
    ? item.restSec
    : Number.isFinite(settings?.restSeconds)
      ? settings.restSeconds
      : DEFAULT_REST;

export const remaining = (endsAt, now) =>
  Math.max(0, Math.ceil((endsAt - now) / 1000));

export const fmtRest = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// +/- seconds on this rest only; never ends before now.
export const adjust = (rest, delta, now) => ({
  endsAt: Math.max(now, rest.endsAt + delta * 1000),
  total: Math.max(1, rest.total + delta),
});

export const MAX_SOUND_SECONDS = 6;
// How long a custom sound plays: its own length, at most 6 s.
export const playSeconds = (duration) =>
  Math.min(
    MAX_SOUND_SECONDS,
    Number.isFinite(duration) && duration > 0 ? duration : 0,
  );

// ---- DOM part (only runs in the browser) ----
let ctx = null;
let route = "";
let bar = null;
let timer = 0;
let lock = null;
let audio = null;
let beepedFor = 0; // endsAt that already beeped (or must not beep)
let graceFor = 0; // endsAt whose "Rest over" was first seen late, on return
let graceUntil = 0;
let pushed = false; // a "Rest over" push is scheduled on the server for the current rest

const SHOWN_ON = new Set(["workout", "exercise"]);
const rest = () => ctx?.state.active?.rest;
const save = () => ctx.save({ render: false });
const notify = () => ctx?.state.settings?.notifyRest === true;

// Keep the server's alert in step with the rest. Never redraws or waits.
function schedulePush(r) {
  if (!notify()) return;
  if (r.endsAt - Date.now() <= PUSH_CUT_MS) return cancelPush();
  pushed = true;
  push.schedule(r.endsAt);
}
function cancelPush() {
  if (!pushed) return;
  pushed = false;
  push.cancel();
}

function build() {
  bar = document.createElement("div");
  bar.id = "rest";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", t("rest.timer"));
  bar.innerHTML = `<div class="rest-prog"><i></i></div>
    <div class="rest-row">
      <div class="rest-time" aria-live="off">0:00</div>
      <div class="rest-msg" aria-live="polite"></div>
      <div class="rest-btns">
        <button type="button" data-d="-15">${ltr(t("rest.minus15"))}</button>
        <button type="button" data-d="15">${ltr(t("rest.plus15"))}</button>
        <button type="button" data-d="0">${t("rest.skip")}</button>
      </div>
    </div>`;
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !rest()) return;
    const d = Number(b.dataset.d);
    if (d) {
      ctx.state.active.rest = adjust(rest(), d, Date.now());
      schedulePush(rest());
    } else clear();
    save();
    tick();
  });
  document.body.append(bar);
}

async function wake(on) {
  try {
    if (on) {
      if (!lock || lock.released)
        lock = await navigator.wakeLock?.request("screen");
      if (!rest()) wake(false); // ended while the request was pending
    } else {
      await lock?.release();
      lock = null;
    }
  } catch {} // unsupported or refused: the screen may sleep, nothing else changes
}

// Chime context. Creating it is allowed anywhere; resuming needs a tap (see unlock).
function context() {
  return (audio ??= new (window.AudioContext || window.webkitAudioContext)());
}

// The user's own sound, decoded; null -> play the chime.
let custom = null;
let loadId = 0;
export async function loadCustom() {
  const id = ++loadId;
  custom = null;
  try {
    const blob = await getBlob(SOUND_KEY);
    if (!blob) return;
    const buf = await context().decodeAudioData(await blob.arrayBuffer());
    if (id === loadId) custom = buf;
  } catch {} // undecodable or no IndexedDB: the chime plays
}

// Call inside a tap: iOS only lets audio start from one.
function unlock() {
  try {
    // iOS 17+: let the sound mix with the user's music instead of pausing it.
    if (navigator.audioSession) navigator.audioSession.type = "ambient";
  } catch {}
  try {
    const a = context();
    a.resume?.();
    // A silent blip started inside the tap is what really unlocks iOS audio.
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(a.destination);
    src.start(0);
    if (!custom) loadCustom();
  } catch {}
}

// iOS suspends the context when the screen locks or the app is backgrounded; any tap or the return wakes it.
function wakeAudio() {
  try {
    if (audio && audio.state !== "running") audio.resume?.();
  } catch {}
}

// Save (blob) or remove (null) the custom sound. Resolves true when it is saved and playable.
export async function setCustomSound(blob) {
  try {
    // Decode first: an unplayable file must not replace a working sound.
    const buf = blob
      ? await context().decodeAudioData(await blob.arrayBuffer())
      : null;
    if (blob) await putBlob(SOUND_KEY, blob);
    else await deleteBlob(SOUND_KEY);
    loadId++; // a load still in flight must not overwrite this
    custom = buf;
    return true;
  } catch {
    return false;
  }
}

// Tap on "Test": plays the current sound, like the end of a rest.
export async function testSound() {
  unlock();
  if (!custom) await loadCustom();
  play();
}

function chime() {
  // Owner-tuned: a square wave was irritating, a quiet beep was lost under music.
  // A rising three-note chime of pure tones with a soft start and a fading tail.
  [784, 988, 1175].forEach((hz, i) => {
    const t = audio.currentTime + i * 0.4;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = hz; // sine by default
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.93, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.52);
  });
}

function play() {
  try {
    context(); // reloaded mid-rest: there is no context yet
    if (!audio) return;
    if (custom) {
      try {
        const d = playSeconds(custom.duration);
        const t = audio.currentTime;
        const src = audio.createBufferSource();
        const g = audio.createGain();
        src.buffer = custom;
        const vol = 1.15; // owner-tuned: recordings come out quiet
        g.gain.setValueAtTime(vol, t);
        if (custom.duration > d) {
          g.gain.setValueAtTime(vol, t + d - 0.2); // cut at 6 s with a short fade
          g.gain.linearRampToValueAtTime(0, t + d);
        }
        src.connect(g).connect(audio.destination);
        src.start(t);
        src.stop(t + d);
        return;
      } catch {} // fall through to the chime
    }
    chime();
  } catch {}
}

// Once, while visible. A suspended context is resumed first (its clock is frozen, so a sound
// scheduled on it would play late); if that takes too long the end is only shown.
async function beep(endsAt) {
  try {
    navigator.vibrate?.(200);
  } catch {}
  try {
    const a = context();
    if (a.state !== "running")
      await Promise.race([a.resume(), new Promise((r) => setTimeout(r, 800))]);
  } catch {}
  if (isLate(endsAt, Date.now())) return;
  play();
}

// Drop the rest from state (the caller saves) and stop everything that runs for it.
function clear() {
  if (ctx?.state.active) delete ctx.state.active.rest;
  stop();
}
function stop() {
  clearInterval(timer);
  timer = 0;
  cancelPush();
  wake(false);
  paint();
}

function tick() {
  const r = rest();
  if (!r) return stop();
  if (document.hidden) return; // away: keep the rest so the return can show it
  const now = Date.now();
  if (pushed && r.endsAt - now <= PUSH_CUT_MS) cancelPush(); // page is visible: no alert
  if (now >= (graceFor === r.endsAt ? graceUntil : r.endsAt + OVER_MS)) {
    clear();
    return save();
  }
  if (now >= r.endsAt && beepedFor !== r.endsAt) {
    beepedFor = r.endsAt;
    if (!isLate(r.endsAt, now)) beep(r.endsAt);
  }
  paint();
}

function paint() {
  if (!bar) return;
  const r = rest();
  const show = !!r && SHOWN_ON.has(route);
  bar.hidden = !show;
  document.body.classList.toggle("resting", show);
  if (!show) return;
  const now = Date.now();
  const left = remaining(r.endsAt, now);
  const over = left === 0;
  bar.classList.toggle("over", over);
  bar.querySelector(".rest-time").textContent = ltrText(fmtRest(left));
  bar.querySelector(".rest-msg").textContent = over ? t("rest.over") : "";
  bar.querySelector("i").style.transform =
    `scaleX(${Math.min(1, Math.max(0, (r.endsAt - now) / (r.total * 1000)))})`;
}

function run() {
  if (!timer) timer = setInterval(tick, 250);
  wake(true);
}

// Back in the foreground (visibilitychange, pageshow, focus): re-read the clock and repaint now.
// A rest that ended while away shows "Rest over" for OVER_MS from now, without a late beep.
function resume() {
  const r = rest();
  if (!r) return;
  const now = Date.now();
  wakeAudio();
  if (graceFor !== r.endsAt && now >= r.endsAt + OVER_MS) {
    graceFor = r.endsAt;
    graceUntil = overDeadline(r.endsAt, now);
  }
  clearInterval(timer); // a frozen interval may never fire again: start a fresh one
  timer = 0;
  run();
  tick();
}

// Called by the shell after every render.
export function sync(name, shellCtx) {
  ctx = shellCtx;
  route = name;
  if (!bar) {
    build();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume();
    });
    // iOS standalone does not always fire visibilitychange.
    window.addEventListener("pageshow", (e) => e.persisted && resume());
    window.addEventListener("focus", resume);
    document.addEventListener("pointerdown", wakeAudio, { capture: true, passive: true });
  }
  const r = rest();
  if (pushed && (!notify() || !restLength(ctx.state.settings))) cancelPush();
  if (r && !timer) {
    pushed = notify(); // reloaded mid-rest: a push may be waiting on the server; cancel is harmless
    wakeAudio();
    run();
  }
  if (!r && timer) stop();
  tick();
}

// Call inside the set-confirm tap: iOS only lets audio start from a tap.
export function startRest(shellCtx, item) {
  ctx = shellCtx;
  const len = restLength(ctx.state.settings, item);
  if (!len || !ctx.state.active) return;
  unlock();
  ctx.state.active.rest = { endsAt: Date.now() + len * 1000, total: len };
  schedulePush(rest());
  run();
  paint();
}

// Un-ticked a set: the caller saves.
export function cancelRest(shellCtx) {
  ctx = shellCtx;
  clear();
}
