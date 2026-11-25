// "Rest over" alarm: one Durable Object per phone, named by a random device id the phone makes up (no account involved).
// It keeps the push subscription and one alarm. Stored: subscription + the time to fire. The payload is generic, no personal data.
import { pushUrl } from "./lib.js";
import { fromB64u } from "./webpush.js";

export const MAX_BODY = 2048;
export const MAX_AHEAD = 15 * 60 * 1000; // a rest is never longer than this
const MAX_PAST = 60 * 1000;
export const EXPIRE = 60 * 24 * 3600 * 1000; // unused this long: forget the subscription
export const MESSAGE = "Rest over — next set";
const PATHS = new Set([
  "/rest/register",
  "/rest/schedule",
  "/rest/cancel",
  "/rest/unregister",
]);
export const DEVICE_RE = /^[A-Za-z0-9_-]{22,43}$/;

const BAD = { status: 400, body: { error: "bad request" } };
const GONE = { status: 404, body: { error: "not found" } };

const okBytes = (s, test) => {
  try {
    return test(fromB64u(s));
  } catch {
    return false;
  }
};

// -> { endpoint, keys: { p256dh, auth } } or null.
export function checkSub(sub) {
  if (
    !sub ||
    typeof sub !== "object" ||
    !sub.keys ||
    typeof sub.keys !== "object"
  )
    return null;
  const u = pushUrl(sub.endpoint);
  const { p256dh, auth } = sub.keys;
  if (!u || typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (
    !okBytes(p256dh, (b) => b.length === 65 && b[0] === 4) ||
    !okBytes(auth, (b) => b.length === 16)
  )
    return null;
  return { endpoint: u.href, keys: { p256dh, auth } };
}

export class RestAlarmCore {
  // opts.send(sub, text) -> HTTP status of the push service (0 = unreachable). opts.now() for tests.
  constructor(storage, opts = {}) {
    this.s = storage;
    this.o = opts;
  }
  now() {
    return this.o.now ? this.o.now() : Date.now();
  }
  async run(path, b) {
    const ok = { status: 200, body: { ok: true } };
    const now = this.now();
    if (path === "/rest/register") {
      const sub = checkSub(b.sub);
      if (!sub) return BAD;
      await this.s.put("rec", { sub, fireAt: null, used: now });
      await this.s.setAlarm(now + EXPIRE);
      return ok;
    }
    const rec = await this.s.get("rec");
    if (!rec) return GONE; // the phone registers again and retries
    if (path === "/rest/unregister") {
      await this.s.deleteAlarm();
      await this.s.deleteAll();
      return ok;
    }
    if (path === "/rest/schedule") {
      if (
        typeof b.endsAt !== "number" ||
        !Number.isFinite(b.endsAt) ||
        b.endsAt > now + MAX_AHEAD ||
        b.endsAt < now - MAX_PAST
      )
        return BAD;
      rec.fireAt = Math.max(b.endsAt, now);
      rec.used = now;
      await this.s.put("rec", rec);
      await this.s.setAlarm(rec.fireAt);
      return ok;
    }
    if (path === "/rest/cancel") {
      rec.fireAt = null;
      await this.s.put("rec", rec);
      await this.s.deleteAlarm(); // nothing left to fire ...
      await this.s.setAlarm(rec.used + EXPIRE); // ... except the 60-day clean-up
      return ok;
    }
    return BAD;
  }
  async alarm() {
    const rec = await this.s.get("rec");
    if (!rec) return;
    const now = this.now();
    if (rec.fireAt && now >= rec.fireAt) {
      rec.fireAt = null; // cleared first: a retry of this alarm must not send twice
      await this.s.put("rec", rec);
      const st = await this.o.send(rec.sub, MESSAGE);
      if (st === 404 || st === 410) return this.s.deleteAll(); // the phone dropped it
      // A schedule may have arrived while sending: work from what is stored now, never the stale copy.
      const cur = await this.s.get("rec");
      if (!cur) return;
      return this.finish(cur, now);
    }
    return this.finish(rec, now);
  }
  async finish(rec, now) {
    if (now - rec.used >= EXPIRE) return this.s.deleteAll();
    await this.s.setAlarm(rec.fireAt ?? rec.used + EXPIRE);
  }
}

const res = (status, body, cors) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });

// Worker route for /rest/*. The phone sends text/plain JSON (no preflight).
export async function restRoute(req, env, path, cors) {
  if (!PATHS.has(path)) return res(404, { error: "not found" }, cors);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY)
    return res(413, { error: "too big" }, cors);
  if (env.RL) {
    const { success } = await env.RL.limit({
      key: req.headers.get("cf-connecting-ip") ?? "x",
    });
    if (!success) return res(429, { error: "slow down" }, cors);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY)
    return res(413, { error: "too big" }, cors);
  let b;
  try {
    b = JSON.parse(text);
  } catch {}
  if (
    b === null ||
    typeof b !== "object" ||
    Array.isArray(b) ||
    !DEVICE_RE.test(b.device ?? "")
  )
    return res(400, { error: "bad request" }, cors);
  const r = await env.ALARM.get(env.ALARM.idFromName("rest:" + b.device)).run(
    path,
    b,
  );
  return res(r.status, r.body, cors);
}
