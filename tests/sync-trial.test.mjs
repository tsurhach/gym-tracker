import test from "node:test";
import assert from "node:assert/strict";
import { SYNC_ENABLED, TRIAL_KEY, syncTrialOn, toggleSyncTrial } from "../js/sync.js";

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

test("sync stays off by default, even with no localStorage", () => {
  assert.equal(SYNC_ENABLED, false);
  assert.equal(syncTrialOn(mem()), false);
  assert.equal(syncTrialOn(undefined), false);
});
test("on with the key, toggle flips and leaves other data alone", () => {
  const ls = mem();
  ls.setItem("gymtracker.state", "{}");
  ls.setItem(TRIAL_KEY, "1");
  assert.equal(syncTrialOn(ls), true);
  assert.equal(toggleSyncTrial(ls), false);
  assert.equal(syncTrialOn(ls), false);
  assert.equal(toggleSyncTrial(ls), true);
  assert.equal(ls.getItem("gymtracker.state"), "{}");
});
