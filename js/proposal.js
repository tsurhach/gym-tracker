import { MUSCLES, MAJOR_MUSCLES } from "./constants.js";
import { newItem } from "./session.js";
import { t } from "./i18n/index.js";

export const PRESETS = [
  {
    key: "full",
    get label() {
      return t("proposal.full");
    },
    workouts: [
      {
        get name() {
          return t("proposal.full");
        },
        muscles: MUSCLES,
      },
    ],
  },
  {
    key: "ul",
    get label() {
      return t("proposal.upperLower");
    },
    workouts: [
      {
        get name() {
          return t("proposal.upper");
        },
        muscles: [
          "Chest",
          "Back",
          "Shoulders",
          "Biceps",
          "Triceps",
          "Forearms",
        ],
      },
      {
        get name() {
          return t("proposal.lower");
        },
        muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Abs"],
      },
    ],
  },
  {
    key: "ppl",
    get label() {
      return t("proposal.ppl");
    },
    workouts: [
      {
        get name() {
          return t("proposal.push");
        },
        muscles: ["Chest", "Shoulders", "Triceps"],
      },
      {
        get name() {
          return t("proposal.pull");
        },
        muscles: ["Back", "Biceps", "Forearms"],
      },
      {
        get name() {
          return t("proposal.legs");
        },
        muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Abs"],
      },
    ],
  },
];

// "A", "B", ... "Z", then "27", "28", ...
export function blankWorkouts(n) {
  return Array.from({ length: Math.max(0, n) }, (_, i) => ({
    name: i < 26 ? String.fromCharCode(65 + i) : String(i + 1),
    muscles: [],
  }));
}

const MINOR_SOLO = ["Forearms", "Calves", "Abs"];

// How many exercises one muscle gets, given how many muscles are ticked.
function countFor(m, n) {
  if (n >= 7) return 1;
  if (n >= 4) return MAJOR_MUSCLES.includes(m) ? 2 : 1;
  return MINOR_SOLO.includes(m) && n > 1 ? 1 : 2;
}

export function proposeItems(muscles, library, goalKey) {
  const seen = new Set();
  const items = [];
  for (const m of muscles) {
    for (const ex of library.filter((e) => e.primary === m).slice(0, countFor(m, muscles.length))) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      items.push(newItem(ex.id, goalKey, ex));
    }
  }
  return items;
}

export function buildPlan(drafts, library, goalKey) {
  return drafts.map((d) => ({
    id: crypto.randomUUID(),
    name: d.name,
    muscles: [...d.muscles],
    items: proposeItems(d.muscles, library, goalKey),
  }));
}
