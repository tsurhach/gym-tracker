import { createStore } from "./store.js";
import { linkCustomsToLibrary } from "./migrate.js";
import { allMediaKeys } from "./media.js";
import { confirmSheet, showBanner } from "./ui.js";
import * as setup from "./screens/setup.js";
import * as plan from "./screens/plan.js";
import * as today from "./screens/today.js";
import * as workout from "./screens/workout.js";
import * as exercise from "./screens/exercise.js";
import * as history from "./screens/history.js";
import * as muscles from "./screens/muscles.js";
import * as weight from "./screens/weight.js";
import * as planimport from "./screens/planimport.js";
import * as help from "./screens/help.js";
import * as rest from "./rest.js";
import { checkOnForeground, reloadOnUpdate } from "./update.js";
import { SYNC_ENABLED, createSync } from "./sync.js";
import * as sync from "./screens/sync.js";
import * as passkey from "./passkey.js";

const screens = {
  today,
  workout,
  exercise,
  history,
  progress: { render: history.renderProgress },
  muscles,
  weight,
  plan,
  setup,
  import: planimport,
  help,
  ...(SYNC_ENABLED ? { sync } : {}),
};
const NEEDS_ID = new Set(["exercise", "progress"]);
const NO_TABS = new Set(["setup", "workout", "exercise"]);
const TAB_OF = {
  workout: "today",
  exercise: "today",
  progress: "history",
  weight: "today",
  setup: "plan",
  import: "plan",
  help: "today",
  sync: "plan",
};

function parseHash(hash) {
  try {
    const [name, id] = hash
      .replace(/^#\/?/, "")
      .split("/")
      .map(decodeURIComponent);
    if (!screens[name] || (NEEDS_ID.has(name) && !id)) return null;
    return { name, id, key: hash };
  } catch {
    return null;
  }
}

function browserStorage() {
  try {
    return localStorage;
  } catch {
    // Storage blocked (private mode): behave as unreadable and unsaveable.
    const fail = () => {
      throw new Error("storage unavailable");
    };
    return { getItem: fail, setItem: fail };
  }
}

// Sync (hidden unless SYNC_ENABLED). A pulled merge is applied only on a calm screen with no input
// focused, or on the next navigation (which redraws anyway), so typing is never lost to a redraw.
function startSync(ctx, store, render) {
  const calm = () => {
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable;
    return ["#/today", "#/history", "#/muscles"].includes(location.hash || "#/today") && !typing && !document.querySelector(".sheet");
  };
  const s = createSync({
    getState: () => ctx.state,
    setState: (state) => {
      ctx.state = state;
      store.save(state, { resetSnapshot: true });
    },
    isSafe: calm,
    applied: () => {
      render();
      showBanner("Updated from your other device.", { kind: "ok" });
    },
    storage: browserStorage(),
    passkey,
  });
  ctx.sync = s;
  // Navigation redraws anyway: merge first so the new screen shows the combined data.
  window.addEventListener("hashchange", () => s.applyHeld(true));
  setInterval(() => s.hasHeld() && s.applyHeld(), 5000);
  document.addEventListener("visibilitychange", () => (document.hidden ? s.flush() : s.syncNow()));
  s.syncNow();
}

async function main() {
  const app = document.getElementById("app");
  const tabs = document.getElementById("tabs");

  let library;
  try {
    library = await (await fetch("./data/exercises.json")).json();
  } catch {
    app.textContent =
      "Could not load the exercise library. Check your connection and reload.";
    return;
  }
  const byId = new Map(library.map((e) => [e.id, e]));

  const store = createStore(browserStorage());
  const loaded = store.load();
  // Customs an import made from a near-miss name become the library exercise (once; skipped if media is unreadable).
  if (loaded.kept && !loaded.recovered && loaded.state.customExercises.length) {
    try {
      const keys = new Set(await allMediaKeys());
      const links = linkCustomsToLibrary(loaded.state, library, keys);
      if (links.length && store.save(loaded.state)) {
        const list = links.slice(0, 5).map((l) => `${l.from} → ${l.to}`).join(", ");
        const more = links.length > 5 ? `, and ${links.length - 5} more` : "";
        showBanner(`Linked ${links.length} exercise${links.length > 1 ? "s" : ""} to the library so they show drawings: ${list}${more}.`, { sticky: true, kind: "ok" });
      }
    } catch {}
  }
  let blocked = false; // unreadable data that could not be set aside: no save until confirmed

  const ctx = {
    state: loaded.state,
    library,
    params: {},
    lookup(id) {
      const e =
        byId.get(id) ?? ctx.state.customExercises.find((c) => c.id === id);
      return (
        e && {
          id: e.id,
          name: e.name,
          primary: e.primary,
          secondary: e.secondary ?? [],
          images: e.images ?? 0,
          ext: e.ext,
          hint: e.hint,
          howto: e.howto,
          equipment: e.equipment,
        }
      );
    },
    go(hash) {
      location.hash = hash;
    },
    // Resolves true only when the store actually saved.
    // { render: false } saves without redrawing (used when the page is being hidden).
    async save({ render: redraw = true, resetSnapshot = false } = {}) {
      if (blocked && !(await askOverwrite())) {
        showBanner("Changes are not saved. Your old data was left untouched.", {
          sticky: true,
        });
        if (redraw) render();
        return false;
      }
      blocked = false;
      const saved = store.save(ctx.state, { resetSnapshot });
      if (!saved) {
        showBanner(
          "Could not save. Storage may be full or blocked. Export a backup if you can.",
          { sticky: true },
        );
      }
      if (saved) ctx.sync?.changed(); // schedules a push; never awaited, never redraws
      if (redraw) render();
      return saved;
    },
  };

  const askOverwrite = () =>
    confirmSheet(
      "Saved data on this phone could not be read, and it could NOT be set aside. If you continue, the next save will overwrite it for good.",
      "Overwrite and continue",
      "Not now",
    );

  let lastKey = null;
  function render() {
    const route = parseHash(location.hash);
    if (!route) return location.replace("#/today");
    if (
      route.name === "today" &&
      !ctx.state.workouts.length &&
      !ctx.state.active
    )
      return location.replace("#/setup");
    ctx.params = { id: route.id };
    const y = route.key === lastKey ? window.scrollY : 0;
    lastKey = route.key;

    const root = document.createElement("div");
    app.replaceChildren(root);
    try {
      screens[route.name].render(root, ctx);
    } catch (err) {
      console.error(err);
      root.textContent = "Something went wrong showing this screen.";
    }

    const noTabs = NO_TABS.has(route.name);
    tabs.hidden = noTabs;
    document.body.classList.toggle("no-tabs", noTabs);
    const active = TAB_OF[route.name] ?? route.name;
    for (const a of tabs.querySelectorAll("a")) {
      if (a.dataset.tab === active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    window.scrollTo(0, y);
    rest.sync(route.name, ctx);
  }

  if (loaded.recovered && loaded.kept) {
    showBanner(
      "Saved data could not be read, so it was set aside and the app started fresh.",
      { sticky: true },
    );
  } else if (loaded.recovered) {
    blocked = true;
    askOverwrite().then((ok) => {
      if (ok) blocked = false;
      else
        showBanner(
          "Saved data could not be read. Nothing will be saved until you confirm.",
          { sticky: true },
        );
    });
  }

  if (SYNC_ENABLED) startSync(ctx, store, () => render());
  window.addEventListener("hashchange", render);
  render();
  // Ask the browser not to evict our data; the answer does not matter.
  try {
    navigator.storage?.persist?.()?.catch?.(() => {});
  } catch {}
}

// Offline support: https always; localhost only with ?sw=1 so dev servers never serve a stale shell.
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" ||
    (location.hostname === "localhost" && location.search.includes("sw=1")))
) {
  reloadOnUpdate(!!navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      checkOnForeground(reg);
      return navigator.serviceWorker.ready;
    })
    .then((reg) => reg.active.postMessage("cache-images"))
    .catch(() => {});
}

main();
