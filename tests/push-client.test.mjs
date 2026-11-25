// Phone side of the rest alert: device id, register-before-schedule, re-register on 404, silent when offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceId, newDeviceId, sendTo, REG_KEY, DEVICE_KEY } from "../js/push.js";

const store = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};
const sub = { endpoint: "https://web.push.apple.com/x", toJSON: () => ({ endpoint: "https://web.push.apple.com/x", keys: { p256dh: "a", auth: "b" } }) };
// A fake server: answers per path from a queue, records the calls.
const net = (answers) => {
  const calls = [];
  const fetchFn = async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    calls.push({ path, body });
    const a = answers[path];
    return { status: Array.isArray(a) ? a.shift() : (a ?? 200) };
  };
  return { calls, fetchFn };
};

test("device id: 22 URL-safe characters, made once and kept", () => {
  assert.match(newDeviceId(), /^[A-Za-z0-9_-]{22}$/);
  const s = store();
  const id = deviceId(s);
  assert.equal(deviceId(s), id);
  assert.equal(s.m.get(DEVICE_KEY), id);
});

test("first schedule registers the subscription, then schedules; the next one only schedules", async () => {
  const s = store();
  const n = net({});
  assert.equal(await sendTo(sub, "/rest/schedule", { endsAt: 5 }, { fetchFn: n.fetchFn, store: s }), 200);
  assert.deepEqual(n.calls.map((c) => c.path), ["/rest/register", "/rest/schedule"]);
  assert.equal(n.calls[0].body.sub.endpoint, sub.endpoint);
  assert.equal(n.calls[1].body.endsAt, 5);
  assert.equal(n.calls[1].body.device, s.m.get(DEVICE_KEY));
  n.calls.length = 0;
  await sendTo(sub, "/rest/cancel", undefined, { fetchFn: n.fetchFn, store: s });
  assert.deepEqual(n.calls.map((c) => c.path), ["/rest/cancel"]);
});

test("a new endpoint from iOS registers again; a 404 on schedule registers and retries once", async () => {
  const s = store();
  s.setItem(REG_KEY, "https://web.push.apple.com/old");
  const n = net({ "/rest/schedule": [404, 200] });
  assert.equal(await sendTo(sub, "/rest/schedule", { endsAt: 9 }, { fetchFn: n.fetchFn, store: s }), 200);
  assert.deepEqual(n.calls.map((c) => c.path), ["/rest/register", "/rest/schedule", "/rest/register", "/rest/schedule"]);
});

test("server refuses to register: nothing else is sent; unregister never registers", async () => {
  const s = store();
  const n = net({ "/rest/register": 400 });
  assert.equal(await sendTo(sub, "/rest/schedule", { endsAt: 1 }, { fetchFn: n.fetchFn, store: s }), undefined);
  assert.deepEqual(n.calls.map((c) => c.path), ["/rest/register"]);
  const m = net({});
  await sendTo(sub, "/rest/unregister", undefined, { fetchFn: m.fetchFn, store: s });
  assert.deepEqual(m.calls.map((c) => c.path), ["/rest/unregister"]);
});
