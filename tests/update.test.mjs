import test from "node:test";
import assert from "node:assert/strict";
import { reloadAction, shouldCheck, versionFromKeys } from "../js/update.js";

test("reloadAction: never on first install or after one reload", () => {
  assert.equal(reloadAction({ hadController: false, reloaded: false, typing: false }), "none");
  assert.equal(reloadAction({ hadController: true, reloaded: true, typing: false }), "none");
});
test("reloadAction: update reloads now, or defers while typing", () => {
  assert.equal(reloadAction({ hadController: true, reloaded: false, typing: false }), "now");
  assert.equal(reloadAction({ hadController: true, reloaded: false, typing: true }), "defer");
});
test("shouldCheck throttles to once a minute", () => {
  assert.equal(shouldCheck(59999, 0), false);
  assert.equal(shouldCheck(60000, 0), true);
});
test("versionFromKeys reads the shell cache name", () => {
  assert.equal(versionFromKeys(["gym-tracker-img-v1", "gym-tracker-shell-abc123"]), "abc123");
  assert.equal(versionFromKeys(["other"]), null);
});
