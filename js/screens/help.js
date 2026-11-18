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
    <p><b>Important:</b> your data stays on this phone only. If you delete the app from your home screen, your data is deleted too. Use <b>Backup</b> first (see "Keep your data safe").</p>`,
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
      <li>Tap <b>Done, back to list</b>, then pick the next exercise.</li>
      <li>At the end, tap <b>Finish workout</b>.</li>
    </ol>`,
  ],
  [
    "heavier",
    "“Go heavier” advice",
    "Only a suggestion.",
    `<p>If you did all your reps on every set last time, the app says something like "Try 42.5 kg today". It means you may be ready for a bit more weight.</p>
    <p>For body-weight exercises like push-ups, it suggests one more rep, or a little added weight if you have it.</p>
    <p>It is only a suggestion. Use the weight that feels right.</p>`,
  ],
  [
    "extras",
    "Rest timer, plates, New best",
    "Small helpers while you train.",
    `<p><b>Rest timer:</b> after you confirm a set, a countdown starts. Change its length in Plan, Settings.</p>
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
  [
    "backup",
    "Keep your data safe",
    "Do this now and then.",
    `<p>Your data lives only on this phone. A backup is a file you can save somewhere safe.</p>
    <ol>
      <li>Go to <b>Plan</b>, then <b>Backup and export</b>.</li>
      <li>Tap <b>Export backup</b>. Do this about once a month, and before changing phones.</li>
      <li>Tap <b>Full backup</b> instead if you added your own photos or videos. It keeps them too.</li>
    </ol>
    <p>To get your data back, tap <b>Import backup</b> and choose the file.</p>`,
  ],
];

export function render(root, ctx) {
  const want = ctx.params.id; // "#/help/install" opens that section
  const open = (k) => (want ? k === want : k === "install" && !isInstalled());
  root.innerHTML = `<h1 class="title">How to use</h1>
    <p class="muted" style="margin:0 0 12px">About two minutes to read. Tap a heading to open it.</p>
    ${SECTIONS.map(
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
