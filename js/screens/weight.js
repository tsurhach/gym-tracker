import { kgHtml, kgText, parseNum } from "../logic.js";
import { confirmSheet, esc, fmtKg } from "../ui.js";
import { fmtDate, t } from "../i18n/index.js";
import {
  dateMs,
  dayNum,
  deleteWeight,
  localDate,
  logWeight,
  validKg,
  weightStats,
} from "../weight.js";

const move = (c) =>
  c === 0 ? t("weight.noChange") : t(c > 0 ? "weight.up" : "weight.down", { kg: kgText(fmtKg(Math.abs(c))) });

export function summary(list, today) {
  const s = weightStats(list, today);
  if (s.latest === null) return t("weight.noEntries");
  const out = [t("weight.latest", { kg: kgText(fmtKg(s.latest)) })];
  if (s.change !== null)
    out.push(t("weight.sincePrev", { move: move(s.change) }));
  if (s.change30 !== null) out.push(t("weight.since30", { move: move(s.change30) }));
  return out.join(" ");
}

// Last 90 days as a line; needs 3 points.
function sparkline(list, today) {
  const t = dayNum(today);
  const pts = list.filter((e) => e.date <= today && t - dayNum(e.date) <= 90);
  if (pts.length < 3) return "";
  const W = 300;
  const H = 60;
  const P = 6;
  const x0 = dayNum(pts[0].date);
  const span = dayNum(pts.at(-1).date) - x0 || 1;
  const lo = Math.min(...pts.map((p) => p.kg));
  const hi = Math.max(...pts.map((p) => p.kg));
  const xy = pts.map((p) => [
    P + ((dayNum(p.date) - x0) / span) * (W - 2 * P),
    hi === lo ? H / 2 : H - P - ((p.kg - lo) / (hi - lo)) * (H - 2 * P),
  ]);
  const a = pts[0];
  const b = pts.at(-1);
  const label = t("weight.trend", { from: kgText(fmtKg(a.kg)), fromDate: fmtDate(dateMs(a.date)), to: kgText(fmtKg(b.kg)), toDate: fmtDate(dateMs(b.date)) });
  const [lx, ly] = xy.at(-1);
  return `<section class="card"><svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <polyline points="${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" />
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" /></svg></section>`;
}

export function render(root, ctx) {
  const list = ctx.state.bodyWeights ?? [];
  const today = localDate();
  const latest = list.length ? fmtKg(list.at(-1).kg) : "";
  root.innerHTML = `<div class="row topbar"><a class="back" href="#/today"><span class="flip">‹</span> ${t("weight.back")}</a></div>
    <h1 class="title">${t("weight.title")}</h1>
    <p class="muted" style="margin-bottom:var(--gap)">${esc(summary(list, today))}</p>
    <form class="card" novalidate>
      <div class="fields" style="grid-template-columns:1fr 1fr">
        <label>${t("weight.weightKg")}<input name="kg" inputmode="decimal" autocomplete="off" value="${esc(latest)}" /></label>
        <label>${t("weight.date")}<input name="date" type="date" value="${today}" max="${today}" /></label>
      </div>
      <p class="err" role="alert"></p>
      <button class="btn btn-primary" type="submit">${t("weight.save")}</button>
    </form>
    ${sparkline(list, today)}
    <section class="card list">${
      list.length
        ? [...list]
            .reverse()
            .map(
              (
                e,
              ) => `<div class="li"><span class="grow">${esc(fmtDate(dateMs(e.date)))}</span><b>${kgHtml(esc(fmtKg(e.kg)))}</b>
        <button class="btn btn-warn inline" data-act="del" data-id="${esc(e.id)}" aria-label="${t("weight.deleteDate", { date: esc(fmtDate(dateMs(e.date))) })}">${t("weight.delete")}</button></div>`,
            )
            .join("")
        : `<p class="muted empty">${t("weight.nothing")}</p>`
    }</section>`;

  const err = root.querySelector(".err");
  root.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const kg = parseNum(e.target.kg.value);
    const date = e.target.date.value;
    if (!validKg(kg))
      err.textContent = t("weight.badKg");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDate())
      err.textContent = t("weight.badDate");
    else {
      logWeight(ctx.state, date, kg);
      ctx.save();
    }
  });
  root.addEventListener("click", async (e) => {
    const el = e.target.closest('[data-act="del"]');
    if (!el || !(await confirmSheet(t("weight.deleteAsk"), t("weight.delete"))))
      return;
    deleteWeight(ctx.state, el.dataset.id);
    ctx.save();
  });
}
