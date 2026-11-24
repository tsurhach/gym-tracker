// Calendar subscription, phone side: body, average length, store shape, privacy, upload trigger, old state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarBody, avgMins, calMins } from "../js/logic.js";
import {
  isValidState,
  emptyState,
  createStore,
  exportJson,
  KEY,
} from "../js/store.js";
import { buildView } from "../js/share.js";
import { merge } from "../js/sync.js";
import {
  pushCalendar,
  createCalSync,
  webcalUrl,
  googleUrl,
  feedUrl,
  SENT_KEY,
  KEEPALIVE,
} from "../js/calendar.js";

const ID = "A".repeat(22);
const TOKEN = "B".repeat(43);
const cal = (o = {}) => ({
  id: ID,
  token: TOKEN,
  time: null,
  mins: 60,
  autoMins: false,
  alarm: false,
  ...o,
});
const wk = (id, name) => ({ id, name, muscles: [], items: [] });
const state = (o = {}) => {
  const s = emptyState();
  s.workouts = [wk("w1", "  Push  "), wk("w2", "Pull")];
  s.settings.schedule = { days: { 4: "next", 1: "w1", 3: "gone-id" } };
  s.settings.calendar = cal();
  return Object.assign(s, o);
};
const MIN = 60000;
const ses = (i, minutes) => ({
  id: "s" + i,
  workoutName: "x",
  startedAt: i * 86400000,
  finishedAt: i * 86400000 + minutes * MIN,
  entries: [],
});

test("calendarBody: fixed name trimmed, next/unknown/deleted -> Workout, sorted, nothing extra", () => {
  const b = calendarBody(state(), "2026-11-24", "Asia/Jerusalem");
  assert.deepEqual(b, {
    from: "2026-11-24",
    tz: "Asia/Jerusalem",
    time: null,
    mins: 60,
    alarm: false,
    days: [
      { d: 1, t: "Push" },
      { d: 3, t: "Workout" },
      { d: 4, t: "Workout" },
    ],
  });
  assert.deepEqual(Object.keys(b).sort(), [
    "alarm",
    "days",
    "from",
    "mins",
    "time",
    "tz",
  ]);
  assert.ok(
    !JSON.stringify(b).includes(TOKEN) &&
      !JSON.stringify(b).includes(ID) &&
      !JSON.stringify(b).includes("w1"),
  );
});

test("calendarBody: long names are cut to 60 characters, blank names become Workout, time and alarm pass through", () => {
  const s = state();
  s.workouts[0].name = "x".repeat(100);
  s.workouts[1].name = "   ";
  s.settings.schedule = { days: { 1: "w1", 2: "w2" } };
  Object.assign(s.settings.calendar, { time: "07:30", alarm: true });
  const b = calendarBody(s, "2026-11-24", null);
  assert.equal(b.days[0].t.length, 60);
  assert.equal(b.days[1].t, "Workout");
  assert.equal(b.time, "07:30");
  assert.equal(b.alarm, true);
  assert.equal(b.tz, null);
  // never splits an emoji
  s.workouts[0].name = "\u{1F3CB}".repeat(80);
  assert.equal(
    Array.from(calendarBody(s, "2026-11-24", "UTC").days[0].t).length,
    60,
  );
});

test("calendarBody: no schedule gives no days", () => {
  const s = state();
  delete s.settings.schedule;
  assert.deepEqual(calendarBody(s, "2026-11-24", "UTC").days, []);
});

test("avgMins: median of the last 8, skips out-of-range, rounds to 5, clamps 20-180, needs 3", () => {
  assert.equal(avgMins([ses(1, 50), ses(2, 60)]), null); // too few
  assert.equal(avgMins([ses(1, 50), ses(2, 60), ses(3, 70)]), 60);
  assert.equal(avgMins([ses(1, 52), ses(2, 53), ses(3, 54)]), 55); // 53 -> 55
  assert.equal(avgMins([ses(1, 5), ses(2, 400), ses(3, 60), ses(4, 70)]), null); // only two usable
  assert.equal(
    avgMins([ses(1, 5), ses(2, 400), ses(3, 60), ses(4, 70), ses(5, 80)]),
    70,
  );
  assert.equal(avgMins([ses(1, 10), ses(2, 11), ses(3, 12)]), 20); // clamps up
  assert.equal(avgMins([ses(1, 250), ses(2, 260), ses(3, 270)]), 180); // clamps down
  // only the last 8 count: eight 60s after two old 120s
  const many = [
    ses(1, 120),
    ses(2, 120),
    ...[3, 4, 5, 6, 7, 8, 9, 10].map((i) => ses(i, 60)),
  ];
  assert.equal(avgMins(many), 60);
  // unfinished workouts are ignored
  assert.equal(
    avgMins([ses(1, 60), ses(2, 60), { ...ses(3, 60), finishedAt: null }]),
    null,
  );
  assert.equal(avgMins(undefined), null);
});

test("calMins: the average only when asked for and available; chosen value stays stored", () => {
  const s = state({ sessions: [ses(1, 40), ses(2, 40), ses(3, 40)] });
  assert.equal(calMins(s), 60);
  s.settings.calendar.autoMins = true;
  assert.equal(calMins(s), 40);
  assert.equal(s.settings.calendar.mins, 60);
  s.sessions = [ses(1, 40)];
  assert.equal(calMins(s), 60); // not enough data: the chosen minutes
  s.sessions = [ses(1, 40), ses(2, 40), ses(3, 40)];
  assert.equal(calendarBody(s, "2026-11-24", "UTC").mins, 40);
});

test("store: the calendar shape is checked, old state without it is valid", () => {
  assert.equal(isValidState(emptyState()), true);
  const ok = (c) =>
    isValidState({
      ...emptyState(),
      settings: { ...emptyState().settings, calendar: c },
    });
  assert.equal(ok(cal()), true);
  assert.equal(
    ok(cal({ time: "18:30", mins: 15, autoMins: true, alarm: true })),
    true,
  );
  for (const bad of [
    null,
    "x",
    [],
    cal({ id: "short" }),
    cal({ id: "A".repeat(23) }),
    cal({ token: "B".repeat(42) }),
    cal({ token: "!" + "B".repeat(42) }),
    cal({ time: "6:00" }),
    cal({ time: "24:00" }),
    cal({ time: "" }),
    cal({ time: 5 }),
    cal({ mins: 14 }),
    cal({ mins: 241 }),
    cal({ mins: 60.5 }),
    cal({ autoMins: "yes" }),
    cal({ alarm: 1 }),
    { id: ID, token: TOKEN },
  ])
    assert.equal(ok(bad), false, JSON.stringify(bad));
});

test("share views and the backup/plan exports: the share view never holds the calendar; the backup keeps it", () => {
  const s = state();
  s.sessions = [ses(1, 60)];
  for (const o of [
    {},
    { plan: true },
    { plan: true, weight: true, copy: true, name: "Dana" },
  ]) {
    const v = JSON.stringify(buildView(s, o));
    assert.ok(
      !v.includes(TOKEN) && !v.includes(ID) && !v.includes("calendar"),
      JSON.stringify(o),
    );
  }
  assert.ok(exportJson(s).includes(TOKEN)); // the user's own backup keeps it
});

test("sync: calendar settings travel (later settings win), so every phone keeps the same feed", () => {
  const a = state();
  a.settings.updatedAt = 100;
  delete a.settings.calendar;
  const b = state();
  b.settings.updatedAt = 200;
  b.settings.calendar = cal({ time: "18:00" });
  const m = merge(a, b);
  assert.deepEqual(m.state.settings.calendar, cal({ time: "18:00" }));
  assert.equal(isValidState(m.state), true);
});

test("links: https feed, webcal, and the Google cid link", () => {
  assert.match(feedUrl(ID), new RegExp(`^https://.+/cal/${ID}\\.ics$`));
  assert.ok(
    webcalUrl(ID).startsWith("webcal://") &&
      webcalUrl(ID).endsWith(`/cal/${ID}.ics`),
  );
  assert.equal(
    googleUrl(ID),
    "https://calendar.google.com/calendar/render?cid=" +
      encodeURIComponent(webcalUrl(ID)),
  );
});

// ---- upload trigger ----
const T = new Date(2026, 10, 24, 12).getTime();
function fakeFetch(status = 200) {
  const f = async (url, init) => {
    f.calls.push({ url, body: JSON.parse(init.body) });
    if (status === "offline") throw new TypeError("offline");
    return { status, json: async () => ({}) };
  };
  f.calls = [];
  return f;
}
const run = (s, sent, fetchFn, now = T) =>
  pushCalendar(s, sent, { fetchFn, now, tz: "Asia/Jerusalem" });

test("trigger: first send, then nothing while unchanged, then a send when the plan changes", async () => {
  const f = fakeFetch();
  const s = state();
  let sent = await run(s, null, f);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.id, ID);
  assert.equal(f.calls[0].body.token, TOKEN);
  assert.ok(f.calls[0].url.endsWith("/cal/put"));
  assert.equal(f.calls[0].body.from, "2026-11-24");
  assert.ok(sent.h && sent.at === T);
  assert.equal(await run(s, sent, f, T + 1000), sent); // unchanged: same object, no call
  assert.equal(f.calls.length, 1);
  s.workouts[0].name = "Chest";
  sent = await run(s, sent, f, T + 2000);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.days[0].t, "Chest");
  s.settings.calendar.time = "18:00"; // time change sends
  await run(s, sent, f, T + 3000);
  assert.equal(f.calls.length, 3);
});

test("trigger: `from` stays put until the days change; a time zone change alone does not send", async () => {
  const f = fakeFetch();
  const s = state();
  let sent = await run(s, null, f, T);
  const later = T + 5 * 86400000;
  s.settings.calendar.mins = 90;
  sent = await run(s, sent, f, later);
  assert.equal(f.calls[1].body.from, "2026-11-24"); // days did not change
  assert.equal(
    await pushCalendar(s, sent, {
      fetchFn: f,
      now: later,
      tz: "America/New_York",
    }),
    sent,
  );
  s.settings.schedule.days[0] = "next"; // days change
  await run(s, sent, f, later);
  assert.equal(f.calls[2].body.from, "2026-11-29");
});

test("trigger: sends again after 30 days even if nothing changed", async () => {
  const f = fakeFetch();
  const s = state();
  const sent = await run(s, null, f);
  assert.equal(await run(s, sent, f, T + KEEPALIVE - 1000), sent);
  const n = await run(s, sent, f, T + KEEPALIVE + 1000);
  assert.equal(f.calls.length, 2);
  assert.equal(n.at, T + KEEPALIVE + 1000);
});

test("trigger: 404 stops sending until the keys change; offline and server errors retry later", async () => {
  const s = state();
  const f404 = fakeFetch(404);
  const dead = await run(s, null, f404);
  assert.deepEqual(dead, { dead: ID });
  const f = fakeFetch();
  assert.equal(await run(s, dead, f), dead);
  assert.equal(f.calls.length, 0);
  s.settings.calendar = cal({ id: "C".repeat(22) }); // a new link arrived by sync
  assert.ok((await run(s, dead, f)).h);
  assert.equal(f.calls.length, 1);
  assert.equal(await run(s, null, fakeFetch("offline")), null);
  assert.equal(await run(s, null, fakeFetch(500)), null);
});

test("trigger: nothing at all without a calendar", async () => {
  const f = fakeFetch();
  const s = state();
  delete s.settings.calendar;
  assert.equal(await run(s, null, f), null);
  assert.equal(f.calls.length, 0);
});

test("createCalSync: debounces, stores the result device-locally, reset clears it", async () => {
  const f = fakeFetch();
  const m = new Map();
  const storage = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
  const s = state();
  const c = createCalSync({
    getState: () => s,
    storage,
    fetchFn: f,
    delay: 10,
    now: () => T,
  });
  c.changed();
  c.changed();
  c.changed();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(f.calls.length, 1);
  assert.equal(JSON.parse(m.get(SENT_KEY)).id, ID);
  c.changed();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(f.calls.length, 1); // unchanged
  c.reset();
  assert.equal(m.has(SENT_KEY), false);
  delete s.settings.calendar;
  c.changed();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(f.calls.length, 1);
});

test("old saved state (no calendar) loads and re-saves unchanged; a state with a calendar round-trips", () => {
  const old = JSON.stringify({ ...emptyState(), workouts: [wk("w1", "Push")] });
  const mem = (init) => {
    const m = new Map(init ? [[KEY, init]] : []);
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, String(v)),
    };
  };
  const st = mem(old);
  const store = createStore(st);
  const r = store.load();
  assert.equal(r.recovered, false);
  assert.equal("calendar" in r.state.settings, false);
  store.save(r.state);
  assert.equal("calendar" in JSON.parse(st.getItem(KEY)).settings, false);
  r.state.settings.calendar = cal({ time: "18:00" });
  store.save(r.state);
  const again = createStore(st).load();
  assert.equal(again.recovered, false);
  assert.deepEqual(again.state.settings.calendar, cal({ time: "18:00" }));
});
