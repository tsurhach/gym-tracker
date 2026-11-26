// #/people and #/join/<code>: invite a coach or friend, enter a code, allow or remove people.
// Only reachable when SYNC_ENABLED (js/sync.js). Redraws only itself and never calls ctx.save with a render,
// so nothing typed is lost (iOS taps do not blur inputs, so the name is copied at every tap).
import { esc, confirmSheet, showBanner } from "../ui.js";
import { t, ltr, ltrText, fmtDate } from "../i18n/index.js";
import { friendlyError } from "../friendly.js";
import { showCode } from "../share.js";

let view = "home"; // home | invite | code | enter | accept
let data = null; // the last list: { viewers, pending, canSee, invites }
let error = "";
let busy = false;
let made = null; // { code, link }
let peeked = null;
let text = ""; // what was typed in "Enter a code"
let auto = false; // opened from a link: look the code up at once
let pickRole = "coach";
let pickPlan = false;
let pickCopy = false;

const role = (r) => (r === "coach" ? t("people.roleCoach") : t("people.roleFriend"));
const label = (r) => (r === "coach" ? t("people.labelCoach") : t("people.labelFriend"));

export function renderJoin(root, ctx) {
  if (!ctx.sync?.active()) {
    const code = String(ctx.params.id ?? "");
    root.innerHTML = `<h1 class="title">${t("people.joinTitle")}</h1>
      <section class="card"><p>${t("people.joinIntro")}</p>
        <ol><li>${t("people.joinStep1")}</li><li>${t("people.joinStep2")}</li><li>${t("people.joinStep3")}</li></ol>
        <p style="font:600 22px/1.5 ui-monospace,monospace">${ltr(esc(showCode(code)))}</p>
        <button class="btn" data-copy>${t("people.copyCode")}</button></section>`;
    root.querySelector("[data-copy]").onclick = () =>
      navigator.clipboard
        ?.writeText(code)
        .then(() => showBanner(t("people.copied"), { kind: "ok" }))
        .catch(() => {});
    return;
  }
  view = "enter";
  text = String(ctx.params.id ?? "");
  auto = true;
  render(root, ctx);
}

export function render(root, ctx) {
  const sh = ctx.share;
  if (!ctx.sync?.active()) {
    root.innerHTML = `<h1 class="title">${t("people.title")}</h1><section class="card"><p>${t("people.needsSync")}</p></section>
      <a class="btn btn-primary" href="#/sync">${t("people.goSync")}</a><a class="btn" href="#/plan">${t("people.backPlan")}</a>`;
    return;
  }
  const draw = () => {
    if (!root.isConnected) return;
    root.innerHTML = html(ctx, sh);
    wire(root, ctx, sh, draw);
  };
  const refresh = () =>
    sh
      .list()
      .then((l) => {
        data = l;
        if (
          root.isConnected &&
          !(
            root.contains(document.activeElement) &&
            document.activeElement.tagName === "INPUT"
          )
        )
          draw();
      })
      .catch((e) => {
        error = friendlyError(e);
        draw();
      });
  draw();
  refresh();
  if (auto) {
    auto = false;
    lookUp(sh, ctx, draw, () => text);
  }
}

const nameCard = (ctx) =>
  `<section class="card"><label class="setting">${t("people.yourName")}
      <input data-name type="text" dir="auto" autocomplete="off" maxlength="40" value="${esc(ctx.state.settings.shareName ?? "")}" /></label>
    <p class="muted small">${t("people.nameHelp")}</p></section>`;

const weightCard = (ctx) => `<section class="card"><label class="setting">${t("people.showWeight")} <input type="checkbox" data-weight${ctx.state.settings.shareWeight === true ? " checked" : ""} /></label>
      <p class="muted small">${t("people.weightHelp")}</p></section>`;

function html(ctx, sh) {
  const err = error ? `<p class="err" role="alert">${esc(error)}</p>` : "";
  const dis = busy ? " disabled" : "";
  const back = `<a class="btn" href="#/plan">${t("people.backPlan")}</a>`;
  if (view === "invite")
    return `<h1 class="title">${t("people.inviteTitle")}</h1>${sh.nameOf() ? "" : nameCard(ctx)}
      <section class="card">
        <div class="seg" role="group" aria-label="${esc(t("people.theyAre"))}"><button class="chip" data-act="role" data-role="coach" aria-pressed="${pickRole === "coach"}">${t("people.labelCoach")}</button><button class="chip" data-act="role" data-role="friend" aria-pressed="${pickRole === "friend"}">${t("people.labelFriend")}</button></div>
        ${pickRole === "friend" ? `<label class="setting">${t("people.alsoPlan")} <input type="checkbox" data-plan${pickPlan ? " checked" : ""} /></label>` : ""}
        <label class="setting">${t("people.letCopy")} <input type="checkbox" data-copyinv${pickCopy ? " checked" : ""} /></label>
        <p class="muted small">${pickRole === "coach" ? t("people.coachSees") : t("people.friendSees")} ${t("people.removeAnytime")}</p>
      </section>${pickRole === "coach" ? weightCard(ctx) : ""}${err}
      <button class="btn btn-primary" data-act="make"${dis}>${t("people.makeCode")}</button><button class="btn" data-act="home">${t("people.cancel")}</button>`;
  if (view === "code" && made)
    return `<h1 class="title">${t("people.yourInvite")}</h1>
      <section class="card"><p>${t("people.sendCode")}</p>
        <p style="font:600 24px/1.5 ui-monospace,monospace;letter-spacing:1px">${ltr(esc(showCode(made.code)))}</p></section>
      ${typeof navigator !== "undefined" && navigator.share ? `<button class="btn btn-primary" data-act="share">${t("people.sendInvite")}</button>` : ""}
      <button class="btn" data-act="copy">${t("people.copyLink")}</button><button class="btn" data-act="home">${t("people.done")}</button>`;
  if (view === "enter")
    return `<h1 class="title">${t("people.enterTitle")}</h1>${sh.nameOf() ? "" : nameCard(ctx)}
      <section class="card"><p>${t("people.typeCode")}</p><input data-code type="text" autocapitalize="characters" autocomplete="off" aria-label="${esc(t("people.codeLabel"))}" placeholder="ABCD-2345-XY" value="${esc(text)}" /></section>${err}
      <button class="btn btn-primary" data-act="next"${dis}>${t("people.next")}</button><button class="btn" data-act="home">${t("people.cancel")}</button>`;
  if (view === "accept" && peeked) {
    const f = peeked.from;
    return `<h1 class="title" dir="auto">${t("people.invitesYou", { name: esc(f.name) })}</h1>${sh.nameOf() ? "" : nameCard(ctx)}
      <section class="card"><p>${t("people.invitesRole", { name: esc(f.name), role: role(f.role) })}</p>
        ${f.role === "coach" ? "" : `<label class="setting">${t("people.alsoLet", { name: esc(f.name) })} <input type="checkbox" data-back /></label>`}
        <p class="muted small">${t("people.mustAllow", { name: esc(f.name) })}</p></section>${err}
      <button class="btn btn-primary" data-act="accept"${dis}>${t("people.accept")}</button><button class="btn" data-act="home">${t("people.cancel")}</button>`;
  }
  const d = data;
  const waiting = (d?.pending ?? [])
    .map(
      (
        p,
      ) => `<section class="card"><p>${t("people.wants", { name: `<b>${esc(p.name)}</b>`, role: role(p.role) })}${p.wantsBack ? ` ${t("people.wantsBack", { name: esc(p.name) })}` : ""}</p>
        <button class="btn btn-primary" data-act="allow" data-id="${esc(p.id)}"${dis}>${t("people.allow")}</button><button class="btn" data-act="decline" data-id="${esc(p.id)}"${dis}>${t("people.decline")}</button></section>`,
    )
    .join("");
  const can = (d?.viewers ?? [])
    .map(
      (
        v,
      ) => `<section class="card"><div class="row"><b class="grow" dir="auto">${esc(v.name)}</b><span class="muted">${label(v.role)}</span></div>
        ${v.role === "coach" ? "" : `<label class="setting">${t("people.alsoPlan")} <input type="checkbox" data-ticks data-id="${esc(v.id)}"${v.ticks?.plan ? " checked" : ""} /></label>`}
        <label class="setting">${t("people.letCopy")} <input type="checkbox" data-copyok data-id="${esc(v.id)}"${v.ticks?.copy ? " checked" : ""} /></label>
        <button class="btn btn-warn" data-act="remove" data-id="${esc(v.id)}"${dis}>${t("people.remove")}</button></section>`,
    )
    .join("");
  const see = (d?.canSee ?? [])
    .map((c) => {
      const last = sh
        .cached(c.id)
        ?.view?.sessions?.reduce((m, s) => Math.max(m, s.startedAt), 0);
      return `<a class="card block" href="#/person/${encodeURIComponent(c.id)}"><div class="row"><b class="grow" dir="auto">${esc(c.name)}</b><span class="muted small">${last ? t("people.trained", { date: ltr(esc(fmtDate(last))) }) : sh.cached(c.id) ? "" : t("people.waitingAllow")}</span><span aria-hidden="true">›</span></div></a>`;
    })
    .join("");
  const open = (d?.invites ?? [])
    .map(
      (
        i,
      ) => `<section class="card"><b>${ltr(esc(showCode(i.code)))}</b> <span class="muted small">${t("people.openInvite", { label: label(i.role), date: ltr(esc(fmtDate(i.expiresAt))) })}</span>
        <button class="btn" data-act="cancel" data-id="${esc(i.lookup)}"${dis}>${t("people.cancelInvite")}</button></section>`,
    )
    .join("");
  return `<h1 class="title">${t("people.title")}</h1>
    <p class="muted">${t("people.intro")}</p>
    <button class="btn btn-primary" data-act="invite">${t("people.inviteTitle")}</button>
    <button class="btn" data-act="enter">${t("people.enterTitle")}</button>
    ${nameCard(ctx)}
    ${(d?.viewers ?? []).some((v) => v.role === "coach") ? weightCard(ctx) : ""}${err}
    ${waiting ? `<h3>${t("people.hWaiting")}</h3>${waiting}` : ""}
    ${can ? `<h3>${t("people.hCan")}</h3>${can}` : ""}
    ${see ? `<h3>${t("people.hSee")}</h3>${see}` : ""}
    ${open ? `<h3>${t("people.hOpen")}</h3>${open}` : ""}
    ${back}`;
}

async function lookUp(sh, ctx, draw, getText) {
  try {
    peeked = await sh.peek(getText());
    error = "";
    view = "accept";
  } catch (e) {
    error = friendlyError(e);
  }
  draw();
}

function wire(root, ctx, sh, draw) {
  const syncName = () => {
    const n = root.querySelector("[data-name]");
    const v = n?.value.trim();
    if (n && v !== (ctx.state.settings.shareName ?? "")) {
      ctx.state.settings.shareName = v;
      ctx.save({ render: false });
    }
  };
  const find = (list, id) =>
    (data?.[list] ?? []).find((x) => (x.lookup ?? x.id) === id);
  const run = async (fn) => {
    busy = true;
    error = "";
    draw();
    try {
      await fn();
      data = await sh.list();
    } catch (e) {
      error = friendlyError(e);
    }
    busy = false;
    draw();
  };
  const home = () => (
    (view = "home"),
    (made = peeked = null),
    (text = ""),
    draw()
  );
  const acts = {
    home,
    invite: () => ((view = "invite"), (error = ""), draw()),
    enter: () => ((view = "enter"), (error = ""), draw()),
    make: () =>
      run(async () => {
        made = await sh.invite(
          pickRole,
          { ...(pickRole === "friend" ? { plan: pickPlan } : {}), copy: pickCopy }, // sealed in the invite, like the plan tick
        );
        view = "code";
      }),
    share: () =>
      navigator
        .share({
          title: "Gym Tracker",
          text: t("people.shareText", { name: sh.nameOf(), code: ltrText(showCode(made.code)) }),
          url: made.link,
        })
        .catch(() => {}),
    role: (_, t) => ((pickRole = t.dataset.role), draw()),
    copy: () =>
      navigator.clipboard
        ?.writeText(made.link)
        .then(() => showBanner(t("people.copied"), { kind: "ok" }))
        .catch(() => {}),
    next: () => {
      text = root.querySelector("[data-code]").value;
      return lookUp(sh, ctx, draw, () => text);
    },
    accept: () => {
      const who = peeked.from.name;
      return run(async () => {
        await sh.accept(peeked, !!root.querySelector("[data-back]")?.checked);
        home();
        ctx.go("#/people");
        showBanner(t("people.sent", { who }), { kind: "ok" });
      });
    },
    allow: (id) => run(() => sh.allow(find("pending", id))),
    decline: (id) => run(() => sh.decline(find("pending", id))),
    cancel: (id) => run(() => sh.cancelInvite(find("invites", id))),
    remove: async (id) => {
      const p = find("viewers", id);
      if (
        !(await confirmSheet(
          t("people.removeAsk", { name: p.name }),
          t("people.remove"),
          t("people.cancel"),
          { danger: true },
        ))
      )
        return;
      run(() => sh.remove(p));
    },
  };
  root.onclick = (e) => {
    syncName();
    const t = e.target.closest("[data-act]");
    if (t && !t.disabled) acts[t.dataset.act](t.dataset.id, t);
  };
  root.onchange = (e) => {
    const t = e.target;
    if (t.matches("[data-name]")) return syncName();
    if (t.matches("[data-weight]")) {
      ctx.state.settings.shareWeight = t.checked;
      ctx.save({ render: false });
      sh.publish().catch(() => {}); // switching it off must take effect now, not at the next sync
    } else if (t.matches("[data-plan]")) pickPlan = t.checked;
    else if (t.matches("[data-copyinv]")) pickCopy = t.checked;
    else if (t.matches("[data-ticks],[data-copyok]")) {
      const v = find("viewers", t.dataset.id);
      run(() => sh.setTicks(v, { ...v.ticks, [t.matches("[data-copyok]") ? "copy" : "plan"]: t.checked }));
    }
  };
}
