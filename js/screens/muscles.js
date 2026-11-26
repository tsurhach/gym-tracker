import { MUSCLES } from "../constants.js";
import { muscleName, muscleTally } from "../logic.js";
import { t } from "../i18n/index.js";
import { esc } from "../ui.js";

export function render(root, ctx) {
  const tally = muscleTally(ctx.state.sessions, Date.now());
  const max = Math.max(...MUSCLES.map((m) => tally[m]));
  const zero = MUSCLES.filter((m) => !tally[m]);
  const body = max
    ? `<section class="card">${MUSCLES.map(
        (
          m,
        ) => `<div class="row"><span class="grow">${esc(muscleName(m))}</span><span class="muted">${t("muscles.sets", { n: tally[m] })}</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${(tally[m] / max) * 100}%"></i></div>`,
      ).join("")}</section>
      ${zero.length ? `<section class="card"><div class="stuck">${t("muscles.notTrained")}</div><div class="tags">${zero.map((m) => `<span class="tag">${esc(muscleName(m))}</span>`).join(" ")}</div></section>` : ""}`
    : `<section class="card"><p><b>${t("muscles.none")}</b></p><p class="muted">${t("muscles.noneHint")}</p></section>`;
  root.innerHTML = `<h1 class="title">${t("muscles.title")}</h1>
    <p class="subtitle">${t("muscles.subtitle")}</p>${body}`;
}
