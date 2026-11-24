import { esc } from "./ui.js";
import { t, exName } from "./i18n/index.js";
import { groupItems, supersetsOf } from "./planbuild.js";

// "Make a superset" sheet on the Plan screen: tick 2 or more exercises of a day (tick order = alternation order),
// pick when the rest comes, then make it. Pass a group to edit it (Save / Remove superset).
// Changes w.supersets and the order of w.items, then calls onDone(); the caller redraws and saves.
export const ssLetter = (w, id) => {
  const k = supersetsOf(
    w.supersets,
    w.items.map((it) => it.exerciseId),
  ).findIndex((g) => g.ids.includes(id));
  return k < 0 ? "" : String.fromCharCode(65 + k);
};

export function openSuperset(ctx, w, group, onDone) {
  const present = w.items.map((it) => it.exerciseId);
  const groups = supersetsOf(w.supersets, present);
  const own = group
    ? (groups.find(
        (g) => g.id === group.id && g.ids.join() === group.ids.join(),
      ) ?? group)
    : null;
  let order = own ? [...own.ids] : [];
  let rest = own?.rest ?? "round";
  const nameOf = (id) => exName(id, ctx.lookup(id)?.name) ?? t("super.unknown");
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", own ? t("super.edit") : t("super.make"));
  scrim.append(sheet);

  const paint = () => {
    sheet.innerHTML = `<h2 style="margin-top:0">${own ? t("super.edit") : t("super.make")}</h2>
      <p class="muted small">${t("super.hint")}</p>
      ${present
        .map((id) => {
          const n = order.indexOf(id) + 1;
          const g = groups.findIndex(
            (x) => x !== own && x.ids.includes(id),
          );
          return `<button class="pick-row ss-pick" data-id="${esc(id)}" aria-pressed="${n > 0}">
            <span class="ss-num${n ? " on" : ""}" aria-hidden="true">${n || ""}</span>
            <span class="pick-name">${esc(nameOf(id))}${g >= 0 && !n ? ` <span class="muted small">${t("super.inGroup", { letter: String.fromCharCode(65 + g) })}</span>` : ""}</span>
          </button>`;
        })
        .join("")}
      <div class="seg" role="group" aria-label="${t("super.whenRest")}">
        <button class="chip" data-rest="round" aria-pressed="${rest === "round"}">${t("super.restRound")}</button>
        <button class="chip" data-rest="each" aria-pressed="${rest === "each"}">${t("super.restEach")}</button>
      </div>
      <button class="btn btn-primary" data-act="make" style="margin-top:var(--gap)"${order.length < 2 ? " disabled" : ""}>${own ? t("super.save") : t("super.makeBtn")}</button>
      ${own ? `<button class="btn btn-warn" data-act="remove">${t("super.remove")}</button>` : ""}
      <button class="btn" data-act="cancel">${t("swap.cancel")}</button>`;
  };
  paint();

  const close = () => {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
  };
  const onKey = (e) => e.key === "Escape" && close();
  scrim.addEventListener("click", (e) => {
    const row = e.target.closest(".ss-pick");
    const r = e.target.closest("[data-rest]");
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (row) {
      const id = row.dataset.id;
      order = order.includes(id)
        ? order.filter((x) => x !== id)
        : [...order, id];
      paint();
      sheet.querySelector(`.ss-pick[data-id="${CSS.escape(id)}"]`)?.focus();
    } else if (r) {
      rest = r.dataset.rest;
      paint();
      sheet.querySelector(`[data-rest="${rest}"]`)?.focus();
    } else if (act === "make" && order.length >= 2) {
      const others = groups
        .filter((g) => g !== own)
        .map((g) => ({ ...g, ids: g.ids.filter((id) => !order.includes(id)) }));
      const mine = {
        id: own?.id || `ss-${crypto.randomUUID().slice(0, 8)}`,
        ids: order,
        rest,
      };
      w.supersets = [...others, mine].filter((g) => g.ids.length >= 2);
      w.items.splice(0, w.items.length, ...groupItems(w.items, order));
      close();
      onDone();
    } else if (act === "remove") {
      w.supersets = groups.filter((g) => g !== own);
      close();
      onDone();
    } else if (act === "cancel" || e.target === scrim) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(scrim);
  sheet.querySelector(".ss-pick")?.focus();
}
