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

import { applyInputs } from "../js/screens/exercise.js";

test("applyInputs: valid edit of a confirmed set stays confirmed with new numbers", () => {
  assert.deepEqual(applyInputs({ weight: 60, reps: 8, done: true }, "62,5", "9"), {
    weight: 62.5,
    reps: 9,
    done: true,
  });
});
test("applyInputs: invalid edit of a confirmed set unconfirms it", () => {
  assert.equal(applyInputs({ weight: 60, reps: 8, done: true }, "60", "").done, false);
});
test("applyInputs: blank weight on an unconfirmed set stays null, comma decimal parses", () => {
  const s = applyInputs({ weight: 50, reps: 8, done: false }, "", "8");
  assert.equal(s.weight, null);
  assert.equal(applyInputs(s, "57,5", "8").weight, 57.5);
});
