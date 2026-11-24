// Plan > Weekly schedule > Calendar: one subscribed link shows the training days in any calendar app.
// The box repaints only itself (never the whole screen), so a time picker or a typed value is not disturbed.
import { esc, confirmSheet, infoSheet, showBanner } from "../ui.js";
import { avgMins } from "../logic.js";
import {
  calNew,
  calDelete,
  feedUrl,
  webcalUrl,
  googleUrl,
  TIP_KEY,
} from "../calendar.js";

const OFFLINE = "Couldn't reach the server. Try again when you're online.";
const ui = { busy: false, error: "", showLink: false }; // this screen's own state, never saved
const DEFAULT_TIME = "18:00";

const TIP = [
  "Your calendar won't remind you by default. To get alerts:",
  "iPhone: Settings > Calendar > Default Alert Times, or tap the event > Alert.",
  "Google Calendar: it may not let you set alerts for a linked calendar.",
  "Outlook: the event > Reminder.",
];

const hasDays = (state) =>
  Object.keys(state.settings.schedule?.days ?? {}).length > 0;

export function calHtml(state) {
  const c = state.settings.calendar;
  const days = hasDays(state);
  const off = !c && !days;
  let h = `<div class="cal-sep"></div>
    <label class="setting">Show my training days in my calendar
      <input type="checkbox" data-cal="on"${c ? " checked" : ""}${off || ui.busy ? " disabled" : ""} />
    </label>
    ${off ? `<p class="muted small" style="margin-top:0">Pick training days first.</p>` : ""}
    <p class="muted small" style="margin-top:0">Your workout names and training days are stored on our server without encryption, so your calendar can read them. No weights, notes or body weight.</p>
    ${ui.busy ? `<p class="muted small" role="status">Working…</p>` : ""}
    ${ui.error ? `<p class="small" role="alert" style="color:var(--warning)">${esc(ui.error)}</p>` : ""}`;
  if (!c) return h;
  const timed = c.time !== null;
  const avg = avgMins(state.sessions);
  const mins = [];
  for (let m = 15; m <= 240; m += 15) mins.push(m);
  const shown = c.autoMins && avg ? avg : c.mins;
  if (!mins.includes(shown)) mins.push(shown);
  h += `<a class="btn btn-primary" href="${esc(webcalUrl(c.id))}" style="margin-top:8px">Add to Apple Calendar</a>
    <a class="btn" href="${esc(googleUrl(c.id))}" target="_blank" rel="noopener">Add to Google Calendar</a>
    <p class="muted small" style="margin-top:0">If that doesn't work: copy the link, open calendar.google.com in Chrome or Safari, switch to Desktop site (browser menu), tap Other calendars + &gt; From URL, paste, then Add calendar. It then shows in the Google Calendar app.</p>
    <button class="btn" data-cal="copy">Copy link</button>
    ${ui.showLink ? `<input readonly value="${esc(feedUrl(c.id))}" aria-label="Calendar link" onfocus="this.select()" />` : ""}
    <p class="muted small"><b>Keep this link private.</b> Anyone who has it can see your workout names and days.</p>`;
  h += `<div class="seg" role="group" aria-label="When it shows in the calendar" style="margin-top:8px">
      <button class="chip" data-cal="allday" aria-pressed="${!timed}">All day</button>
      <button class="chip" data-cal="timed" aria-pressed="${timed}">At a set time</button>
    </div>`;
  if (timed)
    h += `<label class="setting">Start time
        <input type="time" data-cal="time" value="${esc(c.time)}" aria-label="Start time" style="width:auto;min-width:110px" />
      </label>
      <label class="setting">Length
        <select data-cal="mins" aria-label="Length in minutes"${c.autoMins ? " disabled" : ""}>
          ${mins
            .sort((a, b) => a - b)
            .map(
              (m) =>
                `<option value="${m}"${m === shown ? " selected" : ""}>${m} min</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="check"><input type="checkbox" data-cal="auto"${c.autoMins ? " checked" : ""} /> Match my average workout length</label>
      ${c.autoMins ? `<p class="muted small" style="margin-top:0">${avg ? `About ${avg} min, from your last finished workouts.` : "Needs 3 finished workouts. Until then the length you picked is used."}</p>` : ""}
      <label class="check"><input type="checkbox" data-cal="alarm"${c.alarm ? " checked" : ""} /> Remind me 30 min before</label>
      <p class="muted small" style="margin-top:0">Reminders depend on your calendar app. To be sure, turn on alerts for this calendar in its settings.</p>`;
  h += `    <p class="muted small" style="margin-top:0">Outlook: Outlook on the web (Desktop site on a phone) &gt; Add calendar &gt; Subscribe from web, and paste.</p>
    <p class="muted small" style="margin-top:0">Changes show here at once, but your calendar app decides when to check: Apple Calendar usually within an hour (pull down to refresh), Outlook every 3-4 hours, Google often 12-24 hours. In Google, to see changes now, remove the calendar and add it again. This is one-way: edit your plan here, not in the calendar.</p>
    <button class="btn" data-cal="renew">Make a new link</button>
    <button class="btn btn-warn" data-cal="off">Turn off</button>`;
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
      return fail(OFFLINE);
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
    if (!seen) infoSheet(TIP);
  }

  async function turnOff() {
    if (
      !(await confirmSheet(
        "This deletes the calendar link. Events already in your calendar may stay; remove the Gym Tracker calendar in your calendar app too.",
        "Turn off",
        "Cancel",
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
      return fail(
        "Couldn't turn it off. Your link is still on. Try again when you're online.",
      );
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
        "The old link stops working now. You'll need to add the new one to your calendar.",
        "Make a new link",
        "Cancel",
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
        deleted
          ? "Your old link is already off. Tap Make a new link again when you're online."
          : "Couldn't make a new link. Try again when you're online.",
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
      showBanner("Link copied.", { kind: "ok" });
    } catch {
      ui.showLink = true; // no clipboard access: show the link to press and hold
      paint();
      showBanner("Couldn't copy. Press and hold the link below.");
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
