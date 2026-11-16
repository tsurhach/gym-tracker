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

import { checkSound, MAX_SOUND_BYTES } from "../js/media.js";
test("rest sound: audio accepted, mislabelled iOS audio only with an audio extension", () => {
  assert.deepEqual(checkSound({ type: "audio/mpeg", name: "a.mp3", size: 1000 }), { ok: true });
  assert.equal(checkSound({ type: "video/mp4", name: "a.M4A", size: 1000 }).ok, true);
  assert.equal(checkSound({ type: "video/quicktime", name: "a.mov", size: 1000 }).ok, false);
  assert.equal(checkSound({ type: "image/png", name: "a.png", size: 10 }).ok, false);
  assert.equal(checkSound({ type: "", name: "a.mp3", size: 10 }).ok, false);
});
test("rest sound: over 3 MB is rejected", () => {
  assert.equal(checkSound({ type: "audio/wav", name: "a.wav", size: MAX_SOUND_BYTES }).ok, true);
  assert.match(checkSound({ type: "audio/wav", name: "a.wav", size: MAX_SOUND_BYTES + 1 }).message, /too large/);
});
