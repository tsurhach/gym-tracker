// #/people and #/join/<code>: invite a coach or friend, enter a code, allow or remove people.
// Only reachable when SYNC_ENABLED (js/sync.js). Redraws only itself and never calls ctx.save with a render,
// so nothing typed is lost (iOS taps do not blur inputs, so the name is copied at every tap).
import { esc, confirmSheet, fmtDate } from "../ui.js";
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

const role = (r) => (r === "coach" ? "coach" : "friend");
const label = (r) => (r === "coach" ? "Coach" : "Friend");

export function renderJoin(root, ctx) {
  if (!ctx.sync?.active()) {
    const code = String(ctx.params.id ?? "");
    root.innerHTML = `<h1 class="title">Join with a code</h1>
      <section class="card"><p>Open <b>Gym Tracker</b> from your home screen, go to <b>Plan</b>, then <b>People</b>, then <b>Enter a code</b>, and type:</p>
        <p style="font:600 22px/1.5 ui-monospace,monospace">${esc(code)}</p>
        <button class="btn" data-copy>Copy code</button></section>`;
    root.querySelector("[data-copy]").onclick = () =>
      navigator.clipboard?.writeText(code).catch(() => {});
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
    root.innerHTML = `<h1 class="title">People</h1><section class="card"><p>Sharing needs sync. Turn it on first.</p></section>
      <a class="btn btn-primary" href="#/sync">Go to sync</a><a class="btn" href="#/plan">Back to Plan</a>`;
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
        error = e.message;
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
  `<section class="card"><label class="setting">Your name for others
      <input data-name type="text" autocomplete="off" maxlength="40" value="${esc(ctx.state.settings.shareName ?? "")}" /></label>
    <p class="muted small">Only the people you allow see it.</p></section>`;

function html(ctx, sh) {
  const err = error ? `<p role="alert">${esc(error)}</p>` : "";
  const dis = busy ? " disabled" : "";
  const back = `<a class="btn" href="#/plan">Back to Plan</a>`;
  if (view === "invite")
    return `<h1 class="title">Invite someone</h1>${sh.nameOf() ? "" : nameCard(ctx)}
      <section class="card">
        <label class="setting">They are my <select data-role><option value="coach"${pickRole === "coach" ? " selected" : ""}>Coach</option><option value="friend"${pickRole === "friend" ? " selected" : ""}>Friend</option></select></label>
        ${pickRole === "friend" ? `<label class="setting">Also show my plan <input type="checkbox" data-plan${pickPlan ? " checked" : ""} /></label>` : ""}
        <p class="muted small">They only see your workouts, never change anything. You choose who sees what, and can remove them at any time.</p>
      </section>${err}
      <button class="btn btn-primary" data-act="make"${dis}>Make a code</button><button class="btn" data-act="home">Cancel</button>`;
  if (view === "code" && made)
    return `<h1 class="title">Your invite</h1>
      <section class="card"><p>Send this code. It works once and is valid for 7 days. You still choose whether to allow them.</p>
        <p style="font:600 24px/1.5 ui-monospace,monospace;letter-spacing:1px">${esc(showCode(made.code))}</p>
        <p class="muted small" style="word-break:break-all">${esc(made.link)}</p></section>
      ${typeof navigator !== "undefined" && navigator.share ? `<button class="btn btn-primary" data-act="share">Send the invite</button>` : ""}
      <button class="btn" data-act="copy">Copy the link</button><button class="btn" data-act="home">Done</button>`;
  if (view === "enter")
    return `<h1 class="title">Enter a code</h1>${sh.nameOf() ? "" : nameCard(ctx)}
      <section class="card"><input data-code type="text" autocapitalize="characters" autocomplete="off" aria-label="Invite code" value="${esc(text)}" /></section>${err}
      <button class="btn btn-primary" data-act="next"${dis}>Next</button><button class="btn" data-act="home">Cancel</button>`;
  if (view === "accept" && peeked) {
    const f = peeked.from;
    return `<h1 class="title">${esc(f.name)} invites you</h1>${sh.nameOf() ? "" : nameCard(ctx)}
      <section class="card"><p>${esc(f.name)} invites you to see their workouts as their ${role(f.role)}.</p>
        <label class="setting">Also let ${esc(f.name)} see my workouts <input type="checkbox" data-back /></label>
        <p class="muted small">${esc(f.name)} must allow you before you see anything.</p></section>${err}
      <button class="btn btn-primary" data-act="accept"${dis}>Accept</button><button class="btn" data-act="home">Cancel</button>`;
  }
  const d = data;
  const waiting = (d?.pending ?? [])
    .map(
      (
        p,
      ) => `<section class="card"><p><b>${esc(p.name)}</b> wants to see your workouts as your ${role(p.role)}.${p.wantsBack ? ` ${esc(p.name)} also shares theirs with you.` : ""}</p>
        <button class="btn btn-primary" data-act="allow" data-id="${esc(p.id)}"${dis}>Allow</button><button class="btn" data-act="decline" data-id="${esc(p.id)}"${dis}>Decline</button></section>`,
    )
    .join("");
  const can = (d?.viewers ?? [])
    .map(
      (
        v,
      ) => `<section class="card"><div class="row"><b class="grow">${esc(v.name)}</b><span class="muted">${label(v.role)}</span></div>
        ${v.role === "coach" ? "" : `<label class="setting">Also show my plan <input type="checkbox" data-ticks data-id="${esc(v.id)}"${v.ticks?.plan ? " checked" : ""} /></label>`}
        <label class="setting">Let them copy my workouts and plan <input type="checkbox" data-copyok data-id="${esc(v.id)}"${v.ticks?.copy ? " checked" : ""} /></label>
        <button class="btn btn-warn" data-act="remove" data-id="${esc(v.id)}"${dis}>Remove</button></section>`,
    )
    .join("");
  const see = (d?.canSee ?? [])
    .map((c) => {
      const last = sh
        .cached(c.id)
        ?.view?.sessions?.reduce((m, s) => Math.max(m, s.startedAt), 0);
      return `<a class="card block" href="#/person/${encodeURIComponent(c.id)}"><div class="row"><b class="grow">${esc(c.name)}</b><span class="muted small">${last ? `trained ${esc(fmtDate(last))}` : ""}</span></div></a>`;
    })
    .join("");
  const open = (d?.invites ?? [])
    .map(
      (
        i,
      ) => `<section class="card"><b>${esc(showCode(i.code))}</b> <span class="muted small">${label(i.role)}, until ${esc(fmtDate(i.expiresAt))}</span>
        <button class="btn" data-act="cancel" data-id="${esc(i.lookup)}"${dis}>Cancel invite</button></section>`,
    )
    .join("");
  const w = ctx.state.settings.shareWeight === true;
  return `<h1 class="title">People</h1>
    <p class="muted">Let a coach or friend look at your workouts. View only, and your data stays locked: only people you allow can open it.</p>
    ${nameCard(ctx)}
    <section class="card"><label class="setting">Show my body weight to my coach <input type="checkbox" data-weight${w ? " checked" : ""} /></label>
      <p class="muted small">Off by default. Friends never see it.</p></section>${err}
    ${waiting ? `<h3>Waiting for you</h3>${waiting}` : ""}
    ${can ? `<h3>Can see your workouts</h3>${can}` : ""}
    ${see ? `<h3>You can see</h3>${see}` : ""}
    ${open ? `<h3>Open invites</h3>${open}` : ""}
    <button class="btn btn-primary" data-act="invite">Invite someone</button>
    <button class="btn" data-act="enter">Enter a code</button>${back}`;
}

async function lookUp(sh, ctx, draw, getText) {
  try {
    peeked = await sh.peek(getText());
    error = "";
    view = "accept";
  } catch (e) {
    error = e.message;
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
      error = e.message ?? "Something went wrong.";
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
          pickRole === "friend" ? { plan: pickPlan } : {},
        );
        view = "code";
      }),
    share: () =>
      navigator
        .share({
          title: "Gym Tracker",
          text: `${sh.nameOf()} invites you to see their workouts. Code: ${showCode(made.code)}`,
          url: made.link,
        })
        .catch(() => {}),
    copy: () => navigator.clipboard?.writeText(made.link).catch(() => {}),
    next: () => {
      text = root.querySelector("[data-code]").value;
      return lookUp(sh, ctx, draw, () => text);
    },
    accept: () =>
      run(async () => {
        await sh.accept(peeked, root.querySelector("[data-back]").checked);
        home();
        ctx.go("#/people");
      }),
    allow: (id) => run(() => sh.allow(find("pending", id))),
    decline: (id) => run(() => sh.decline(find("pending", id))),
    cancel: (id) => run(() => sh.cancelInvite(find("invites", id))),
    remove: async (id) => {
      const p = find("viewers", id);
      if (
        !(await confirmSheet(
          `Remove ${p.name}? They stop seeing anything new. What they already saw stays with them.`,
          "Remove",
        ))
      )
        return;
      run(() => sh.remove(p));
    },
  };
  root.onclick = (e) => {
    syncName();
    const t = e.target.closest("[data-act]");
    if (t && !t.disabled) acts[t.dataset.act](t.dataset.id);
  };
  root.onchange = (e) => {
    const t = e.target;
    if (t.matches("[data-name]")) return syncName();
    if (t.matches("[data-weight]")) {
      ctx.state.settings.shareWeight = t.checked;
      ctx.save({ render: false });
      sh.publish().catch(() => {}); // switching it off must take effect now, not at the next sync
    } else if (t.matches("[data-role]")) {
      pickRole = t.value;
      draw();
    } else if (t.matches("[data-plan]")) pickPlan = t.checked;
    else if (t.matches("[data-ticks],[data-copyok]")) {
      const v = find("viewers", t.dataset.id);
      run(() => sh.setTicks(v, { ...v.ticks, [t.matches("[data-copyok]") ? "copy" : "plan"]: t.checked }));
    }
  };
}
