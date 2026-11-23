// Phase 4: photos and sound sync as sealed binary files. Real client (createSync) against the real VaultCore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSync } from "../js/sync.js";
import { isValidState, emptyState } from "../js/store.js";
import * as sc from "../js/synccrypto.js";
import {
  VaultCore,
  MEDIA_CAP,
  MEDIA_ITEM_MAX,
  IDLE_DELETE,
} from "../server/src/vault.js";
import {
  authenticator,
  memServer,
  memStorage,
  SECRET,
  ORIGIN,
} from "./fakepasskey.mjs";

const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const photo = (text) => ({
  kind: "image",
  blob: new Blob([text], { type: "image/jpeg" }),
  thumb: new Blob(["t"], { type: "image/jpeg" }),
});
const text = async (v) =>
  new TextDecoder().decode(await (v.blob ?? v).arrayBuffer());

function device(server, auth, { state = emptyState(), media = {}, now } = {}) {
  const dev = {
    state,
    applied: 0,
    key: null,
    media: new Map(Object.entries(media)),
    log: [],
  };
  const files = {
    keys: async () => [...dev.media.keys()],
    read: async (k) => dev.media.get(k) ?? null,
    write: async (k, v) => void dev.media.set(k, v),
    remove: async (k) => void dev.media.delete(k),
  };
  dev.sync = createSync({
    getState: () => dev.state,
    setState: (s) => (dev.state = s),
    isSafe: () => true,
    applied: () => dev.applied++,
    storage: mem(),
    passkey: auth.device({ prf: null }),
    fetch: (url, o) => {
      dev.log.push(new URL(url).pathname);
      return (dev.fetch ?? server.fetch)(url, o);
    },
    keys: { get: async () => dev.key, set: async (k) => void (dev.key = k) },
    media: files,
    now,
    url: "https://x",
  });
  return dev;
}
const pair = async (opts = {}) => {
  const server = memServer({ now: opts.now });
  const auth = authenticator();
  const a = device(server, auth, { ...opts.a, now: opts.now });
  const { recoveryCode } = await a.sync.enable();
  await a.sync.syncNow();
  const b = device(server, auth, { ...opts.b, now: opts.now });
  await b.sync.signIn();
  await b.sync.signInWithCode(recoveryCode);
  await b.sync.syncNow(); // let the sign-in sync finish so later calls start fresh runs
  return { server, auth, a, b };
};
const idx = (server) => [...server.vaults.values()][0].st.m.get("mindex") ?? {};

test("a photo is sealed, uploaded as binary before the state, and arrives on the other device", async () => {
  const { server, a, b } = await pair({
    a: { media: { "ex-1": photo("SECRET-PHOTO-BYTES") } },
  });
  assert.ok(
    a.log.indexOf("/media/put") >= 0 &&
      a.log.indexOf("/media/put") < a.log.lastIndexOf("/sync/push"),
    "file before state",
  );
  assert.equal(a.state.mediaRefs["ex-1"].id.length, 22);
  assert.notEqual(a.state.mediaRefs["ex-1"].id, "ex-1");
  await b.sync.syncNow();
  assert.equal(await text(b.media.get("ex-1")), "SECRET-PHOTO-BYTES");
  // the server only ever saw sealed bytes: no file text, no exercise id or file name
  const wire = server.seen
    .map((x) => (typeof x === "string" ? x : Buffer.from(x).toString("latin1")))
    .join("\n");
  assert.ok(
    !wire.includes("SECRET-PHOTO-BYTES") &&
      !wire.includes("ex-1") &&
      !wire.includes("jpeg"),
  );
  const stored = [...[...server.vaults.values()][0].st.m.keys()].join(",");
  assert.ok(!stored.includes("ex-1"));
  assert.deepEqual(
    Object.keys(idx(server)).every((id) => id !== "ex-1"),
    true,
  );
});

test("sound uses its fixed key; videos stay on the phone", async () => {
  const { server, a, b } = await pair({
    a: {
      media: {
        "rest-sound": new Blob(["BEEP"], { type: "audio/mpeg" }),
        vid: {
          kind: "video",
          blob: new Blob(["V"], { type: "video/mp4" }),
          thumb: null,
        },
      },
    },
  });
  a.sync.changed();
  await a.sync.syncNow();
  assert.ok(a.state.mediaRefs["rest-sound"].id);
  assert.equal(a.state.mediaRefs.vid, undefined);
  assert.equal(Object.keys(idx(server)).length, 1);
  await b.sync.syncNow();
  assert.equal(await text(b.media.get("rest-sound")), "BEEP");
  assert.equal(b.media.has("vid"), false);
});

test("deleting a photo deletes it on the other device and later on the server", async () => {
  const { server, a, b } = await pair({
    a: { media: { "ex-1": photo("P1") } },
  });
  a.sync.changed();
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.ok(b.media.has("ex-1"));
  const oldId = a.state.mediaRefs["ex-1"].id;
  assert.ok(idx(server)[oldId]);
  a.media.delete("ex-1");
  a.sync.changed();
  await a.sync.syncNow();
  assert.equal(a.state.mediaRefs["ex-1"].id, null);
  assert.equal(
    idx(server)[oldId],
    undefined,
    "server copy removed once the state is up",
  );
  await b.sync.syncNow();
  assert.equal(b.media.has("ex-1"), false);
  assert.ok(isValidState(b.state));
});

test("a changed photo replaces the old one everywhere", async () => {
  const { a, b } = await pair({ a: { media: { "ex-1": photo("OLD") } } });
  a.sync.changed();
  await a.sync.syncNow();
  await b.sync.syncNow();
  a.media.set("ex-1", photo("NEWER"));
  a.sync.changed();
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal(await text(b.media.get("ex-1")), "NEWER");
});

test("a missing or failing file never breaks the state sync or loses local media", async () => {
  const { server, a, b } = await pair();
  a.media.set("ex-2", photo("P2"));
  a.media.set("ex-3", photo("P3"));
  a.state.sessions.push({
    id: "s1",
    workoutName: "Push",
    startedAt: 1,
    entries: [],
    updatedAt: 9,
  });
  a.sync.changed();
  await a.sync.syncNow();
  // the files vanish from the server
  const v = [...server.vaults.values()][0];
  for (const k of [...v.st.m.keys()]) if (k.startsWith("m:")) v.st.m.delete(k);
  v.st.m.set("mindex", {});
  await b.sync.syncNow();
  assert.deepEqual(
    b.state.sessions.map((s) => s.id),
    ["s1"],
    "state still synced",
  );
  assert.equal(b.media.has("ex-2"), false);
  assert.ok(a.media.has("ex-2"), "owner keeps the photo");
  // downloads that throw do not break it either
  b.fetch = async (url, o) => {
    if (new URL(url).pathname === "/media/get") throw new Error("offline");
    return server.fetch(url, o);
  };
  await b.sync.syncNow();
  assert.equal(b.state.sessions.length, 1);
});

test("size caps: a file over the limit stays local with a plain message; the server answers 413", async () => {
  const big = new Uint8Array(MEDIA_ITEM_MAX + 100);
  for (let i = 0; i < big.length; i += 65536)
    crypto.getRandomValues(big.subarray(i, Math.min(i + 65536, big.length)));
  const { server, a } = await pair({
    a: {
      media: {
        "ex-big": {
          kind: "image",
          blob: new Blob([big], { type: "image/jpeg" }),
          thumb: null,
        },
      },
    },
  });
  a.sync.changed();
  await a.sync.syncNow();
  assert.match(a.sync.mediaNote(), /too big/);
  assert.equal(a.state.mediaRefs?.["ex-big"], undefined);
  assert.ok(a.media.has("ex-big"));
  assert.equal(Object.keys(idx(server)).length, 0);
});

test("server: item over 4 MB and account over 25 MB get 413", async () => {
  const st = memStorage();
  const core = new VaultCore(st, { secret: SECRET, origins: [ORIGIN] });
  const token = "tok";
  const h = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  ).toString("base64url");
  await st.put("acct", {
    tokens: { [h]: Date.now() },
    rev: 0,
    credentials: {},
  });
  const put = (n, size) =>
    core.handle("/media/put", {
      token,
      id: sc.b64u(new Uint8Array(16).fill(n)),
      bytes: new Uint8Array(size),
    });
  assert.equal((await put(1, MEDIA_ITEM_MAX + 1)).status, 413);
  assert.equal((await put(1, MEDIA_ITEM_MAX + 1)).body.error, "item");
  for (let i = 1; i <= 6; i++)
    assert.equal(
      (await put(i, MEDIA_ITEM_MAX)).status,
      200,
      "6 x 4 MB fits in 25 MB",
    );
  const r = await put(7, MEDIA_ITEM_MAX);
  assert.equal(r.status, 413);
  assert.equal(r.body.error, "account");
  assert.ok(6 * MEDIA_ITEM_MAX <= MEDIA_CAP && 7 * MEDIA_ITEM_MAX > MEDIA_CAP);
  // a 4 MB file is stored in 1 MB pieces (a Durable Object value holds 2 MB) and reads back whole
  const got = await core.handle("/media/get", {
    token,
    id: sc.b64u(new Uint8Array(16).fill(1)),
  });
  assert.equal(got.body.bytes.length, MEDIA_ITEM_MAX);
  assert.ok([...st.m.keys()].filter((k) => k.startsWith("m:")).length >= 24);
});

test("server: a copy nobody used for 36 months is deleted; the device that still has it sends it again", async () => {
  let t = 1_000_000_000_000;
  const now = () => t;
  const { server, a } = await pair({
    now,
    a: { media: { "ex-1": photo("P1") } },
  });
  a.sync.changed();
  await a.sync.syncNow();
  const id = a.state.mediaRefs["ex-1"].id;
  assert.ok(idx(server)[id]);
  // the owner keeps using the account (so the sign-in does not expire); only the unused file is cleaned
  for (let i = 0; i < 6; i++) {
    t += IDLE_DELETE / 6 + 1000;
    a.sync.changed();
    await a.sync.syncNow();
  }
  assert.notEqual(a.state.mediaRefs["ex-1"].id, id, "re-uploaded under a new id");
  assert.equal(idx(server)[id], undefined);
  assert.ok(idx(server)[a.state.mediaRefs["ex-1"].id]);
});

test("every sealed file uses a fresh IV and opens only with the media label", async () => {
  const key = await sc.newDataKey();
  const ivs = new Set();
  for (let i = 0; i < 300; i++)
    ivs.add(
      Buffer.from((await sc.sealMedia(key, "same text")).slice(0, 12)).toString(
        "hex",
      ),
    );
  assert.equal(ivs.size, 300);
  const a = await sc.sealMedia(key, "photo text");
  assert.equal(await sc.openMedia(key, a), "photo text");
  assert.notDeepEqual(a, await sc.sealMedia(key, "photo text"));
  await assert.rejects(
    sc.open(key, sc.b64u(a)),
    "a media file cannot pass for the state blob",
  );
  const bad = a.slice();
  bad[20] ^= 1;
  await assert.rejects(sc.openMedia(key, bad));
  await assert.rejects(sc.openMedia(await sc.newDataKey(), a));
});

test("old saved state still loads; bad media references do not", () => {
  assert.ok(isValidState(emptyState()));
  assert.ok(
    isValidState({
      ...emptyState(),
      media: { x: { id: "abc", updatedAt: 1 }, y: { id: null, updatedAt: 2 } },
    }),
  );
  assert.equal(
    isValidState({ ...emptyState(), mediaRefs: { x: { id: 5, updatedAt: 1 } } }),
    false,
  );
  assert.equal(isValidState({ ...emptyState(), mediaRefs: [] }), false);
});
