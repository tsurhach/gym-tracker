// "How to use" guide for people who are new to the app. Static text; no app data is read or changed.
import { t } from "../i18n/index.js";
const FLAG = "gymtracker.helpSeen";

export const isInstalled = () => {
  try {
    return !!(
      matchMedia("(display-mode: standalone)").matches || navigator.standalone
    );
  } catch {
    return false;
  }
};

// Per-viewer "already dismissed" flags (browser storage only; fine if it is unavailable).
export function seen(key) {
  try {
    return JSON.parse(localStorage.getItem(FLAG))?.[key] === true;
  } catch {
    return false;
  }
}
export function markSeen(key) {
  try {
    let v = {};
    try {
      v = JSON.parse(localStorage.getItem(FLAG)) ?? {};
    } catch {}
    v[key] = true;
    localStorage.setItem(FLAG, JSON.stringify(v));
  } catch {}
}

const sections = () => [
  [
    "install",
    t("help.install.title"),
    t("help.install.sub"),
    t("help.install.body"),
  ],
  [
    "plan",
    t("help.plan.title"),
    t("help.plan.sub"),
    t("help.plan.body"),
  ],
  [
    "workout",
    t("help.workout.title"),
    t("help.workout.sub"),
    t("help.workout.body"),
  ],
  [
    "supersets",
    t("help.supersets.title"),
    t("help.supersets.sub"),
    t("help.supersets.body"),
  ],
  [
    "heavier",
    t("help.heavier.title"),
    t("help.heavier.sub"),
    t("help.heavier.body"),
  ],
  [
    "extras",
    t("help.extras.title"),
    t("help.extras.sub"),
    t("help.extras.body"),
  ],
  [
    "progress",
    t("help.progress.title"),
    t("help.progress.sub"),
    t("help.progress.body"),
  ],
];

const syncSection = () => [
  "sync",
  t("help.sync.title"),
  t("help.sync.sub"),
  t("help.sync.body"),
];

const backupSection = () => [
  "backup",
  t("help.backup.title"),
  t("help.backup.sub"),
  t("help.backup.body"),
];

const shareSection = () => [
  "sharing",
  t("help.sharing.title"),
  t("help.sharing.sub"),
  t("help.sharing.body"),
];

export function render(root, ctx) {
  const want = ctx.params.id; // "#/help/install" opens that section
  const open = (k) => (want ? k === want : k === "install" && !isInstalled());
  root.innerHTML = `<h1 class="title">${t("help.title")}</h1>
    <p class="muted" style="margin:0 0 12px">${t("help.hint")}</p>
    ${[...sections(), syncSection(), backupSection(), shareSection()].map(
      ([
        k,
        title,
        sub,
        body,
      ]) => `<details class="card sec help" id="help-${k}"${open(k) ? " open" : ""}>
      <summary><span class="sec-title">${title}</span><span class="sec-count muted">${sub}</span></summary>
      <div class="sec-body">${body}</div>
    </details>`,
    ).join("")}
    <a class="btn" href="#/today">${t("help.back")}</a>`;
  if (want) root.querySelector(`#help-${CSS.escape(want)}`)?.scrollIntoView();
}
