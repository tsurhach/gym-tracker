import { MUSCLES } from "./constants.js";
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

export function openPicker(ctx, onPick, { exclude = new Set(), muscles = [], title = "Add exercise", multi = false } = {}) {
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
          <button class="icon-btn" data-act="close" aria-label="Close">✕</button>
          <h2>${esc(title)}</h2>
        </div>
        <input type="search" data-search placeholder="Search exercises" aria-label="Search exercises" autocomplete="off" autocapitalize="none" enterkeyhint="search" />
        <nav class="pick-jump" data-jump aria-label="Jump to a muscle group"></nav>
      </div>
      <details class="card" style="margin-top:12px">
        <summary>Create a custom exercise</summary>
        <form data-form novalidate>
          <input data-name placeholder="Exercise name" aria-label="Exercise name" maxlength="60" autocomplete="off" />
          <label class="muted small">Main muscle
            <select data-primary>${MUSCLES.map((m) => `<option>${esc(m)}</option>`).join("")}</select>
          </label>
          <div>
            <div class="muted small">Other muscles (optional)</div>
            <div class="chips" data-secondary>
              ${MUSCLES.map((m) => `<button type="button" class="chip" aria-pressed="false" data-m="${esc(m)}">${esc(m)}</button>`).join("")}
            </div>
          </div>
          <label class="btn file-btn">Add photo or video
            <input type="file" data-media accept="image/*,video/*" />
          </label>
          <div class="muted small" data-media-name></div>
          <p class="err" data-err></p>
          <button class="btn btn-primary" type="submit">Create and add</button>
        </form>
      </details>
      ${muscles.length ? `<button type="button" class="btn" data-act="toggle-all" aria-pressed="false" style="margin-top:12px">Show all muscle groups</button>` : ""}
      <div data-list></div>
    </div>
    ${multi ? `<div class="pick-foot"><button class="btn btn-primary" data-act="done" disabled>Add exercises</button></div>` : ""}`;

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
    const thumb = e.images
      ? `<img class="pick-thumb" src="${exImageUrls(e)[0]}" alt="" width="56" height="56" loading="lazy" decoding="async" />`
      : `<span class="pick-thumb"${custom.has(e.id) ? ` data-mid="${esc(e.id)}"` : ""}></span>`;
    return `<button class="pick-row" data-id="${esc(e.id)}"${added ? " disabled" : ""}${multi && !added ? ` aria-pressed="${on}"` : ""}>
          ${thumb}
          <span class="pick-name">${esc(e.name)}</span>
          <span class="tag">${added ? "Added" : on ? "✓" : tag || (custom.has(e.id) ? "Custom" : "")}</span>
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
    const recent = q || !multi ? [] : recentIds(ctx.state.sessions, muscles).map((id) => inDay.find((e) => e.id === id)).filter(Boolean);
    if (recent.length) groups.push({ title: "Recent", html: recent.map((e) => rowHtml(e, custom)).join("") });
    for (const m of MUSCLES) {
      const rows = found.filter((e) => e.primary === m && dayIds.has(e.id));
      if (rows.length) groups.push({ title: m, html: rows.map((e) => rowHtml(e, custom)).join("") });
    }
    const others = found.filter((e) => !dayIds.has(e.id));
    if (others.length) groups.push({ title: "Other muscle groups", html: others.map((e) => rowHtml(e, custom, e.primary)).join("") });
    list.innerHTML = groups.length
      ? groups.map((g, i) => `<section data-g="${i}"><h3 class="pick-h">${esc(g.title)}</h3>${g.html}</section>`).join("")
      : `<p class="muted">${q ? "No exercises match." : "No exercises for these muscle groups."}${showAll ? "" : ` Tap "Show all muscle groups" above.`}</p>`;
    jump.innerHTML = groups.length > 1 ? groups.map((g, i) => `<button type="button" class="chip" data-jump="${i}">${esc(g.title === "Other muscle groups" ? "Other" : g.title)}</button>`).join("") : "";
    jump.hidden = !groups.length || groups.length < 2;
    // Sticky offsets are measured inside the overlay's padding, so the headings stick right under the bar.
    el.style.setProperty("--bar-h", `${bar.offsetHeight - parseFloat(getComputedStyle(el).paddingTop)}px`);
    loadThumbs();
  }

  function paintPicked() {
    for (const r of list.querySelectorAll(".pick-row[aria-pressed]")) {
      const on = picked.includes(r.dataset.id);
      r.setAttribute("aria-pressed", String(on));
      r.querySelector(".tag").textContent = on ? "✓" : "";
    }
    doneBtn.disabled = !picked.length;
    doneBtn.textContent = picked.length ? `Add ${picked.length}` : "Add exercises";
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
      tog.textContent = showAll ? "Show only this workout's muscles" : "Show all muscle groups";
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
    el.querySelector("[data-media-name]").textContent = `Chosen: ${f.name}`;
  });
  el.querySelector("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = el.querySelector("[data-name]").value.trim();
    if (!name) {
      el.querySelector("[data-err]").textContent = "Give the exercise a name.";
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
