// #/sync: turn on, sign in, recovery code, sign out, delete. Only reachable when SYNC_ENABLED (js/sync.js).
// Redraws only itself (never ctx.save / render), so nothing typed elsewhere is touched.
import { esc, confirmSheet, showBanner } from "../ui.js";
import { friendlyError, syncOutcome } from "../friendly.js";
import { supported } from "../passkey.js";
import { t, ltr } from "../i18n/index.js";

let view = "home"; // home | code | needcode
let recovery = "";
let saved = false;
let busy = false;
let error = "";
let typed = ""; // the recovery code being typed: kept when it is wrong

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
  error ? `<p class="err" role="alert">${esc(error)}</p>` : "";
const dis = () => (busy ? " disabled" : "");

function html(sync) {
  const back = `<a class="btn" href="#/plan">${t("sync.backPlan")}</a>`;
  if (view === "code")
    return `<h1 class="title">${t("sync.codeTitle")}</h1>
      <section class="card">
        <p>${t("sync.codeKeep")}</p>
        <p style="font:600 22px/1.5 ui-monospace,monospace;word-break:break-word;letter-spacing:1px">${ltr(esc(recovery))}</p>
        <form data-form="save">
          <span style="position:absolute;opacity:0;height:0;overflow:hidden"><input type="text" name="username" value="Gym Tracker" autocomplete="username" tabindex="-1" /><input type="password" name="code" value="${esc(recovery)}" autocomplete="new-password" tabindex="-1" /></span>
          <button class="btn" type="submit">${t("sync.savePasswords")}</button>
        </form>
        <button class="btn" data-act="copy">${t("sync.copyCode")}</button>
      </section>
      <button class="btn btn-primary" data-act="done">${t("sync.done")}</button>
      ${saved ? "" : `<p class="muted small">${t("sync.saveFirst")}</p>`}`;
  if (view === "needcode")
    return `<h1 class="title">${t("sync.enterTitle")}</h1>
      <section class="card">
        <p>${t("sync.enterBody")}</p>
        <form data-form="code">
          <input type="text" name="username" value="Gym Tracker" autocomplete="username" hidden />
          <input type="password" name="code" autocomplete="current-password" autocapitalize="characters" aria-label="${esc(t("sync.codeLabel"))}" value="${esc(typed)}" />
          <p class="muted small">${t("sync.tapBox")}</p>
          ${err()}
          <button class="btn btn-primary" type="submit"${dis()}>${t("sync.unlock")}</button>
        </form>
      </section>${back}`;
  if (sync.active())
    return `<h1 class="title">${t("sync.title")}</h1>
      <section class="card"><b>${esc(sync.status())}</b>
        <p class="muted small">${t("sync.mediaInfo")}</p>${sync.mediaNote() ? `<p class="small" role="status">${esc(sync.mediaNote())}</p>` : ""}</section>
      ${err()}
      <button class="btn" data-act="now"${dis()}>${t("sync.now")}</button>
      <button class="btn" data-act="newcode"${dis()}>${t("sync.newCode")}</button>
      <p class="muted small">${t("sync.lostCode")}</p>
      <button class="btn" data-act="signout"${dis()}>${t("sync.signOutBtn")}</button>
      <button class="btn btn-warn" data-act="delete"${dis()}>${t("sync.deleteBtn")}</button>
      <a class="btn" href="#/people">${t("sync.goPeople")}</a>
      ${back}`;
  if (!supported())
    return `<h1 class="title">${t("sync.title")}</h1><section class="card"><p>${t("sync.noPasskeys")}</p></section>${back}`;
  return `<h1 class="title">${t("sync.title")}</h1>
    <section class="card">
      <p>${t("sync.intro")}</p>
      ${sync.status() !== t("sync.off") ? `<p class="muted small">${esc(sync.status())}</p>` : ""}
    </section>
    ${err()}
    <button class="btn btn-primary" data-act="enable"${dis()}>${t("sync.enable")}</button>
    <button class="btn" data-act="signin"${dis()}>${t("sync.signIn")}</button>
    <p class="muted small">${t("sync.signInHelp")}</p>
    ${back}`;
}

function wire(root, sync, draw, ctx) {
  const run = async (fn) => {
    let failed = false;
    busy = true;
    error = "";
    draw();
    try {
      await fn();
    } catch (e) {
      error = friendlyError(e); // a cancelled Face ID prompt gives ""
      failed = true;
    }
    busy = false;
    draw();
    return !failed;
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
    now: async () => {
      if (await run(() => sync.syncNow())) {
        const o = syncOutcome(sync.status(), sync.isOk());
        showBanner(o.text, { kind: o.kind });
      }
    },
    newcode: async () => {
      if (!(await confirmSheet(t("sync.newCodeAsk"), t("sync.newCodeOk")))) return;
      run(async () => {
        recovery = await sync.newRecoveryCode();
        saved = false;
        go("code");
      });
    },
    signout: async () => {
      if (!(await confirmSheet(t("sync.signOutAsk"), t("sync.signOutOk")))) return;
      if (await run(() => sync.signOut())) showBanner(t("sync.signedOut"), { kind: "ok" });
    },
    delete: async () => {
      if (
        !(await confirmSheet(
          t("sync.deleteAsk"),
          t("sync.deleteOk"),
          t("sync.cancel"),
          { danger: true },
        ))
      )
        return;
      run(() => sync.deleteCloud());
    },
    copy: async () => {
      try {
        await navigator.clipboard.writeText(recovery);
        saved = true;
        showBanner(t("sync.copied"), { kind: "ok" });
      } catch {}
      draw();
    },
    done: async () => {
      if (!saved && !(await confirmSheet(t("sync.savedAsk"), t("sync.savedOk")))) return;
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
      const text = (typed = code.elements.code.value);
      run(async () => {
        await sync.signInWithCode(text);
        typed = "";
        go("home");
        ctx.go("#/plan");
      });
    };
}
