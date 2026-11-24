export const MUSCLES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Abs",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
];

// Big muscle groups: they get two exercises in a 4-6 muscle workout.
export const MAJOR_MUSCLES = ["Chest", "Back", "Quads", "Hamstrings", "Shoulders"];

export const GOALS = {
  strength: { label: "Strength", repMin: 4, repMax: 6, sets: 3 },
  muscle: { label: "Build muscle", repMin: 8, repMax: 12, sets: 3 },
  endurance: { label: "Endurance", repMin: 12, repMax: 20, sets: 3 },
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_STEP = 2.5;
