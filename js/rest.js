// Rest timer: one bar fixed to the bottom of the page, outside the per-render screen root.
// State lives in state.active.rest = { endsAt, total } (ms timestamp, seconds) so it survives a kill.

export const DEFAULT_REST = 90;
const OVER_MS = 5000; // how long "Rest over" stays
const MAX_REST = 3600; // longest rest you can set: 60 minutes

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
export const restLength = (settings) =>
  Number.isFinite(settings?.restSeconds) ? settings.restSeconds : DEFAULT_REST;

export const remaining = (endsAt, now) =>
  Math.max(0, Math.ceil((endsAt - now) / 1000));

export const fmtRest = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// +/- seconds on this rest only; never ends before now.
export const adjust = (rest, delta, now) => ({
  endsAt: Math.max(now, rest.endsAt + delta * 1000),
  total: Math.max(1, rest.total + delta),
});

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

const SHOWN_ON = new Set(["workout", "exercise"]);
const rest = () => ctx?.state.active?.rest;
const save = () => ctx.save({ render: false });

function build() {
  bar = document.createElement("div");
  bar.id = "rest";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Rest timer");
  bar.innerHTML = `<div class="rest-prog"><i></i></div>
    <div class="rest-row">
      <div class="rest-time" aria-live="off">0:00</div>
      <div class="rest-msg" aria-live="polite"></div>
      <div class="rest-btns">
        <button type="button" data-d="-15">−15s</button>
        <button type="button" data-d="15">+15s</button>
        <button type="button" data-d="0">Skip</button>
      </div>
    </div>`;
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !rest()) return;
    const d = Number(b.dataset.d);
    if (d) ctx.state.active.rest = adjust(rest(), d, Date.now());
    else clear();
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

function beep() {
  try {
    navigator.vibrate?.(200);
    if (!audio) return;
    for (const at of [0, 0.25]) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.2;
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + at);
      o.stop(audio.currentTime + at + 0.15);
    }
  } catch {}
}

// Drop the rest from state (the caller saves) and stop everything that runs for it.
function clear() {
  if (ctx?.state.active) delete ctx.state.active.rest;
  stop();
}
function stop() {
  clearInterval(timer);
  timer = 0;
  wake(false);
  paint();
}

function tick() {
  const r = rest();
  if (!r) return stop();
  if (document.hidden) return; // away: keep the rest so the return can show it
  const now = Date.now();
  if (now >= (graceFor === r.endsAt ? graceUntil : r.endsAt + OVER_MS)) {
    clear();
    return save();
  }
  if (now >= r.endsAt && beepedFor !== r.endsAt) {
    beepedFor = r.endsAt;
    beep();
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
  bar.querySelector(".rest-time").textContent = fmtRest(left);
  bar.querySelector(".rest-msg").textContent = over ? "Rest over" : "";
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
  if (now >= r.endsAt) beepedFor = r.endsAt;
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
  }
  const r = rest();
  if (r && !timer) {
    if (Date.now() >= r.endsAt) beepedFor = r.endsAt; // finished while away: no late beep
    run();
  }
  if (!r && timer) stop();
  tick();
}

// Call inside the set-confirm tap: iOS only lets audio start from a tap.
export function startRest(shellCtx) {
  ctx = shellCtx;
  const len = restLength(ctx.state.settings);
  if (!len || !ctx.state.active) return;
  try {
    // iOS 17+: let the beep mix with the user's music instead of pausing it.
    if (navigator.audioSession) navigator.audioSession.type = "ambient";
  } catch {}
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch {}
  ctx.state.active.rest = { endsAt: Date.now() + len * 1000, total: len };
  run();
  paint();
}

// Un-ticked a set: the caller saves.
export function cancelRest(shellCtx) {
  ctx = shellCtx;
  clear();
}
