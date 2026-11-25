import { round2 } from "./logic.js";
import { fmtDate as fmtDateLang, t } from "./i18n/index.js";

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
    ? `<div class="howto muted small"><b>${t("ui.howto")}</b><br />${esc(ex.howto)}</div>`
    : "";

// 2 pictures cross-fade, 1 stays still, 0 gives "". The optional hint sits under the picture.
export function photoHtml(ex) {
  const urls = exImageUrls(ex);
  if (!urls.length) return "";
  const imgs = urls
    .map((u, i) => `<img class="${i ? "b" : "a"}" src="${u}" alt="" width="4" height="3" decoding="async" />`)
    .join("");
  const hint = ex.hint ? `<p class="muted small photo-hint">${esc(ex.hint)}</p>` : "";
  return `<div class="photo${urls.length === 1 ? " still" : ""}">${imgs}</div>${hint}`;
}

// The cross-fade starts only once every frame is decoded: before, the second drawing was still
// loading (first view, nothing cached yet), so the fade showed a blank frame and stuttered.
export function armPhotos(root) {
  for (const box of root.querySelectorAll(".photo:not(.still)")) {
    const go = () => box.classList.add("ready");
    const imgs = [...box.querySelectorAll("img")];
    Promise.all(imgs.map((i) => i.decode().catch(() => {}))).then(go, go);
  }
}

// 57.5 -> "57.5", 50 -> "50", 1.25 -> "1.25"
export const fmtKg = (n) => String(round2(Number(n)));

// "Thu 12 Nov" (local time)
export const fmtDate = fmtDateLang;

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
  close.setAttribute("aria-label", t("ui.dismiss"));
  close.textContent = "✕";
  close.onclick = () => (el.hidden = true);
  el.append(msg, close);
  el.hidden = false;
  if (!sticky) bannerTimer = setTimeout(() => (el.hidden = true), 7000);
}

// A short notice with one OK button. `lines` are paragraphs. Resolves when closed.
export function infoSheet(lines) {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    for (const l of lines) {
      const p = document.createElement("p");
      p.textContent = l;
      sheet.append(p);
    }
    const ok = document.createElement("button");
    ok.className = "btn btn-primary";
    ok.textContent = t("ui.ok");
    const done = () => (scrim.remove(), resolve());
    ok.onclick = done;
    scrim.onclick = (e) => e.target === scrim && done();
    sheet.append(ok);
    scrim.append(sheet);
    document.body.append(scrim);
    ok.focus();
  });
}

// In-page replacement for window.confirm. Resolves true on confirm, false otherwise.
export function confirmSheet(
  message,
  confirmLabel = t("ui.confirm"),
  cancelLabel = t("ui.cancel"),
  { danger = false } = {},
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
    ok.className = danger ? "btn btn-warn" : "btn btn-primary";
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
