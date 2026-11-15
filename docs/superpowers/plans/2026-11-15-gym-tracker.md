# Gym Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first web app, installable on an iPhone home screen, that logs gym workouts set by set, shows last session's numbers at each exercise, and says plainly when to add weight.

**Architecture:** Static files, no build step, no framework. Pure logic lives in small ES modules tested with Node's built-in test runner; screens are modules that render HTML strings into one root element and re-render on every state change. All data is one JSON document in `localStorage`, reached only through `js/store.js`.

**Tech Stack:** HTML, CSS, JavaScript ES modules. Node 24 (`node --test`) for tests and a tiny local static server. No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-gym-tracker-design.md`. Read it before any task. The mockups it names show the accepted layout.

## Global Constraints

- No npm dependencies, no framework, no build step. If a task seems to need one, stop and report.
- All persistence goes through `js/store.js`. No other file touches `localStorage`.
- Nothing derived is stored. Advice, stuck flags, rotation and muscle tallies are computed from `state.sessions` on every render.
- Every record has `id` (`crypto.randomUUID()`) and timestamps are epoch milliseconds (`Date.now()`).
- Units are kilograms only. Weights are rounded to 2 decimals after any arithmetic (`round2`).
- Muscle groups, exactly: Chest, Back, Shoulders, Biceps, Triceps, Forearms, Abs, Quads, Hamstrings, Glutes, Calves.
- Goals, exactly: Strength 4–6 reps, Build muscle 8–12, Endurance 12–20; 3 sets each. Default weight step 2.5.
- Every string that came from the user or from an imported file is passed through `esc()` before going into HTML.
- Tap targets at least 44px. Inputs use `font-size` of at least 16px (prevents iOS zoom) and `inputmode="decimal"` for weight, `inputmode="numeric"` for reps.
- Dark theme. Advice is a plain sentence, never a chart.
- Commit locally after each task. Never push or publish; hosting needs the owner's approval.
- Each task names the model to run it on. Use it.

## Review Focus

1. **Decimal comma.** iPhone keypads in some regions type `57,5`. Expected: treated as 57.5. Pinned in Task 2 (`parseNum`).
2. **Blank, zero or junk in a set.** Expected: a set with blank or non-numeric weight or reps cannot be confirmed; weight 0 is allowed (bodyweight), reps must be at least 1. Pinned in Task 2 (`parseNum`, `validSet`).
3. **A wrong or damaged backup file.** Expected: import is refused with a clear message and current data is untouched. Pinned in Task 3.
4. **Corrupt or full browser storage.** Expected: the app still opens, the unreadable data is kept aside rather than overwritten, and a failed save tells the user. Pinned in Task 3.
5. **History that outlives the plan.** A workout or custom exercise is deleted or renamed after it was logged. Expected: history, progress and muscle tallies still show it under the name it was logged with. Pinned in Task 4 (sessions snapshot names and muscles).

## File Structure

```
index.html                 app shell: root element, tab bar, module entry
styles.css                 all styles, design tokens on :root
manifest.webmanifest       PWA manifest
sw.js                      service worker (offline cache)
icons/                     app icons
data/exercises.json        curated exercise library
img/ex/<id>/0.jpg, 1.jpg   two photos per exercise
js/constants.js            MUSCLES, GOALS, DEFAULT_STEP
js/logic.js                pure rules: advice, prefill, stuck, rotation, tally
js/store.js                load, save, export, import
js/session.js              pure state changes for plan and workouts
js/proposal.js             plan proposal from muscles and goal
js/ui.js                   esc(), small HTML helpers
js/app.js                  boot, hash router, tab bar, re-render
js/screens/setup.js        goal, number of workouts, muscles per workout
js/screens/today.js
js/screens/workout.js      list of exercises in the active workout
js/screens/exercise.js     one exercise: photos, last time, set rows
js/screens/history.js      list, one workout, per-exercise progress
js/screens/muscles.js
js/screens/plan.js         plan editor and settings
tools/serve.mjs            local static server
tools/build-library.mjs    one-off: builds data/exercises.json and img/ex
tests/*.test.mjs
```

## Data shape

```js
// state, stored under localStorage key "gymtracker.v1"
{
  version: 1,
  settings: { goal: "muscle", showPhotos: true, lastExportAt: null },
  customExercises: [{ id, name, primary, secondary: [] }],
  workouts: [{                      // the plan
    id, name: "A", muscles: ["Chest", "Triceps"],
    items: [{ exerciseId, sets: 3, repMin: 8, repMax: 12, step: 2.5 }]
  }],
  active: null,                     // or a session with finishedAt: null
  sessions: [{                      // finished workouts
    id, workoutId, workoutName: "A", startedAt: 1794700000000, finishedAt: 1794702880000,
    entries: [{ exerciseId, name: "Bench Press", primary: "Chest",
                sets: [{ weight: 60, reps: 10, done: true }] }]
  }]
}
// library exercise (data/exercises.json)
{ id: "bench-press", name: "Bench Press", primary: "Chest",
  secondary: ["Triceps", "Shoulders"], equipment: "barbell", images: 2 }
```

---

### Task 1: Project setup

**Model:** haiku

**Files:**

- Create: `.gitignore`, `package.json`, `tools/serve.mjs`, `.claude/launch.json`, `index.html`

**Interfaces:**

- Produces: `npm test` runs `node --test tests/`; `node tools/serve.mjs` serves the project root at `http://localhost:5173`.

- [ ] **Step 1:** Run `git init` in the project root. Create `.gitignore` containing `.superpowers/` and `node_modules/`.
- [ ] **Step 2:** Create `package.json`: `{"name":"gym-tracker","private":true,"type":"module","scripts":{"test":"node --test tests/","serve":"node tools/serve.mjs"}}`.
- [ ] **Step 3:** Write `tools/serve.mjs`: a `node:http` server on port 5173 (override with `PORT`) serving files under the project root with correct `Content-Type` for `.html .css .js .mjs .json .webmanifest .jpg .png .svg`. `/` serves `index.html`. Reject any resolved path outside the root with 403. Send `Cache-Control: no-store`.
- [ ] **Step 4:** Create `.claude/launch.json` with one configuration: name `gym-tracker`, `runtimeExecutable` `node`, `runtimeArgs` `["tools/serve.mjs"]`, port 5173.
- [ ] **Step 5:** Create a placeholder `index.html` with `<h1>Gym Tracker</h1>`.
- [ ] **Step 6: Verify.** Run `node tools/serve.mjs` in the background, then `curl -s http://localhost:5173/` prints the placeholder, and `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/../package.json` does not return a file from outside the root. Stop the server.
- [ ] **Step 7: Commit** all files, including `docs/`: `chore: project setup`.

### Task 2: Rules (pure logic)

**Model:** sonnet

**Files:**

- Create: `js/constants.js`, `js/logic.js`
- Test: `tests/logic.test.mjs`

**Interfaces:**

- Produces, from `js/constants.js`:
  - `MUSCLES: string[]` (the eleven, in the Global Constraints order)
  - `GOALS = { strength: {label:"Strength", repMin:4, repMax:6, sets:3}, muscle: {label:"Build muscle", repMin:8, repMax:12, sets:3}, endurance: {label:"Endurance", repMin:12, repMax:20, sets:3} }`
  - `DEFAULT_STEP = 2.5`
- Produces, from `js/logic.js`. A `SetRec` is `{weight:number, reps:number}`; an `Item` is `{sets, repMin, repMax, step}`:
  - `round2(n: number): number`
  - `parseNum(text: string): number | null`: trims, accepts `,` or `.` as the decimal mark, returns `null` for blank, non-numeric or negative input.
  - `validSet(weight: number|null, reps: number|null): boolean`: weight is a number ≥ 0 and reps is an integer ≥ 1.
  - `exerciseHistory(sessions, exerciseId): {startedAt:number, sets:SetRec[]}[]`: oldest first; only sessions containing that exercise.
  - `advice(prevSets: SetRec[] | null, item: Item): {kind:"first"|"heavier"|"stay", weight:number|null, message:string}`
  - `prefill(prevSets: SetRec[] | null, item: Item): {weight:number|null, reps:number}[]`: length `item.sets`.
  - `beats(curr: SetRec[], prev: SetRec[]): boolean`
  - `isStuck(history: SetRec[][]): boolean`: `history` oldest first.
  - `nextWorkoutId(workouts, sessions): string | null`
  - `muscleTally(sessions, now: number): Record<string, number>`: every muscle in `MUSCLES` is a key.

- [ ] **Step 1: Write the failing tests** in `tests/logic.test.mjs` using `node:test` and `node:assert/strict`. With `item = {sets:3, repMin:8, repMax:12, step:2.5}`:

```js
// parseNum / validSet (Review Focus 1 and 2)
assert.equal(parseNum("57,5"), 57.5);
assert.equal(parseNum(" 60 "), 60);
assert.equal(parseNum(""), null);
assert.equal(parseNum("abc"), null);
assert.equal(parseNum("-5"), null);
assert.equal(parseNum("0"), 0);
assert.equal(validSet(0, 10), true);
assert.equal(validSet(60, 0), false);
assert.equal(validSet(null, 10), false);
assert.equal(validSet(60, 8.5), false);

// advice
const s = (w, ...reps) => reps.map((r) => ({ weight: w, reps: r }));
assert.deepEqual(advice(null, item), {
  kind: "first",
  weight: null,
  message: "First time. Pick a starting weight.",
});
let a = advice(s(55, 12, 12, 12), item);
assert.equal(a.kind, "heavier");
assert.equal(a.weight, 57.5);
assert.equal(a.message, "You hit 12 on every set. Try 57.5 kg today.");
a = advice(s(50, 10, 10, 9), item);
assert.equal(a.kind, "stay");
assert.equal(a.weight, 50);
assert.equal(a.message, "Stay at 50 kg and beat your reps.");
assert.equal(advice(s(55, 12, 12), item).kind, "stay"); // fewer sets than planned
assert.equal(advice([...s(50, 12), ...s(55, 12, 12, 12)], item).weight, 57.5); // heaviest weight counts
assert.equal(advice(s(55, 12, 12, 12), { ...item, step: 1.25 }).weight, 56.25);
assert.equal(advice(s(20.1, 12, 12, 12), { ...item, step: 0.2 }).weight, 20.3); // no float drift

// prefill
assert.deepEqual(prefill(s(50, 10, 10, 9), item), [
  { weight: 50, reps: 10 },
  { weight: 50, reps: 10 },
  { weight: 50, reps: 9 },
]);
assert.deepEqual(prefill(s(55, 12, 12, 12), item), [
  { weight: 57.5, reps: 8 },
  { weight: 57.5, reps: 8 },
  { weight: 57.5, reps: 8 },
]);
assert.deepEqual(prefill(s(50, 10), item), [
  { weight: 50, reps: 10 },
  { weight: 50, reps: 8 },
  { weight: 50, reps: 8 },
]);
assert.deepEqual(prefill(null, item), [
  { weight: null, reps: 8 },
  { weight: null, reps: 8 },
  { weight: null, reps: 8 },
]);

// stuck
assert.equal(
  isStuck([s(30, 10, 10, 10), s(30, 10, 10, 10), s(30, 10, 9, 10)]),
  true,
);
assert.equal(
  isStuck([s(30, 10, 10, 10), s(30, 10, 10, 10), s(30, 11, 10, 10)]),
  false,
); // more reps
assert.equal(
  isStuck([s(30, 10, 10, 10), s(32.5, 8, 8, 8), s(32.5, 8, 8, 8)]),
  false,
); // weight rose within the window
assert.equal(isStuck([s(30, 10, 10, 10), s(30, 10, 10, 10)]), false); // needs 3 sessions
```

Also test, with literal fixtures you write: `nextWorkoutId` returns the first workout's id with no sessions; the workout after the most recently **started** session's workout, wrapping from last to first; the first workout when that session's `workoutId` is no longer in `workouts`; `null` when `workouts` is empty. `muscleTally` counts one per `done` set toward `entry.primary`, ignores sets with `done:false`, ignores sessions whose `startedAt` is more than `7*24*60*60*1000` ms before `now`, and returns 0 for untouched muscles.

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** both files. Rules not fully determined by the tests:
  - `advice`: `W` is the heaviest weight in `prevSets`; "heavier" when the count of sets at `W` is ≥ `item.sets` and every set at `W` has reps ≥ `item.repMax`. Message numbers are printed without trailing zeros (`57.5`, `50`).
  - `beats(curr, prev)`: `curr`'s heaviest weight is higher, or it is equal and `curr`'s total reps across all sets are higher.
  - `isStuck`: with fewer than 3 sessions, false. Otherwise take the last three `[a, b, c]`: stuck when `!beats(b, a) && !beats(c, b)`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat: workout rules`.

### Task 3: Storage and backup

**Model:** sonnet

**Files:**

- Create: `js/store.js`
- Test: `tests/store.test.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: `KEY = "gymtracker.v1"`, `CORRUPT_KEY = "gymtracker.corrupt"`, and
  - `emptyState(): State` (the Data shape above with empty arrays, `goal: "muscle"`, `showPhotos: true`, `lastExportAt: null`, `active: null`)
  - `createStore(storage): { load(): {state: State, recovered: boolean}, save(state): boolean }` where `storage` has `getItem`/`setItem` (the browser passes `localStorage`; tests pass a fake).
  - `exportJson(state): string`
  - `importJson(text: string): State`: throws `Error("This file is not a Gym Tracker backup.")` on anything invalid.
  - `isValidState(obj): boolean`

- [ ] **Step 1: Write the failing tests** with a `Map`-backed fake storage:
  - `load()` on empty storage returns `emptyState()` and `recovered: false`.
  - `save(state)` then `load()` round-trips deeply equal.
  - (Review Focus 4) With `KEY` holding `"{not json"`, `load()` returns `emptyState()` with `recovered: true`, and `CORRUPT_KEY` now holds `"{not json"`.
  - (Review Focus 4) With a storage whose `setItem` throws, `save()` returns `false` and does not throw.
  - (Review Focus 3) `importJson` throws the exact message for each of: `"hello"`, `"{}"`, `'{"version":2,"workouts":[],"sessions":[]}'`, a state whose `sessions` is not an array, and a state where a set's `weight` is a string.
  - `importJson(exportJson(state))` deep-equals `state`.
- [ ] **Step 2:** Run `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** `isValidState` checks `version === 1`, that `settings` is an object, that `customExercises`, `workouts` and `sessions` are arrays, and that every set in every session has numeric `weight` and `reps`. `load()` treats a stored value that parses but fails `isValidState` the same as corrupt JSON.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat: storage and backup`.

### Task 4: Plan and workout state changes

**Model:** sonnet

**Files:**

- Create: `js/session.js`
- Test: `tests/session.test.mjs`

**Interfaces:**

- Consumes: `prefill`, `exerciseHistory` from `js/logic.js`; `GOALS`, `DEFAULT_STEP` from `js/constants.js`.
- Produces. Every function mutates and returns `state`; the caller saves. `lookup(exerciseId)` returns `{id, name, primary, secondary}` from the library or custom exercises, or `undefined`:
  - `newItem(exerciseId, goalKey): Item` (sets and reps from `GOALS[goalKey]`, `step: DEFAULT_STEP`)
  - `startSession(state, workoutId, lookup, now)`: sets `state.active` with one entry per plan item, sets pre-filled by `prefill` from that exercise's last logged sets, all `done: false`. Does nothing if `state.active` is already set.
  - `addEntry(state, exerciseId, lookup)`: adds an entry to `state.active` for this session only, using `newItem(exerciseId, state.settings.goal)` for the pre-fill; no duplicate if already present.
  - `finishSession(state, now)`
  - `discardSession(state)`
  - `deleteSession(state, sessionId)`

- [ ] **Step 1: Write the failing tests:**
  - `startSession` snapshots `workoutName`, and each entry's `name` and `primary` from `lookup`; an item whose exercise `lookup` cannot find is skipped.
  - With a previous session logging Bench Press at 50 kg × 10, 10, 9, a new session's Bench Press sets are `[{weight:50,reps:10,done:false},{weight:50,reps:10,done:false},{weight:50,reps:9,done:false}]`.
  - `finishSession` keeps only sets with `done: true`, drops entries left with no sets, strips nothing else, sets `finishedAt`, appends to `state.sessions`, and sets `state.active = null`. A session with no confirmed sets at all is discarded, not saved.
  - (Review Focus 5) After a session is finished, removing its workout from `state.workouts` and its exercise from `state.customExercises` leaves `state.sessions[0].workoutName`, `entries[0].name` and `entries[0].primary` unchanged, and `muscleTally` still counts it.
  - `startSession` while another is active leaves the active one untouched.
- [ ] **Step 2:** Run `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat: plan and workout state`.

### Task 5: Exercise library and photos

**Model:** sonnet (curation needs judgment)

**Owner approval already given:** download from `yuhonas/free-exercise-db` for the owner's own copy. Do not download anything else.

**Files:**

- Create: `tools/build-library.mjs`, `data/exercises.json`, `img/ex/<id>/0.jpg` and `1.jpg`
- Test: `tests/library.test.mjs`

**Interfaces:**

- Consumes: `MUSCLES` from `js/constants.js`.
- Produces: `data/exercises.json`, an array of library exercises in the Data shape above. `id` is a lowercase hyphenated slug of the name. `images` is 2 or 0.

- [ ] **Step 1: Write the failing test:** the file parses to an array of 80 to 120 entries; ids are unique; every `primary` and every `secondary` value is in `MUSCLES`; every muscle in `MUSCLES` is the `primary` of at least 4 exercises; every entry with `images: 2` has both files on disk and each is under 300 KB.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL, file missing.
- [ ] **Step 3: Write `tools/build-library.mjs`.** It fetches `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`, selects the exercises named in a `PICKS` array inside the script, maps source muscles to ours, downloads each exercise's first two images from `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<path from the images field>`, and writes the outputs. It must exit with an error listing every `PICKS` name not found and every source muscle with no mapping. Muscle mapping: `abdominals→Abs; biceps→Biceps; calves→Calves; chest→Chest; forearms→Forearms; glutes, abductors→Glutes; hamstrings→Hamstrings; lats, middle back, lower back, traps→Back; quadriceps, adductors→Quads; shoulders, neck→Shoulders; triceps→Triceps`. Verify these source names against the downloaded JSON before relying on them.
- [ ] **Step 4: Choose `PICKS`.** Hand-pick 80 to 120 exercises a commercial gym supports, using the exact names in the source JSON: the main barbell, dumbbell, cable and machine movements for each muscle group, at least 4 per group, more for Chest, Back, Quads and Shoulders. Prefer well-known names; skip stretches, cardio, strongman and Olympic lifts.
- [ ] **Step 5:** Run `node tools/build-library.mjs`, then `npm test`. Expected: all pass. If any image is over 300 KB, report the sizes and stop; do not add an image library.
- [ ] **Step 6:** Report the total size of `img/ex`. **Commit:** `feat: exercise library`.

### Task 6: Plan proposal

**Model:** sonnet

**Files:**

- Create: `js/proposal.js`
- Test: `tests/proposal.test.mjs`

**Interfaces:**

- Consumes: `MUSCLES`, `GOALS` from `js/constants.js`; `newItem` from `js/session.js`.
- Produces:
  - `PRESETS = [{key:"full", label:"Full body", workouts:[{name:"Full body", muscles: MUSCLES}]}, {key:"ul", label:"Upper / Lower", workouts:[{name:"Upper", muscles:["Chest","Back","Shoulders","Biceps","Triceps","Forearms"]},{name:"Lower", muscles:["Quads","Hamstrings","Glutes","Calves","Abs"]}]}, {key:"ppl", label:"Push / Pull / Legs", workouts:[{name:"Push", muscles:["Chest","Shoulders","Triceps"]},{name:"Pull", muscles:["Back","Biceps","Forearms"]},{name:"Legs", muscles:["Quads","Hamstrings","Glutes","Calves","Abs"]}]}]`
  - `blankWorkouts(n: number): {name, muscles: []}[]`: named `"A"`, `"B"`, `"C"`...
  - `proposeItems(muscles: string[], library, goalKey): Item[]`
  - `buildPlan(drafts: {name, muscles}[], library, goalKey): Workout[]`: adds `id` and `items`.

- [ ] **Step 1: Write the failing tests** against the real `data/exercises.json`:
  - `blankWorkouts(4)` names are `["A","B","C","D"]`.
  - `proposeItems(["Chest","Triceps"], lib, "muscle")` returns 4 items, 2 with a Chest primary and 2 with a Triceps primary, each with `sets:3, repMin:8, repMax:12, step:2.5`.
  - `proposeItems(MUSCLES, lib, "strength")` returns 11 items, one per muscle, each `repMin:4, repMax:6`.
  - `proposeItems(["Chest","Back","Shoulders","Biceps","Triceps","Forearms"], lib, "muscle")` returns between 5 and 8 items and every listed muscle is the primary of at least one.
  - No exercise appears twice in one result; `proposeItems([], lib, "muscle")` returns `[]`.
  - `buildPlan(PRESETS[2].workouts, lib, "muscle")` returns 3 workouts with unique ids.
- [ ] **Step 2:** Run `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Per muscle, exercises are taken in library file order (so order `PICKS` in Task 5 with the most standard movement first). Count per muscle: 2 when there are 1 to 3 muscles, otherwise 1. There is no total cap, so a full-body workout gets 11.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat: plan proposal`.

### Task 7: App shell, styles and plan setup

**Model:** sonnet. Before writing UI, invoke the `mobile-native` skill and follow it.

**Files:**

- Create: `styles.css`, `js/ui.js`, `js/app.js`, `js/screens/setup.js`, `js/screens/plan.js`
- Modify: `index.html`

**Interfaces:**

- Consumes: everything produced by Tasks 2, 3, 4 and 6.
- Produces:
  - `js/ui.js`: `esc(text): string` (escapes `& < > " '`); `fmtKg(n): string` (no trailing zeros); `fmtDate(ms): string` (e.g. `Thu 12 Nov`).
  - Every screen module exports `render(root: HTMLElement, ctx)`. `ctx = { state, library, lookup(id), save(), go(hash), params }`. `save()` persists, shows a visible error banner when the store returns `false`, then re-renders the current screen.
  - Routes: `#/today`, `#/workout`, `#/exercise/<exerciseId>`, `#/history`, `#/history/<sessionId>`, `#/progress/<exerciseId>`, `#/muscles`, `#/plan`, `#/setup`. Unknown routes go to `#/today`. With no workouts in the plan, `#/today` redirects to `#/setup`.
  - Screens not yet built render a heading with their name.

- [ ] **Step 1: Shell.** `index.html`: viewport meta with `viewport-fit=cover`, theme colour, a `<main id="app">`, a four-tab bottom bar (Today, History, Muscles, Plan) hidden on `#/setup`, `#/workout` and `#/exercise/*`, and `<script type="module" src="js/app.js">`. `app.js` loads `data/exercises.json`, creates the store with `localStorage`, and if `load()` reports `recovered: true` shows a one-time notice that saved data could not be read and was set aside.
- [ ] **Step 2: Styles.** Design tokens on `:root` (background, surface, text, muted, accent, warning, radius, spacing). Dark theme, one accent colour. Safe-area padding top and bottom. Follow every Global Constraint on tap targets and inputs.
- [ ] **Step 3: Setup screen**, three steps on one route: (1) goal, three large choices from `GOALS`; (2) number of workouts, with the three `PRESETS` as shortcuts plus a stepper from 1 upward that calls `blankWorkouts(n)`; (3) for each workout, an editable name and the eleven muscles as toggle chips. "Propose my plan" calls `buildPlan` and saves; "Start from empty" saves the workouts with no items. Both go to `#/plan`. A workout with no muscles ticked gets no items.
- [ ] **Step 4: Plan screen.** Shows the goal (changeable), and each workout with its exercises. Supports: rename, add, delete (with confirmation) and reorder workouts; change a workout's muscles; add an exercise from a searchable library list grouped by muscle, or create a custom one (name, primary muscle, optional secondary); remove and reorder exercises; edit sets, rep range and weight step per exercise, where step accepts any positive number through `parseNum`. Reordering uses up/down buttons. A "Redo setup" button returns to `#/setup` after a confirmation that it replaces the plan and keeps history. A Settings block holds: show photos toggle, Export backup (downloads `gym-tracker-backup-YYYY-MM-DD.json` and sets `lastExportAt`), Import backup (file input, confirmation, `importJson`; shows the error message on failure and changes nothing).
- [ ] **Step 5: Verify in the browser** at 430×932 using the `gym-tracker` preview: fresh load lands on setup; choosing Build muscle, the stepper at 4, and ticking muscles for A to D yields four workouts whose exercises match the ticked muscles; Full body yields one workout with 11 exercises; a custom exercise named `<b>x</b>` displays as literal text; a step of `1,25` saves as 1.25; export then import restores the same plan; importing `package.json` shows "This file is not a Gym Tracker backup." and the plan is unchanged. Console has no errors.
- [ ] **Step 6:** Run `npm test`. **Commit:** `feat: app shell and plan setup`.

### Task 8: Today, workout and exercise screens

**Model:** sonnet. This is the core flow. Mockup: `workout-v2.html`.

**Files:**

- Create: `js/screens/today.js`, `js/screens/workout.js`, `js/screens/exercise.js`
- Modify: `styles.css`

**Interfaces:**

- Consumes: `nextWorkoutId`, `muscleTally`, `advice`, `exerciseHistory`, `parseNum`, `validSet` from `js/logic.js`; `startSession`, `addEntry`, `finishSession`, `discardSession` from `js/session.js`; `ctx` from Task 7.
- Produces: the three screens' `render` functions.

- [ ] **Step 1: Today.** If `state.active` exists: a card to resume it, and a Discard action with confirmation. Otherwise: the up-next workout (`nextWorkoutId`) with its muscles and exercise count and a large Start button; the other workouts listed, each startable. Below: last 7 days summary (number of sessions, and the muscles with a tally of 0). If there is at least one session and `lastExportAt` is null or older than 30 days, a dismissible backup reminder linking to `#/plan`.
- [ ] **Step 2: Workout list.** Title, elapsed minutes, and one row per entry showing done (all sets confirmed), partial (`n/total`) or untouched. An untouched row shows the advice hint when `kind` is `heavier`, otherwise `Last: 50 kg × 10, 10, 9`, or nothing on first time. Tapping a row opens `#/exercise/<id>`. "Add another exercise" opens the library picker from Task 7 and calls `addEntry`. "Finish workout" asks for confirmation if any sets are unconfirmed, then calls `finishSession` and goes to `#/today`.
- [ ] **Step 3: Exercise screen.** Back link to the list. Name and muscle tags. Photo area: the two images cross-fade every 1.2 s, only when `settings.showPhotos` is true and the exercise has `images: 2`; a Hide/Show control toggles `settings.showPhotos`; `prefers-reduced-motion` shows the first image only. "Last time" card: date, sets, and `advice().message`. Set rows: weight input, reps input, confirm button. Confirming requires `validSet(parseNum(weight), parseNum(reps))`; an invalid row shakes and stays unconfirmed. A confirmed row can be tapped again to unconfirm and edit. "Add set" copies the last row unconfirmed; a row can be removed. Every change calls `ctx.save()`. "Done, back to list" returns to `#/workout`.
- [ ] **Step 4: Verify in the browser** at 430×932: start workout A, open the third exercise first (free order works), confirm three sets, return to the list and see it marked done; reload the page mid-workout and the confirmed sets are still there with Today offering to resume; type `57,5` as a weight and it confirms as 57.5; a row with blank reps will not confirm; hide photos, open another exercise, they stay hidden; finish the workout with one exercise untouched, and it lands on Today with the next workout up. Start a second session of workout A: exercises show last time's numbers, and one where every set hit the top of the range shows the heavier suggestion and is pre-filled with the higher weight. Console has no errors.
- [ ] **Step 5:** Run `npm test`. **Commit:** `feat: workout logging`.

### Task 9: History, progress and muscles

**Model:** sonnet

**Files:**

- Create: `js/screens/history.js`, `js/screens/muscles.js`
- Modify: `styles.css`

**Interfaces:**

- Consumes: `exerciseHistory`, `isStuck`, `muscleTally`, `parseNum`, `validSet` from `js/logic.js`; `deleteSession` from `js/session.js`.
- Produces: `history.js` renders `#/history`, `#/history/<sessionId>` and `#/progress/<exerciseId>`; `muscles.js` renders `#/muscles`.

- [ ] **Step 1: History list.** Sessions newest first: workout name, date, exercise count, set count, duration in minutes. Below, a list of every exercise that appears in history with its first and latest heaviest weight (`50 → 60 kg`), or `30 kg · stuck` when `isStuck` is true. An empty state when there are no sessions.
- [ ] **Step 2: One session.** Every entry and set. Each set's weight and reps are editable in place with the same validation as Task 8; an invalid edit is not saved. A set can be deleted. "Delete workout" with confirmation calls `deleteSession`. All names come from the session's snapshot.
- [ ] **Step 3: Exercise progress.** For one exercise: each session's date and sets, newest first, and the stuck flag with one sentence explaining it.
- [ ] **Step 4: Muscles.** One bar per muscle in `MUSCLES`, labelled with its set count for the last 7 days, widths relative to the largest. Muscles at 0 are listed in a callout. No advice beyond that.
- [ ] **Step 5: Verify in the browser** at 430×932 with at least three sessions logged: editing a past set changes the "last time" numbers shown in the next workout; deleting a session updates the muscle bars; deleting a workout from the plan leaves its sessions readable in History. Console has no errors.
- [ ] **Step 6:** Run `npm test`. **Commit:** `feat: history and muscles`.

### Task 10: Install and offline

**Model:** sonnet. Follow the `mobile-native` skill.

**Files:**

- Create: `manifest.webmanifest`, `sw.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`
- Modify: `index.html`, `js/app.js`

- [ ] **Step 1: Manifest:** name `Gym Tracker`, `display: standalone`, `start_url: "./"`, `scope: "./"`, dark background and theme colours matching `styles.css`, the two icons. `index.html` links it and adds `apple-touch-icon`, `apple-mobile-web-app-capable` and a status-bar style. All paths relative, so the app works from a sub-path.
- [ ] **Step 2: Icons.** Draw one simple SVG mark in the accent colour and export the three PNG sizes (192, 512, 180) with a script using only Node built-ins or the browser pane's canvas. Report if neither works; do not add a dependency.
- [ ] **Step 3: Service worker.** A `CACHE` constant with a version string. On install, cache the app shell: `index.html`, `styles.css`, every file under `js/`, `data/exercises.json`, the manifest and icons. On fetch: cache-first for same-origin GET; images under `img/ex/` are cached on first successful fetch. After activation, the page asks the worker to fetch all exercise images in the background so the gym needs no signal. On activate, delete older caches. `app.js` registers it only when the protocol is `https:` or the host is `localhost`.
- [ ] **Step 4: Verify in the browser:** load once, wait for the background image caching, then stop the server and reload. The app opens, a workout can be started, and exercise photos show. Restart the server.
- [ ] **Step 5:** Run `npm test`. **Commit:** `feat: installable and offline`.

### Task 11: Design polish and stress test

**Model:** sonnet for the changes. Invoke the `impeccable` skill for the polish pass and the `break-ui` skill for the stress test.

**Files:**

- Modify: `styles.css`, screen modules as needed

- [ ] **Step 1: Polish** every screen against the spec's "Look and feel" section and the mockups: hierarchy, spacing, type scale, one accent colour, clear pressed states, numbers readable at arm's length. Motion is brief and respects `prefers-reduced-motion`.
- [ ] **Step 2: Stress test** with: a 60-character exercise name, a workout with 20 exercises, a plan with 8 workouts, weights of `0`, `0.5` and `1250`, 12 sets on one exercise, 200 sessions of history, and an empty plan. Fix what breaks: no horizontal scroll, no overlapping text, no unreachable buttons.
- [ ] **Step 3: Verify** at 430×932 and at 375×667 that every screen is usable, and that `npm test` passes.
- [ ] **Step 4: Commit:** `polish: visual pass and edge cases`.

### Task 12: Final review

**Model:** opus for the review; sonnet for fixes.

- [ ] **Step 1:** Review the whole branch against the spec, section by section, and against Global Constraints and Review Focus. Check specifically: no `localStorage` use outside `js/store.js`; every user string goes through `esc()`; no stored derived data; `tools/serve.mjs` cannot serve outside the root.
- [ ] **Step 2:** Run the `verify-work` skill.
- [ ] **Step 3:** Fix findings, re-run `npm test`, commit.
- [ ] **Step 4:** Report to the owner: what was built, anything the spec asked for that is missing, the size of the photo folder, and a recommendation for a free static host. Do not create accounts or publish.
