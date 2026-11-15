import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { MUSCLES } from "../js/constants.js";

const lib = JSON.parse(
  readFileSync(new URL("../data/exercises.json", import.meta.url), "utf8"),
);

test("library has 80-120 entries with unique ids", () => {
  assert.ok(Array.isArray(lib));
  assert.ok(lib.length >= 80 && lib.length <= 120, `got ${lib.length}`);
  assert.equal(new Set(lib.map((e) => e.id)).size, lib.length);
});

test("muscles are valid and each group has at least 4 primaries", () => {
  for (const e of lib) {
    assert.ok(MUSCLES.includes(e.primary), `${e.id} primary ${e.primary}`);
    for (const s of e.secondary)
      assert.ok(MUSCLES.includes(s), `${e.id} secondary ${s}`);
  }
  for (const m of MUSCLES) {
    assert.ok(
      lib.filter((e) => e.primary === m).length >= 4,
      `${m} has fewer than 4`,
    );
  }
});

test("exercises with images have both files under 300 KB", () => {
  for (const e of lib) {
    assert.ok(e.images === 0 || e.images === 2, `${e.id} images`);
    if (e.images !== 2) continue;
    for (const n of [0, 1]) {
      const size = statSync(
        new URL(`../img/ex/${e.id}/${n}.jpg`, import.meta.url),
      ).size;
      assert.ok(size < 300 * 1024, `${e.id}/${n}.jpg is ${size} bytes`);
    }
  }
});

test("jargon names are plain, ids unchanged", () => {
  const byId = new Map(lib.map((e) => [e.id, e.name]));
  assert.equal(byId.get("leverage-chest-press"), "Machine Chest Press");
  assert.equal(byId.get("leverage-high-row"), "Machine High Row");
  assert.equal(
    byId.get("cable-seated-lateral-raise"),
    "Seated Cable Lateral Raise",
  );
});

test("major groups lead with a sensible pair", () => {
  const second = (m) => lib.filter((e) => e.primary === m)[1].name;
  assert.match(second("Back"), /Row/);
  assert.match(second("Quads"), /Leg Press/);
  assert.match(second("Hamstrings"), /Leg Curl/);
  assert.match(second("Chest"), /Incline/);
  assert.match(second("Shoulders"), /Lateral Raise/);
});
