// Calendar subscription, phone side: talks to the server (new / put / delete) and uploads only when something changed.
// Every call is best effort and never redraws. The server builds the .ics; the phone sends names + days + time only.
import { SERVER } from "./push.js";
import { calendarBody } from "./logic.js";
import { localDate } from "./weight.js";

export const SENT_KEY = "gymtracker.calSent"; // device-local: what was last sent and when (never synced)
export const TIP_KEY = "gymtracker.calTipSeen";
export const KEEPALIVE = 30 * 24 * 3600 * 1000; // re-send now and then so the server does not expire an idle feed

export const feedUrl = (id) => `${SERVER}/cal/${id}.ics`;
export const webcalUrl = (id) => feedUrl(id).replace(/^https:/, "webcal:");
export const googleUrl = (id) =>
  "https://calendar.google.com/calendar/render?cid=" +
  encodeURIComponent(webcalUrl(id));

async function call(path, body, fetchFn = fetch) {
  // text/plain keeps this a simple request (no preflight); the server reads the body as JSON.
  const r = await fetchFn(SERVER + path, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {}
  return { status: r.status, json };
}

// -> { id, token }. Throws when the server cannot be reached or refuses.
export async function calNew(fetchFn) {
  const r = await call("/cal/new", {}, fetchFn);
  if (r.status !== 200 || !r.json?.id || !r.json?.token)
    throw new Error("server");
  return { id: r.json.id, token: r.json.token };
}

// Deletes the feed on the server. 404 counts as done (it is already gone). Throws otherwise.
export async function calDelete(cal, fetchFn) {
  const r = await call(
    "/cal/delete",
    { id: cal.id, token: cal.token },
    fetchFn,
  );
  if (r.status !== 200 && r.status !== 404) throw new Error("server");
}

// Decide and, if needed, send. sent = { id, h, at, from, ds } | { dead: id } | null. Returns the new `sent`.
// Sends when the body changed (ignoring `from` and `tz`) or the last send is over 30 days old. A 404 means the feed
// was replaced or turned off on another phone: stop until sync brings new keys.
export async function pushCalendar(
  state,
  sent,
  { fetchFn, now = Date.now(), tz } = {},
) {
  const c = state.settings.calendar;
  if (!c || sent?.dead === c.id) return sent;
  const today = localDate(new Date(now));
  const body = calendarBody(state, today, tz);
  const ds = JSON.stringify(body.days);
  // `from` moves to today only when the training days change, so the feed never invents history.
  const from =
    sent?.id === c.id && sent.ds === ds && sent.from ? sent.from : today;
  const h =
    c.id + "|" + JSON.stringify({ ...body, from: undefined, tz: undefined });
  if (sent?.id === c.id && sent.h === h && now - sent.at < KEEPALIVE)
    return sent;
  let r;
  try {
    r = await call(
      "/cal/put",
      { id: c.id, token: c.token, ...body, from },
      fetchFn,
    );
  } catch {
    return sent; // offline: the next save or app start tries again
  }
  if (r.status === 404) return { dead: c.id };
  if (r.status !== 200) return sent;
  return { id: c.id, h, at: now, from, ds };
}

// Wiring: call changed() after every save and at app start; it waits 2 s, then sends only if needed.
export function createCalSync({
  getState,
  storage,
  fetchFn,
  delay = 2000,
  now = () => Date.now(),
}) {
  let timer = 0;
  let running = false;
  let again = false;
  const read = () => {
    try {
      return JSON.parse(storage.getItem(SENT_KEY));
    } catch {
      return null;
    }
  };
  const write = (v) => {
    try {
      if (v) storage.setItem(SENT_KEY, JSON.stringify(v));
      else storage.removeItem(SENT_KEY);
    } catch {}
  };
  async function run() {
    if (running) return void (again = true);
    running = true;
    try {
      const s = read();
      const n = await pushCalendar(getState(), s, { fetchFn, now: now() });
      if (n !== s) write(n);
    } catch {
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      changed();
    }
  }
  function changed() {
    clearTimeout(timer);
    if (getState().settings.calendar) timer = setTimeout(run, delay);
  }
  return { changed, now: run, reset: () => (clearTimeout(timer), write(null)) };
}
