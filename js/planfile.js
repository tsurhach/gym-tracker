// Plan file format: a whole training plan as plain JSON (names only, no ids), so a person or an AI
// can write one. Pure module: no DOM, no storage.
import { DEFAULT_STEP, GOALS, MUSCLES } from "./constants.js";
import { ltrText as N, t as tr } from "./i18n/index.js";

export const FORMAT = "gym-tracker-plan";
export const VERSION = 1;
export const LIMITS = {
  days: [1, 14],
  exercises: [1, 20],
  sets: [1, 10],
  reps: [1, 100],
  seconds: [1, 3600], // timed exercises keep seconds in reps; only exercises flagged timed may go above reps[1]
  step: [0.25, 25],
  name: 80,
  dayName: 40, // the Plan screen's own limit for a workout name
  notes: 500,
};

export const PLAN_FILE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Gym Tracker plan",
  type: "object",
  required: ["format", "version", "name", "goal", "days"],
  properties: {
    format: { const: FORMAT },
    version: { const: VERSION },
    name: { type: "string", minLength: 1, maxLength: LIMITS.name },
    goal: {
      enum: Object.keys(GOALS),
      description: "strength, muscle or endurance",
    },
    notes: { type: "string", maxLength: LIMITS.notes },
    days: {
      type: "array",
      minItems: LIMITS.days[0],
      maxItems: LIMITS.days[1],
      items: {
        type: "object",
        required: ["name", "exercises"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: LIMITS.dayName },
          exercises: {
            type: "array",
            minItems: LIMITS.exercises[0],
            maxItems: LIMITS.exercises[1],
            items: {
              type: "object",
              required: ["name", "sets", "reps"],
              properties: {
                name: {
                  type: "string",
                  minLength: 1,
                  maxLength: LIMITS.name,
                  description: "Plain exercise name, e.g. Barbell Squat",
                },
                sets: {
                  type: "integer",
                  minimum: LIMITS.sets[0],
                  maximum: LIMITS.sets[1],
                },
                reps: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: {
                    type: "integer",
                    minimum: LIMITS.reps[0],
                    maximum: LIMITS.reps[1],
                  },
                  description: "[lowest, highest] reps, lowest <= highest",
                },
                step: {
                  type: "number",
                  minimum: LIMITS.step[0],
                  maximum: LIMITS.step[1],
                  description: `kg added when ready for more; default ${DEFAULT_STEP}`,
                },
                muscle: {
                  enum: MUSCLES,
                  description:
                    "Only needed for exercises that are not common gym exercises",
                },
              },
            },
          },
        },
      },
    },
  },
};

// ---- names ----
// Lowercase letters and digits only: "Pull-Up", "pull up" and "PULLUP" are one name. Any script counts
// as letters, so two Hebrew names never collapse to the same empty key; accents are dropped.
export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "");

// Other common names -> library exercise id. Exact only; anything else is a new custom exercise.
// FROZEN: the aliases that existed before the forgiving-match release (e8763d3). A custom named exactly like one of
// these is treated as chosen on purpose. Never edit this list; new aliases go in MORE_ALIASES below.
export const LEGACY_ALIASES = {
  "bench-press": [
    "barbell bench press",
    "flat bench press",
    "flat barbell bench press",
    "bb bench press",
  ],
  "dumbbell-bench-press": ["db bench press", "flat dumbbell press"],
  "split-squat-with-dumbbells": [
    "split squat with dumbbells",
    "split squat",
    "dumbbell split squat",
    "static lunge",
  ],
  "incline-dumbbell-press": ["db incline press", "incline db press"],
  "overhead-press": [
    "ohp",
    "military press",
    "barbell overhead press",
    "standing overhead press",
    "barbell shoulder press",
    "standing barbell press",
  ],
  "romanian-deadlift": ["rdl", "barbell romanian deadlift"],
  "barbell-deadlift": ["deadlift", "conventional deadlift"],
  "barbell-squat": ["squat", "back squat", "barbell back squat"],
  "bent-over-barbell-row": [
    "barbell row",
    "bent over row",
    "barbell bent over row",
    "bb row",
  ],
  "wide-grip-lat-pulldown": ["lat pulldown", "lat pull down"],
  "seated-cable-row": ["seated row", "cable row"],
  "pull-up": ["pullup", "pull ups", "pullups"],
  "chin-up": ["chinup", "chin ups", "chinups"],
  "push-up": ["pushup", "push ups", "pushups"],
  // "chest fly" and "bicep curl" are left out on purpose: the library has several of each.
  "dumbbell-flyes": ["dumbbell fly", "dumbbell flies"],
  "leverage-chest-press": ["chest press", "machine chest press"],
  "dumbbell-bicep-curl": ["dumbbell curl", "db curl"],
  "smith-machine-squat": ["smith squat"],
  "triceps-pushdown": ["tricep pushdown", "cable pushdown", "pushdown"],
  "triceps-dip": ["tricep dip", "tricep dips", "triceps dips"],
  skullcrusher: [
    "skull crusher",
    "skull crushers",
    "skullcrushers",
    "lying triceps extension",
  ],
  "close-grip-barbell-bench-press": [
    "close grip bench press",
    "close grip bench",
  ],
  "lateral-raise": ["lateral raises", "side raise", "dumbbell lateral raise"],
  "face-pull": ["face pulls"],
  "barbell-hip-thrust": ["hip thrust", "hip thrusts"],
  "standing-calf-raise": ["calf raise", "calf raises"],
  "back-extension": ["hyperextension", "back extensions"],
  "ez-bar-curl": ["ez curl", "ez bar curl", "ez curl bar curl"],
};
Object.freeze(LEGACY_ALIASES);

// Aliases added since: the ones from the forgiving-match release (e8763d3), then names from the free exercise
// lists (see docs/exercise-aliases.md). Add new ones HERE. Every alias in this list (and every future one) also
// re-links an existing custom exercise spelled exactly like it (see looseMatch), so nothing else needs keeping in sync.
// Only the same movement on the same equipment belongs here; when in doubt, leave it out.
const MORE_ALIASES = {
  "close-grip-front-lat-pulldown": [
    "close grip lat pulldown",
    "close grip pulldown",
    "narrow grip lat pulldown",
    "v bar lat pulldown",
  ],
  "rope-triceps-pushdown": [
    "rope pushdown",
    "cable rope pushdown",
    "triceps rope pushdown",
    "cable rope triceps pushdown",
  ],
  "incline-bench-press": ["incline barbell press"],
  "dumbbell-bench-press": ["flat dumbbell bench press"],
  "incline-dumbbell-press": ["incline dumbbell bench press"],
  "decline-barbell-bench-press": ["decline bench press"],
  "push-up": ["press up", "press ups"],
  "dumbbell-flyes": ["dumbbell chest fly", "flat dumbbell fly"],
  "cable-crossover": ["cable fly", "cable chest fly"],
  "pec-deck-fly": [
    "pec deck",
    "pec dec",
    "pec deck machine",
    "machine chest fly",
    "machine fly",
    "butterfly machine",
    "butterfly pec deck",
  ],
  "leverage-chest-press": ["seated chest press", "machine bench press"],
  "chest-dip": ["dips chest version"],
  "triceps-dip": ["dips triceps version"],
  "wide-grip-lat-pulldown": ["wide grip pulldown"],
  "straight-arm-pulldown": ["straight arm lat pulldown"],
  "back-extension": [
    "hyperextension back extension",
    "45 degree back extension",
    "45 degree hyperextension",
    "roman chair back extension",
  ],
  "dumbbell-shoulder-press": [
    "dumbbell overhead press",
    "seated dumbbell shoulder press",
    "seated dumbbell press",
    "standing dumbbell shoulder press",
  ],
  "arnold-dumbbell-press": ["arnold press", "arnold shoulder press"],
  "lateral-raise": ["side lateral raise"],
  "face-pull": ["rope face pull", "cable rope face pull"],
  "rear-delt-fly": [
    "dumbbell reverse fly",
    "bent over reverse fly",
    "bent over rear delt fly",
    "rear delt reverse fly dumbbell",
  ],
  "reverse-machine-flyes": [
    "machine rear delt fly",
    "reverse pec deck",
    "rear delt reverse fly machine",
  ],
  "machine-shoulder-military-press": [
    "machine shoulder press",
    "seated machine shoulder press",
    "machine military press",
  ],
  "barbell-curl": ["standing barbell curl", "barbell bicep curl"],
  "dumbbell-bicep-curl": [
    "alternating dumbbell curl",
    "alternating dumbbell bicep curl",
    "standing dumbbell curl",
    "standing dumbbell bicep curl",
  ],
  "cable-rope-hammer-curl": ["cable hammer curl", "rope hammer curl"],
  "preacher-curl": ["ez bar preacher curl", "ez preacher curl"],
  "incline-dumbbell-curl": ["incline dumbbell bicep curl"],
  "cable-curl": ["cable bicep curl", "standing cable curl"],
  "machine-bicep-curl": ["machine curl"],
  "ez-bar-curl": ["ez bar bicep curl"],
  "triceps-pushdown": ["triceps pressdown", "straight bar pushdown"],
  skullcrusher: ["barbell skullcrusher", "barbell skull crusher"],
  "cable-rope-overhead-triceps-extension": [
    "cable overhead triceps extension",
    "rope overhead triceps extension",
  ],
  "bench-dips": ["bench tricep dip"],
  "dumbbell-one-arm-triceps-extension": ["single arm dumbbell triceps extension"],
  crunch: ["abdominal crunch", "ab crunch"],
  "cable-crunch": ["kneeling cable crunch"],
  plank: ["front plank", "forearm plank"],
  "ab-crunch-machine": ["crunch machine", "abdominal machine", "ab machine", "seated ab crunch machine"],
  "ab-roller": ["ab wheel", "ab wheel rollout", "ab rollout", "wheel rollout"],
  "barbell-squat": ["high bar squat", "low bar squat"],
  "leg-press": ["45 degree leg press"],
  "leg-extension": ["seated leg extension"],
  "goblet-squat": ["dumbbell goblet squat"],
  "lying-leg-curl": ["lying hamstring curl", "prone leg curl"],
  "seated-leg-curl": ["seated hamstring curl"],
  "stiff-leg-deadlift": ["sldl", "straight leg deadlift"],
  "glute-ham-raise": ["ghr"],
  "glute-kickback": ["glute kickback", "donkey kick", "donkey kicks"],
  "cable-glute-kickback": ["standing cable kickback", "cable kickback"],
  "hip-abduction-machine": ["seated hip abduction", "abductor machine", "hip abductor machine"],
  "calf-press-on-the-leg-press-machine": [
    "calf raise on leg press",
    "leg press calf raise",
    "calf press leg press",
  ],
  "standing-barbell-calf-raise": ["barbell calf raise"],
  "standing-dumbbell-calf-raise": ["dumbbell calf raise"],
};

// Third batch: the full name pass over wger, free-exercise-db and everkinetic, and the exercises added with the
// Everkinetic drawings (docs/exercise-aliases.md). Same rule: same movement on the same equipment, else leave it out.
const EXTRA_ALIASES = {
  "bench-press": ["barbell bench press medium grip", "bench press custom"],
  "dumbbell-bench-press": ["benchpress dumbbells"],
  "close-grip-barbell-bench-press": ["bench press narrow grip", "narrow grip bench press"],
  "overhead-press": ["standing military press", "seated barbell military press"],
  "bent-over-barbell-row": ["bent over rowing"],
  "t-bar-row": ["rowing t bar", "t bar row with handle"],
  "straight-arm-pulldown": ["straight arm push down",
    "rope straight arm pulldown",
    "straight arm pull down bar attachment",
    "straight arm pull down rope attachment",
  ],
  "wide-grip-lat-pulldown": ["pull down wide bar wide grip", "lat pull down leaning back", "lat pull down straight back"],
  "close-grip-front-lat-pulldown": ["v bar pulldown"],
  "reverse-grip-lat-pulldown": [
    "underhand pull downs",
    "underhand pull down",
    "underhand lat pull down",
    "underhand lat pulldown",
    "underhand grip lat pulldown",
    "supinated lat pulldown",
    "reverse grip pulldown",
  ],
  "inverted-row": ["body row", "bodyweight row", "australian pull ups", "australian pull up"],
  "hanging-leg-raise": ["leg raises pull up bar"],
  "rear-delt-fly": ["bent over lateral raises", "bent over lateral raise"],
  "front-dumbbell-raise": ["front two dumbbell raise"],
  "dumbbell-shoulder-press": ["standing dumbbell press"],
  "cable-seated-lateral-raise": [
    "cable lateral raise",
    "cable lateral raises",
    "lateral raise cable",
    "side lateral raise cable",
    "cable lateral raises single arm",
  ],
  "cable-rear-delt-fly": ["bent over lateral cable raises"],
  "dumbbell-pullover": [
    "dumbbell bent arm pullover",
    "bent arm dumbbell pullover",
    "cross bench dumbbell pullovers",
    "straight arm dumbbell pullover",
  ],
  "incline-bench-press": ["barbell incline bench press medium grip"],
  "incline-dumbbell-fly": ["incline dumbbell fly s", "incline dumbbell flys"],
  "incline-cable-flye": ["incline cable fly s"],
  "smith-machine-bench-press": ["smith bench press", "bench press smith", "smith machine flat bench press"],
  "smith-machine-incline-bench-press": ["smith incline bench press", "incline bench press smith"],
  "smith-machine-squat": ["squats on multipress"],
  "bench-dips": ["dips between two benches", "chair dips"],
  "seated-dip-machine": ["dip machine", "triceps dip machine", "tricep dips using machine", "machine dips"],
  "dumbbell-skullcrusher": [
    "lying dumbbell tricep extension",
    "lying triceps extension with dumbbells",
    "lying two arm triceps extension with dumbbell",
  ],
  "dumbbell-overhead-triceps-extension": ["triceps overhead dumbbell", "standing dumbbell triceps extension"],
  "dumbbell-one-arm-triceps-extension": [
    "standing one arm dumbbell triceps extension",
    "standing one arm triceps extension with dumbbell",
  ],
  "barbell-overhead-triceps-extension": [
    "standing overhead barbell triceps extension",
    "standing overhead triceps extension with barbell",
    "seated overhead triceps extension with barbell",
  ],
  "diamond-push-up": ["close triceps pushup", "close grip push up", "close grip press ups", "triangle push up"],
  "rope-triceps-pushdown": ["triceps pushdown rope attachment", "triceps pushdown with rope and cable"],
  "v-bar-triceps-pushdown": [
    "triceps pushdown v bar attachment",
    "triceps pushdown with v bar and cable",
    "v bar pushdown",
  ],
  "cable-rope-hammer-curl": ["cable hammer curls rope attachment", "hammer curls with rope and cable"],
  "hammer-curl": [
    "biceps hammer curl with dumbbell",
    "alternating hammer curl with dumbbell",
    "alternate hammer curl",
    "alternating dumbbell hammer curl",
  ],
  "dumbbell-bicep-curl": ["dumbbell alternate bicep curl", "alternating bicep curl with dumbbell"],
  "incline-dumbbell-curl": ["alternate incline dumbbell curl", "alternating incline curl with dumbbell"],
  "cable-curl": ["standing biceps cable curl", "standing biceps curl with cable", "straight bar cable curls"],
  "ez-bar-curl": ["ez bar curl with barbell"],
  "dumbbell-reverse-curl": ["standing dumbbell reverse curl", "biceps curl reverse with dumbbells"],
  "barbell-squat": ["barbell full squat"],
  "barbell-lunge": ["barbell lunges standing"],
  "dumbbell-lunges": ["dumbbell lunges standing"],
  "barbell-reverse-lunge": ["rear lunges with barbell", "barbell step back lunge"],
  "lying-leg-curl": ["leg curls laying"],
  "seated-leg-curl": ["leg curls sitting"],
  "romanian-deadlift": ["barbell romanian deadlift rdl"],
  "glute-ham-raise": ["natural glute ham raise"],
  "hip-adduction-machine": ["thigh adductor", "seated hip adduction", "adductor machine", "hip adductor machine"],
  "calf-press-on-the-leg-press-machine": [
    "calves press on leg machine",
    "calf press using leg press machine",
  ],
  "lying-leg-raise": ["flat bench leg raises", "flat bench lying leg raise"],
  "barbell-deadlift": ["dead lifts barbell"],
  "dumbbell-shrug": ["shoulder shrugs dumbbell"],
  "hip-abduction-machine": ["thigh abductor"],
  "skullcrusher": ["lying triceps press with barbell"],
  "dumbbell-upright-row": ["upright row w dumbbells", "standing dumbbell upright row"],
  "roman-chair-side-bend": [
    "roman chair side bends",
    "lateral hyperextension",
    "side hyperextension",
    "45 degree side bend",
    "side bend on roman chair",
    "roman chair oblique",
    "hyperextension bench side bend",
    "weighted roman chair side bend",
  ],
  "bosu-ball-crunch": ["bosu crunch", "bosu crunches", "crunch on bosu", "crunches on bosu ball", "bosu ball crunches", "bosu sit up", "bosu sit ups", "bosu situp", "sit up on bosu", "sit ups on bosu ball", "bosu ball sit ups", "bosu ball sit up"],
  "high-to-low-cable-crossover": [
    "high to low cable fly",
    "cable fly high to low",
    "high pulley cable crossover",
    "lower chest cable fly",
    "downward cable fly",
  ],
  "mid-cable-crossover": ["mid cable fly", "mid chest cable fly", "middle cable crossover", "mid pulley cable crossover", "horizontal cable fly"],
  "low-to-high-cable-crossover": [
    "low to high cable fly",
    "cable fly low to high",
    "low pulley cable crossover",
    "upper chest cable fly",
    "upward cable fly",
  ],
};

// Fourth batch: the 105 exercises added with the owner's picks (aliases from the proposal). Same rule as above.
const NEW_ALIASES = {
  "incline-chest-press-machine": ["incline machine press","incline hammer strength press","seated incline press machine"],
  "incline-push-up": ["hands elevated push up","push up on bench"],
  "decline-push-up": ["feet elevated push up","feet on bench push up"],
  "dumbbell-floor-press": ["floor press dumbbell","db floor press"],
  "wide-grip-bench-press": ["wide grip bench","wide bench press"],
  "cable-chest-press": ["standing cable press","cable bench press","cable press"],
  "svend-press": ["plate squeeze press","plate press","chest squeeze press"],
  "dumbbell-squeeze-press": ["hex press","db hex press"],
  "wide-push-up": ["wide grip push up","wide hand push up"],
  "trx-push-up": ["suspension push up","ring push up","trx chest press"],
  "single-arm-cable-crossover": ["one arm cable fly","single arm cable fly"],
  "low-incline-dumbbell-press": ["30 degree dumbbell press","low incline db press"],
  "seated-machine-row": ["machine row","chest supported machine row","low row machine"],
  "chest-supported-dumbbell-row": ["incline dumbbell row","seal row dumbbell","incline bench row"],
  "assisted-pull-up-machine": ["assisted pull up","gravitron","assisted chin up"],
  "trap-bar-deadlift": ["hex bar deadlift","trap bar dl"],
  "sumo-deadlift": ["sumo dl","wide stance deadlift"],
  "pendlay-row": ["dead stop row","barbell row from floor"],
  "wide-grip-pull-up": ["wide pull up","wide grip pullup"],
  "single-arm-lat-pulldown": ["one arm lat pulldown","unilateral lat pulldown"],
  "single-arm-cable-row": ["one arm cable row","standing cable row"],
  "rack-pull": ["block pull","partial deadlift"],
  "landmine-row": ["landmine t bar row","v handle landmine row"],
  "iso-lateral-row-machine": ["hammer strength row","plate loaded row","iso lateral row"],
  "reverse-hyperextension": ["reverse hyper","reverse hyper machine"],
  "weighted-pull-up": ["pull up weighted","pull up with belt"],
  "trx-row": ["suspension row","ring row"],
  "cable-shrug": ["cable shrugs","standing cable shrug"],
  "smith-machine-shrug": ["smith shrug"],
  "lat-pulldown-machine": ["plate loaded pulldown","hammer strength pulldown","iso lateral pulldown"],
  "single-arm-cable-lateral-raise": ["cable side raise","one arm cable lateral raise","cable lateral raise behind"],
  "push-press": ["barbell push press"],
  "landmine-press": ["half kneeling landmine press","single arm landmine press"],
  "smith-machine-shoulder-press": ["smith overhead press","smith machine overhead press"],
  "kettlebell-overhead-press": ["kb press","kettlebell shoulder press"],
  "pike-push-up": ["pike pushup","shoulder push up"],
  "machine-lateral-raise": ["machine side raise","seated lateral raise machine"],
  "band-pull-apart": ["resistance band pull apart","band pull aparts"],
  "plate-front-raise": ["weight plate front raise"],
  "rear-delt-row": ["dumbbell rear delt row","rear delt row"],
  "barbell-front-raise": ["front raise barbell"],
  "seated-dumbbell-curl": ["seated bicep curl","seated db curl"],
  "bayesian-curl": ["bayesian curl","behind the back cable curl","cable curl facing away"],
  "single-arm-cable-curl": ["one arm cable curl"],
  "incline-hammer-curl": ["incline db hammer curl"],
  "overhead-cable-curl": ["cable double biceps curl","high pulley curl"],
  "single-arm-triceps-pushdown": ["one arm cable pushdown","single arm pushdown"],
  "single-arm-overhead-cable-extension": ["one arm cable overhead extension"],
  "weighted-triceps-dip": ["weighted dip","dip with belt"],
  "cable-triceps-kickback": ["cable kickback triceps"],
  "reverse-barbell-curl": ["reverse curl barbell","overhand barbell curl"],
  "farmers-walk": ["farmers carry","farmer carry","farmer walk"],
  "dead-hang": ["bar hang","hang from bar"],
  "reverse-ez-bar-curl": ["ez bar reverse curl","reverse curl ez"],
  "reverse-cable-curl": ["cable reverse curl"],
  "suitcase-carry": ["one arm farmer carry","single arm carry"],
  "side-plank": ["side bridge","lateral plank"],
  "hanging-knee-raise": ["hanging knee tuck"],
  "captains-chair-leg-raise": ["vertical knee raise","roman chair leg raise","leg raise station"],
  "hollow-body-hold": ["hollow hold","hollow rock position"],
  "l-sit": ["l sit hold","parallel bar l sit"],
  "dead-bug": ["deadbug"],
  "v-up": ["v ups","jackknife sit up"],
  "decline-sit-up": ["decline bench sit up"],
  "cable-woodchop": ["high to low woodchop","woodchopper"],
  "mountain-climber": ["mountain climbers"],
  "bird-dog": ["bird dog hold"],
  "flutter-kicks": ["flutter kick"],
  "stability-ball-crunch": ["swiss ball crunch","exercise ball crunch"],
  "toes-to-bar": ["t2b","hanging toes to bar"],
  "bulgarian-split-squat": ["bulgarian","rear foot elevated split squat","rfess"],
  "wall-sit": ["wall squat hold"],
  "bodyweight-squat": ["air squat","squat bodyweight"],
  "dumbbell-reverse-lunge": ["db reverse lunge"],
  "lateral-lunge": ["side lunge","side lunges"],
  "jump-squat": ["squat jump"],
  "box-jump": ["box jumps"],
  "single-leg-press": ["one leg leg press","unilateral leg press"],
  "single-leg-extension": ["one leg leg extension"],
  "sled-push": ["prowler push"],
  "pendulum-squat": ["pendulum squat machine"],
  "pistol-squat": ["single leg squat","one leg squat"],
  "dumbbell-romanian-deadlift": ["db rdl","dumbbell rdl"],
  "single-leg-romanian-deadlift": ["single leg rdl","one leg rdl"],
  "kettlebell-swing": ["kb swing","russian kettlebell swing"],
  "nordic-hamstring-curl": ["nordic curl","nordics"],
  "stability-ball-leg-curl": ["swiss ball hamstring curl"],
  "smith-machine-romanian-deadlift": ["smith rdl"],
  "glute-bridge": ["bodyweight glute bridge","hip bridge"],
  "dumbbell-hip-thrust": ["db hip thrust"],
  "single-leg-hip-thrust": ["one leg hip thrust"],
  "machine-hip-thrust": ["hip thrust machine","glute drive"],
  "curtsy-lunge": ["curtsey lunge"],
  "banded-lateral-walk": ["monster walk","side band walk","lateral band walk"],
  "cable-hip-abduction": ["cable abduction"],
  "sumo-squat": ["wide stance squat","dumbbell sumo squat"],
  "glute-kickback-machine": ["standing kickback machine"],
  "smith-machine-hip-thrust": ["smith hip thrust"],
  "bodyweight-calf-raise": ["calf raise bodyweight","standing calf raise bodyweight"],
  "single-leg-calf-raise": ["one leg calf raise"],
  "single-leg-dumbbell-calf-raise": ["one arm dumbbell calf raise"],
  "tibialis-raise": ["tib raise","tib bar raise","shin raise"],
  "single-leg-calf-press": ["one leg leg press calf raise"],
  "plate-loaded-standing-calf-raise": ["lever calf raise"],
  "jump-rope": ["skipping","skipping rope"],
};

export const ALIAS_LIST = {};
for (const src of [LEGACY_ALIASES, MORE_ALIASES, EXTRA_ALIASES, NEW_ALIASES])
  for (const [id, names] of Object.entries(src)) ALIAS_LIST[id] = [...(ALIAS_LIST[id] ?? []), ...names];
const ALIASES = new Map();
for (const [id, names] of Object.entries(ALIAS_LIST))
  for (const n of [id, ...names]) ALIASES.set(norm(n), id);
// Names a custom exercise could have been given on purpose before aliases existed: the frozen legacy set.
const LEGACY_KEYS = new Set();
for (const [id, names] of Object.entries(LEGACY_ALIASES)) for (const n of [id, ...names]) LEGACY_KEYS.add(norm(n));

// A forgiving key: lowercase words, DB/BB spelled out, bicep(s)/tricep(s), plurals, "pull down"/"pulldown",
// "e-z"/"ez", "body weight"/"bodyweight" folded together, filler words ("with", "on", "the") dropped, then sorted
// and de-duplicated so word order and "Bench Press (Barbell)" vs "Barbell Bench Press" do not matter.
// Two names with the same key are the same exercise.
const WORD = {
  db: "dumbbell",
  dumbell: "dumbbell",
  dumbel: "dumbbell",
  bb: "barbell",
  barbel: "barbell",
  kb: "kettlebell",
  bw: "bodyweight",
  leverage: "machine", // free-exercise-db calls selectorised machines "leverage"
  lever: "machine",
  single: "one", // single-arm = one-arm
  legged: "leg", // stiff-legged = stiff-leg
  biceps: "bicep",
  triceps: "tricep",
  flye: "fly",
  flyes: "fly",
  flies: "fly",
  flys: "fly",
};
const FILLER = new Set(["with", "on", "the", "a", "an", "of", "using", "custom"]);
const stem = (w) => {
  if (WORD[w]) return WORD[w];
  if (/[^s]{2}(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2); // crunches -> crunch
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
  if (/[^s]s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
};
export const looseKey = (s) =>
  [
    ...new Set(
      String(s ?? "")
        .toLowerCase()
        .replace(/\b(pull|push|chin|sit|step)[\s-]+(down|up)s?\b/g, "$1$2")
        .replace(/\be[\s-]?z\b/g, "ez")
        .replace(/\bbody[\s-]?weight\b/g, "bodyweight")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w && !FILLER.has(w))
        .map(stem),
    ),
  ]
    .sort()
    .join(" ");

// "Squat (Barbell)", "Lat Pulldown (Cable)": a library name or alias plus the equipment the exercise is
// done with names the same exercise. Only added where that key is not already some other exercise's.
const EQUIPMENT_WORDS = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  cable: "cable",
  machine: "machine",
  kettlebells: "kettlebell",
  "body only": "bodyweight",
  "e-z curl bar": "ez bar",
  bands: "band",
};

const looseMaps = new WeakMap();
function looseMap(library) {
  let m = looseMaps.get(library);
  if (m) return m;
  m = new Map();
  const add = (map, name, id) => {
    const k = looseKey(name);
    if (k) map.set(k, map.has(k) && map.get(k) !== id ? null : id); // two ids on one key: ambiguous
  };
  for (const e of library) add(m, e.name, e.id);
  for (const [id, names] of Object.entries(ALIAS_LIST))
    for (const n of names) add(m, n, id);
  const implied = new Map();
  for (const e of library) {
    const eq = EQUIPMENT_WORDS[e.equipment];
    if (!eq) continue;
    const alias = Object.hasOwn(ALIAS_LIST, e.id) ? ALIAS_LIST[e.id] : [];
    for (const n of [e.name, ...alias]) add(implied, `${n} ${eq}`, e.id);
  }
  for (const [k, id] of implied) if (id && !m.has(k)) m.set(k, id);
  looseMaps.set(library, m);
  return m;
}

// Only the forgiving step (no exact name or alias): "dumbbell bicep curls" -> Dumbbell Bicep Curl.
// A custom named exactly like a library exercise or a LEGACY alias (e.g. "Squat") was chosen on purpose, so it is
// left alone. Every other name, including every alias added since, counts as a near-miss and gets linked.
export function looseMatch(name, library) {
  const k = norm(name);
  if (!Array.isArray(library) || LEGACY_KEYS.has(k) || library.some((e) => norm(e.name) === k)) return null;
  const id = looseMap(library).get(looseKey(name));
  return (id && library.find((e) => e.id === id)) || null;
}

// The library exercise this name means, or null. Exact name, then alias, then the forgiving key; never a guess
// between two exercises.
export function matchExercise(name, library) {
  const k = norm(name);
  if (!k || !Array.isArray(library)) return null;
  const byName = library.find((e) => norm(e.name) === k);
  if (byName) return byName;
  const id = ALIASES.get(k);
  return (id && library.find((e) => e.id === id)) || looseMatch(name, library);
}

// ---- validation ----
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const int = (x, [lo, hi]) => Number.isInteger(x) && x >= lo && x <= hi;
const plain = (s) => typeof s === "string" && s.trim().length > 0;
const clean = (s) => s.trim().replace(/\s+/g, " ");
// A short, readable copy of a value for messages: "AMRAP", [8], 8.5.
const show = (v) => {
  let t;
  try {
    t = JSON.stringify(v);
  } catch {}
  t ??= String(v);
  return t.length > 30 ? t.slice(0, 29) + "…" : t;
};
const TIMED = /\b(secs?|seconds?|mins?|minutes?)\b|\d\s*[sm]\b/i;
const muscleOf = (m) =>
  MUSCLES.find((x) => x.toLowerCase() === String(m).trim().toLowerCase()) ??
  null;
// Two names that mean the same exercise (alias or spelling) share a key.
const canonicalKey = (name) => ALIASES.get(norm(name)) ?? norm(name);

export function validatePlanFile(obj) {
  const errors = [];
  try {
    if (!isObj(obj))
      return { ok: false, errors: [tr("pf.err.notobject")] };
    if (obj.format !== FORMAT) errors.push(tr("pf.err.format", { format: FORMAT }));
    if (obj.version !== VERSION) errors.push(tr("pf.err.version", { n: N(VERSION) }));
    if (!plain(obj.name) || obj.name.trim().length > LIMITS.name)
      errors.push(tr("pf.err.name", { max: N(LIMITS.name) }));
    if (typeof obj.goal !== "string" || !Object.hasOwn(GOALS, obj.goal))
      errors.push(tr("pf.err.goal", { list: Object.keys(GOALS).join(", ") }));
    if (
      obj.notes !== undefined &&
      (typeof obj.notes !== "string" || obj.notes.length > LIMITS.notes)
    )
      errors.push(tr("pf.err.notes", { max: N(LIMITS.notes) }));
    const days = obj.days;
    if (
      !Array.isArray(days) ||
      days.length < LIMITS.days[0] ||
      days.length > LIMITS.days[1]
    )
      errors.push(tr("pf.err.days", { min: N(LIMITS.days[0]), max: N(LIMITS.days[1]) }));
    else
      days.forEach((d, i) => {
        const at = tr("pf.day", { n: N(i + 1) });
        if (!isObj(d)) return errors.push(tr("pf.err.day.object", { at }));
        if (!plain(d.name) || d.name.trim().length > LIMITS.dayName)
          errors.push(tr("pf.err.day.name", { at, max: N(LIMITS.dayName) }));
        const label = plain(d.name)
          ? tr("pf.label", { at, name: clean(d.name).slice(0, 40) })
          : at;
        const ex = d.exercises;
        if (
          !Array.isArray(ex) ||
          ex.length < LIMITS.exercises[0] ||
          ex.length > LIMITS.exercises[1]
        )
          return errors.push(
            tr("pf.err.exercises", { label, min: N(LIMITS.exercises[0]), max: N(LIMITS.exercises[1]) }),
          );
        const seen = new Set();
        ex.forEach((x, j) => {
          const pos = tr("pf.pos", { label, n: N(j + 1) });
          if (!isObj(x)) return errors.push(tr("pf.err.ex.object", { pos }));
          const e = plain(x.name)
            ? tr("pf.where", { day: plain(d.name) ? clean(d.name).slice(0, 40) : at, name: clean(x.name).slice(0, 40) })
            : pos;
          if (!plain(x.name) || x.name.trim().length > LIMITS.name)
            errors.push(tr("pf.err.ex.name", { pos, max: N(LIMITS.name) }));
          else {
            const key = canonicalKey(x.name);
            if (seen.has(key))
              errors.push(tr("pf.err.twice", { e }));
            seen.add(key);
          }
          if (!int(x.sets, LIMITS.sets))
            errors.push(
              x.sets === undefined
                ? tr("pf.err.sets.missing", { e, min: N(LIMITS.sets[0]), max: N(LIMITS.sets[1]) })
                : tr("pf.err.sets.bad", { e, v: show(x.sets), min: N(LIMITS.sets[0]), max: N(LIMITS.sets[1]) }),
            );
          const r = x.reps;
          if (
            !Array.isArray(r) ||
            r.length !== 2 ||
            !r.every((n) => int(n, [LIMITS.reps[0], LIMITS.seconds[1]]))
          )
            errors.push(
              r === undefined
                ? tr("pf.err.reps.missing", { e, min: N(LIMITS.reps[0]), max: N(LIMITS.reps[1]) })
                : tr(typeof r === "string" && TIMED.test(r) ? "pf.err.reps.timed" : "pf.err.reps.bad", { e, v: show(r), min: N(LIMITS.reps[0]), max: N(LIMITS.reps[1]) }),
            );
          else if (r[0] > r[1])
            errors.push(tr("pf.err.reps.order", { e, v: show(r) }));
          if (
            x.step !== undefined &&
            !(
              typeof x.step === "number" &&
              x.step >= LIMITS.step[0] &&
              x.step <= LIMITS.step[1]
            )
          )
            errors.push(
              tr("pf.err.step", { e, v: show(x.step), min: N(LIMITS.step[0]), max: N(LIMITS.step[1]) }),
            );
          if (
            x.muscle !== undefined &&
            !(typeof x.muscle === "string" && muscleOf(x.muscle))
          )
            errors.push(
              tr("pf.err.muscle", { e, v: show(x.muscle), list: MUSCLES.join(", ") }),
            );
        });
      });
  } catch {
    return { ok: false, errors: [tr("pf.err.unreadable")] };
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

// ---- leniency: read what AI chat apps write ----
// Small, explicit tables. Anything not listed here is left alone for the validator to report.
const DAY_LISTS = ["days", "workouts", "routines", "sessions", "plan"];
const EX_LISTS = ["exercises", "movements", "lifts"];
const DAY_NAMES = ["title", "day"];
const EX_NAMES = ["exercise", "title"];
const PLAN_NAMES = ["title", "plan_name", "planName", "program"];
const GOAL_WORDS = {
  hypertrophy: "muscle",
  size: "muscle",
  bodybuilding: "muscle",
  power: "strength",
  powerlifting: "strength",
  conditioning: "endurance",
  stamina: "endurance",
};
const REPS_TEXT = new RegExp(
  "^(\\d{1,6})(?:\\s*(?:-|–|—|to)\\s*(\\d{1,6}))?" +
    "(?:\\s*(?:reps?|times))?(?:\\s*(?:each|ea\\.?|per|/)\\s*(?:side|leg|arm|hand|direction|set)?)?$",
);
const SETS_TEXT = /^(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?(?:\s*sets?)?$/;
const own = (o, k) => Object.hasOwn(o, k);
const toInt = (v) =>
  Number.isInteger(v)
    ? v
    : typeof v === "string" && /^\s*\d{1,6}\s*$/.test(v)
      ? +v
      : null;

// [lowest, highest] from 10, "8-12", "10 each side", {min,max}, ["8","12"] ... or null when unreadable
// (AMRAP, "30 sec" and so on). A reversed range is swapped.
function repsOf(v) {
  let lo = null,
    hi = null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    const m = s.length <= 60 ? REPS_TEXT.exec(s) : null;
    if (m) ((lo = +m[1]), (hi = m[2] === undefined ? lo : +m[2]));
  } else if (Array.isArray(v)) {
    if (v.length === 1) lo = hi = toInt(v[0]);
    else if (v.length === 2) ((lo = toInt(v[0])), (hi = toInt(v[1])));
  } else if (isObj(v))
    ((lo = toInt(v.min ?? v.low)), (hi = toInt(v.max ?? v.high)));
  else lo = hi = toInt(v);
  if (lo === null || hi === null) return null;
  return lo > hi ? [hi, lo] : [lo, hi];
}

const hasExerciseList = (d) =>
  isObj(d) && EX_LISTS.some((k) => Array.isArray(d[k]));

// Returns { obj, fixes }: the plan with the usual AI slips repaired, and short sentences saying what was
// adjusted. Never throws and never changes its input; a plan that is already valid comes back equal, with no fixes.
export function normalizePlanFile(input) {
  const notes = new Map(); // kind -> { general, specific, n }: the same slip many times is one line
  const fix = (kind, general, specific) => {
    const f = notes.get(kind);
    if (f) f.n++;
    else notes.set(kind, { general, specific, n: 1 });
  };
  try {
    const obj = run(input, fix);
    if (obj === null) return { obj: input, fixes: [] };
    const fixes = [...notes.values()]
      .slice(0, 30)
      .map((f) =>
        f.n === 1
          ? f.specific
          : tr("pf.fix.many", { general: f.general, n: N(f.n), first: f.specific }),
      );
    return { obj, fixes };
  } catch {
    return { obj: input, fixes: [] };
  }
}

function run(input, fix) {
  let top, key;
  if (Array.isArray(input)) {
    if (!input.some(hasExerciseList)) return null;
    top = { days: input };
    key = "days";
    fix("wrap", "", tr("pf.fix.wrap"));
  } else if (isObj(input)) {
    top = { ...input };
    key = DAY_LISTS.find((k) => Array.isArray(top[k]));
    if (!key && isObj(top.plan)) {
      const k = DAY_LISTS.find((n) => Array.isArray(top.plan[n]));
      if (k) {
        const { plan, ...rest } = top;
        top = { ...plan, ...rest };
        key = k;
        fix("inner", "", tr("pf.fix.inner"));
      }
    }
  } else return null;
  if (!key || !top[key].some(hasExerciseList)) return null;
  if (key !== "days") {
    top.days = top[key];
    delete top[key];
    fix("days", "", tr("pf.fix.days", { key }));
  }
  top.days = top.days.flatMap((d, i) => {
    const r = day(d, i, fix);
    return r === null ? [] : [r];
  });
  if (!plain(top.name))
    for (const k of PLAN_NAMES)
      if (plain(top[k])) {
        top.name = top[k];
        delete top[k];
        fix("pname", "", tr("pf.fix.pname", { key: k }));
        break;
      }
  // format and version carry no information once the days are there, so these two are filled in quietly.
  if (top.format !== FORMAT) top.format = FORMAT;
  if (!own(top, "version") || top.version === "1") top.version = VERSION;
  if (top.goal === undefined || top.goal === null) {
    top.goal = "muscle";
    fix("goal", "", tr("pf.fix.goal"));
  } else if (typeof top.goal === "string") {
    const g = top.goal.trim().toLowerCase();
    const w = Object.hasOwn(GOALS, g)
      ? g
      : Object.hasOwn(GOAL_WORDS, g)
        ? GOAL_WORDS[g]
        : null;
    if (w && w !== top.goal) {
      fix("goalword", "", tr("pf.fix.goalword", { from: show(top.goal), to: w }));
      top.goal = w;
    }
  }
  return top;
}

function day(d, i, fix) {
  if (!isObj(d)) return d;
  const o = { ...d };
  if (!plain(o.name))
    for (const k of DAY_NAMES)
      if (plain(o[k])) {
        o.name = o[k];
        delete o[k];
        fix(
          "dname",
          tr("pf.fix.dname.general", { key: k }),
          tr("pf.fix.dname", { n: N(i + 1), key: k }),
        );
        break;
      }
  if (typeof o.name === "string") o.name = o.name.trim();
  const at = plain(o.name) ? clean(o.name).slice(0, 40) : tr("pf.day", { n: N(i + 1) });
  if (!Array.isArray(o.exercises)) {
    const k = EX_LISTS.find((n) => Array.isArray(o[n]));
    if (k) {
      o.exercises = o[k];
      delete o[k];
      fix(
        "exlist",
        tr("pf.fix.exlist.general", { key: k }),
        tr("pf.fix.exlist", { at, key: k }),
      );
    }
  }
  if (!Array.isArray(o.exercises)) return o;
  o.exercises = o.exercises.flatMap((x) => {
    const r = exercise(x, at, fix);
    return r === null ? [] : [r];
  });
  if (!o.exercises.length) {
    fix(
      "emptyday",
      tr("pf.fix.emptyday.general"),
      tr("pf.fix.emptyday", { at }),
    );
    return null;
  }
  return o;
}

function exercise(x, at, fix) {
  const empty = () => {
    fix(
      "emptyex",
      tr("pf.fix.emptyex.general"),
      tr("pf.fix.emptyex", { at }),
    );
    return null;
  };
  if (x === null || x === undefined || (isObj(x) && !Object.keys(x).length))
    return empty();
  if (!isObj(x)) return x;
  const o = { ...x };
  if (!plain(o.name))
    for (const k of EX_NAMES)
      if (plain(o[k])) {
        o.name = o[k];
        delete o[k];
        fix(
          "exname",
          tr("pf.fix.exname.general", { key: k }),
          tr("pf.fix.exname", { at, key: k }),
        );
        break;
      }
  if (typeof o.name === "string") {
    o.name = o.name.trim();
    if (!o.name) return empty();
  }
  const lab = plain(o.name) ? tr("pf.where", { day: at, name: clean(o.name).slice(0, 40) }) : at;
  const s = o.sets;
  if (typeof s === "string") {
    const m = SETS_TEXT.exec(s.trim().toLowerCase());
    if (m) {
      o.sets = +m[1];
      if (m[2] !== undefined)
        fix(
          "setsrange",
          tr("pf.fix.setsrange.general"),
          tr("pf.fix.setsrange", { lab, v: show(s), n: N(o.sets) }),
        );
      else
        fix(
          "setstext",
          tr("pf.fix.setstext.general"),
          tr("pf.fix.setstext", { lab, v: show(s), n: N(o.sets) }),
        );
    }
  } else if (Array.isArray(s) && s.length > 0 && s.length <= 50) {
    const rs = s.map((e) => repsOf(isObj(e) ? e.reps : e));
    if (rs.every(Boolean)) {
      o.sets = s.length;
      if (o.reps === undefined)
        o.reps = [
          Math.min(...rs.map((r) => r[0])),
          Math.max(...rs.map((r) => r[1])),
        ];
      fix(
        "setslist",
        tr("pf.fix.setslist.general"),
        tr("pf.fix.setslist", { lab, count: N(s.length) }),
      );
    }
  }
  if (own(o, "reps")) {
    const v = o.reps;
    const r = repsOf(v);
    if (
      r &&
      !(Array.isArray(v) && v.length === 2 && v[0] === r[0] && v[1] === r[1])
    ) {
      o.reps = r;
      fix(
        "reps",
        tr("pf.fix.reps.general"),
        tr("pf.fix.reps", { lab, v: show(v), lo: N(r[0]), hi: N(r[1]) }),
      );
    }
  }
  if (own(o, "step")) {
    const v = o.step;
    const m =
      typeof v === "string"
        ? /^(\d+(?:\.\d+)?)\s*(?:kg)?$/.exec(v.trim().toLowerCase())
        : null;
    if (m) o.step = +m[1];
    if (!(
      typeof o.step === "number" &&
      o.step >= LIMITS.step[0] &&
      o.step <= LIMITS.step[1]
    )) {
      delete o.step;
      fix(
        "step",
        tr("pf.fix.step.general"),
        tr("pf.fix.step", { lab, v: show(v), n: N(DEFAULT_STEP) }),
      );
    } else if (m)
      fix(
        "steptext",
        tr("pf.fix.steptext.general"),
        tr("pf.fix.steptext", { lab, v: show(v), n: N(o.step) }),
      );
  }
  return o;
}

// ---- preview ----
// kind: "library" | "existing" (one of the owner's own exercises) | "new" (will be created).
// newExercises lists each new exercise once; the screen sets .muscle on those that have none.
export function planFromFile(obj, library, customExercises = []) {
  const v = validatePlanFile(obj);
  if (!v.ok) return { ok: false, errors: v.errors };
  const news = new Map();
  const tooMany = [];
  const days = obj.days.map((d) => ({
    name: clean(d.name),
    exercises: d.exercises.map((x) => {
      const name = clean(x.name);
      const [repMin, repMax] = x.reps;
      const base = {
        name,
        sets: x.sets,
        repMin,
        repMax,
        step: x.step ?? DEFAULT_STEP,
      };
      // One of the owner's own exercises with this exact name beats an alias, so its history stays linked.
      const own = customExercises.find((c) => norm(c.name) === norm(name));
      const lib = own
        ? library.find((e) => norm(e.name) === norm(name))
        : matchExercise(name, library);
      if (repMax > LIMITS.reps[1] && !(own ?? lib)?.timed)
        tooMany.push(tr("pf.err.reps.bad", { e: name, v: show(x.reps), min: N(LIMITS.reps[0]), max: N(LIMITS.reps[1]) }));
      if (lib)
        return {
          ...base,
          kind: "library",
          id: lib.id,
          name: lib.name,
          primary: lib.primary,
        };
      if (own)
        return {
          ...base,
          kind: "existing",
          id: own.id,
          name: own.name,
          primary: own.primary,
        };
      const key = norm(name) || name; // a name of only symbols keeps itself
      if (!news.has(key))
        news.set(key, {
          key,
          name,
          muscle: x.muscle === undefined ? null : muscleOf(x.muscle),
        });
      return { ...base, kind: "new", key };
    }),
  }));
  if (tooMany.length) return { ok: false, errors: tooMany };
  return {
    ok: true,
    name: clean(obj.name),
    notes: typeof obj.notes === "string" ? clean(obj.notes) : "",
    goal: obj.goal,
    days,
    newExercises: [...news.values()],
  };
}

export const needsMuscle = (preview) =>
  preview.newExercises.some((n) => !muscleOf(n.muscle));

// Put the preview into state: create new custom exercises, replace the plan, keep everything else.
// Refuses (returns { ok:false, error }) while a workout is in progress or a muscle is missing; state is only
// touched once everything has been checked.
export function applyPlan(state, preview) {
  if (!preview?.ok) return { ok: false, error: tr("pf.err.invalid") };
  if (state.active)
    return {
      ok: false,
      error: tr("pf.err.active"),
    };
  if (needsMuscle(preview))
    return {
      ok: false,
      error: tr("pf.err.muscles"),
    };
  // An own exercise made since the preview was built is reused, never duplicated.
  const made = new Map(
    preview.newExercises.map((n) => [
      n.key,
      state.customExercises.find((c) => norm(c.name) === norm(n.name)) ?? {
        id: crypto.randomUUID(),
        name: n.name,
        primary: muscleOf(n.muscle),
        secondary: [],
      },
    ]),
  );
  // The owner's plate settings (uses plates, empty weight) follow the exercise into the new plan.
  const kept = new Map();
  for (const w of state.workouts)
    for (const it of w.items) {
      const o = kept.get(it.exerciseId) ?? {};
      if (o.plates === undefined && typeof it.plates === "boolean")
        o.plates = it.plates;
      if (o.emptyKg === undefined && Number.isFinite(it.emptyKg))
        o.emptyKg = it.emptyKg;
      if (o.restSec === undefined && Number.isFinite(it.restSec))
        o.restSec = it.restSec;
      kept.set(it.exerciseId, o);
    }
  const workouts = preview.days.map((d) => {
    const prim = new Set();
    const items = d.exercises.map((x) => {
      const c = x.kind === "new" ? made.get(x.key) : null;
      prim.add(c ? c.primary : x.primary);
      const exerciseId = c ? c.id : x.id;
      return {
        exerciseId,
        sets: x.sets,
        repMin: x.repMin,
        repMax: x.repMax,
        step: x.step,
        ...kept.get(exerciseId),
      };
    });
    return {
      id: crypto.randomUUID(),
      name: d.name,
      muscles: MUSCLES.filter((m) => prim.has(m)),
      items,
    };
  });
  state.customExercises.push(
    ...[...made.values()].filter((c) => !state.customExercises.includes(c)),
  );
  state.workouts = workouts;
  state.settings.goal = preview.goal;
  return { ok: true };
}

// ---- reading text ----
export const MAX_PLAN_TEXT = 200_000;

// Every top-level {...} in the text (string-aware), so chatter around or between objects is skipped.
function topObjects(t) {
  const out = [];
  let depth = 0,
    start = -1,
    inStr = false,
    esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = depth > 0;
    else if (c === "{") {
      if (depth++ === 0) start = i;
    } else if (c === "}" && depth > 0 && --depth === 0)
      out.push(t.slice(start, i + 1));
  }
  return out;
}

// Removes // and /* */ comments and trailing commas, but only OUTSIDE string literals.
function stripJsonExtras(s) {
  const out = [];
  let inStr = false,
    esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out.push(c);
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out.push(c);
    } else if (c === "/" && s[i + 1] === "/") {
      while (i + 1 < s.length && s[i + 1] !== "\n") i++;
    } else if (c === "/" && s[i + 1] === "*") {
      const j = s.indexOf("*/", i + 2);
      i = j < 0 ? s.length : j + 1;
      out.push(" ");
    } else {
      if (c === "}" || c === "]") {
        let k = out.length - 1;
        while (k >= 0 && /\s/.test(out[k])) k--;
        if (out[k] === ",") out.splice(k, 1);
      }
      out.push(c);
    }
  }
  return out.join("");
}

// Clean-up stages, tried in order. The text as pasted always goes first; riskier repairs come last.
const SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;
const tidy = (t) => t.replace(SPACES, " ").replace(INVISIBLE, "");
const STAGES = [
  (t) => t.replace(/^\uFEFF/, ""),
  (t) => tidy(t),
  (t) => tidy(t).replace(/[\u201C-\u201F]/g, '"'),
  (t) => tidy(t).replace(/[\u201C-\u201F\u2018\u2019]/g, '"'),
];

const candidatesOf = (t) => {
  const fenced = [...t.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)].map(
    (m) => m[1],
  );
  return [t, ...fenced, ...topObjects(t), ...fenced.flatMap(topObjects)].slice(
    0,
    60,
  );
};

// A few characters around a parse error, when the engine says where it is.
function around(src, msg) {
  const m = /position (\d+)/.exec(msg);
  if (!m) return "";
  const at = +m[1];
  const bit = src
    .slice(Math.max(0, at - 25), at + 25)
    .replace(/\s+/g, " ")
    .trim();
  return bit ? tr("pf.near", { bit }) : "";
}

// JSON from a file or a chat paste: also finds it inside chatter or code fences, and repairs what chat apps do
// to code (odd spaces, invisible characters, curly quotes, trailing commas, comments). Each stage only runs
// when the earlier ones found no valid plan. Returns the first candidate that is a valid plan; if none is, the
// best one that parsed (so the validator's plain errors show); if nothing parsed, a short explanation.
export function parsePlanText(text) {
  if (typeof text !== "string" || !text.trim())
    return { ok: false, errors: [tr("pf.err.notext")] };
  if (text.length > MAX_PLAN_TEXT)
    return { ok: false, errors: [tr("pf.err.toolong")] };
  let first = null,
    planish = null,
    failed = null;
  for (const [n, stage] of STAGES.entries()) {
    for (const raw of candidatesOf(stage(text))) {
      const s = n ? stripJsonExtras(raw) : raw;
      let parsed;
      try {
        parsed = JSON.parse(s);
      } catch (e) {
        if (
          n === STAGES.length - 1 &&
          s.trimStart().startsWith("{") &&
          (!failed || s.length > failed.src.length)
        )
          failed = { msg: String(e.message), src: s };
        continue;
      }
      if (!isObj(parsed) && !Array.isArray(parsed)) continue;
      const { obj, fixes } = normalizePlanFile(parsed);
      if (!isObj(obj)) continue;
      if (validatePlanFile(obj).ok) return { ok: true, obj, fixes };
      if ("format" in obj || "days" in obj) planish ??= { obj, fixes };
      first ??= { obj, fixes };
    }
  }
  const best = planish ?? first;
  if (best) return { ok: true, ...best };
  const why = failed
    ? tr("pf.why", { msg: failed.msg, near: around(failed.src, failed.msg) })
    : "";
  return {
    ok: false,
    errors: [tr("pf.err.noplan", { why })],
  };
}

// ---- the AI prompt ----
const EXAMPLE = {
  format: FORMAT,
  version: VERSION,
  name: "Full Body Beginner",
  goal: "muscle",
  notes: "Two workouts, alternate them, three sessions a week.",
  days: [
    {
      name: "A",
      exercises: [
        { name: "Barbell Squat", sets: 3, reps: [6, 10], step: 2.5 },
        { name: "Bench Press", sets: 3, reps: [6, 10], step: 2.5 },
        {
          name: "Cable Hip Abduction",
          sets: 3,
          reps: [10, 15],
          step: 2.5,
          muscle: "Glutes",
        },
      ],
    },
  ],
};

// What to do with a chosen file: "json" (text/JSON, read here), "ai" (PDF, photo, Word: needs the AI app) or "unsupported".
// iOS often gives an empty type, so the extension decides first; then the MIME type.
export function fileKind(name = "", type = "") {
  const n = String(name).toLowerCase();
  const ext = n.includes(".") ? n.slice(n.lastIndexOf(".") + 1) : "";
  const t = String(type).toLowerCase();
  if (["json", "txt", "text"].includes(ext)) return "json";
  if (
    ["pdf", "jpg", "jpeg", "png", "heic", "heif", "doc", "docx"].includes(ext)
  )
    return "ai";
  if (t === "application/json" || t.startsWith("text/")) return "json";
  if (
    t === "application/pdf" ||
    t.startsWith("image/") ||
    t === "application/msword" ||
    t.includes("wordprocessingml")
  )
    return "ai";
  return "unsupported";
}

// Prompt for the owner's own AI chat app (also reused by a later in-app version).
// mode: "describe" (design a plan from the request) or "convert" (convert an attached plan faithfully).
export function buildAiPrompt({
  request = "",
  library = [],
  custom = [],
  mode = "describe",
} = {}) {
  const groups = MUSCLES.map((m) => {
    const names = [...library, ...custom]
      .filter((e) => e.primary === m)
      .map((e) => e.name);
    return names.length ? `${m}: ${names.join("; ")}` : "";
  }).filter(Boolean);
  const ask =
    String(request).trim() ||
    "(nothing specific; use sensible defaults for a general trainee)";
  const task =
    mode === "convert"
      ? `TASK: Convert the training plan I have attached (a file or photo) into this app's format. The file may hold more than workouts: use ONLY the weekly workout routines, and ignore nutrition, cardio, warm-ups, mobility and timed holds unless they are given as sets × reps. Be faithful: keep its days, exercises, sets and reps as written. Do not improve it, add to it or remove from it. Map each exercise to the closest name in the exercise list below. Only when nothing in the list fits, use the original name and add a "muscle". If reps are one number, use it twice, like [5, 5]. For "AMRAP" or "to failure", pick a sensible range and say so in "notes". If sets are a range like 3-4, use the lower number. If it gives no weight steps, leave "step" out.`
      : `TASK: Design a sound, conventional plan that matches my request: the number of days, the session length, my experience, my goal and any injuries or limits I mention. Balance the muscle groups across the week, put the big lifts first in each workout and keep to a sensible number of exercises per day. Choose exercises from the list below wherever possible. Only when nothing in the list fits, use another plain name and add a "muscle".`;
  return `You are a strength coach building a training plan for a personal gym-tracker app. The app reads one JSON object, so follow the format exactly.

${task}

MY REQUEST: ${ask}

RULES
- Weights are in kg only. "step" is the kg to add when the person is ready for more (default ${DEFAULT_STEP}; use 5 for deadlift or leg press, 1 to 2 for small dumbbell lifts).
- "goal" must be one of: ${Object.keys(GOALS).join(", ")}.
- "muscle" is allowed only for exercises that are NOT in the list below, and must be one of: ${MUSCLES.join(", ")}.
- Limits: ${LIMITS.days[0]} to ${LIMITS.days[1]} days; ${LIMITS.exercises[0]} to ${LIMITS.exercises[1]} exercises per day; sets ${LIMITS.sets[0]} to ${LIMITS.sets[1]}; reps ${LIMITS.reps[0]} to ${LIMITS.reps[1]} as [lowest, highest]; step ${LIMITS.step[0]} to ${LIMITS.step[1]}; names up to ${LIMITS.name} characters (day names up to ${LIMITS.dayName}); no exercise twice in one day.
- "sets" and both "reps" numbers are whole numbers.
- Use plain straight quotes. "notes" is optional: one or two sentences, at most ${LIMITS.notes} characters.

IMPORTANT: copy the field names exactly: "format", "version", "name", "goal", "days", "exercises", "sets", "reps". Do not rename them or add other structure.

FORMAT (example; yours will differ):
${JSON.stringify(EXAMPLE, null, 1)}

EXERCISE LIST (use these names exactly), grouped by main muscle:
${groups.join("\n")}

Reply with ONLY the JSON object, in a single code block, with nothing before or after it. No comments and no trailing commas.`;
}
