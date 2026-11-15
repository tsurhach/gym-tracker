# Gym Tracker: Design

Date: 2026-11-15

Items marked **(owner)** were decided by the owner. Items marked **(builder's call)** were chosen by the designer and can be changed.

## Why

The owner trains from memory. Mid-workout they cannot recall exactly what they lifted last time, so they cannot tell whether to go heavier. The app's central job: at each exercise, show last session's weights and reps and say plainly whether to add weight today.

Success is the owner using it every session on their iPhone because logging is faster than remembering.

## Goals

- **(owner)** Log each workout: which exercises, and for every set the weight and reps. Entries can be corrected afterwards.
- **(owner)** At each exercise, show the previous session's sets for that exercise.
- **(owner)** Tell the user what to do to improve, driven by a rep range that comes from a chosen training goal.
- **(owner)** Keep every past workout so the user can look back.
- **(owner)** Track which muscles have been worked.
- **(owner)** Workout days are fully dynamic: any number of days, any exercises. The owner uses A/B today.
- **(owner)** The app proposes a plan from the goal; the user can edit all of it.
- **(owner)** Each exercise has a two-photo flip (start and end position) that can be hidden.
- **(owner)** During a workout the user picks any exercise in any order. No forced sequence.
- **(owner)** Looks good, is easy to understand, and is built for phone use (iPhone 15 Pro Max first).

## Non-goals for this version

- **(owner)** Rest timer, body-weight tracking and accounts are out of this version but **will be added** once the app is running well. See "Room for later".
- Syncing between devices, social features, nutrition, cardio tracking.
- Real exercise video.
- An App Store app.

## Anti-goals

- Logging a set must never take more than a tap or two when the numbers match the pre-fill. If logging is slower than remembering, the app has failed.
- No charts the user must interpret to get advice. Advice is a plain sentence.
- No data loss: a closed tab, a phone lock or a crash mid-workout must not lose logged sets.

## How it gets made

- **(builder's call)** A web app installed to the iPhone home screen (PWA): full-screen, own icon, works offline. Reason: the owner is on Windows; a native iOS app needs a Mac and a paid developer account.
- **(builder's call)** Plain HTML, CSS and JavaScript modules with no framework and no build step, served as static files. Reason: smallest thing that works and can be hosted anywhere free.
- **(builder's call)** All data in the phone's browser storage (`localStorage`, one JSON document), read and written through a single storage module. No server, no login. A workout in progress is saved after every change.
- **(builder's call)** Backup: export all data to a JSON file and import it back, from a settings screen. Import replaces current data after a confirmation.
- **(builder's call)** A service worker caches the app and the exercise photos so it works with no signal.
- Hosting: any free static host over HTTPS. The owner must be asked before an account is created or anything is published.
- Sharing later works by sending the link; each person gets their own data on their own phone.

## The exercise library

- **(builder's call)** Bundled with the app: a curated set of roughly 80 to 120 common gym exercises, not the full source library, to keep the app small.
- Each exercise has: name, primary muscle group, secondary muscle groups, equipment, two photos.
- Source: a free, openly licensed exercise dataset with start/end photos. The candidate is `free-exercise-db`; its licence must be verified before use, and the owner must approve the download. If an exercise has no usable photos it simply shows none.
- The user can add custom exercises (name, muscle groups, no photo required).
- **(builder's call)** Muscle groups: Chest, Back, Shoulders, Biceps, Triceps, Forearms, Abs, Quads, Hamstrings, Glutes, Calves.

## Goals and rep ranges

The user picks one training goal. It sets the default rep range and set count for exercises in the plan.

| Goal         | Reps  | Sets |
| ------------ | ----- | ---- |
| Strength     | 4–6   | 3    |
| Build muscle | 8–12  | 3    |
| Endurance    | 12–20 | 3    |

- **(builder's call)** These numbers.
- **(owner)** Rep range depends on the goal. **(builder's call)** It can also be overridden per exercise.

## The improvement advice

Per exercise, comparing against the most recent session that included it:

- **Go heavier:** every set last time reached the top of the rep range at the same weight. Message: "You hit 12 on every set. Try 57.5 kg today." The suggested weight is last weight plus that exercise's step.
- **Stay:** otherwise. Message: "Stay at 50 kg and beat your reps."
- **Stuck:** no increase in weight or total reps across the last 3 sessions of that exercise. Shown as a flag in History.
- **First time:** no history. Message invites the user to pick a starting weight.

**(owner)** The weight step is flexible: each exercise has its own step, default 2.5 kg, and the user can set it to 0.5, 1.25 or any other value. The suggestion is only a pre-fill; the user can type any weight in any set.

**(builder's call)** Units are kilograms only.

## Plan proposal

**(owner)** Plan structure is completely free. The user decides how many distinct workouts there are (one, A/B, A/B/C, A/B/C/D, or more) and which muscle groups each workout trains. "Full body" means a single workout that trains every muscle group, not an A/B pair.

Setup, on first run and any time from the Plan tab:

1. Pick the goal.
2. Choose the number of workouts. They are named A, B, C... by default and can be renamed.
3. For each workout, tick the muscle groups it trains. Any combination is allowed, and a muscle group may appear in several workouts.
4. The app proposes exercises for each workout from the library, covering the ticked muscle groups, with sets and rep range from the goal.

**(builder's call)** To save tapping, step 2 offers ready-made starting points that pre-fill steps 2 and 3 and remain fully changeable: Full body (one workout, all muscle groups), Upper / Lower, and Push / Pull / Legs. The app does not ask for training days per week; the rotation simply repeats the workouts however often the user trains. It assumes a fully equipped gym.

**(builder's call)** A proposed workout gets one or two exercises per ticked muscle group, about 5 to 8 in total; a full-body workout gets one per major group.

Everything is then editable: rename, add, remove and reorder workouts; change a workout's muscle groups; add, remove and reorder exercises; change sets, rep range and weight step per exercise. The user can also skip the proposal and build from empty.

## Screens

Four tabs at the bottom: Today, History, Muscles, Plan. Mockups the owner saw and accepted in layout are in `.superpowers/brainstorm/1027-1794757943/content/` (`main-screens.html`, `workout-v2.html`). Colours there are placeholders.

**Today**

- The next workout day in rotation (the one after the most recently completed day), with a large start button. Any other day can be started instead.
- A summary of the current week: workouts done, muscle groups not yet trained.

**Workout in progress** (owner-approved flow)

- A list of that day's exercises. Each row shows done, partly done or untouched, plus last time's numbers or the "go heavier" hint.
- Tap any exercise in any order. Finishing one returns to the list.
- "Add another exercise" adds one from the library for this session only. **(builder's call, owner did not object)**
- "Finish workout" saves it to history. Unfinished exercises are simply not recorded.

**One exercise**

- Name, muscle tags, and the photo flip with a hide/show switch. The choice is remembered across exercises and sessions.
- "Last time" card with date, sets and the advice sentence.
- Set rows pre-filled with the suggested weight and last time's reps. One tap confirms a set; tapping a number edits it. Sets can be added or removed.

**History**

- Past workouts, newest first: date, day name, exercise and set counts, duration.
- Open a workout to see and edit every set, or delete the workout (with confirmation).
- Per-exercise progress: first to latest weight, and the stuck flag.

**Muscles**

- Sets per muscle group over the last 7 days, as bars.
- **(builder's call)** A set counts toward the exercise's primary muscle group only.
- Muscle groups with no sets are called out.

**Plan**

- Goal, the list of days, and each day's exercises, all editable as described above.
- Settings: hide photos, backup export/import.

## Look and feel

- Dark theme, one strong accent colour, large tap targets, numbers large enough to read at arm's length.
- Must feel like an installed app on iPhone: respects the notch and home indicator, no page zoom on input focus, no tap flash, numeric keypad for weight and reps.
- Final visual design is left to the builder, using the design skills available, within the layout the owner accepted.

## Room for later

The owner has said these will be added once the app runs well: rest timer, body-weight tracking, accounts.

**(owner)** Also for later: uploading a PDF or document containing a training plan, which the app reads and uses to help set up the plan.

This version builds none of them. It only avoids blocking them:

- All storage goes through one module, so it can later be backed by a server.
- Every record (day, exercise, workout, set) has a unique id and a timestamp.
- The saved data carries a version number so its shape can be migrated.

## Exact rules (all builder's call, settled after review)

Nothing derived is stored. Advice, flags, rotation and muscle tallies are always recomputed from the logged workouts, so editing or deleting history updates them.

**Advice.** Uses the exercise's current rep range and planned set count, and the most recent finished workout containing the exercise. Let W be the heaviest weight logged that session.

- Go heavier: at least the planned number of sets were done at W, and each of them reached the top of the range. Suggest W + step.
- Otherwise stay at W.
- Pre-fill: weight is the suggestion for every set. Reps are last time's reps for the same set number when staying, and the bottom of the range when going heavier or when there is no matching set.

**Stuck.** Needs at least 3 sessions of the exercise. One session beats the previous one if its heaviest weight is higher, or the heaviest weight is equal and total reps across all sets are higher. Stuck means neither of the last two sessions beat the one before it.

**Rotation.** "Up next" is the day after, in current plan order, the day of the most recently finished workout, whichever day that was, wrapping to the first. With no history, or if that day was deleted, it is the first day.

**Workout in progress.** Only one at a time. It survives closing the app and is offered for resuming on Today. "Finish workout" saves every confirmed set, including those of partly done exercises; unconfirmed rows are dropped. The workout's date is its start time; duration is start to finish. An in-progress workout can also be discarded, with confirmation.

**Week.** Both the Today summary and the Muscles tab use a rolling last 7 days.

**Photo licence finding (checked 2026-11-15).** `free-exercise-db` is released under the Unlicense (public domain), with no attribution required. Its licence text speaks of "this software" and does not mention the photos, and the data comes from an upstream dataset whose licence was not verified. So the exercise data is safe to use; rights to the photos are unverified. **(owner)** Use the photos for the owner's own copy. Before the app is shared with anyone else, the photo rights must be re-checked or the photos replaced.

**Photos are optional.** The flip is built so an exercise with no photos works fine. If the photo source falls through, the app ships without photos and nothing else changes. The builder hand-picks the curated exercises.

**Backup reminder.** If there is data and no export in the last 30 days, Today shows a small dismissible reminder to back up.

## Left to the builder

- File layout, naming, and the exact data shape.
- Which exercises make the curated library.
- Visual design details and motion.
- Which static host to propose to the owner.
- Tests: the advice rule, the rotation rule and the muscle tally each need a runnable check.
