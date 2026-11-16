// Rest timer: one bar fixed to the bottom of the page, outside the per-render screen root.
// State lives in state.active.rest = { endsAt, total } (ms timestamp, seconds) so it survives a kill.

export const DEFAULT_REST = 90;
export const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
const OVER_MS = 5000; // how long "Rest over" stays

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
  const now = Date.now();
  if (now >= r.endsAt + OVER_MS) {
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

// Called by the shell after every render, and when the app comes back to the foreground.
export function sync(name, shellCtx) {
  ctx = shellCtx;
  route = name;
  if (!bar) {
    build();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !rest()) return;
      tick();
      wake(true);
    });
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
