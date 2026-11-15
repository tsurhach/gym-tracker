import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, fmtKg, fmtDate } from "../js/ui.js";

test("esc escapes the five HTML characters and tolerates null", () => {
  assert.equal(
    esc(`<b>"x" & 'y'</b>`),
    "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;",
  );
  assert.equal(esc(null), "");
  assert.equal(esc(5), "5");
});

test("fmtKg has no trailing zeros", () => {
  assert.equal(fmtKg(50), "50");
  assert.equal(fmtKg(57.5), "57.5");
  assert.equal(fmtKg(1.25), "1.25");
  assert.equal(fmtKg(0.1 + 0.2), "0.3");
});

test("fmtDate formats local day, date and month", () => {
  assert.equal(fmtDate(new Date(2026, 10, 12, 9, 30).getTime()), "Thu 12 Nov");
  assert.equal(fmtDate(new Date(2026, 0, 1).getTime()), "Thu 1 Jan");
});
