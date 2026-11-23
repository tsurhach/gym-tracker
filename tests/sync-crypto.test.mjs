import { test } from "node:test";
import assert from "node:assert/strict";
import * as sc from "../js/synccrypto.js";

test("recovery code round-trips through formatting", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const code = sc.makeRecoveryCode(bytes);
  assert.match(code, /^[0-9A-Z]{4}(-[0-9A-Z]{2,4})+$/);
  assert.equal(code.replace(/-/g, "").length, 26);
  assert.deepEqual(sc.parseRecoveryCode(code), bytes);
  assert.deepEqual(
    sc.parseRecoveryCode(code.toLowerCase().replaceAll("-", " ")),
    bytes,
  );
  assert.equal(sc.parseRecoveryCode(code.slice(0, -1)), null);
  assert.equal(sc.parseRecoveryCode("!".repeat(26)), null);
  assert.equal(sc.parseRecoveryCode(""), null);
  assert.notEqual(sc.makeRecoveryCode(), sc.makeRecoveryCode());
});

test("data key wrapped by PRF output unwraps", async () => {
  const key = await sc.newDataKey();
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const back = await sc.unwrapDataKey(
    await sc.wrapDataKey(key, prf, "prf"),
    prf,
    "prf",
  );
  const blob = await sc.seal(key, { hi: 1 });
  assert.deepEqual(await sc.open(back, blob), { hi: 1 });
});

test("data key wrapped by recovery code unwraps; wrong code fails", async () => {
  const key = await sc.newDataKey();
  const code = crypto.getRandomValues(new Uint8Array(16));
  const w = await sc.wrapDataKey(key, code, "code");
  assert.ok(await sc.unwrapDataKey(w, code, "code"));
  await assert.rejects(
    sc.unwrapDataKey(w, crypto.getRandomValues(new Uint8Array(16)), "code"),
  );
  await assert.rejects(sc.unwrapDataKey(w, code, "prf")); // a wrap is bound to its kind
});

test("seal then open returns the document; gzip makes it small", async () => {
  const key = await sc.newDataKey();
  const doc = {
    syncFormat: 1,
    data: {
      rows: Array.from({ length: 500 }, (_, i) => ({ i, name: "Bench press" })),
    },
  };
  const blob = await sc.seal(key, doc);
  assert.deepEqual(await sc.open(key, blob), doc);
  assert.ok(blob.length < JSON.stringify(doc).length / 3);
  assert.ok(!blob.includes("Bench"));
  assert.notEqual(await sc.seal(key, doc), blob); // fresh iv each time
});

test("tampered blob and wrong key fail", async () => {
  const key = await sc.newDataKey();
  const blob = await sc.seal(key, { a: 1 });
  const bytes = sc.unb64u(blob);
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(sc.open(key, sc.b64u(bytes)));
  await assert.rejects(sc.open(await sc.newDataKey(), blob));
});

test("new recovery code replaces the old wrap", async () => {
  const key = await sc.newDataKey();
  const oldCode = crypto.getRandomValues(new Uint8Array(16));
  const newCode = crypto.getRandomValues(new Uint8Array(16));
  const wrapNew = await sc.wrapDataKey(key, newCode, "code"); // what the server now stores instead
  await assert.rejects(sc.unwrapDataKey(wrapNew, oldCode, "code"));
  const back = await sc.unwrapDataKey(wrapNew, newCode, "code");
  assert.deepEqual(await sc.open(back, await sc.seal(key, { ok: 1 })), {
    ok: 1,
  });
});

test("base64url helpers round-trip", () => {
  for (const n of [0, 1, 2, 3, 31, 32]) {
    const b = crypto.getRandomValues(new Uint8Array(n));
    assert.deepEqual(sc.unb64u(sc.b64u(b)), b);
  }
});
