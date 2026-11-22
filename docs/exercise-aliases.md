# Exercise-name aliases: sources

Not shipped. Only exercise NAMES were read from these lists, to decide which spellings mean the same movement
and equipment as a library exercise. No descriptions, instructions or images were copied or added to the repo.
Lists were fetched into a scratch folder only.

| Source | URL | Licence | Aliases that appear verbatim in it |
|---|---|---|---|
| wger exercise database (API, English) | https://wger.de/api/v2/exerciseinfo/ | CC-BY-SA 4.0 (exercise data) | 21 |
| free-exercise-db (yuhonas) `dist/exercises.json` | https://github.com/yuhonas/free-exercise-db | Unlicense (public domain) | 10 |
| everkinetic/data | https://github.com/everkinetic/data | CC-BY-SA 3.0 (data) | 10 |
| Naming used by Hevy, Strong and ChatGPT-style plans ("Bench Press (Barbell)", "RDL", "OHP", "Pec Deck") | n/a, common usage | n/a (no data copied) | the rest |

Counts: 115 aliases were added to the library in this change (8 of them are the ones from the earlier forgiving-match
release, now moved out of the frozen legacy set). 34 of the 115 appear verbatim in at least one list (sources overlap,
so the per-source numbers do not add up); the other aliases come from common gym-app naming. Beyond the aliases, the
normalisation in `looseKey` and the "name + equipment" rule make many more source names resolve (for the three lists:
38 wger, 16 free-exercise-db and 26 everkinetic distinct names that were not library names).

## How aliases work now

- `LEGACY_ALIASES` in `js/planfile.js` is frozen: the aliases that existed before the forgiving-match release (e8763d3).
  A custom exercise named exactly like one of them, or like a library exercise, is treated as chosen on purpose.
- New aliases go in `MORE_ALIASES`. A custom exercise named like any of them is linked to the library on the next
  migration run, so adding an alias is all that is needed.
- `looseKey` folds spelling: DB/BB/KB, dumbell, plurals, bicep(s), "e-z", "body weight", single/one, stiff-legged,
  leverage = machine, filler words (with, on, the), word order, so "Bench Press (Barbell)" = "Barbell Bench Press".
- A library name or alias plus its own equipment is the same exercise ("Squat (Barbell)", "Lat Pulldown (Cable)").
  Keys that two exercises share match nothing.
- Left out on purpose: names with other equipment or another movement (dumbbell vs barbell, Smith, machine vs cable,
  incline vs flat, walking lunge, Bulgarian split squat, weighted variants) and bare generic names ("Dips", "Shrug",
  "Front Raise", "Leg Curl", "Dumbbell Row", "Bicep Curl", "Chest Fly").
