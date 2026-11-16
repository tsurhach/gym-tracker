import { createStore } from "./store.js";
import { confirmSheet, showBanner } from "./ui.js";
import * as setup from "./screens/setup.js";
import * as plan from "./screens/plan.js";
import * as today from "./screens/today.js";
import * as workout from "./screens/workout.js";
import * as exercise from "./screens/exercise.js";
import * as history from "./screens/history.js";
import * as muscles from "./screens/muscles.js";

const screens = {
  today,
  workout,
  exercise,
  history,
  progress: { render: history.renderProgress },
  muscles,
  plan,
  setup,
};
const NEEDS_ID = new Set(["exercise", "progress"]);
const NO_TABS = new Set(["setup", "workout", "exercise"]);
const TAB_OF = {
  workout: "today",
  exercise: "today",
  progress: "history",
  setup: "plan",
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
        }
      );
    },
    go(hash) {
      location.hash = hash;
    },
    // Resolves true only when the store actually saved.
    // { render: false } saves without redrawing (used when the page is being hidden).
    async save({ render: redraw = true } = {}) {
      if (blocked && !(await askOverwrite())) {
        showBanner("Changes are not saved. Your old data was left untouched.", {
          sticky: true,
        });
        if (redraw) render();
        return false;
      }
      blocked = false;
      const saved = store.save(ctx.state);
      if (!saved) {
        showBanner(
          "Could not save. Storage may be full or blocked. Export a backup if you can.",
          { sticky: true },
        );
      }
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
  navigator.serviceWorker
    .register("./sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => reg.active.postMessage("cache-images"))
    .catch(() => {});
}

main();
