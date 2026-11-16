import test from "node:test";
import assert from "node:assert/strict";
import { checkFile, fitSize, MAX_VIDEO_BYTES, TOO_BIG } from "../js/media.js";

test("landscape is scaled so the long side is 1200", () => {
  assert.deepEqual(fitSize(4000, 3000), { w: 1200, h: 900 });
});
test("portrait is scaled so the long side is 1200", () => {
  assert.deepEqual(fitSize(3000, 4000), { w: 900, h: 1200 });
});
test("a small image is not upscaled", () => {
  assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 });
});
test("images and videos under the limit are accepted", () => {
  assert.deepEqual(checkFile({ type: "image/jpeg", size: 9e9 }), { ok: true, kind: "image" });
  assert.deepEqual(checkFile({ type: "video/mp4", size: MAX_VIDEO_BYTES }), { ok: true, kind: "video" });
});
test("a video over the limit is rejected with the plain message", () => {
  assert.deepEqual(checkFile({ type: "video/quicktime", size: MAX_VIDEO_BYTES + 1 }), { ok: false, message: TOO_BIG });
});
test("other types are rejected", () => {
  assert.equal(checkFile({ type: "application/pdf", size: 1 }).ok, false);
  assert.equal(checkFile({ type: "", size: 1 }).ok, false);
  assert.equal(checkFile(null).ok, false);
});
