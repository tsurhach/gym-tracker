import { MUSCLES } from "../constants.js";
import { muscleTally } from "../logic.js";
import { esc } from "../ui.js";

export function render(root, ctx) {
  const tally = muscleTally(ctx.state.sessions, Date.now());
  const max = Math.max(...MUSCLES.map((m) => tally[m]));
  const zero = MUSCLES.filter((m) => !tally[m]);
  const body = max
    ? `<section class="card">${MUSCLES.map(
        (
          m,
        ) => `<div class="row"><span class="grow">${esc(m)}</span><span class="muted">${tally[m]} ${tally[m] === 1 ? "set" : "sets"}</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${(tally[m] / max) * 100}%"></i></div>`,
      ).join("")}</section>
      ${zero.length ? `<section class="card"><div class="stuck">Not trained in the last 7 days</div><div class="tags">${zero.map((m) => `<span class="tag">${esc(m)}</span>`).join(" ")}</div></section>` : ""}`
    : `<section class="card"><p><b>No sets in the last 7 days.</b></p><p class="muted">Log a workout and the bars appear here.</p></section>`;
  root.innerHTML = `<h1 class="title">Muscles</h1>
    <p class="subtitle">Sets per muscle, last 7 days</p>${body}`;
}
