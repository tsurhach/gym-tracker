// "How to use" guide for people who are new to the app. Static text; no app data is read or changed.
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

const SECTIONS = [
  [
    "install",
    "Put it on your home screen",
    "Then it opens like a normal app.",
    `<p><b>iPhone:</b></p>
    <ol>
      <li>Open the link in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button (a square with an arrow pointing up).</li>
      <li>Tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b>.</li>
    </ol>
    <p><b>Android:</b></p>
    <ol>
      <li>Open the link in <b>Chrome</b>.</li>
      <li>Tap the <b>⋮</b> menu (three dots, top right).</li>
      <li>Tap <b>Add to Home screen</b> or <b>Install app</b>.</li>
    </ol>
    <p><b>Important:</b> your data is kept on this phone. If you delete the app from your home screen, it is deleted too, unless sync is on or you saved a backup file. See "Sync" and "Backup file".</p>`,
  ],
  [
    "plan",
    "Set up your plan",
    "Your workouts and exercises.",
    `<p>The first time, the app asks a few questions and suggests a plan. Just answer and tap <b>Propose my plan</b>.</p>
    <p>Later, go to <b>Plan</b>, then <b>Change the whole plan</b>:</p>
    <ul>
      <li><b>Ready-made programs</b>: pick one and use it.</li>
      <li><b>Build a plan with AI</b>: the app gives you words to copy into an AI app. Paste its answer back.</li>
    </ul>
    <p>You can also change any workout in Plan by hand.</p>`,
  ],
  [
    "workout",
    "Do a workout",
    "Start, tick off your sets, finish.",
    `<ol>
      <li>On <b>Today</b>, tap <b>Start</b>.</li>
      <li>Tap any exercise. You can do them in any order.</li>
      <li>The weight and reps are filled in from last time.</li>
      <li>After each set, tap the <b>✓</b> to confirm it.</li>
      <li>To change a number, tap it and type.</li>
      <li>Machine taken? On the exercise, tap <b>Swap exercise</b> to switch to a similar one. Ones you picked before show <b>★ Usual</b>.</li>
      <li>Tap <b>Done, back to list</b>, then pick the next exercise.</li>
      <li>At the end, tap <b>Finish workout</b>.</li>
    </ol>`,
  ],
  [
    "heavier",
    "“Go heavier” advice",
    "Only a suggestion.",
    `<p>If you did all your reps on every set last time, the app says something like "Try 42.5 kg today". It means you may be ready for a bit more weight.</p>
    <p>For body-weight exercises like push-ups, it suggests one more rep, or a little added weight if you have it. You can turn this off, and the Stuck reminder too, in <b>Plan</b>, then <b>Settings</b>.</p>
    <p>It is only a suggestion. Use the weight that feels right.</p>`,
  ],
  [
    "extras",
    "Rest timer, photos, sound",
    "Small helpers while you train.",
    `<p><b>Rest timer:</b> after you tick a set, a countdown starts. Tap <b>−15s</b> or <b>+15s</b> to change it, or <b>Skip</b>. Set its length in <b>Plan</b>, then <b>Settings</b>.</p>
    <p><b>Rest-over sound:</b> in <b>Settings</b> you can record your own sound or pick an audio file. Turn on <b>Notify me when rest is over</b> to get an alert when the phone is locked.</p>
    <p><b>Your own photo or video:</b> on an exercise you added yourself, tap <b>Add photo or video</b>.</p>
    <p><b>Plates per side:</b> for bar exercises the app shows which plates to put on each side.</p>
    <p><b>New best:</b> a star shows when a set beats everything you did before.</p>`,
  ],
  [
    "progress",
    "History, Muscles, Body weight",
    "See how you are doing.",
    `<p><b>History:</b> every past workout. Tap one to fix a mistake. Tap an exercise name for its chart.</p>
    <p><b>Muscles:</b> how many sets each muscle got in the last 7 days, and which ones you missed.</p>
    <p><b>Body weight:</b> on Today, tap <b>Body weight</b> to log your weight now and then.</p>`,
  ],
];

const SYNC_SECTION = [
  "sync",
  "Sync",
  "Optional. Keeps your data if you lose your phone.",
  `<p>Go to <b>Plan</b>, then <b>Sync and sign-in</b>, and tap <b>Turn on sync with Face ID</b>. The app works fine without it.</p>
    <p>It saves your workouts, plan, settings, photos and rest sound. Videos stay on this phone. Your data is locked before it leaves the phone, so nobody else can read it, not even us.</p>
    <p><b>Recovery code:</b> the app shows it once. Tap <b>Save in iPhone Passwords</b>. You need it if Face ID alone cannot open your data, for example on an Android phone. Nobody can reset it.</p>
    <p><b>Another phone or iPad:</b> open the app there, go to <b>Sync and sign-in</b>, and tap <b>I already use sync</b>.</p>
    <p>Syncing happens by itself. <b>Sign out on this device</b> stops it on this phone. <b>Delete my cloud data</b> removes the saved copy. Either way, your data on the phone stays.</p>`,
];

const BACKUP_SECTION = [
  "backup",
  "Backup file",
  "A copy you keep yourself.",
  `<p>A backup is a file you save somewhere safe, like Files or iCloud Drive. Do it about once a month, and before changing phones.</p>
    <ol>
      <li>Go to <b>Plan</b>, then <b>Backup and export</b>.</li>
      <li>Tap <b>Export backup</b>. If you added your own photos, videos or sound, tap <b>Full backup</b> instead.</li>
    </ol>
    <p>To get your data back, tap <b>Import backup</b> and choose the file.</p>`,
];

const SHARE_SECTION = [
  "sharing",
  "Coach and friends",
  "Let someone look at your workouts.",
  `<p>Turn on sync first. Then go to <b>Plan</b>, then <b>People</b>.</p>
    <ol>
      <li>Type your name, tap <b>Invite someone</b> and choose <b>Coach</b> or <b>Friend</b>.</li>
      <li>Tap <b>Send the invite</b> and pick Messages or WhatsApp. The code works once, for 7 days.</li>
      <li>When they enter it, open <b>People</b> again and tap <b>Allow</b>. Nothing is shared before that.</li>
    </ol>
    <p><b>What they see:</b> they can only look, never change anything. A coach sees your workouts and plan. A friend sees your workouts, and your plan only if you tick it. Body weight is hidden unless you switch on <b>Show my body weight to my coach</b>. Friends never see it.</p>
    <p><b>Copying:</b> tick <b>Let them copy my workouts and plan</b> if they may copy days into their own plan.</p>
    <p><b>Stop sharing:</b> tap <b>Remove</b>. They see nothing new from then on. What they already saw stays with them.</p>
    <p><b>Got a code?</b> In <b>People</b>, tap <b>Enter a code</b>. Once they allow you, tap their name to see their workouts. If they let you copy, you can add a day or all days to your plan, or tap <b>Make a day from this workout</b>. The copy is yours and does not change when theirs does.</p>`,
];

export function render(root, ctx) {
  const want = ctx.params.id; // "#/help/install" opens that section
  const open = (k) => (want ? k === want : k === "install" && !isInstalled());
  root.innerHTML = `<h1 class="title">How to use</h1>
    <p class="muted" style="margin:0 0 12px">Tap a heading to open it.</p>
    ${[...SECTIONS, SYNC_SECTION, BACKUP_SECTION, SHARE_SECTION].map(
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
    <a class="btn" href="#/today">Back to Today</a>`;
  if (want) root.querySelector(`#help-${CSS.escape(want)}`)?.scrollIntoView();
}
