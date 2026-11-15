import test from "node:test";
import assert from "node:assert/strict";
import { lastText } from "../js/screens/workout.js";

test("lastText groups same weight", () => {
  assert.equal(
    lastText([{ weight: 50, reps: 10 }, { weight: 50, reps: 10 }, { weight: 50, reps: 9 }]),
    "50 kg × 10, 10, 9",
  );
});
test("lastText mixed weights and empty", () => {
  assert.equal(lastText([{ weight: 50, reps: 10 }, { weight: 52.5, reps: 8 }]), "50 × 10, 52.5 × 8 kg");
  assert.equal(lastText(null), "");
});
