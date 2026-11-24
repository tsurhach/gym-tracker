// Calendar feed: one tiny record per feed (names + training days + time choice), turned into an .ics on request.
// Pure logic over a storage interface (a Map in tests). The token is stored only as a SHA-256 hash.
import { b64u, sha256b64u } from "./syncauth.js";

export const CAL_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const MAX_CAL_BODY = 1024; // bytes
export const IDLE_DELETE = 180 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const NOT_FOUND = { status: 404, body: { error: "not found" } }; // same for "no feed" and "wrong token"
const BAD = { status: 400, body: { error: "bad request" } };
const BODY_KEYS = ["from", "tz", "time", "mins", "alarm", "days"];

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const sameKeys = (o, keys) =>
  Object.keys(o).length === keys.length &&
  keys.every((k) => Object.hasOwn(o, k));
const CTRL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

// -> true when the date string is a real calendar date (2026-02-30 is not).
const realDate = (s) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return (
    t.getUTCFullYear() === y &&
    t.getUTCMonth() === m - 1 &&
    t.getUTCDate() === d
  );
};
const zoneOk = (tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return typeof tz === "string" && tz.length <= 64;
  } catch {
    return false;
  }
};

// Strict check of what a phone sends. -> the clean body (only known fields) or null. Unknown fields are refused.
export function checkBody(b) {
  if (!isObj(b) || !sameKeys(b, BODY_KEYS)) return null;
  const { from, tz, time, mins, alarm, days } = b;
  if (!realDate(from)) return null;
  if (tz !== null && !zoneOk(tz)) return null;
  if (
    time !== null &&
    !(typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
  )
    return null;
  if (!Number.isInteger(mins) || mins < 15 || mins > 240) return null;
  if (typeof alarm !== "boolean") return null;
  if (!Array.isArray(days) || days.length > 7) return null;
  const seen = new Set();
  for (const e of days) {
    if (!isObj(e) || !sameKeys(e, ["d", "t"])) return null;
    if (!Number.isInteger(e.d) || e.d < 0 || e.d > 6 || seen.has(e.d))
      return null;
    seen.add(e.d);
    if (typeof e.t !== "string" || CTRL.test(e.t)) return null;
    const n = Array.from(e.t).length;
    if (n < 1 || n > 60) return null;
  }
  return {
    from,
    tz,
    time,
    mins,
    alarm,
    days: days.map((e) => ({ d: e.d, t: e.t })),
  };
}

// ---------- the .ics ----------

const sha256hex = async (s) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const pad = (n, w = 2) => String(n).padStart(w, "0");
const ymd = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};
const stamp = (ms) =>
  `${ymd(ms)}T${pad(new Date(ms).getUTCHours())}${pad(new Date(ms).getUTCMinutes())}${pad(new Date(ms).getUTCSeconds())}Z`;
const dayNum = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d); // midnight UTC of the calendar date: only used as a date counter
};

// Local clock parts of an instant in a zone.
function parts(ms, tz) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const o = Object.fromEntries(
    f.formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]),
  );
  return o;
}
// Today's calendar date in the zone (UTC if none), as a day counter.
export function todayIn(tz, now) {
  if (!tz) return Math.floor(now / DAY) * DAY;
  const p = parts(now, tz);
  return Date.UTC(p.year, p.month - 1, p.day);
}
// The instant when the wall clock in `tz` shows this date and HH:MM. DST-correct (the gap hour moves forward).
export function zonedToUtc(day, hh, mm, tz) {
  const wall = day + (hh * 60 + mm) * 60000;
  const off = (t) => {
    const p = parts(t, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  let t = wall - off(wall);
  t = wall - off(t);
  return t;
}

const esc = (s) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

// Fold at 75 octets (not counting CRLF) without splitting a UTF-8 character; continuation lines start with a space.
export function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "";
  let n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      n = 0;
    }
    cur += ch;
    n += b;
  }
  out.push(cur);
  return out.map((l, i) => (i ? " " + l : l)).join("\r\n");
}

export async function buildIcs(id, rec, now) {
  const uidKey = (await sha256hex(id)).slice(0, 16);
  const today = todayIn(rec.tz, now);
  const first = Math.max(dayNum(rec.from), today - 14 * DAY);
  const last = today + 70 * DAY;
  const names = new Map(rec.days.map((e) => [e.d, e.t]));
  const upd = stamp(rec.updatedAt);
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gym Tracker//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Gym Tracker",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (let d = first; d <= last; d += DAY) {
    const name = names.get(new Date(d).getUTCDay());
    if (name === undefined) continue;
    L.push(
      "BEGIN:VEVENT",
      `UID:${ymd(d)}-${uidKey}@gym-tracker`,
      `DTSTAMP:${upd}`,
      `LAST-MODIFIED:${upd}`,
      `SUMMARY:${esc("\u{1F3CB}\uFE0F " + name)}`,
      "TRANSP:TRANSPARENT",
    );
    if (rec.time) {
      const [hh, mm] = rec.time.split(":").map(Number);
      const start = zonedToUtc(d, hh, mm, rec.tz || "UTC");
      L.push(
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(start + rec.mins * 60000)}`,
      );
      if (rec.alarm)
        L.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:Workout",
          "TRIGGER:-PT30M",
          "END:VALARM",
        );
    } else
      L.push(
        `DTSTART;VALUE=DATE:${ymd(d)}`,
        `DTEND;VALUE=DATE:${ymd(d + DAY)}`,
      );
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

// ---------- one feed ----------

// storage: { get, put, deleteAll, setAlarm, deleteAlarm }. opts: { now? }.
export class CalendarCore {
  constructor(storage, opts = {}) {
    this.s = storage;
    this.o = opts;
  }
  now() {
    return this.o.now ? this.o.now() : Date.now();
  }
  // -> the record when the token is right, else null.
  async authed(b) {
    const rec = await this.s.get("cal");
    if (!rec || typeof b.token !== "string" || b.token.length > 100)
      return null;
    return (await sha256b64u(b.token)) === rec.tokenHash ? rec : null;
  }
  async save(rec) {
    rec.updatedAt = this.now();
    await this.s.put("cal", rec);
    await this.s.setAlarm(rec.updatedAt + IDLE_DELETE);
    return rec;
  }
  async run(path, b) {
    const ok = (body = {}) => ({ status: 200, body });
    if (path === "/cal/new") {
      if (await this.s.get("cal"))
        return { status: 409, body: { error: "exists" } };
      const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
      const from = new Date(this.now()).toISOString().slice(0, 10);
      await this.save({
        tokenHash: await sha256b64u(token),
        from,
        tz: null,
        time: null,
        mins: 60,
        alarm: false,
        days: [],
      });
      return ok({ token });
    }
    if (path === "/cal/get") {
      const rec = await this.s.get("cal");
      return rec ? ok(rec) : NOT_FOUND;
    }
    const rec = await this.authed(b);
    if (!rec) return NOT_FOUND;
    if (path === "/cal/delete") {
      await this.s.deleteAlarm();
      await this.s.deleteAll();
      return ok();
    }
    if (path === "/cal/put") {
      const { id, token, ...rest } = b;
      const clean = checkBody(rest);
      if (!clean) return BAD;
      await this.save({ tokenHash: rec.tokenHash, ...clean });
      return ok();
    }
    return BAD;
  }
  async alarm() {
    await this.s.deleteAll();
  }
}

const jsonRes = (status, body, cors) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

// Worker side. POSTs share the per-IP limit (RL binding); the GET holds the secret in its URL and is not limited.
const CAL_PATHS = new Set(["/cal/new", "/cal/put", "/cal/delete"]);

export async function calRoute(req, env, path, cors) {
  if (!CAL_PATHS.has(path)) return jsonRes(404, { error: "not found" }, cors);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CAL_BODY) return jsonRes(413, { error: "too big" }, cors);
  if (env.RL) {
    const { success } = await env.RL.limit({ key: req.headers.get("cf-connecting-ip") ?? "x" });
    if (!success) return jsonRes(429, { error: "slow down" }, cors);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_CAL_BODY) return jsonRes(413, { error: "too big" }, cors);
  let b;
  try {
    b = JSON.parse(text);
  } catch {}
  if (b === null || typeof b !== "object" || Array.isArray(b)) return jsonRes(400, { error: "bad request" }, cors);
  if (path === "/cal/new") {
    const id = b64u(crypto.getRandomValues(new Uint8Array(16)));
    const r = await env.CAL.get(env.CAL.idFromName(id)).run(path, {});
    return jsonRes(r.status, r.status === 200 ? { id, token: r.body.token } : r.body, cors);
  }
  if (!CAL_ID_RE.test(b.id ?? "")) return jsonRes(404, { error: "not found" }, cors);
  const r = await env.CAL.get(env.CAL.idFromName(b.id)).run(path, b);
  return jsonRes(r.status, r.body, cors);
}

export async function calFeed(req, env, path) {
  const m = /^\/cal\/([^/]+)\.ics$/.exec(path);
  const gone = () => new Response("Not found", { status: 404, headers: { "x-robots-tag": "noindex", "cache-control": "no-store" } });
  if (!m || !CAL_ID_RE.test(m[1])) return gone();
  const r = await env.CAL.get(env.CAL.idFromName(m[1])).run("/cal/get", {});
  if (r.status !== 200) return gone();
  const body = await buildIcs(m[1], r.body, Date.now());
  const etag = `"${[...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("")}"`;
  const headers = { etag, "last-modified": new Date(r.body.updatedAt).toUTCString(), "cache-control": "no-cache", "x-robots-tag": "noindex" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "content-type": "text/calendar; charset=utf-8" } });
}

