// The sharing routes of the server (VaultCore + InviteCore with Maps), driven with opaque sealed strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memServer, newAccount } from "./fakepasskey.mjs";
import {
  INVITE_LIFE,
  MAX_OPEN_INVITES,
  MAX_PEOPLE,
} from "../server/src/share.js";

const T0 = 1_800_000_000_000;
const sealed = (c = "x") => c.repeat(40);
const hex = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
let clock = T0;
const setup = async () => {
  clock = T0;
  return memServer({ now: () => clock });
};
const mkInvite = async (S, lookup = hex()) => {
  const r = await S.post("/invite/create", {
    lookup,
    wrapped: sealed("w"),
    sealedS: sealed("s"),
    sealedMeta: sealed("m"),
  });
  assert.equal(r.status, 200);
  return lookup;
};
const accept = (V, lookup) =>
  V.post("/invite/accept", {
    lookup,
    sealedJ: sealed("j"),
    sealedCanSee: sealed("c"),
  });
const blob = (c) => c.repeat(30);
const publish = (S, ids, v = "h") =>
  S.post("/share/publish", {
    blobs: { [v]: blob("b") },
    envelopes: Object.fromEntries(
      ids.map((id) => [id, { v, env: sealed("e") }]),
    ),
  });
// S invites, V accepts, S allows.
async function connected(server) {
  const S = await newAccount(server);
  const V = await newAccount(server);
  const lookup = await mkInvite(S);
  assert.equal((await accept(V, lookup)).status, 200);
  assert.equal(
    (await S.post("/share/allow", { joinerId: V.id, sealedMeta: sealed("v") }))
      .status,
    200,
  );
  return { S, V, lookup };
}

test("invite works once", async () => {
  const server = await setup();
  const S = await newAccount(server);
  const lookup = await mkInvite(S);
  const V = await newAccount(server);
  const W = await newAccount(server);
  assert.equal((await V.post("/invite/peek", { lookup })).status, 200);
  assert.equal((await accept(V, lookup)).status, 200);
  assert.equal((await accept(W, lookup)).status, 404);
  assert.equal(
    (
      await S.post("/invite/accept", {
        lookup,
        sealedJ: sealed("j"),
        sealedCanSee: sealed("c"),
      })
    ).status,
    404,
  ); // not even the sharer
});

test("invite expires after 7 days", async () => {
  const server = await setup();
  const S = await newAccount(server);
  const V = await newAccount(server);
  const lookup = await mkInvite(S);
  clock = T0 + INVITE_LIFE - 1000;
  assert.equal((await V.post("/invite/peek", { lookup })).status, 200);
  clock = T0 + INVITE_LIFE + 1000;
  assert.equal((await V.post("/invite/peek", { lookup })).status, 404);
  assert.equal((await accept(V, lookup)).status, 404);
  assert.equal((await S.post("/share/list")).body.invites[lookup], undefined);
  await server.invite(lookup).core.alarm(); // the alarm clears the object
  assert.equal(server.invite(lookup).st.m.size, 0);
});

test("peek of unknown, claimed and expired are all 404 and look the same", async () => {
  const server = await setup();
  const S = await newAccount(server);
  const V = await newAccount(server);
  const claimed = await mkInvite(S);
  await accept(V, claimed);
  const expired = await mkInvite(S);
  clock += INVITE_LIFE + 1;
  const got = [];
  for (const l of [hex(), claimed, expired])
    got.push(await V.post("/invite/peek", { lookup: l }));
  assert.ok(got.every((r) => r.status === 404));
  assert.deepEqual(got[0], got[1]);
  assert.deepEqual(got[1], got[2]);
  assert.equal(
    (await V.post("/invite/peek", { lookup: "nothex" })).status,
    400,
  );
});

test("nothing is published to a viewer before allow", async () => {
  const server = await setup();
  const S = await newAccount(server);
  const V = await newAccount(server);
  await accept(V, await mkInvite(S));
  assert.equal((await publish(S, [V.id])).status, 400); // waiting is not allowed
  assert.equal((await publish(S, [])).status, 200);
  assert.equal((await V.post("/share/get", { from: S.id })).status, 404);
  assert.equal(
    Object.keys((await S.post("/share/list")).body.viewers).length,
    0,
  );
});

test("publish rejects envelopes for non-viewers and junk", async () => {
  const server = await setup();
  const { S, V } = await connected(server);
  const W = await newAccount(server);
  assert.equal((await publish(S, [V.id, W.id])).status, 400);
  assert.equal(
    (
      await S.post("/share/publish", {
        blobs: { zzz: blob("b") },
        envelopes: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await S.post("/share/publish", {
        blobs: { h: "no spaces!" },
        envelopes: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await S.post("/share/publish", {
        blobs: { h: blob("b") },
        envelopes: { [V.id]: { v: "hp", env: sealed("e") } },
      })
    ).status,
    400,
  ); // variant not sent
  assert.equal((await publish(S, [V.id])).status, 200);
  const g = await V.post("/share/get", { from: S.id });
  assert.equal(g.status, 200);
  assert.equal(g.body.blob, blob("b"));
});

test("remove deletes envelope and get is 404; the last remove clears the blobs", async () => {
  const server = await setup();
  const { S, V } = await connected(server);
  await publish(S, [V.id]);
  assert.equal((await V.post("/share/get", { from: S.id })).status, 200);
  assert.equal((await S.post("/share/remove", { viewerId: V.id })).status, 200);
  assert.equal((await V.post("/share/get", { from: S.id })).status, 404);
  assert.ok(
    ![...server.core(S.id).st.m.keys()].some((k) => k.startsWith("blob:")),
  );
  assert.equal((await publish(S, [V.id])).status, 400); // and cannot be added back to a publish
});

test("get by a stranger or without a token is 404", async () => {
  const server = await setup();
  const { S } = await connected(server);
  const W = await newAccount(server);
  await publish(S, []);
  assert.equal((await W.post("/share/get", { from: S.id })).status, 404);
  assert.equal((await W.post("/share/get", { from: "nobody" })).status, 404);
  const bad = await server.fetch("https://x/share/get", {
    body: JSON.stringify({ accountId: W.id, token: "nope", from: S.id }),
  });
  assert.equal(bad.status, 404);
});

test("leave drops both sides", async () => {
  const server = await setup();
  const { S, V } = await connected(server);
  assert.equal(
    Object.keys((await V.post("/share/list")).body.canSee).length,
    1,
  );
  assert.equal((await V.post("/share/leave", { sharerId: S.id })).status, 200);
  assert.equal(
    Object.keys((await V.post("/share/list")).body.canSee).length,
    0,
  );
  assert.equal(
    Object.keys((await S.post("/share/list")).body.viewers).length,
    0,
  );
  assert.equal((await publish(S, [V.id])).status, 400);
});

test("deleting an account removes its shares and invites", async () => {
  const server = await setup();
  const { S, V } = await connected(server);
  const open = await mkInvite(S);
  await publish(S, [V.id]);
  assert.equal((await S.post("/account/delete")).status, 200);
  assert.equal(server.core(S.id).st.m.size, 0);
  assert.equal(server.invite(open).st.m.size, 0);
  assert.equal((await V.post("/share/get", { from: S.id })).status, 404);
});

test("peek and accept are rate limited per account", async () => {
  const server = await setup();
  const V = await newAccount(server);
  let last;
  for (let i = 0; i < 20; i++) {
    clock += 4000; // under the general request limit
    last = await V.post("/invite/peek", { lookup: hex() });
    assert.equal(last.status, 404);
  }
  clock += 4000;
  assert.equal((await V.post("/invite/peek", { lookup: hex() })).status, 429);
  clock += 3_600_000;
  assert.equal((await V.post("/invite/peek", { lookup: hex() })).status, 404);
});

test("caps: the 51st person and the 11th open invite are refused", async () => {
  const server = await setup();
  const S = await newAccount(server);
  for (let i = 0; i < MAX_OPEN_INVITES; i++) await mkInvite(S);
  const r = await S.post("/invite/create", {
    lookup: hex(),
    wrapped: sealed("w"),
    sealedS: sealed("s"),
    sealedMeta: sealed("m"),
  });
  assert.equal(r.status, 413);
  const T = await newAccount(server);
  for (let i = 0; i < MAX_PEOPLE; i++) {
    clock += 2000;
    const id = (await newAccount(server)).id;
    assert.equal(
      (await T.post("/share/add", { viewerId: id, sealedMeta: sealed("v") }))
        .status,
      200,
    );
  }
  const extra = (await newAccount(server)).id;
  assert.equal(
    (await T.post("/share/add", { viewerId: extra, sealedMeta: sealed("v") }))
      .status,
    413,
  );
  assert.equal(
    (
      await T.post("/share/add", {
        viewerId: Object.keys((await T.post("/share/list")).body.viewers)[0],
        sealedMeta: sealed("n"),
      })
    ).status,
    200,
  ); // a change is not a new person
});

test("a bad accept leaves the invite unclaimed, and a full list undoes the claim", async () => {
  const server = await setup();
  const S = await newAccount(server);
  const V = await newAccount(server);
  const lookup = await mkInvite(S);
  assert.equal(
    (
      await V.post("/invite/accept", {
        lookup,
        sealedJ: "short",
        sealedCanSee: sealed("c"),
      })
    ).status,
    400,
  );
  assert.equal((await accept(V, lookup)).status, 200); // still unclaimed
  const F = await newAccount(server); // a viewer whose "can see" list is full: the claim is rolled back
  for (let i = 0; i < MAX_PEOPLE; i++) await F.post("/share/cansee", { sharerId: (await newAccount(server)).id, sealed: sealed("c") });
  const again = await mkInvite(S);
  assert.equal((await accept(F, again)).status, 413);
  assert.equal((await V.post("/invite/peek", { lookup: again })).status, 200);
});

test("the server stores only sealed strings and ids for sharing", async () => {
  const server = await setup();
  const { S, V } = await connected(server);
  await publish(S, [V.id]);
  const d = server.core(S.id).st.m.get("share");
  assert.deepEqual(Object.keys(d).sort(), [
    "canSee",
    "env",
    "invites",
    "pending",
    "sharedAt",
    "viewers",
  ]);
  assert.deepEqual(Object.keys(d.viewers[V.id]), ["sealed"]);
});
