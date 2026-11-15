import { MUSCLES } from "./constants.js";
import { newItem } from "./session.js";

export const PRESETS = [
  {
    key: "full",
    label: "Full body",
    workouts: [{ name: "Full body", muscles: MUSCLES }],
  },
  {
    key: "ul",
    label: "Upper / Lower",
    workouts: [
      {
        name: "Upper",
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
        name: "Lower",
        muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Abs"],
      },
    ],
  },
  {
    key: "ppl",
    label: "Push / Pull / Legs",
    workouts: [
      { name: "Push", muscles: ["Chest", "Shoulders", "Triceps"] },
      { name: "Pull", muscles: ["Back", "Biceps", "Forearms"] },
      {
        name: "Legs",
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

export function proposeItems(muscles, library, goalKey) {
  const per = muscles.length <= 3 ? 2 : 1;
  const seen = new Set();
  const items = [];
  for (const m of muscles) {
    for (const ex of library.filter((e) => e.primary === m).slice(0, per)) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      items.push(newItem(ex.id, goalKey));
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
