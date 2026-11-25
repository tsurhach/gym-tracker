import { esc } from "./ui.js";
import { t } from "./i18n/index.js";
import { FACES, REASONS, afterOpen, clean, needsWhy } from "./rating.js";

// The workout screen asks for a rating right after Finish; History shows it once, on the screen of that workout.
let ask = null;
export const askRating = (id) => (ask = id);
export const takeRating = (id) => (ask === id ? ((ask = null), true) : false);

// Small tags for a rating: face, effort, during, after, reasons. "" when nothing is set.
export function badgesHtml(r) {
  r = clean(r);
  if (!r) return "";
  const tag = (txt, aria) => `<span class="tag"${aria ? ` aria-label="${esc(aria)}"` : ""}>${txt}</span>`;
  return [
    r.lifts && tag(FACES[r.lifts - 1], `${t("rate.lifts")}: ${t(`rate.lifts.${r.lifts}`)}`),
    r.effort && tag(esc(t(`rate.effort.${r.effort}`))),
    r.during && tag(esc(t("rate.badgeDuring", { v: t(`rate.feel.${r.during}`) }))),
    r.after && tag(esc(t("rate.badgeAfter", { v: t(`rate.feel.${r.after}`) }))),
    ...(r.reasons ?? []).map((k) => tag(esc(t(`rate.why.${k}`)))),
  ]
    .filter(Boolean)
    .join(" ");
}

// One row of buttons, one pressed at most; tap the pressed one again to clear it.
const rowHtml = (g, n, label, cur) =>
  `<div class="seg rate-row" data-g="${g}" role="group" aria-label="${esc(t(`rate.${g}`))}">${Array.from({ length: n }, (_, i) => {
    const v = i + 1;
    return `<button type="button" class="chip" data-v="${v}" aria-pressed="${cur === v}" aria-label="${esc(label(v).aria)}">${label(v).html}</button>`;
  }).join("")}</div>`;

// The "How was it?" sheet. Nothing is saved until Save; Skip (or Escape) closes it unchanged. ctx.save() once, on Save.
export function openRating(ctx, ses) {
  const draft = { ...(clean(ses.rating) ?? {}), reasons: [...(ses.rating?.reasons ?? [])] };
  const had = !!clean(ses.rating);
  const showAfter = afterOpen(ses, Date.now()) || !!draft.after;
  const feel = (v) => ({ html: esc(t(`rate.feel.${v}`)), aria: t(`rate.feel.${v}`) });
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const sheet = document.createElement("div");
  sheet.className = "sheet rate";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", t("rate.title"));
  sheet.innerHTML = `<h2 class="rate-title">${t("rate.title")}</h2>
    <p class="muted small">${t("rate.hint")}</p>
    <div class="rate-q"><b>${t("rate.lifts")}</b>
      ${rowHtml("lifts", 5, (v) => ({ html: `<span class="face">${FACES[v - 1]}</span>`, aria: t(`rate.lifts.${v}`) }), draft.lifts)}
      <div class="rate-ends muted small"><span>${t("rate.weak")}</span><span>${t("rate.strong")}</span></div></div>
    <div class="rate-q"><b>${t("rate.effort")}</b>
      ${rowHtml("effort", 5, (v) => ({ html: esc(t(`rate.effort.${v}`)), aria: t(`rate.effort.${v}`) }), draft.effort)}</div>
    <div class="rate-q"><b>${t("rate.during")}</b>${rowHtml("during", 3, feel, draft.during)}</div>
    ${showAfter ? `<div class="rate-q"><b>${t("rate.after")}</b>${rowHtml("after", 3, feel, draft.after)}${ses.rating?.after ? "" : `<p class="muted small">${t("rate.afterHint")}</p>`}</div>` : ""}
    <div class="rate-q" data-why${needsWhy(draft) ? "" : " hidden"}><b>${t("rate.why")}</b>
      <div class="chips">${REASONS.map((k) => `<button type="button" class="chip" data-r="${k}" aria-pressed="${draft.reasons.includes(k)}">${esc(t(`rate.why.${k}`))}</button>`).join("")}</div></div>
    <input data-note dir="auto" maxlength="200" enterkeyhint="done" placeholder="${esc(t("rate.notePh"))}" aria-label="${esc(t("rate.noteLabel"))}" value="${esc(draft.note ?? "")}" />
    <button class="btn btn-primary" data-save>${t("rate.save")}</button>
    <button class="btn" data-skip>${t(had ? "rate.cancel" : "rate.skip")}</button>`;
  scrim.append(sheet);

  const close = () => {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  sheet.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.skip !== undefined) return close();
    if (b.dataset.save !== undefined) {
      const note = sheet.querySelector("[data-note]").value;
      const r = clean({ ...draft, reasons: needsWhy(draft) ? draft.reasons : [], note });
      if (r) ses.rating = r;
      else delete ses.rating;
      close();
      await ctx.save();
      return;
    }
    const g = b.closest("[data-g]")?.dataset.g;
    if (g) {
      const v = Number(b.dataset.v);
      if (draft[g] === v) delete draft[g];
      else draft[g] = v;
      for (const c of b.parentNode.children) c.setAttribute("aria-pressed", String(Number(c.dataset.v) === draft[g]));
    } else if (b.dataset.r) {
      const i = draft.reasons.indexOf(b.dataset.r);
      if (i < 0) draft.reasons.push(b.dataset.r);
      else draft.reasons.splice(i, 1);
      b.setAttribute("aria-pressed", String(i < 0));
    } else return;
    sheet.querySelector("[data-why]").hidden = !needsWhy(draft);
  });
  document.body.append(scrim);
  sheet.querySelector("[data-save]").focus();
}
