import { MUSCLES } from "./constants.js";
import { esc, exImageUrls, showBanner } from "./ui.js";
import { checkFile, getMedia, saveMedia } from "./media.js";

// Full-screen exercise picker: library + custom exercises, searchable, grouped by
// primary muscle, with a form to create a custom exercise. Not tied to any screen.
// onPick(exerciseId) is called once, then the picker closes.
// opts.exclude: Set of exercise ids shown as already added and not selectable.
// opts.muscles: the workout's muscle groups; by default only exercises whose primary is one of them are listed.
export function pickerExercises(all, muscles, showAll) {
  return showAll || !muscles?.length ? all : all.filter((e) => muscles.includes(e.primary));
}

export function openPicker(ctx, onPick, { exclude = new Set(), muscles = [] } = {}) {
  let showAll = false;
  const el = document.createElement("div");
  el.className = "overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Add exercise");
  el.innerHTML = `
    <div class="overlay-inner">
      <div class="overlay-head">
        <button class="icon-btn" data-act="close" aria-label="Close">✕</button>
        <h2>Add exercise</h2>
      </div>
      <input type="search" data-search placeholder="Search exercises" aria-label="Search exercises" autocomplete="off" autocapitalize="none" enterkeyhint="search" />
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
    </div>`;

  const list = el.querySelector("[data-list]");
  const search = el.querySelector("[data-search]");
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

  function draw() {
    const q = search.value.trim().toLowerCase();
    const custom = new Set(ctx.state.customExercises.map((c) => c.id));
    const all = pickerExercises([...ctx.library, ...ctx.state.customExercises], muscles, showAll).filter((e) =>
      e.name.toLowerCase().includes(q),
    );
    let html = "";
    for (const m of MUSCLES) {
      const rows = all.filter((e) => e.primary === m);
      if (!rows.length) continue;
      html += `<h3>${esc(m)}</h3>`;
      for (const e of rows) {
        const added = exclude.has(e.id);
        const thumb = e.images
          ? `<img class="pick-thumb" src="${exImageUrls(e)[0]}" alt="" width="56" height="56" loading="lazy" decoding="async" />`
          : `<span class="pick-thumb"${custom.has(e.id) ? ` data-mid="${esc(e.id)}"` : ""}></span>`;
        html += `<button class="pick-row" data-id="${esc(e.id)}"${added ? " disabled" : ""}>
          ${thumb}
          <span class="pick-name">${esc(e.name)}</span>
          <span class="tag">${added ? "Added" : custom.has(e.id) ? "Custom" : ""}</span>
        </button>`;
      }
    }
    list.innerHTML =
      html ||
      `<p class="muted">${q ? "No exercises match." : "No exercises for these muscle groups."}${showAll ? "" : ` Tap "Show all muscle groups" above.`}</p>`;
    loadThumbs();
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
    close();
    onPick(id);
  }
  const onKey = (e) => e.key === "Escape" && close();

  search.addEventListener("input", draw);
  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-act=close]")) return close();
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
    pick(ex.id);
  });

  document.addEventListener("keydown", onKey);
  document.body.classList.add("locked");
  document.body.append(el);
  draw();
  el.querySelector("[data-act=close]").focus();
}
