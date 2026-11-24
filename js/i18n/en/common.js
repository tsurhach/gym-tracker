// Shared words and shell strings (tabs, banners, sheets, errors, Help). Owner: common area.
export const addressesUser = ["help.install.body","help.plan.body","help.workout.body","help.supersets.body","help.heavier.body","help.extras.body","help.progress.body","help.sync.body","help.backup.body","help.sharing.body","friendly.offline","app.calRefused","app.overwriteAsk"]; // Help bodies talk to the reader
export default {
  "muscle.Chest": "Chest",
  "muscle.Back": "Back",
  "muscle.Shoulders": "Shoulders",
  "muscle.Biceps": "Biceps",
  "muscle.Triceps": "Triceps",
  "muscle.Forearms": "Forearms",
  "muscle.Abs": "Abs",
  "muscle.Quads": "Quads",
  "muscle.Hamstrings": "Hamstrings",
  "muscle.Glutes": "Glutes",
  "muscle.Calves": "Calves",
  "equip.barbell": "barbell",
  "equip.dumbbell": "dumbbell",
  "equip.body only": "body only",
  "equip.cable": "cable",
  "equip.machine": "machine",
  "equip.other": "other",
  "equip.e-z curl bar": "e-z curl bar",
  "equip.kettlebells": "kettlebells",
  "goal.strength": "Strength",
  "goal.muscle": "Build muscle",
  "goal.endurance": "Endurance",
  "help.install.title": "Put it on your home screen",
  "help.install.sub": "Then it opens like a normal app.",
  "help.install.body": `<p><b>iPhone:</b></p>
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
  "help.plan.title": "Set up your plan",
  "help.plan.sub": "Your workouts and exercises.",
  "help.plan.body": `<p>The first time, the app asks a few questions and suggests a plan. Just answer and tap <b>Propose my plan</b>.</p>
    <p>Later, go to <b>Plan</b>, then <b>Change the whole plan</b>:</p>
    <ul>
      <li><b>Ready-made programs</b>: pick one and use it.</li>
      <li><b>Build a plan with AI</b>: the app gives you words to copy into an AI app. Paste its answer back.</li>
    </ul>
    <p>You can also change any workout in Plan by hand.</p>
    <p><b>Weekly schedule (optional):</b> in Plan, open <b>Weekly schedule</b> and tap your training days. Today then shows that day's workout, and says <b>Rest day</b> on the others. Without a schedule, the app just suggests the next workout in order.</p>
    <p><b>Calendar (optional):</b> in Plan &gt; Weekly schedule, switch on <b>Calendar</b> and tap <b>Add to Apple Calendar</b> or <b>Add to Google Calendar</b> (or copy the link). Your planned training days show in your calendar, all day or at the time you pick. Only workout names and days leave the phone. Calendar apps check for changes on their own schedule (Google can take a day). Reminders are off: turn on alerts for the Gym Tracker calendar in your calendar app's settings. Make a new link or turn it off there at any time.</p>`,
  "help.workout.title": "Do a workout",
  "help.workout.sub": "Start, tick off your sets, finish.",
  "help.workout.body": `<ol>
      <li>On <b>Today</b>, tap <b>Start</b>.</li>
      <li>Tap any exercise. You can do them in any order.</li>
      <li>The weight and reps are filled in from last time.</li>
      <li>After each set, tap the <b>✓</b> to confirm it.</li>
      <li>To change a number, tap it and type. A weight you type on the first set is copied to the sets below it.</li>
      <li>Want to remember something, like the seat setting? Type it in the note box. It shows again next time.</li>
      <li>Machine taken? On the exercise, tap <b>Swap exercise</b> to switch to a similar one. Ones you picked before show <b>★ Usual</b>.</li>
      <li>When all sets are ticked, tap <b>Next</b> to go to the next exercise, or <b>Done, back to list</b>.</li>
      <li>At the end, tap <b>Finish workout</b>.</li>
    </ol>`,
  "help.supersets.title": "Supersets (optional)",
  "help.supersets.sub": "Switch between two exercises.",
  "help.supersets.body": `<p>A superset means you do one set of one exercise, then one set of the next, and so on. Nothing changes unless you make one.</p>
    <ol>
      <li>In <b>Plan</b>, open a workout and tap <b>Superset…</b>.</li>
      <li>Tap the exercises in the order you want. Choose when to rest. Tap <b>Make superset</b>.</li>
    </ol>
    <p>When you tick a set, the app opens the next exercise of the superset for you. To change or remove it, tap its <b>Superset</b> tag in Plan.</p>`,
  "help.heavier.title": "“Go heavier” advice",
  "help.heavier.sub": "Only a suggestion.",
  "help.heavier.body": `<p>If you did all your reps on every set last time, the app says something like "Try 42.5 kg today". It means you may be ready for a bit more weight.</p>
    <p>For body-weight exercises like push-ups, it suggests one more rep, or a little added weight if you have it. You can turn this off, and the Stuck reminder too, in <b>Plan</b>, then <b>Settings</b>.</p>
    <p>It is only a suggestion. Use the weight that feels right.</p>`,
  "help.extras.title": "Rest timer, photos, sound",
  "help.extras.sub": "Small helpers while you train.",
  "help.extras.body": `<p><b>Rest timer:</b> after you tick a set, a countdown starts. Tap <b>−15s</b> or <b>+15s</b> to change it, or <b>Skip</b>. Set its length in <b>Plan</b>, then <b>Settings</b>.</p>
    <p><b>Rest-over sound:</b> in <b>Settings</b> you can record your own sound or pick an audio file. Turn on <b>Notify me when rest is over</b> to get an alert when the phone is locked.</p>
    <p><b>Your own photo or video:</b> on an exercise you added yourself, tap <b>Add photo or video</b>.</p>
    <p><b>Plates per side:</b> for bar exercises the app shows which plates to put on each side.</p>
    <p><b>New best:</b> a 🏆 shows when a set is heavier than ever, or has more reps than ever at that weight. When you finish, you see a short summary with your new bests.</p>`,
  "help.progress.title": "History, Muscles, Body weight",
  "help.progress.sub": "See how you are doing.",
  "help.progress.body": `<p><b>History:</b> every past workout. Tap one to fix a mistake. Tap an exercise name for its chart.</p>
    <p><b>Muscles:</b> how many sets each muscle got in the last 7 days, and which ones you missed.</p>
    <p><b>Body weight:</b> on Today, tap <b>Body weight</b> to log your weight now and then.</p>`,
  "help.sync.title": "Sync",
  "help.sync.sub": "Optional. Keeps your data if you lose your phone.",
  "help.sync.body": `<p>Go to <b>Plan</b>, then <b>Sync and sign-in</b>, and tap <b>Turn on sync with Face ID</b>. The app works fine without it.</p>
    <p>It saves your workouts, plan, settings, photos and rest sound. Videos stay on this phone. Your data is locked before it leaves the phone, so nobody else can read it, not even us.</p>
    <p><b>Recovery code:</b> the app shows it once. Tap <b>Save in iPhone Passwords</b>. You need it if Face ID alone cannot open your data, for example on an Android phone. Nobody can reset it.</p>
    <p><b>Another phone or iPad:</b> open the app there, go to <b>Sync and sign-in</b>, and tap <b>I already use sync</b>.</p>
    <p>Syncing happens by itself. <b>Sign out on this device</b> stops it on this phone. <b>Delete my cloud data</b> removes the saved copy. Either way, your data on the phone stays.</p>`,
  "help.backup.title": "Backup file",
  "help.backup.sub": "A copy you keep yourself.",
  "help.backup.body": `<p>A backup is a file you save somewhere safe, like Files or iCloud Drive. Do it about once a month, and before changing phones.</p>
    <ol>
      <li>Go to <b>Plan</b>, then <b>Backup and export</b>.</li>
      <li>Tap <b>Export backup</b>. If you added your own photos, videos or sound, tap <b>Full backup</b> instead.</li>
    </ol>
    <p>To get your data back, tap <b>Import backup</b> and choose the file.</p>`,
  "help.sharing.title": "Coach and friends",
  "help.sharing.sub": "Let someone look at your workouts.",
  "help.sharing.body": `<p>Turn on sync first. Then go to <b>Plan</b>, then <b>People</b>.</p>
    <ol>
      <li>Type your name, tap <b>Invite someone</b> and choose <b>Coach</b> or <b>Friend</b>.</li>
      <li>Tap <b>Send the invite</b> and pick Messages or WhatsApp. The code works once, for 7 days.</li>
      <li>When they enter it, open <b>People</b> again and tap <b>Allow</b>. Nothing is shared before that.</li>
    </ol>
    <p><b>What they see:</b> they can only look, never change anything. A coach sees your workouts and plan. A friend sees your workouts, and your plan only if you tick it. Body weight is hidden unless you switch on <b>Show my body weight to my coach</b>. Friends never see it.</p>
    <p><b>Copying:</b> tick <b>Let them copy my workouts and plan</b> if they may copy days into their own plan.</p>
    <p><b>Stop sharing:</b> tap <b>Remove</b>. They see nothing new from then on. What they already saw stays with them.</p>
    <p><b>Got a code?</b> In <b>People</b>, tap <b>Enter a code</b>. Once they allow you, tap their name to see their workouts. If they let you copy, you can add a day or all days to your plan, or tap <b>Make a day from this workout</b>. The copy is yours and does not change when theirs does.</p>`,
  "help.title": "How to use",
  "help.hint": "Tap a heading to open it.",
  "help.back": "Back to Today",
  "ui.howto": "How to do it",
  "ui.dismiss": "Dismiss",
  "ui.ok": "OK",
  "ui.confirm": "Confirm",
  "ui.cancel": "Cancel",
  "friendly.now": "just now",
  "friendly.min": "{n} min ago",
  "friendly.hours": "{n} h ago",
  "friendly.days": "{n} days ago",
  "friendly.offline": "No internet connection. Try again when you are online.",
  "friendly.wrong": "Something went wrong.",
  "friendly.synced": "Synced.",
  "store.notBackup": "This file is not a Gym Tracker backup.",
  "app.linkedItem": "{from} → {to}",
  "app.linkedMore": ", and {n} more",
  "app.linked": {one:"Linked {n} exercise to the library so they show drawings: {list}{more}.",other:"Linked {n} exercises to the library so they show drawings: {list}{more}."},
  "app.updated": "Updated from your other device.",
  "app.noLibrary": "Could not load the exercise library. Check your connection and reload.",
  "app.notSaved": "Changes are not saved. Your old data was left untouched.",
  "app.saveFailed": "Could not save. Storage may be full or blocked. Export a backup if you can.",
  "app.overwriteAsk": "Saved data on this phone could not be read, and it could NOT be set aside. If you continue, the next save will overwrite it for good.",
  "app.overwrite": "Overwrite and continue",
  "app.notNow": "Not now",
  "app.screenError": "Something went wrong showing this screen.",
  "app.recovered": "Saved data could not be read, so it was set aside and the app started fresh.",
  "app.unreadable": "Saved data could not be read. Nothing will be saved until you confirm.",
  "app.calRefused": "Your calendar could not be updated. Try shortening your workout names.",
  "tab.aria": "Main",
  "tab.today": "Today",
  "tab.history": "History",
  "tab.muscles": "Muscles",
  "tab.plan": "Plan",
};
