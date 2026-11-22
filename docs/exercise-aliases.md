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

## Full name pass (all English names, three sources)

Every English exercise name was read from wger (979), free-exercise-db (876) and Everkinetic (291) into a scratch
folder (names only, nothing copied into the repo) and classed:

- (a) the same movement and equipment as a library exercise (now 148 library exercises, including the 40 added with
  Everkinetic drawings in this release): the name resolves to it;
- (b) a different or uncommon exercise, or a name too loose to say ("Pullover", "Side bend", "Dumbbell Raise"):
  left unmatched on purpose, so it stays a custom exercise.

| Source | Names | (a) matched | (b) left unmatched |
|---|---|---|---|
| wger | 979 | 158 | 821 |
| free-exercise-db | 876 | 156 | 720 |
| Everkinetic | 291 | 119 | 172 |

Alias count: 310 alias spellings in the library now (EXTRA_ALIASES holds the ones from this pass). One new general rule in
`looseKey`: the word "custom" is ignored (wger marks user-added entries "(Custom)"). The 40 added exercises came with
their own names and a few common spellings ("Air Bike", "Thigh Adductor", "Dip Machine").

Strictness as before: other equipment, grip or stance variants (wide-grip, close-grip incline, seated vs standing
curl, walking lunge with a barbell, assisted/weighted versions), bands, TRX, kettlebell and Smith variants of an
exercise we have only free-weight, and bare names that fit two exercises are all category (b). The tests
(`tests/aliases.test.mjs`, table in `tests/alias-table.json`) check every (a) mapping below and a list of (b) near-misses.

### Category (a): source names that resolve, by library exercise

- `ab-crunch-machine`: Crunches on Machine; Ab Crunch Machine
- `ab-roller`: Ab wheel; Ab Roller
- `arnold-dumbbell-press`: Arnold Shoulder Press; Arnold Dumbbell Press; Arnold Press
- `back-extension`: Hyperextensions; Lower Back Extensions; Hyperextensions (Back Extensions)
- `barbell-curl`: Biceps Curls With Barbell; Barbell Curl; Biceps Curls with Barbell
- `barbell-deadlift`: Deadlifts; Barbell Deadlift; Barbell Dead Lifts
- `barbell-glute-bridge`: Barbell Glute Bridge
- `barbell-hip-thrust`: Hip Thrust; Hip Thrust (Custom); Barbell Hip Thrust
- `barbell-lunge`: Barbell Lunges Standing; Barbell Lunge; Barbell Lunges
- `barbell-overhead-triceps-extension`: Standing Overhead Barbell Triceps Extension; Seated Overhead Triceps Extension with Barbell; Standing Overhead Triceps Extension with Barbell
- `barbell-reverse-lunge`: Barbell Step Back Lunge; Rear Lunges with Barbell
- `barbell-shrug`: Shrugs, Barbells; Barbell Shrug; Barbell Shrugs
- `barbell-squat`: Squats; Barbell Full Squat; Barbell Squat
- `barbell-wrist-curl`: Barbell Wrist Curl
- `bench-dips`: Dips Between Two Benches; Chair dips; Bench Dips
- `bench-press`: Bench Press; Bench Press (Custom); Barbell Bench Press - Medium Grip
- `bent-over-barbell-row`: Bent Over Rowing; Bent Over Row; Bent Over Barbell Row; Bent Over Row with Barbell
- `bent-over-two-dumbbell-row`: Bent Over Two-Dumbbell Row
- `bicycle-crunch`: bicycle crunches; Air Bike
- `cable-crossover`: Fly With Cable; Cable Cross-over; Cable Crossover
- `cable-crunch`: Crunches With Cable; Crunches With Cable (Custom); Cable Crunch
- `cable-curl`: Biceps Curl With Cable; Straight Bar Cable Curls; Cable Curls; Standing Biceps Cable Curl; Standing Biceps Curl with Cable
- `cable-front-raise`: Front Raise (Cable); Front Cable Raise; Front Cable Raises
- `cable-rear-delt-fly`: Cable Rear Delt Fly; Bent-over Lateral Cable Raises
- `cable-rope-hammer-curl`: Cable Hammer Curls - Rope Attachment; Hammer Curls with Rope and Cable
- `cable-rope-overhead-triceps-extension`: Overhead Cable Tricep Extension; Cable Rope Overhead Triceps Extension; Triceps Overhead Extension with Rope
- `cable-seated-lateral-raise`: Cable Lateral Raises (Single Arm); Side Lateral Raise (Cable); Cable Seated Lateral Raise
- `cable-upright-row`: Upright Cable Row
- `cable-wrist-curl`: Wrist curl, cable; Cable Wrist Curl
- `calf-press-on-the-leg-press-machine`: Calf Press Using Leg Press Machine; Calf Press; Calf Press On The Leg Press Machine; Calves Press on Leg Machine
- `chest-dip`: Dips - Chest Version; Chest Dips
- `chin-up`: Chin Up; Chin-Up; Chin Ups
- `close-grip-barbell-bench-press`: Bench Press Narrow Grip; Close-Grip Barbell Bench Press; Close Grip Barbell Bench Press
- `close-grip-front-lat-pulldown`: Close-grip Lat Pull Down; V-Bar Pulldown; Close-Grip Front Lat Pulldown; V Bar Pull Down
- `concentration-curl`: Dumbbell Concentration Curl; Concentration Curls; Concentration Curls with Dumbbell
- `cross-body-crunch`: Cross-Body Crunch; Cross Body Crunch
- `cross-body-hammer-curl`: DB Cross Body Hammer Curls; Cross Body Hammer Curl; Cross Body Hammer Curl with Dumbbell
- `crunch`: Crunches; Abdominal Crunch; Crunches (Custom)
- `decline-barbell-bench-press`: Decline Bench Press Barbell; Decline Barbell Bench Press
- `decline-dumbbell-bench-press`: Decline Bench Press Dumbbell; Decline Dumbbell Bench Press
- `diamond-push-up`: Diamond push ups; Close-grip Press-ups; Close Triceps Pushup
- `donkey-calf-raise`: Donkey Calf Raises
- `drag-curl`: Drag Curl; Drag Curl with Barbell
- `dumbbell-bench-press`: Benchpress Dumbbells; Dumbbell Bench Press; Bench Press Dumbbell
- `dumbbell-bicep-curl`: Biceps Curls With Dumbbell; Alternating Biceps Curls With Dumbbell; Dumbbell Curl; Biceps Curls With Dumbbell (Custom); Dumbbell Alternate Bicep Curl; Dumbbell Bicep Curl; Alternating Bicep Curl with Dumbbell; Biceps Curl with Dumbbell
- `dumbbell-flyes`: Fly With Dumbbells; Dumbbell Flyes; Dumbbell Flys
- `dumbbell-lunges`: Dumbbell Lunges Standing; Dumbbell Lunges
- `dumbbell-one-arm-triceps-extension`: Dumbbell One-Arm Triceps Extension; Standing One-Arm Dumbbell Triceps Extension; One Arm Triceps Extension with Dumbbell; Standing One Arm Triceps Extension with Dumbbell
- `dumbbell-overhead-triceps-extension`: Triceps Overhead (Dumbbell); Standing Dumbbell Triceps Extension
- `dumbbell-pullover`: Cross-Bench Dumbbell Pullovers; Bent-Arm Dumbbell Pullover; Straight-Arm Dumbbell Pullover; Dumbbell Bent Arm Pullover; Straight Arm Dumbbell Pullover
- `dumbbell-reverse-curl`: Standing Dumbbell Reverse Curl; Biceps Curl Reverse with Dumbbells
- `dumbbell-shoulder-press`: Shoulder Press, Dumbbells; Dumbbell Shoulder Press; Seated Dumbbell Press; Standing Dumbbell Press
- `dumbbell-shrug`: Shrugs, Dumbbells; Dumbbell Shrug
- `dumbbell-side-bend`: Dumbbell Side Bend; Side Bend with Dumbbell
- `dumbbell-skullcrusher`: Skullcrusher Dumbbells; Lying Dumbbell Tricep Extension; Lying Triceps Extension with Dumbbells; Lying Two Arm Triceps Extension with Dumbbell
- `dumbbell-squat`: Dumbbell Squat; Squats using Dumbbells
- `dumbbell-step-ups`: Dumbbell Step Ups; Step Ups with Dumbbells
- `dumbbell-upright-row`: Upright Row w/ Dumbbells; Standing Dumbbell Upright Row; Dumbbell Upright Rows
- `dumbbell-wrist-curl`: Wrist curl, dumbbells
- `ez-bar-curl`: EZ-Bar Curl; EZ Bar Curl with Barbell
- `face-pull`: Facepull; Face Pull
- `front-dumbbell-raise`: Front Dumbbell Raise; Front Two-Dumbbell Raise
- `front-squat`: Front Squats; Front Barbell Squat; Front Squat with Barbell
- `glute-ham-raise`: Glute-Ham Raise; Glute Ham Raise; Natural Glute Ham Raise
- `glute-kickback`: Glute Kickback
- `goblet-squat`: Dumbbell Goblet Squat; Goblet Squat
- `good-morning`: Good Morning; Barbell Good Mornings
- `hack-squat`: Hack Squats; Hack Squats (Custom); Hack Squat; Hack Squat Machine
- `hammer-curl`: Hammer Curls; Alternating dumbbell hammer curl; Alternate Hammer Curl; Alternating Hammer Curl with Dumbbell; Biceps Hammer Curl with Dumbbell
- `hanging-leg-raise`: Hanging Leg Raises; Leg raises pull up bar; Hanging Leg Raises (Custom); Hanging Leg Raise
- `hip-abduction-machine`: Seated Hip Abduction; Machine Hip Abduction; Seated Hip Abduction (Custom); Thigh Abductor
- `hip-adduction-machine`: Seated Hip Adduction; Seated Hip Adduction (Custom); Thigh Adductor
- `incline-bench-press`: Incline Bench Press - Barbell; Barbell Incline Bench Press - Medium Grip; Incline Bench Press
- `incline-cable-flye`: Incline Cable Flye; Incline Cable Fly's
- `incline-dumbbell-curl`: Dumbbell Incline Curl; Alternate Incline Dumbbell Curl; Incline Dumbbell Curl; Alternating Incline Curl with Dumbbell; Incline Biceps Curl with Dumbbell
- `incline-dumbbell-fly`: Incline Dumbbell Fly; Incline Dumbbell Flyes; Incline Dumbbell Fly's
- `incline-dumbbell-press`: Incline Bench Press - Dumbbell; Incline Dumbbell Press; Dumbbell Incline Bench Press
- `incline-dumbbell-shoulder-press`: Incline Shoulder Press Dumbbell
- `inverted-row`: Inverted Rows; Australian pull-ups; Inverted Row; Body Row
- `jm-press`: JM Press
- `lateral-raise`: Lateral Raises; Dumbbell Lateral Raise (Custom); Side Lateral Raise; Lateral Dumbbell Raises
- `leg-extension`: Leg Extension; Leg Extension (Custom); Leg Extensions
- `leg-press`: Leg Press; Leg Press (Custom)
- `leverage-chest-press`: Chest Press; Leverage Machine Chest Press; Leverage Chest Press; Machine Bench Press
- `leverage-high-row`: Leverage High Row
- `lying-leg-curl`: Leg Curls (laying); Lying Leg Curls; Lying Leg Curl Machine
- `lying-leg-raise`: Leg Raises, Lying; Flat Bench Lying Leg Raise; Flat Bench Leg Raises
- `machine-bicep-curl`: Biceps Curl Machine; Machine Bicep Curl; Bicep Curl with Machine
- `machine-preacher-curl`: Preacher Curl Machine; Machine Preacher Curls; Preacher Curl with Machine
- `machine-shoulder-military-press`: Shoulder Press, on Machine; Shoulder Press, on Machine (Custom); Leverage Shoulder Press; Machine Shoulder (Military) Press; Seated Shoulder Press Machine
- `machine-triceps-extension`: Machine Triceps Extension; Triceps Extensions using Machine
- `one-arm-dumbbell-preacher-curl`: One Arm Dumbbell Preacher Curl; One Arm Preacher Curl with Dumbbell
- `one-arm-dumbbell-row`: One-Arm Dumbbell Row
- `one-arm-dumbbell-shoulder-press`: Single-arm dumbbell shoulder press; Dumbbell One-Arm Shoulder Press; One Arm Dumbbell Shoulder Press
- `one-legged-cable-kickback`: One-Legged Cable Kickback; One Legged Cable Kickback
- `overhead-press`: Shoulder Press, Barbell; Overhead Press; Overhead Barbell Press; Barbell Shoulder Press; Seated Barbell Military Press; Standing Military Press; Seated Military Press
- `overhead-squat`: Overhead Squat; Overhead Squat with Barbell
- `pallof-press`: Pallof Press
- `pec-deck-fly`: Machine chest fly; Pec Deck; Butterfly Machine
- `plank`: Plank; Front Plank
- `preacher-curl`: Preacher Curls; Preacher Curl; Preacher Curl with Barbell
- `pull-through`: Cable pull through; Pull Through
- `pull-up`: Pull-ups; Pull-ups (Custom); Pullups; Pull Ups
- `push-up`: Push-Up; Pushups; Push Ups
- `rear-delt-fly`: Bent-over Lateral Raises
- `reverse-barbell-wrist-curl`: Barbell Reverse Wrist Curl
- `reverse-crunch`: Reverse crunch; Reverse Crunch
- `reverse-grip-lat-pulldown`: Underhand Lat Pull Down; Underhand Cable Pulldowns; Underhand Pull downs; Underhand Pull down
- `reverse-grip-triceps-pushdown`: Reverse Grip Triceps Pushdown
- `reverse-machine-flyes`: Reverse Machine Flyes
- `romanian-deadlift`: Romanian Deadlift; Barbell Romanian Deadlift (RDL); Romanian Deadlift (Custom); Romanian Dead Lift
- `rope-triceps-pushdown`: Tricep Rope Pushdowns; Triceps Pushdown - Rope Attachment; Triceps Pushdown with Rope and Cable
- `russian-twist`: Russian Twist
- `seated-cable-row`: Seated Cable Row; Seated Cable Rows
- `seated-calf-raise`: Seated Calf Raise; Seated Calf Raise using Machine
- `seated-dip-machine`: Dip Machine; Tricep Dips using Machine
- `seated-leg-curl`: Leg Curls (sitting); Leg Curls (sitting) (Custom); Seated Leg Curl
- `seated-one-leg-calf-raise`: Dumbbell Seated One-Leg Calf Raise; Seated One Leg Calf Raise with Dumbbell
- `single-leg-glute-bridge`: Single Leg Glute Bridge
- `sit-up`: Sit-ups; Sit-Up
- `skullcrusher`: Lying Triceps Extensions; EZ-Bar Skullcrusher; Lying Triceps Press with Barbell
- `smith-machine-bench-press`: Smith Machine Bench Press
- `smith-machine-calf-raise`: Smith Machine Calf Raise
- `smith-machine-incline-bench-press`: Smith Machine Incline Bench Press
- `smith-machine-squat`: Squats on Multipress; Smith machine squat; Smith Machine Squat; Smith Machine Squats
- `spider-curl`: Spider Curl; Spider Curl with Barbell
- `split-squat-with-dumbbells`: Dumbbell Split Squat; Split Squat with Dumbbells; Split Squats
- `standing-barbell-calf-raise`: Standing Barbell Calf Raise
- `standing-calf-raise`: Standing Calf Raises; Standing Calf Raises using Machine
- `standing-dumbbell-calf-raise`: Dumbbell Calf Raise; Calf Raise On A Dumbbell; Standing Dumbbell Calf Raise; Standing Calf Raise with Dumbbell
- `standing-leg-curl`: Leg Curls (standing); Standing Leg Curl; Standing Leg Curls
- `stiff-leg-deadlift`: Stiff-legged Deadlifts; Stiff-Legged Barbell Deadlift
- `stiff-legged-dumbbell-deadlift`: Stiff-Legged Dumbbell Deadlift
- `straight-arm-pulldown`: Straight-arm Pull Down (bar Attachment); Straight-arm Pull Down (rope Attachment); Straight-Arm Pulldown (Cable); Straight-arm Pull Down (bar Attachment) (Custom); Rope Straight-Arm Pulldown; Straight-Arm Pulldown; Straight Arm Push Down
- `superman`: Superman; Supermans
- `t-bar-row`: Rowing, T-bar; T-Bar row; T-Bar Row with Handle; T-Bar Rows
- `tricep-dumbbell-kickback`: Tricep Dumbbell Kickback; Triceps Kickback with Dumbbell
- `triceps-dip`: Dips - Triceps Version; Tricep Dips using Body Weight
- `triceps-pushdown`: Tricep Pushdown on Cable; Triceps Pushdown; Triceps Pushdown (Custom); Triceps Pushdown with Cable
- `upright-row`: Upright Barbell Row; Upright Barbell Rows
- `v-bar-triceps-pushdown`: Triceps Pushdown - V-Bar Attachment; Triceps Pushdown with V Bar and Cable
- `walking-lunge`: Dumbbell Lunges Walking; Walking Lunges
- `wide-grip-lat-pulldown`: Lat Pull Down (Leaning Back); Lat Pull Down (Straight Back); Wide-grip Pulldown; Wide-grip Pulldown (Custom); Wide-Grip Lat Pulldown; Wide Grip Lat Pull Down
- `wrist-roller`: Wrist Roller
- `zottman-curl`: Zottman curl; Zottman Curl; Zottman Curl with Dumbbells
