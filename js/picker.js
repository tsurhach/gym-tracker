import { MUSCLES } from "./constants.js";
import { muscleName } from "./logic.js";
import { exTwo, t } from "./i18n/index.js";
import { esc, exImageUrls, showBanner } from "./ui.js";
import { checkFile, getMedia, saveMedia } from "./media.js";
import { recentIds, searchExercises } from "./planbuild.js";

// Full-screen exercise picker: library + custom exercises, searchable, grouped by
// primary muscle, with a form to create a custom exercise. Not tied to any screen.
// onPick(exerciseId) is called once, then the picker closes.
// opts.multi: the list stays open, rows are ticked, and onPick(ids[]) is called once with the ids in tick order.
// opts.exclude: Set of exercise ids shown as already added and not selectable.
// opts.title: heading, default "Add exercise".
// opts.muscles: the workout's muscle groups; by default only exercises whose primary is one of them are listed.
export function pickerExercises(all, muscles, showAll) {
  return showAll || !muscles?.length ? all : all.filter((e) => muscles.includes(e.primary));
}

export function openPicker(ctx, onPick, { exclude = new Set(), muscles = [], title = t("picker.addExercise"), multi = false } = {}) {
  let showAll = false;
  const picked = []; // multi: ticked ids, in tick order
  const el = document.createElement("div");
  el.className = "overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", title);
  el.innerHTML = `
    <div class="overlay-inner">
      <div class="pick-bar" data-bar>
        <div class="overlay-head">
          <button class="icon-btn" data-act="close" aria-label="${t("picker.close")}">✕</button>
          <h2>${esc(title)}</h2>
        </div>
        <input type="search" dir="auto" data-search placeholder="${t("picker.search")}" aria-label="${t("picker.search")}" autocomplete="off" autocapitalize="none" enterkeyhint="search" />
        <nav class="pick-jump" data-jump aria-label="${t("picker.jump")}"></nav>
      </div>
      <details class="card" style="margin-top:12px">
        <summary>${t("picker.create")}</summary>
        <form data-form novalidate>
          <input data-name dir="auto" placeholder="${t("picker.name")}" aria-label="${t("picker.name")}" maxlength="60" autocomplete="off" />
          <label class="muted small">${t("picker.mainMuscle")}
            <select data-primary>${MUSCLES.map((m) => `<option value="${esc(m)}">${esc(muscleName(m))}</option>`).join("")}</select>
          </label>
          <div>
            <div class="muted small">${t("picker.otherMuscles")}</div>
            <div class="chips" data-secondary>
              ${MUSCLES.map((m) => `<button type="button" class="chip" aria-pressed="false" data-m="${esc(m)}">${esc(muscleName(m))}</button>`).join("")}
            </div>
          </div>
          <label class="btn file-btn">${t("exercise.mediaAdd")}
            <input type="file" data-media accept="image/*,video/*" />
          </label>
          <div class="muted small" data-media-name></div>
          <p class="err" data-err></p>
          <button class="btn btn-primary" type="submit">${t("picker.createAdd")}</button>
        </form>
      </details>
      ${muscles.length ? `<button type="button" class="btn" data-act="toggle-all" aria-pressed="false" style="margin-top:12px">${t("picker.showAll")}</button>` : ""}
      <div data-list></div>
    </div>
    ${multi ? `<div class="pick-foot"><button class="btn btn-primary" data-act="done" disabled>${t("picker.addExercises")}</button></div>` : ""}`;

  const list = el.querySelector("[data-list]");
  const search = el.querySelector("[data-search]");
  const jump = el.querySelector("[data-jump]");
  const bar = el.querySelector("[data-bar]");
  const doneBtn = el.querySelector("[data-act=done]");
  let chosen = null; // media file for the exercise being created
  let closed = false;
  const thumbs = new Map(); // custom id -> object URL ("" while loading or none)

  function paintThumbs() {
    for (const s of list.querySelectorAll("[data-mid]")) {
      const url = thumbs.get(s.dataset.mid);
      if (!url) continue;
      const img = document.createElement("img");
      img.className = "pick-thumb";
      img.alt = "";
      img.src = url;
      s.replaceWith(img);
    }
  }
  // After the list is drawn, so it never waits on IndexedDB.
  async function loadThumbs() {
    paintThumbs();
    const ids = [...list.querySelectorAll("[data-mid]")]
      .map((s) => s.dataset.mid)
      .filter((id) => !thumbs.has(id));
    for (const id of ids) thumbs.set(id, "");
    for (const id of ids) {
      const m = await getMedia(id);
      if (closed) return;
      if (m?.thumb) thumbs.set(id, URL.createObjectURL(m.thumb));
    }
    paintThumbs();
  }

  function rowHtml(e, custom, tag) {
    const added = exclude.has(e.id);
    const on = picked.includes(e.id);
    const tagText = tag ? muscleName(tag) : "";
    const thumb = e.images
      ? `<img class="pick-thumb" src="${exImageUrls(e)[0]}" alt="" width="56" height="56" loading="lazy" decoding="async" />`
      : `<span class="pick-thumb"${custom.has(e.id) ? ` data-mid="${esc(e.id)}"` : ""}></span>`;
    return `<button class="pick-row" data-id="${esc(e.id)}" data-tag="${esc(tagText)}"${added ? " disabled" : ""}${multi && !added ? ` aria-pressed="${on}"` : ""}>
          ${thumb}
          <span class="pick-name">${exTwo(e.id, e.name)}</span>
          <span class="tag">${added ? t("picker.added") : on ? "✓" : tagText || (custom.has(e.id) ? t("picker.custom") : "")}</span>
        </button>`;
  }

  function draw() {
    const q = search.value.trim();
    const custom = new Set(ctx.state.customExercises.map((c) => c.id));
    const every = [...ctx.library, ...ctx.state.customExercises];
    // A typed search looks at every exercise; the ones in this workout's muscles come first.
    const inDay = pickerExercises(every, muscles, showAll);
    const dayIds = new Set(inDay.map((e) => e.id));
    const found = searchExercises(q ? every : inDay, q);
    const groups = []; // [{ key, title, html }]
    const recent = q || !multi ? [] : recentIds(ctx.state.sessions, muscles, 12).map((id) => inDay.find((e) => e.id === id)).filter((e) => e && !exclude.has(e.id)).slice(0, 6);
    if (recent.length) groups.push({ title: t("picker.recent"), html: recent.map((e) => rowHtml(e, custom)).join("") });
    const order = muscles.length && !showAll ? [...muscles, ...MUSCLES.filter((x) => !muscles.includes(x))] : MUSCLES;
    for (const m of [...order.filter((x) => x !== "Abs"), ...order.filter((x) => x === "Abs")]) { // Abs last
      const rows = found.filter((e) => e.primary === m && dayIds.has(e.id));
      if (rows.length) groups.push({ title: muscleName(m), html: rows.map((e) => rowHtml(e, custom)).join("") });
    }
    const others = found.filter((e) => !dayIds.has(e.id));
    if (others.length) groups.push({ title: t("picker.otherGroups"), short: t("picker.other"), html: others.map((e) => rowHtml(e, custom, e.primary)).join("") });
    list.innerHTML = groups.length
      ? groups.map((g, i) => `<section data-g="${i}"><h3 class="pick-h">${esc(g.title)}</h3>${g.html}</section>`).join("")
      : `<p class="muted">${q ? (showAll ? t("picker.noMatch") : t("picker.noMatchTap")) : showAll ? t("picker.none") : t("picker.noneTap")}</p>`;
    jump.innerHTML = groups.length > 1 ? groups.map((g, i) => `<button type="button" class="chip" data-jump="${i}">${esc(g.short ?? g.title)}</button>`).join("") : "";
    jump.hidden = !groups.length || groups.length < 2;
    // Sticky offsets are measured inside the overlay's padding, so the headings stick right under the bar.
    el.style.setProperty("--bar-h", `${bar.offsetHeight - parseFloat(getComputedStyle(el).paddingTop)}px`);
    loadThumbs();
  }

  function paintPicked() {
    for (const r of list.querySelectorAll(".pick-row[aria-pressed]")) {
      const on = picked.includes(r.dataset.id);
      r.setAttribute("aria-pressed", String(on));
      r.querySelector(".tag").textContent = on ? "✓" : r.dataset.tag;
    }
    doneBtn.disabled = !picked.length;
    doneBtn.textContent = picked.length ? t("picker.addN", { n: picked.length }) : t("picker.addExercises");
  }

  function close() {
    closed = true;
    for (const u of thumbs.values()) if (u) URL.revokeObjectURL(u);
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("locked");
    el.remove();
  }
  function pick(id) {
    if (exclude.has(id)) return;
    if (multi) {
      const k = picked.indexOf(id);
      if (k < 0) picked.push(id);
      else picked.splice(k, 1);
      return paintPicked();
    }
    close();
    onPick(id);
  }
  const onKey = (e) => e.key === "Escape" && close();

  search.addEventListener("input", draw);
  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-act=close]")) return close();
    if (e.target.closest("[data-act=done]")) {
      const ids = [...picked];
      close();
      return onPick(ids);
    }
    const j = e.target.closest("[data-jump]");
    if (j && j.tagName === "BUTTON") {
      const g = list.querySelector(`[data-g="${j.dataset.jump}"]`);
      if (g) el.scrollTop += g.getBoundingClientRect().top - el.getBoundingClientRect().top - bar.offsetHeight;
      return;
    }
    const tog = e.target.closest("[data-act=toggle-all]");
    if (tog) {
      showAll = !showAll;
      tog.setAttribute("aria-pressed", String(showAll));
      tog.textContent = showAll ? t("picker.showOnly") : t("picker.showAll");
      return draw();
    }
    const row = e.target.closest(".pick-row");
    if (row) return pick(row.dataset.id);
    const chip = e.target.closest("[data-secondary] .chip");
    if (chip)
      chip.setAttribute(
        "aria-pressed",
        String(chip.getAttribute("aria-pressed") !== "true"),
      );
  });
  el.querySelector("[data-media]").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const chk = checkFile(f);
    if (!chk.ok) return showBanner(chk.message);
    chosen = f;
    el.querySelector("[data-media-name]").textContent = t("picker.chosen", { name: f.name });
  });
  el.querySelector("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = el.querySelector("[data-name]").value.trim();
    if (!name) {
      el.querySelector("[data-err]").textContent = t("picker.needName");
      return;
    }
    const primary = el.querySelector("[data-primary]").value;
    const secondary = [
      ...el.querySelectorAll("[data-secondary] .chip[aria-pressed=true]"),
    ]
      .map((c) => c.dataset.m)
      .filter((m) => m !== primary);
    const ex = {
      id: `custom-${crypto.randomUUID()}`,
      name,
      primary,
      secondary,
      images: 0,
    };
    el.querySelector("[data-form] [type=submit]").disabled = true;
    ctx.state.customExercises.push(ex);
    ctx.save();
    if (chosen) await saveMedia(ex.id, chosen); // a failure shows a banner; the exercise is kept
    if (multi) {
      picked.push(ex.id);
      const ids = [...picked];
      close();
      return onPick(ids);
    }
    pick(ex.id);
  });

  document.addEventListener("keydown", onKey);
  document.body.classList.add("locked");
  document.body.append(el);
  draw();
  el.querySelector("[data-act=close]").focus();
}
