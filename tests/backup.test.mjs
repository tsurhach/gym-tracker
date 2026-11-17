import test from "node:test";
import assert from "node:assert/strict";
import {
  BAD_MEDIA, FULL_TAIL, NOT_BACKUP, base64ToBytes, bytesToBase64, decodeMedia,
  encodeMedia, fmtSize, fullHead, readBackup,
} from "../js/backup.js";
import { emptyState, exportJson } from "../js/store.js";

const bytes = (n) => Uint8Array.from({ length: n }, (_, i) => i % 256);

test("base64 round trip: every byte value, empty, and odd lengths", () => {
  for (const b of [bytes(256), new Uint8Array(0), bytes(1), bytes(2), bytes(100000)])
    assert.deepEqual(base64ToBytes(bytesToBase64(b)), b);
});
test("bad base64 is rejected", () => {
  for (const s of ["a", "ab=c", "@@@@", 5, null]) assert.throws(() => base64ToBytes(s), { message: BAD_MEDIA });
});

async function fullFile(items) {
  const parts = [fullHead({ ...emptyState(), customExercises: [] })];
  const enc = [];
  for (const [k, v] of items) enc.push(await encodeMedia(k, v));
  return parts.join("") + enc.filter(Boolean).join(",") + FULL_TAIL;
}
const png = new Blob([bytes(256)], { type: "image/jpeg" });

test("full backup round trips sound, photo with thumb, video without thumb, empty item", async () => {
  const text = await fullFile([
    ["rest-sound", new Blob([bytes(256)], { type: "audio/mp4" })],
    ["ex1", { kind: "image", blob: png, thumb: new Blob([bytes(7)], { type: "image/jpeg" }) }],
    ["ex2", { kind: "video", blob: new Blob([], { type: "video/mp4" }), thumb: null }],
    ["junk", "not media"],
  ]);
  const { state, media } = readBackup(text);
  assert.deepEqual(state, emptyState());
  assert.deepEqual(media.map((m) => m.key), ["rest-sound", "ex1", "ex2"]);
  const buf = async (b) => new Uint8Array(await b.arrayBuffer());
  assert.deepEqual(await buf(media[0].value), bytes(256));
  assert.equal(media[0].value.type, "audio/mp4");
  assert.equal(media[1].value.kind, "image");
  assert.deepEqual(await buf(media[1].value.thumb), bytes(7));
  assert.equal(media[2].value.blob.size, 0);
  assert.equal(media[2].value.thumb, null);
});

test("a plain backup is recognised and has no media", () => {
  const r = readBackup(exportJson(emptyState()));
  assert.equal(r.media, null);
  assert.deepEqual(r.state, emptyState());
});

test("garbage is rejected", () => {
  for (const t of ["", "{nope", "[]", '{"version":2}']) assert.throws(() => readBackup(t), { message: NOT_BACKUP });
});

test("one malformed media item rejects the whole file", async () => {
  const good = JSON.parse(await fullFile([["a", png]]));
  for (const bad of [
    { key: "b", kind: "blob", type: "x", data: "!!!" },
    { key: "", kind: "blob", type: "x", data: "" },
    { key: "b", kind: "weird", type: "x", data: "" },
    { key: "b", kind: "image", type: "x", data: "", thumb: { type: "x", data: "?" } },
    null,
  ]) {
    const f = { ...good, media: [...good.media, bad] };
    assert.throws(() => readBackup(JSON.stringify(f)), { message: BAD_MEDIA });
  }
  assert.throws(() => readBackup(JSON.stringify({ ...good, media: "x" })), { message: BAD_MEDIA });
  assert.throws(() => decodeMedia(undefined), { message: BAD_MEDIA });
});

test("file size text", () => {
  assert.equal(fmtSize(10), "1 KB");
  assert.equal(fmtSize(250000), "250 KB");
  assert.equal(fmtSize(12_340_000), "12.3 MB");
});
