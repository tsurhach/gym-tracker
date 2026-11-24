import { alternatives, equipName, pairKey } from "./logic.js";
import { t } from "./i18n/index.js";
import { swapEntry } from "./session.js";
import { openPicker } from "./picker.js";
import { esc, exImageUrls } from "./ui.js";
import { lastSets, lastText } from "./screens/workout.js";

// "Swap <name> for…" sheet on the exercise screen: up to 5 same-muscle alternatives,
// "Show all" (picker), and a tick to change the plan too. Swapping goes to the new exercise.
// plan = { taken: Set of ids in the day, onSwap(id) }: the same sheet from the Plan screen, no workout involved.
export function openSwap(ctx, entry, plan) {
  const { state } = ctx;
  const cur = ctx.lookup(entry.exerciseId) ?? { id: entry.exerciseId, primary: entry.primary, secondary: [] };
  const taken = plan?.taken ?? new Set(state.active.entries.map((e) => e.exerciseId));
  const alts = alternatives(cur, [...ctx.library, ...state.customExercises], state.sessions, taken, 5, state.swapCounts);
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", t("swap.aria", { name: entry.name }));
  const rows = alts.map((e) => {
    const last = lastSets(state, e.id);
    return `<button class="pick-row" data-id="${esc(e.id)}">
      ${e.images ? `<img class="pick-thumb" src="${exImageUrls(e)[0]}" alt="" width="56" height="56" loading="lazy" decoding="async" />` : `<span class="pick-thumb"></span>`}
      <span class="pick-name">${esc(e.name)}${state.swapCounts?.[pairKey(cur.id, e.id)] ? ` <span class="tag">${t("swap.usual")}</span>` : ""}<span class="muted small" style="display:block">${last ? t("swap.eqLast", { eq: esc(e.equipment ? equipName(e.equipment) : t("swap.custom")), text: esc(lastText(last)) }) : esc(e.equipment ? equipName(e.equipment) : t("swap.custom"))}</span></span>
    </button>`;
  });
  sheet.innerHTML = `<h2 style="margin-top:0">${t("swap.title", { name: esc(entry.name) })}</h2>
    ${rows.join("") || `<p class="muted">${t("swap.none")}</p>`}
    <button class="btn" data-act="all">${t("swap.showAll")}</button>
    ${plan ? "" : `<label class="check"><input type="checkbox" data-plan /> ${t("swap.alsoPlan")}</label>`}
    <button class="btn" data-act="cancel">${t("swap.cancel")}</button>`;
  scrim.append(sheet);
  const close = () => {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
  };
  const onKey = (e) => e.key === "Escape" && close();
  const go = (id, inPlan) => {
    if (plan) return plan.onSwap(id);
    swapEntry(state, entry.exerciseId, id, ctx.lookup, { inPlan });
    ctx.save({ render: false });
    location.hash = `#/exercise/${id}`;
  };
  scrim.addEventListener("click", (e) => {
    const inPlan = !!sheet.querySelector("[data-plan]")?.checked;
    const row = e.target.closest(".pick-row");
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (row) {
      close();
      go(row.dataset.id, inPlan);
    } else if (act === "all") {
      close();
      openPicker(ctx, (id) => go(id, inPlan), { exclude: taken, muscles: [cur.primary], title: t("exercise.swap") });
    } else if (act === "cancel" || e.target === scrim) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(scrim);
  sheet.querySelector("[data-act=cancel]").focus();
}
