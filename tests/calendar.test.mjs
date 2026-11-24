// The .ics builder and the body check (server/src/calendar.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildIcs,
  checkBody,
  fold,
  zonedToUtc,
  todayIn,
} from "../server/src/calendar.js";

const ID = "abcdefghijklmnopqrstuv";
const NOW = Date.UTC(2026, 10, 24, 10, 0, 0); // Tue 2026-11-24
const UPD = Date.UTC(2026, 10, 20, 8, 30, 15);
const rec = (o = {}) => ({
  from: "2026-01-01",
  tz: "UTC",
  time: null,
  mins: 60,
  alarm: false,
  days: [
    { d: 1, t: "Push" },
    { d: 4, t: "Workout" },
  ],
  updatedAt: UPD,
  ...o,
});
const lines = (t) => t.split("\r\n");
const events = (t) =>
  t
    .split("BEGIN:VEVENT\r\n")
    .slice(1)
    .map((e) => e.split("END:VEVENT")[0]);
const field = (ev, k) =>
  ev
    .split("\r\n")
    .find((l) => l.startsWith(k))
    ?.slice(k.length);
const starts = (t) => events(t).map((e) => field(e, "DTSTART;VALUE=DATE:"));
const ALL = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, t: "X" }));

test("structure: header, CRLF only, ends with a CRLF, balanced blocks", async () => {
  const t = await buildIcs(ID, rec(), NOW);
  assert.ok(
    t.startsWith(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Gym Tracker//Calendar//EN\r\n",
    ),
  );
  assert.ok(t.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/(^|[^\r])\n/.test(t), "bare LF found");
  for (const k of [
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Gym Tracker",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ])
    assert.ok(t.includes(k), k);
  assert.equal(t.split("BEGIN:VEVENT").length, t.split("END:VEVENT").length);
  for (const e of events(t)) {
    for (const k of [
      "UID:",
      "DTSTAMP:20261120T083015Z",
      "LAST-MODIFIED:20261120T083015Z",
      "TRANSP:TRANSPARENT",
    ])
      assert.ok(e.includes(k), k);
    assert.ok(!e.includes("DESCRIPTION"));
  }
});

test("window: today-14 to today+70, never before `from`, crosses month and year", async () => {
  const s = starts(await buildIcs(ID, rec({ days: ALL }), NOW));
  assert.equal(s[0], "20261110"); // 2026-11-24 minus 14
  assert.equal(s.at(-1), "20270202"); // plus 70, across the year
  assert.equal(s.length, 14 + 70 + 1);
  const late = starts(
    await buildIcs(ID, rec({ from: "2026-11-20", days: ALL }), NOW),
  );
  assert.equal(late[0], "20261120");
  assert.equal(
    starts(await buildIcs(ID, rec({ from: "2030-01-01" }), NOW)).length,
    0,
  );
});

test("only the chosen weekdays, with the right names", async () => {
  const ev = events(await buildIcs(ID, rec(), NOW));
  for (const e of ev) {
    const d = field(e, "DTSTART;VALUE=DATE:");
    const wd = new Date(
      Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6)),
    ).getUTCDay();
    assert.ok(wd === 1 || wd === 4);
    assert.ok(e.includes(wd === 1 ? "Push" : "Workout"));
  }
  assert.equal(ev.length, 24); // 85 days, Mondays and Thursdays
});

test("all-day: DATE values and DTEND is the next day, across a month end", async () => {
  const t = await buildIcs(
    ID,
    rec({ days: [{ d: 1, t: "Push" }], from: "2026-11-25" }),
    Date.UTC(2026, 10, 29, 12),
  );
  const e = events(t).find((x) => x.includes("DTSTART;VALUE=DATE:20261130"));
  assert.ok(e.includes("DTEND;VALUE=DATE:20261201"));
});

test("UID: stable across builds and edits, per date, per id, raw id never shown", async () => {
  const a = await buildIcs(ID, rec(), NOW);
  const b = await buildIcs(
    ID,
    rec({
      days: [
        { d: 1, t: "Renamed" },
        { d: 4, t: "Workout" },
      ],
      time: "18:00",
      updatedAt: UPD + 5000,
    }),
    NOW,
  );
  const uids = (t) => events(t).map((e) => field(e, "UID:"));
  assert.deepEqual(uids(a), uids(b));
  assert.equal(new Set(uids(a)).size, uids(a).length);
  assert.match(uids(a)[0], /^\d{8}-[0-9a-f]{16}@gym-tracker$/);
  const other = await buildIcs("ZYXWVUTSRQPONMLKJIHGFE", rec(), NOW);
  assert.notEqual(uids(a)[0].split("-")[1], uids(other)[0].split("-")[1]);
  assert.ok(!a.includes(ID));
});

test("timed: UTC instants are DST-correct (Jerusalem, New York) and DTEND adds mins", async () => {
  const jer = (date) => zonedToUtc(Date.UTC(...date), 18, 0, "Asia/Jerusalem");
  assert.equal(
    new Date(jer([2026, 2, 20])).toISOString(),
    "2026-03-20T16:00:00.000Z",
  ); // winter, UTC+2
  assert.equal(
    new Date(jer([2026, 2, 27])).toISOString(),
    "2026-03-27T15:00:00.000Z",
  ); // summer time began Fri 27 Mar, UTC+3
  const ny = (date) => zonedToUtc(Date.UTC(...date), 6, 30, "America/New_York");
  assert.equal(
    new Date(ny([2026, 2, 7])).toISOString(),
    "2026-03-07T11:30:00.000Z",
  ); // EST
  assert.equal(
    new Date(ny([2026, 2, 9])).toISOString(),
    "2026-03-09T10:30:00.000Z",
  ); // EDT began 8 Mar
  assert.equal(
    new Date(ny([2026, 10, 2])).toISOString(),
    "2026-11-02T11:30:00.000Z",
  ); // EST again after 1 Nov
  // In a feed: the Monday before and the Monday after the change get different UTC hours.
  const t = await buildIcs(
    ID,
    rec({
      tz: "America/New_York",
      time: "06:30",
      mins: 45,
      days: [{ d: 1, t: "Push" }],
    }),
    Date.UTC(2026, 2, 8, 12),
  );
  const e = events(t);
  const before = e.find((x) => x.includes("DTSTART:20260302T113000Z"));
  const after = e.find((x) => x.includes("DTSTART:20260309T103000Z"));
  assert.ok(before && after);
  assert.ok(before.includes("DTEND:20260302T121500Z")); // +45 min
  assert.ok(!before.includes("VALUE=DATE"));
  assert.ok(!t.includes("VALARM"));
});

test("the zone decides which date is today", () => {
  const now = Date.UTC(2026, 10, 24, 23, 30); // already Wed 25th in Jerusalem (UTC+2)
  assert.equal(
    new Date(todayIn("Asia/Jerusalem", now)).toISOString().slice(0, 10),
    "2026-11-25",
  );
  assert.equal(
    new Date(todayIn("UTC", now)).toISOString().slice(0, 10),
    "2026-11-24",
  );
  assert.equal(
    new Date(todayIn(null, now)).toISOString().slice(0, 10),
    "2026-11-24",
  );
});

test("VALARM only with a time and alarm on", async () => {
  const has = async (o) =>
    (await buildIcs(ID, rec(o), NOW)).includes("BEGIN:VALARM");
  assert.equal(await has({ time: "18:00", alarm: true }), true);
  assert.equal(await has({ time: "18:00", alarm: false }), false);
  assert.equal(await has({ time: null, alarm: true }), false);
  const t = await buildIcs(ID, rec({ time: "18:00", alarm: true }), NOW);
  assert.ok(
    t.includes(
      "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Workout\r\nTRIGGER:-PT30M\r\nEND:VALARM",
    ),
  );
});

test("zero days is a valid empty calendar", async () => {
  const t = await buildIcs(ID, rec({ days: [] }), NOW);
  assert.ok(t.startsWith("BEGIN:VCALENDAR") && t.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!t.includes("VEVENT"));
});

test("escaping: backslash, semicolon, comma", async () => {
  const t = await buildIcs(
    ID,
    rec({ days: [{ d: 1, t: "Push; pull, legs \\ core" }] }),
    NOW,
  );
  assert.ok(t.includes("Push\\; pull\\, legs \\\\ core"));
});

const bytes = (s) => new TextEncoder().encode(s).length;
const BAR = "\u{1F3CB}️";

test("folding: 75 octets, UTF-8 never split, unfolds to the original", async () => {
  const names = [
    "A".repeat(60),
    "א".repeat(40) + "ש".repeat(20),
    BAR.repeat(30),
  ];
  for (const name of names) {
    const t = await buildIcs(ID, rec({ days: [{ d: 1, t: name }] }), NOW);
    for (const l of lines(t))
      assert.ok(bytes(l) <= 75, `${bytes(l)} octets: ${l}`);
    const unfolded = t.replace(/\r\n /g, "");
    assert.ok(unfolded.includes("SUMMARY:" + BAR + " " + name));
    assert.ok(!unfolded.includes("�"));
    assert.ok(lines(t).some((l) => l.startsWith(" ")));
  }
  assert.equal(fold("x".repeat(75)), "x".repeat(75));
  assert.equal(fold("x".repeat(76)), "x".repeat(75) + "\r\n x");
  assert.equal(fold("x".repeat(74) + "א"), "x".repeat(74) + "\r\n א"); // a 2-byte letter at the edge moves whole
});

const ok = () => ({
  from: "2026-11-24",
  tz: "Asia/Jerusalem",
  time: "18:00",
  mins: 60,
  alarm: false,
  days: [{ d: 1, t: "Push" }],
});

test("checkBody accepts a good body", () => {
  assert.deepEqual(checkBody(ok()), ok());
  assert.deepEqual(checkBody({ ...ok(), tz: null, time: null, days: [] }), {
    ...ok(),
    tz: null,
    time: null,
    days: [],
  });
  assert.ok(checkBody({ ...ok(), days: [{ d: 1, t: "x".repeat(60) }] }));
});

test("checkBody refuses every broken rule", () => {
  const bad = (patch) =>
    assert.equal(checkBody({ ...ok(), ...patch }), null, JSON.stringify(patch));
  bad({ extra: 1 });
  bad({ days: Array.from({ length: 8 }, (_, d) => ({ d: d % 7, t: "x" })) });
  bad({
    days: [
      { d: 1, t: "a" },
      { d: 1, t: "b" },
    ],
  });
  bad({ days: [{ d: 7, t: "a" }] });
  bad({ days: [{ d: -1, t: "a" }] });
  bad({ days: [{ d: 1.5, t: "a" }] });
  bad({ days: [{ d: 1, t: "" }] });
  bad({ days: [{ d: 1, t: "x".repeat(61) }] });
  bad({ days: [{ d: 1, t: "a\nb" }] });
  bad({ days: [{ d: 1, t: "a\u0000b" }] });
  bad({ days: [{ d: 1, t: 5 }] });
  bad({ days: [{ d: 1, t: "a", z: 1 }] });
  bad({ days: "x" });
  bad({ from: "2026-02-30" });
  bad({ from: "2026-2-3" });
  bad({ from: 5 });
  bad({ tz: "Mars/Base" });
  bad({ tz: "" });
  bad({ time: "24:00" });
  bad({ time: "6:00" });
  bad({ time: "18:60" });
  bad({ mins: 14 });
  bad({ mins: 241 });
  bad({ mins: 60.5 });
  bad({ mins: "60" });
  bad({ alarm: "yes" });
  for (const x of [null, [], "x", 5]) assert.equal(checkBody(x), null);
  const missing = ok();
  delete missing.alarm;
  assert.equal(checkBody(missing), null);
});
