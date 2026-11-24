// The calendar feed on the server: DO core (record, token, expiry) and the Worker routes around it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CalendarCore, calRoute, calFeed, IDLE_DELETE } from "../server/src/calendar.js";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const BODY = { from: "2026-11-24", tz: "Asia/Jerusalem", time: null, mins: 60, alarm: false, days: [{ d: 1, t: "Push" }, { d: 4, t: "Workout" }] };

function memStore() {
  const m = new Map();
  return {
    m,
    alarm: null,
    get: async (k) => structuredClone(m.get(k)),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    deleteAll: async () => m.clear(),
    setAlarm: async function (t) { this.alarm = t; },
    deleteAlarm: async function () { this.alarm = null; },
  };
}

// A fake env: one CalendarCore per id, a limiter that allows `limit` calls, and a counter of DO touches.
function fakeEnv({ limit = 1000 } = {}) {
  const cores = new Map();
  const env = {
    touched: 0,
    now: T0,
    CAL: {
      idFromName: (n) => n,
      get: (n) => ({
        run: (p, b) => {
          env.touched++;
          if (!cores.has(n)) cores.set(n, new CalendarCore(memStore(), { now: () => env.now }));
          return cores.get(n).run(p, b);
        },
      }),
    },
    RL: { calls: 0, limit: async () => ({ success: ++env.RL.calls <= limit }) },
    cores,
  };
  return env;
}

const post = (env, path, body, extra = {}) =>
  calRoute(new Request("https://x.test" + path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: extra }), env, path, {});
const get = (env, id, h = {}) => calFeed(new Request(`https://x.test/cal/${id}.ics`, { headers: h }), env, `/cal/${id}.ics`);
async function make(env) {
  const r = await post(env, "/cal/new", {});
  assert.equal(r.status, 200);
  return r.json();
}

test("new, put, GET (text/calendar, ETag, 304)", async () => {
  const env = fakeEnv();
  const { id, token } = await make(env);
  assert.match(id, /^[A-Za-z0-9_-]{22}$/);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await post(env, "/cal/put", { id, token, ...BODY })).status, 200);
  const r = await get(env, id);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.equal(r.headers.get("cache-control"), "no-cache");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  assert.ok(r.headers.get("last-modified"));
  const text = await r.text();
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.match(text, /SUMMARY:.*Push/);
  const etag = r.headers.get("etag");
  assert.ok(etag);
  const r2 = await get(env, id, { "if-none-match": etag });
  assert.equal(r2.status, 304);
  assert.equal(await r2.text(), "");
});

test("the feed holds names and days only, and the token only as a hash", async () => {
  const env = fakeEnv();
  const { id, token } = await make(env);
  await post(env, "/cal/put", { id, token, ...BODY });
  const stored = JSON.stringify([...env.cores.get(id).s.m.entries()]);
  assert.ok(!stored.includes(token));
  const rec = env.cores.get(id).s.m.get("cal");
  assert.deepEqual(Object.keys(rec).sort(), ["alarm", "days", "from", "mins", "time", "tokenHash", "tz", "updatedAt"]);
  const text = await (await get(env, id)).text();
  assert.ok(!text.includes(id) && !text.includes(token));
});

test("put with a wrong token or unknown id is 404, and put never creates", async () => {
  const env = fakeEnv();
  const { id, token } = await make(env);
  assert.equal((await post(env, "/cal/put", { id, token: "x".repeat(43), ...BODY })).status, 404);
  const ghost = "A".repeat(22);
  assert.equal((await post(env, "/cal/put", { id: ghost, token, ...BODY })).status, 404);
  assert.equal((await get(env, ghost)).status, 404); // nothing was created
});

test("a broken body is 400 (after the token is checked)", async () => {
  const env = fakeEnv();
  const { id, token } = await make(env);
  assert.equal((await post(env, "/cal/put", { id, token, ...BODY, extra: 1 })).status, 400);
  assert.equal((await post(env, "/cal/put", { id, token, ...BODY, mins: 5 })).status, 400);
  assert.equal((await post(env, "/cal/put", "not json")).status, 400);
  assert.equal((await post(env, "/cal/put", "[]")).status, 400);
});

test("delete, then GET 404 and put 404; rotate = delete + new gives a different id", async () => {
  const env = fakeEnv();
  const a = await make(env);
  await post(env, "/cal/put", { ...a, ...BODY });
  assert.equal((await post(env, "/cal/delete", { id: a.id, token: "y".repeat(43) })).status, 404);
  assert.equal((await post(env, "/cal/delete", a)).status, 200);
  assert.equal((await get(env, a.id)).status, 404);
  assert.equal((await post(env, "/cal/put", { ...a, ...BODY })).status, 404);
  assert.equal((await post(env, "/cal/delete", a)).status, 404);
  const b = await make(env);
  assert.notEqual(b.id, a.id);
  assert.equal((await post(env, "/cal/put", { ...a, ...BODY })).status, 404); // a stale phone cannot revive the old link
  assert.equal((await post(env, "/cal/put", { ...b, ...BODY })).status, 200);
});

test("a bad id format is 404 without touching the DO", async () => {
  const env = fakeEnv();
  for (const id of ["short", "A".repeat(23), "A".repeat(21) + "!", "../etc", 5, undefined]) {
    assert.equal((await post(env, "/cal/put", { id, token: "t", ...BODY })).status, 404);
    if (typeof id === "string") assert.equal((await get(env, encodeURIComponent(id))).status, 404);
  }
  assert.equal(env.touched, 0);
});

test("413 for a big body; 429 once the limiter says so; other paths and methods are not routed", async () => {
  const env = fakeEnv();
  assert.equal((await post(env, "/cal/put", { id: "A".repeat(22), token: "t", pad: "x".repeat(1100) })).status, 413);
  assert.equal((await post(env, "/cal/put", "x".repeat(2000), { "content-length": "2000" })).status, 413);
  const lim = fakeEnv({ limit: 2 });
  assert.equal((await post(lim, "/cal/new", {})).status, 200);
  assert.equal((await post(lim, "/cal/new", {})).status, 200);
  assert.equal((await post(lim, "/cal/new", {})).status, 429);
  assert.equal((await post(env, "/cal/other", {})).status, 404);
});

test("GET is not rate limited and answers 404 for a gone feed (not an empty calendar)", async () => {
  const env = fakeEnv({ limit: 0 });
  assert.equal((await get(env, "B".repeat(22))).status, 404);
  assert.equal(env.RL.calls, 0);
});

test("the alarm is moved forward by put and removes the record when it fires", async () => {
  const env = fakeEnv();
  const { id, token } = await make(env);
  const st = env.cores.get(id).s;
  assert.equal(st.alarm, T0 + IDLE_DELETE);
  env.now = T0 + 30 * 24 * 3600 * 1000;
  await post(env, "/cal/put", { id, token, ...BODY });
  assert.equal(st.alarm, env.now + IDLE_DELETE);
  await env.cores.get(id).alarm();
  assert.equal((await get(env, id)).status, 404);
  const gone = await make(env);
  await post(env, "/cal/delete", gone);
  assert.equal(env.cores.get(gone.id).s.alarm, null);
});

test("new answers 409 if the object already holds a feed", async () => {
  const c = new CalendarCore(memStore(), { now: () => T0 });
  assert.equal((await c.run("/cal/new", {})).status, 200);
  assert.equal((await c.run("/cal/new", {})).status, 409);
});
