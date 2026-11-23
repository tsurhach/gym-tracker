// #/sync: turn on, sign in, recovery code, sign out, delete. Only reachable when SYNC_ENABLED (js/sync.js).
// Redraws only itself (never ctx.save / render), so nothing typed elsewhere is touched.
import { esc, confirmSheet } from "../ui.js";
import { supported } from "../passkey.js";

let view = "home"; // home | code | needcode
let recovery = "";
let saved = false;
let busy = false;
let error = "";

export function render(root, ctx) {
  const sync = ctx.sync;
  const draw = () => {
    root.innerHTML = html(sync);
    wire(root, sync, draw, ctx);
  };
  if (view === "code" && !recovery) view = "home";
  draw();
}

const err = () =>
  error ? `<p role="alert">${esc(error)}</p>` : "";
const dis = () => (busy ? " disabled" : "");

function html(sync) {
  const back = `<a class="btn" href="#/plan">Back to Plan</a>`;
  if (view === "code")
    return `<h1 class="title">Your recovery code</h1>
      <section class="card">
        <p>You only need this if Face ID cannot unlock your data, for example on an Android phone. We cannot reset it. Save it now.</p>
        <p style="font:600 22px/1.5 ui-monospace,monospace;word-break:break-word;letter-spacing:1px">${esc(recovery)}</p>
        <form data-form="save">
          <span style="position:absolute;opacity:0;height:0;overflow:hidden"><input type="text" name="username" value="Gym Tracker" autocomplete="username" tabindex="-1" /><input type="password" name="code" value="${esc(recovery)}" autocomplete="new-password" tabindex="-1" /></span>
          <button class="btn" type="submit">Save in Passwords</button>
        </form>
        <button class="btn" data-act="copy">Copy code</button>
      </section>
      <button class="btn btn-primary" data-act="done"${saved ? "" : " disabled"}>Done</button>
      ${saved ? "" : `<p class="muted small">Tap Save or Copy first.</p>`}`;
  if (view === "needcode")
    return `<h1 class="title">Enter your recovery code</h1>
      <section class="card">
        <p>Face ID could not unlock your data on this device. Type the recovery code once.</p>
        <form data-form="code">
          <input type="text" name="username" value="Gym Tracker" autocomplete="username" hidden />
          <input type="password" name="code" autocomplete="current-password" autocapitalize="characters" aria-label="Recovery code" />
          ${err()}
          <button class="btn btn-primary" type="submit"${dis()}>Unlock</button>
        </form>
      </section>${back}`;
  if (sync.active())
    return `<h1 class="title">Sync</h1>
      <section class="card"><b>${esc(sync.status())}</b>
        <p class="muted small">Videos stay on this phone and in your backup file. Photos and sound are not synced yet.</p></section>
      ${err()}
      <button class="btn" data-act="now"${dis()}>Sync now</button>
      <button class="btn" data-act="newcode"${dis()}>Make a new recovery code</button>
      <button class="btn" data-act="signout"${dis()}>Sign out on this device</button>
      <button class="btn btn-warn" data-act="delete"${dis()}>Delete my cloud data</button>
      ${back}`;
  if (!supported())
    return `<h1 class="title">Sync</h1><section class="card"><p>This browser cannot use passkeys, so sync is not available here.</p></section>${back}`;
  return `<h1 class="title">Sync</h1>
    <section class="card">
      <p>Keep your workouts safe if you lose your phone, and use them on another device. Your data is locked on the phone before it leaves, so nobody else can read it.</p>
      <p class="muted small">Your workouts on this device and in the cloud will be combined when you sign in.</p>
    </section>
    ${err()}
    <button class="btn btn-primary" data-act="enable"${dis()}>Turn on sync with Face ID</button>
    <button class="btn" data-act="signin"${dis()}>I already use sync</button>
    ${back}`;
}

function wire(root, sync, draw, ctx) {
  const run = async (fn) => {
    busy = true;
    error = "";
    draw();
    try {
      await fn();
    } catch (e) {
      // A cancelled Face ID prompt is not an error worth showing.
      error =
        e?.name === "NotAllowedError"
          ? ""
          : (e?.message ?? "Something went wrong.");
    }
    busy = false;
    draw();
  };
  const go = (f) => (view = f);
  const acts = {
    enable: () =>
      run(async () => {
        recovery = (await sync.enable()).recoveryCode;
        saved = false;
        go("code");
      }),
    signin: () =>
      run(async () => {
        const r = await sync.signIn();
        if (r.needCode) go("needcode");
        else ctx.go("#/plan");
      }),
    now: () => run(() => sync.syncNow()),
    newcode: () =>
      run(async () => {
        recovery = await sync.newRecoveryCode();
        saved = false;
        go("code");
      }),
    signout: () => run(() => sync.signOut()),
    delete: async () => {
      if (
        !(await confirmSheet(
          "Delete your data from the cloud? Your data on this phone stays. Other devices stop syncing. This cannot be undone. The passkey stays in iPhone Settings, Passwords; you can delete it there.",
          "Delete cloud data",
        ))
      )
        return;
      run(() => sync.deleteCloud());
    },
    copy: async () => {
      try {
        await navigator.clipboard.writeText(recovery);
        saved = true;
      } catch {}
      draw();
    },
    done: () => {
      recovery = "";
      go("home");
      draw();
    },
  };
  for (const el of root.querySelectorAll("[data-act]"))
    el.onclick = acts[el.dataset.act];
  const save = root.querySelector('[data-form="save"]');
  if (save)
    save.onsubmit = (e) => {
      e.preventDefault(); // iOS offers "Save Password" on submit
      saved = true;
      draw();
    };
  const code = root.querySelector('[data-form="code"]');
  if (code)
    code.onsubmit = (e) => {
      e.preventDefault();
      const text = code.elements.code.value;
      run(async () => {
        await sync.signInWithCode(text);
        go("home");
        ctx.go("#/plan");
      });
    };
}
