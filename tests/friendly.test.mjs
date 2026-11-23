import { test } from "node:test";
import assert from "node:assert/strict";
import { plural, ago, friendlyError } from "../js/friendly.js";

test("plural", () => {
  assert.equal(plural(1, "day", "days"), "1 day");
  assert.equal(plural(0, "day", "days"), "0 days");
  assert.equal(plural(3, "exercise", "exercises"), "3 exercises");
});
test("ago", () => {
  const n = 10_000_000_000;
  assert.equal(ago(n - 20_000, n), "just now");
  assert.equal(ago(n - 5 * 60000, n), "5 min ago");
  assert.equal(ago(n - 180 * 60000, n), "3 h ago");
  assert.equal(ago(n - 2 * 1440 * 60000, n), "2 days ago");
});
test("friendlyError hides raw network errors and keeps real messages", () => {
  assert.match(friendlyError(new TypeError("Load failed")), /No internet/);
  assert.match(friendlyError(new Error("Failed to fetch")), /No internet/);
  assert.equal(friendlyError({ name: "NotAllowedError" }), "");
  assert.equal(friendlyError(new Error("That code does not open this data")), "That code does not open this data");
  assert.equal(friendlyError(null), "Something went wrong.");
});

import { syncOutcome } from "../js/friendly.js";
test("syncOutcome: success only when status says Synced", () => {
  assert.deepEqual(syncOutcome("Synced just now"), { text: "Synced.", kind: "ok" });
  assert.deepEqual(syncOutcome("Offline. Will retry."), { text: "Offline. Will retry.", kind: "error" });
});
