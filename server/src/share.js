// Sharing (phase 5). Pure logic over the same tiny storage interface as vault.js, so node tests can use a Map.
// The server only ever holds sealed text: names, roles, ticks and public keys are inside sealed parts it cannot open.
import { ID_RE, MAX_SYNC_BODY, checkSize } from "./syncauth.js";

export const INVITE_LIFE = 7 * 24 * 3600 * 1000;
export const MAX_OPEN_INVITES = 10;
export const MAX_PEOPLE = 50; // viewers + waiting requests per sharer, and "can see" entries per account
const GUESS_LIMIT = 20; // peek + accept per account per hour (bad lookups count too)
const BLOBS = ["h", "hp", "hpw"];
const LOOKUP_RE = /^[0-9a-f]{64}$/;
const SEALED_RE = /^[A-Za-z0-9_-]{20,4000}$/;
const NOT_FOUND = { status: 404, body: { error: "not found" } };
const BAD = { status: 400, body: { error: "bad request" } };
const FULL = { status: 413, body: { error: "full" } };
const OK = (body = {}) => ({ status: 200, body });

// One invite, one Durable Object (named by the lookup hash). Unknown, claimed and expired all look the same.
export class InviteCore {
  constructor(storage, opts = {}) {
    this.s = storage;
    this.now = opts.now ?? Date.now;
  }
  async live() {
    const inv = await this.s.get("inv");
    return inv && this.now() < inv.expiresAt ? inv : null;
  }
  async run(path, b) {
    const inv = await this.live();
    if (path === "/create") {
      if (await this.s.get("inv"))
        return { status: 409, body: { error: "exists" } };
      const expiresAt = this.now() + INVITE_LIFE;
      await this.s.put("inv", {
        sharerId: b.sharerId,
        wrapped: b.wrapped,
        sealedS: b.sealedS,
        expiresAt,
        claimed: null,
      });
      await this.s.setAlarm(expiresAt);
      return OK({ expiresAt });
    }
    if (path === "/delete") {
      if (inv && inv.sharerId === b.sharerId) await this.s.deleteAll();
      return OK();
    }
    if (!inv || (path !== "/unclaim" && inv.claimed)) return NOT_FOUND;
    if (path === "/peek")
      return OK({ wrapped: inv.wrapped, sealedS: inv.sealedS });
    if (path === "/claim") {
      if (b.joinerId === inv.sharerId) return BAD;
      inv.claimed = { joinerId: b.joinerId, sealedJ: b.sealedJ };
      await this.s.put("inv", inv); // one request at a time per object, so a second claim sees this and gets 404
      return OK({ sharerId: inv.sharerId });
    }
    if (path === "/unclaim") {
      inv.claimed = null;
      await this.s.put("inv", inv);
      return OK();
    }
    return BAD;
  }
  alarm() {
    return this.s.deleteAll();
  }
}

// The caller's own Vault. data = { invites, pending, viewers, canSee, env, shareKey }, all small sealed strings.
const load = async (v) =>
  (await v.s.get("share")) ?? {
    invites: {},
    pending: {},
    viewers: {},
    canSee: {},
    env: {},
  };
const save = (v, d) => v.s.put("share", d);
const count = (o) => Object.keys(o).length;
const sealed = (x) => typeof x === "string" && SEALED_RE.test(x);

// Rate limit for code guessing, per account per hour (in memory, like the request limit).
function guessing(v) {
  const t = v.now();
  v.ghits = (v.ghits ?? []).filter((x) => t - x < 3_600_000);
  return v.ghits.push(t) > GUESS_LIMIT;
}

// Calls that start from the caller's own Vault (the token was already checked). Other accounts are reached
// only through shareRoute below.
export async function vaultShare(v, path, b, acct) {
  const t = v.now();
  const d = await load(v);
  for (const [l, e] of Object.entries(d.invites))
    if (t >= e.expiresAt) delete d.invites[l]; // expired
  const ok = async (body) => (await save(v, d), OK(body));
  switch (path) {
    case "/share/key": {
      if (b.pub === undefined) return d.shareKey ? OK(d.shareKey) : NOT_FOUND;
      if (d.shareKey) return { status: 409, body: { error: "exists" } };
      if (!sealed(b.pub) || !sealed(b.sealedPriv)) return BAD;
      d.shareKey = { pub: b.pub, sealedPriv: b.sealedPriv };
      return ok();
    }
    case "/share/who": // proves the token, nothing else
      return OK();
    case "/share/guess":
      return guessing(v) ? { status: 429, body: { error: "slow down" } } : OK();
    case "/share/list":
      return ok({ invites: d.invites, pending: d.pending, viewers: d.viewers, canSee: d.canSee });
    case "/invite/create": {
      if (
        !LOOKUP_RE.test(b.lookup ?? "") ||
        !sealed(b.sealedMeta) ||
        !sealed(b.wrapped) ||
        !sealed(b.sealedS)
      )
        return BAD;
      if (count(d.invites) >= MAX_OPEN_INVITES) return FULL;
      d.invites[b.lookup] = {
        sealed: b.sealedMeta,
        expiresAt: t + INVITE_LIFE,
      };
      return ok({ expiresAt: t + INVITE_LIFE });
    }
    case "/invite/cancel": {
      if (!d.invites[b.lookup]) return NOT_FOUND;
      delete d.invites[b.lookup];
      for (const [j, p] of Object.entries(d.pending))
        if (p.lookup === b.lookup) delete d.pending[j];
      return ok();
    }
    case "/share/add": // add a viewer, or replace one's sealed meta (ticks changed); also how a joiner shares back
      if (!ID_RE.test(b.viewerId ?? "") || !sealed(b.sealedMeta)) return BAD;
      if (
        !d.viewers[b.viewerId] &&
        count(d.viewers) + count(d.pending) >= MAX_PEOPLE
      )
        return FULL;
      d.viewers[b.viewerId] = { sealed: b.sealedMeta };
      return ok();
    case "/share/cansee":
      if (!ID_RE.test(b.sharerId ?? "") || !sealed(b.sealed)) return BAD;
      if (!d.canSee[b.sharerId] && count(d.canSee) >= MAX_PEOPLE) return FULL;
      d.canSee[b.sharerId] = b.sealed;
      return ok();
    case "/share/allow": {
      const p = d.pending[b.joinerId];
      if (!p) return NOT_FOUND;
      if (!sealed(b.sealedMeta)) return BAD;
      d.viewers[b.joinerId] = { sealed: b.sealedMeta };
      delete d.pending[b.joinerId];
      delete d.invites[p.lookup];
      return ok({ lookup: p.lookup });
    }
    case "/share/decline": {
      const p = d.pending[b.joinerId];
      if (!p) return NOT_FOUND;
      delete d.pending[b.joinerId];
      delete d.invites[p.lookup];
      return ok({ lookup: p.lookup });
    }
    case "/share/remove": {
      delete d.viewers[b.viewerId];
      delete d.env[b.viewerId]; // from now on this person's get is a 404
      if (!count(d.viewers)) {
        for (const k of BLOBS) await v.s.delete(`blob:${k}`);
        d.env = {};
      }
      return ok();
    }
    case "/share/publish": {
      const blobs = b.blobs ?? {};
      const env = b.envelopes ?? {};
      if (
        typeof blobs !== "object" ||
        typeof env !== "object" ||
        !Object.keys(blobs).every((k) => BLOBS.includes(k))
      )
        return BAD;
      if (!Object.values(blobs).every(checkSize)) return BAD;
      for (const [id, e] of Object.entries(env)) {
        if (!d.viewers[id]) return BAD; // only people who were allowed
        if (!(e && e.v in blobs && sealed(e.env))) return BAD;
      }
      for (const k of BLOBS)
        k in blobs
          ? await v.s.put(`blob:${k}`, blobs[k])
          : await v.s.delete(`blob:${k}`);
      d.env = Object.fromEntries(
        Object.entries(env).map(([id, e]) => [id, { v: e.v, env: e.env }]),
      );
      d.sharedAt = t;
      return ok();
    }
    case "/share/leave": // viewer side: forget this person (shareRoute tells their Vault)
      delete d.canSee[b.sharerId];
      return ok();
    case "/in/pending": {
      if (count(d.viewers) + count(d.pending) >= MAX_PEOPLE) return FULL;
      d.pending[b.joinerId] = { sealedJ: b.sealedJ, lookup: b.lookup };
      return ok();
    }
    case "/in/dropviewer":
      delete d.viewers[b.viewerId];
      delete d.env[b.viewerId];
      return ok();
    case "/in/get": {
      const e = d.env[b.viewerId];
      const blob = e && (await v.s.get(`blob:${e.v}`));
      return blob ? OK({ blob, env: e.env, updatedAt: d.sharedAt }) : NOT_FOUND;
    }
  }
  return BAD;
}

// Routes that touch more than one object. ctx: { vault(id)(path, body), invite(lookup)(path, body) }.
// Each starts with a call to the caller's own Vault, which checks the token, so a stranger gets a 404.
export async function shareRoute(path, b, ctx) {
  if (path.startsWith("/invite/") && !LOOKUP_RE.test(b.lookup ?? "")) return BAD;
  // A call to the caller's own Vault: same token, other path (and fields, if given).
  const me = (p = path, extra) => ctx.vault(b.accountId)(p, extra ? { accountId: b.accountId, token: b.token, ...extra } : b);
  const inv = (p, body) =>
    ctx.invite(b.lookup)(p, { sharerId: b.accountId, ...body });
  switch (path) {
    case "/invite/create": {
      const r = await me();
      if (r.status !== 200) return r;
      const c = await inv("/create", {
        wrapped: b.wrapped,
        sealedS: b.sealedS,
      });
      if (c.status !== 200) await me("/invite/cancel", { lookup: b.lookup }); // lookup already taken: undo
      return c.status === 200 ? r : { status: 409, body: { error: "exists" } };
    }
    case "/invite/cancel": {
      const r = await me();
      if (r.status === 200) await inv("/delete", {});
      return r;
    }
    case "/invite/peek": {
      const r = await me("/share/guess", {});
      return r.status === 200 ? inv("/peek", {}) : r;
    }
    case "/invite/accept": {
      if (
        !LOOKUP_RE.test(b.lookup ?? "") ||
        !sealed(b.sealedJ) ||
        !sealed(b.sealedCanSee)
      )
        return BAD;
      const g = await me("/share/guess", {});
      if (g.status !== 200) return g;
      const c = await inv("/claim", { joinerId: b.accountId, sealedJ: b.sealedJ });
      if (c.status !== 200) return c;
      const sid = c.body.sharerId;
      let r = await me("/share/cansee", { sharerId: sid, sealed: b.sealedCanSee });
      if (r.status === 200) {
        r = await ctx.vault(sid)("/in/pending", { joinerId: b.accountId, sealedJ: b.sealedJ, lookup: b.lookup });
        if (r.status !== 200) await me("/share/leave", { sharerId: sid });
      }
      if (r.status !== 200) await inv("/unclaim", {});
      return r.status === 200 ? OK() : r;
    }
    case "/share/allow":
    case "/share/decline": {
      const r = await me();
      if (r.status === 200) await ctx.invite(r.body.lookup)("/delete", { sharerId: b.accountId }); // lookup comes from the pending record
      return r.status === 200 ? OK() : r;
    }
    case "/share/leave": {
      const r = await me();
      if (r.status === 200 && ID_RE.test(b.sharerId ?? ""))
        await ctx.vault(b.sharerId)("/in/dropviewer", {
          viewerId: b.accountId,
        });
      return r;
    }
    case "/share/get": {
      const r = await me("/share/who", {});
      return r.status === 200 && ID_RE.test(b.from ?? "")
        ? ctx.vault(b.from)("/in/get", { viewerId: b.accountId })
        : NOT_FOUND;
    }
    case "/account/delete": {
      const l = await me("/share/list", {});
      const r = await me();
      if (r.status === 200)
        for (const k of Object.keys(l.body.invites ?? {}))
          await ctx.invite(k)("/delete", { sharerId: b.accountId });
      return r;
    }
  }
  return me();
}

export const SHARE_PATHS = [
  "/share/key",
  "/share/list",
  "/share/add",
  "/share/cansee",
  "/share/allow",
  "/share/decline",
  "/share/remove",
  "/share/publish",
  "/share/leave",
  "/share/get",
  "/invite/create",
  "/invite/cancel",
  "/invite/peek",
  "/invite/accept",
];
export const SHARE_BODY_MAX = MAX_SYNC_BODY;
