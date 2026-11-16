import test from "node:test";
import assert from "node:assert/strict";
import { pickerExercises } from "../js/picker.js";

const all = [
  { id: "a", primary: "Chest" },
  { id: "b", primary: "Back" },
  { id: "custom-1", primary: "Chest" },
];
const ids = (l) => l.map((e) => e.id);

test("filters by the workout's muscles, custom included", () => {
  assert.deepEqual(ids(pickerExercises(all, ["Chest"], false)), ["a", "custom-1"]);
});
test("empty or undefined muscles shows all", () => {
  assert.equal(pickerExercises(all, [], false).length, 3);
  assert.equal(pickerExercises(all, undefined, false).length, 3);
});
test("showAll overrides the filter", () => {
  assert.equal(pickerExercises(all, ["Chest"], true).length, 3);
});
