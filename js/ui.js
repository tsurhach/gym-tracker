import { round2 } from "./logic.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const ENT = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escape any user or imported text before it goes into HTML.
export const esc = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ENT[c]);

// Picture files for a library exercise: 0, 1 or 2 drawings (ext defaults to svg).
export const exImageUrls = (ex) =>
  Array.from(
    { length: ex?.images ?? 0 },
    (_, i) => `./img/ex/${encodeURIComponent(ex.id)}/${i}.${ex.ext ?? "svg"}`,
  );

// The written how-to, a compact block under the picture. Only when the setting is on (missing = off).
export const howtoHtml = (ex, settings) =>
  settings?.showHowTo === true && ex?.howto
    ? `<div class="howto muted small"><b>How to do it</b><br />${esc(ex.howto)}</div>`
    : "";

// 2 pictures cross-fade, 1 stays still, 0 gives "". The optional hint sits under the picture.
export function photoHtml(ex) {
  const urls = exImageUrls(ex);
  if (!urls.length) return "";
  const imgs = urls
    .map((u, i) => `<img class="${i ? "b" : "a"}" src="${u}" alt="" />`)
    .join("");
  const hint = ex.hint ? `<p class="muted small photo-hint">${esc(ex.hint)}</p>` : "";
  return `<div class="photo${urls.length === 1 ? " still" : ""}">${imgs}</div>${hint}`;
}

// 57.5 -> "57.5", 50 -> "50", 1.25 -> "1.25"
export const fmtKg = (n) => String(round2(Number(n)));

// "Thu 12 Nov" (local time)
export function fmtDate(ms) {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// The DOM is only touched inside functions below, so this file imports cleanly in Node.

let bannerTimer = 0;

// One banner at a time. sticky: stays until dismissed. kind: "error" | "ok".
export function showBanner(text, { sticky = false, kind = "error" } = {}) {
  const el = document.getElementById("banner");
  clearTimeout(bannerTimer);
  el.className = kind === "ok" ? "ok" : "";
  el.replaceChildren();
  const msg = document.createElement("span");
  msg.textContent = text;
  const close = document.createElement("button");
  close.className = "icon-btn";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "✕";
  close.onclick = () => (el.hidden = true);
  el.append(msg, close);
  el.hidden = false;
  if (!sticky) bannerTimer = setTimeout(() => (el.hidden = true), 7000);
}

// In-page replacement for window.confirm. Resolves true on confirm, false otherwise.
export function confirmSheet(
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
) {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    const p = document.createElement("p");
    p.textContent = message;
    const ok = document.createElement("button");
    ok.className = "btn btn-primary";
    ok.textContent = confirmLabel;
    const no = document.createElement("button");
    no.className = "btn";
    no.textContent = cancelLabel;
    sheet.append(p, ok, no);
    scrim.append(sheet);

    const done = (v) => {
      document.removeEventListener("keydown", onKey);
      scrim.remove();
      resolve(v);
    };
    const onKey = (e) => e.key === "Escape" && done(false);
    ok.onclick = () => done(true);
    no.onclick = () => done(false);
    scrim.onclick = (e) => e.target === scrim && done(false);
    document.addEventListener("keydown", onKey);
    document.body.append(scrim);
    no.focus();
  });
}
