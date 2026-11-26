// Plan > Weekly schedule > Calendar: one subscribed link shows the training days in any calendar app.
// The box repaints only itself (never the whole screen), so a time picker or a typed value is not disturbed.
import { esc, confirmSheet, infoSheet, showBanner } from "../ui.js";
import { avgMins } from "../logic.js";
import { t, ltr, ltrText } from "../i18n/index.js";
import {
  calNew,
  calDelete,
  feedUrl,
  webcalUrl,
  googleUrl,
  TIP_KEY,
} from "../calendar.js";

const offline = () => t("cal.offline");
const ui = { busy: false, error: "", showLink: false }; // this screen's own state, never saved
const DEFAULT_TIME = "18:00";

const tip = () => [t("cal.tip1"), t("cal.tip2"), t("cal.tip3"), t("cal.tip4")];

const hasDays = (state) =>
  Object.keys(state.settings.schedule?.days ?? {}).length > 0;

export function calHtml(state) {
  const c = state.settings.calendar;
  const days = hasDays(state);
  const off = !c && !days;
  let h = `<div class="cal-sep"></div>
    <label class="setting">${t("cal.show")}
      <input type="checkbox" data-cal="on"${c ? " checked" : ""}${off || ui.busy ? " disabled" : ""} />
    </label>
    ${off ? `<p class="muted small" style="margin-top:0">${t("cal.pickDays")}</p>` : ""}
    <p class="muted small" style="margin-top:0">${t("cal.stored")}</p>
    ${ui.busy ? `<p class="muted small" role="status">${t("cal.working")}</p>` : ""}
    ${ui.error ? `<p class="small" role="alert" style="color:var(--warning)">${esc(ui.error)}</p>` : ""}`;
  if (!c) return h;
  const timed = c.time !== null;
  const avg = avgMins(state.sessions);
  const mins = [];
  for (let m = 15; m <= 240; m += 15) mins.push(m);
  const shown = c.autoMins && avg ? avg : c.mins;
  if (!mins.includes(shown)) mins.push(shown);
  h += `<a class="btn btn-primary" href="${esc(webcalUrl(c.id))}" style="margin-top:8px">${t("cal.addApple")}</a>
    <a class="btn" href="${esc(googleUrl(c.id))}" target="_blank" rel="noopener">${t("cal.addGoogle")}</a>
    <p class="muted small" style="margin-top:0">${t("cal.googleHelp")}</p>
    <button class="btn" data-cal="copy">${t("cal.copyLink")}</button>
    ${ui.showLink ? `<input readonly value="${esc(feedUrl(c.id))}" aria-label="${esc(t("cal.linkLabel"))}" onfocus="this.select()" />` : ""}
    <p class="muted small">${t("cal.private")}</p>`;
  h += `<div class="seg" role="group" aria-label="${esc(t("cal.whenLabel"))}" style="margin-top:8px">
      <button class="chip" data-cal="allday" aria-pressed="${!timed}">${t("cal.allDay")}</button>
      <button class="chip" data-cal="timed" aria-pressed="${timed}">${t("cal.setTime")}</button>
    </div>`;
  if (timed)
    h += `<label class="setting">${t("cal.startTime")}
        <input type="time" data-cal="time" value="${esc(c.time)}" aria-label="${esc(t("cal.startTime"))}" style="width:auto;min-width:110px" />
      </label>
      <label class="setting">${t("cal.length")}
        <select data-cal="mins" aria-label="${esc(t("cal.lengthLabel"))}"${c.autoMins ? " disabled" : ""}>
          ${mins
            .sort((a, b) => a - b)
            .map(
              (m) =>
                `<option value="${m}"${m === shown ? " selected" : ""}>${ltrText(t("cal.optMin", { m }))}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="check"><input type="checkbox" data-cal="auto"${c.autoMins ? " checked" : ""} /> ${t("cal.matchAvg")}</label>
      ${c.autoMins ? `<p class="muted small" style="margin-top:0">${avg ? t("cal.about", { n: ltr(String(avg)) }) : t("cal.needs3")}</p>` : ""}
      <label class="check"><input type="checkbox" data-cal="alarm"${c.alarm ? " checked" : ""} /> ${t("cal.remind")}</label>
      <p class="muted small" style="margin-top:0">${t("cal.remindHelp")}</p>`;
  h += `    <p class="muted small" style="margin-top:0">${t("cal.outlook")}</p>
    <p class="muted small" style="margin-top:0">${t("cal.refresh")}</p>
    <button class="btn" data-cal="renew">${t("cal.renew")}</button>
    <button class="btn btn-warn" data-cal="off">${t("cal.off")}</button>`;
  return h;
}

export function bindCal(root, ctx) {
  const { state } = ctx;
  const paint = () => {
    const box = root.querySelector("[data-calbox]");
    if (box) box.innerHTML = calHtml(state);
  };
  const keep = () => ctx.save({ render: false }); // saves; sync + feed upload follow; no redraw
  const fail = (msg) => {
    ui.busy = false;
    ui.error = msg;
    paint();
  };

  async function turnOn() {
    ui.busy = true;
    ui.error = "";
    paint();
    let keys;
    try {
      keys = await calNew();
    } catch {
      return fail(offline());
    }
    state.settings.calendar = {
      ...keys,
      time: null,
      mins: 60,
      autoMins: false,
      alarm: false,
    };
    ui.busy = false;
    await keep();
    ctx.cal.now(); // first upload right away, so the link already has events when it is added
    paint();
    let seen = false;
    try {
      seen = !!localStorage.getItem(TIP_KEY);
      localStorage.setItem(TIP_KEY, "1");
    } catch {}
    if (!seen) infoSheet(tip());
  }

  async function turnOff() {
    if (
      !(await confirmSheet(
        t("cal.offAsk"),
        t("cal.off"),
        t("cal.cancel"),
        { danger: true },
      ))
    )
      return paint();
    ui.busy = true;
    ui.error = "";
    paint();
    try {
      await calDelete(state.settings.calendar);
    } catch {
      return fail(t("cal.offFailed"));
    }
    delete state.settings.calendar;
    ui.busy = false;
    ui.showLink = false;
    ctx.cal.reset();
    await keep();
    paint();
  }

  async function renew() {
    if (
      !(await confirmSheet(
        t("cal.renewAsk"),
        t("cal.renew"),
        t("cal.cancel"),
      ))
    )
      return;
    ui.busy = true;
    ui.error = "";
    paint();
    let deleted = false;
    try {
      await calDelete(state.settings.calendar);
      deleted = true;
      const keys = await calNew();
      state.settings.calendar = { ...state.settings.calendar, ...keys };
    } catch {
      return fail(
        deleted ? t("cal.renewHalf") : t("cal.renewFailed"),
      );
    }
    ui.busy = false;
    ui.showLink = false;
    await keep();
    ctx.cal.now();
    paint();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl(state.settings.calendar.id));
      showBanner(t("cal.copied"), { kind: "ok" });
    } catch {
      ui.showLink = true; // no clipboard access: show the link to press and hold
      paint();
      showBanner(t("cal.copyFailed"));
    }
  }

  const act = async (e) => {
    const t = e.target.closest?.("[data-cal]");
    const c = state.settings.calendar;
    if (!t || ui.busy || !root.contains(t)) return;
    const k = t.dataset.cal;
    const isClick = e.type === "click";
    if (isClick && t.tagName === "BUTTON") {
      if (k === "allday" || k === "timed") {
        c.time = k === "allday" ? null : (c.time ?? DEFAULT_TIME);
        await keep();
        paint();
      } else if (k === "copy") copy();
      else if (k === "renew") renew();
      else if (k === "off") turnOff();
    } else if (!isClick && t.tagName !== "BUTTON") {
      if (k === "on") t.checked ? turnOn() : turnOff();
      else if (k === "time") {
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t.value)) c.time = t.value;
        keep();
      } else if (k === "mins") {
        c.mins = Number(t.value);
        keep();
      } else if (k === "auto" || k === "alarm") {
        c[k === "auto" ? "autoMins" : "alarm"] = t.checked;
        await keep();
        paint();
      }
    }
  };
  root.addEventListener("click", act);
  root.addEventListener("change", act);
}
