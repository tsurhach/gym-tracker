// One account's vault. Pure logic over a tiny storage interface so node tests can use a Map.
// It only ever holds sealed data: public keys, wrapped keys, token hashes and one encrypted blob.
import {
  ID_RE,
  b64u,
  unb64u,
  checkRegistration,
  checkSize,
  sha256b64u,
  verifyAssertion,
} from "./syncauth.js";

const MONTH = 30 * 24 * 3600 * 1000;
export const IDLE_DELETE = 36 * MONTH; // 36 months without the owner's devices
export const TOKEN_IDLE = 12 * MONTH;
const MAX_TOKENS = 20;
const RATE = 60; // requests per account per minute
const MEDIA_RATE = 300; // photos and sound go one file per request, so a first sync needs many
export const MEDIA_ITEM_MAX = 4 * 1024 * 1024; // sealed bytes per photo or sound
export const MEDIA_CAP = 25 * 1024 * 1024; // sealed bytes per account
const CHUNK = 1024 * 1024; // a Durable Object value holds 2 MB, so files are stored in 1 MB pieces
const NOT_FOUND = { status: 404, body: { error: "not found" } }; // same for "no account" and "wrong token"
const BAD = { status: 400, body: { error: "bad request" } };
const OK = (body = {}) => ({ status: 200, body });
const isWrap = (w) =>
  typeof w === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(w);

// storage: { get, put, delete, deleteAll, setAlarm }. opts: { secret, origins, now? }.
export class VaultCore {
  constructor(storage, opts) {
    this.s = storage;
    this.o = opts;
    this.hits = []; // in-memory request times for the rate limit
    this.mhits = [];
  }
  now() {
    return this.o.now ? this.o.now() : Date.now();
  }

  limited(media) {
    const t = this.now();
    const k = media ? "mhits" : "hits";
    this[k] = this[k].filter((x) => t - x < 60_000);
    return this[k].push(t) > (media ? MEDIA_RATE : RATE);
  }

  // The owner's devices touching the account resets the 36-month clock.
  async touch(acct) {
    acct.touchedAt = this.now();
    await this.s.put("acct", acct);
    await this.s.setAlarm(acct.touchedAt + IDLE_DELETE);
  }

  async issueToken(acct) {
    const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
    acct.tokens[await sha256b64u(token)] = this.now();
    const newest = Object.entries(acct.tokens)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOKENS);
    acct.tokens = Object.fromEntries(newest);
    return token;
  }

  // -> acct when the token is a live one for this account, else null.
  async authed(b) {
    const acct = await this.s.get("acct");
    if (!acct || typeof b.token !== "string" || b.token.length > 100)
      return null;
    const h = await sha256b64u(b.token);
    const last = acct.tokens[h];
    if (last === undefined || this.now() - last > TOKEN_IDLE) return null;
    acct.tokens[h] = this.now();
    return acct;
  }

  // One request at a time per account: the awaits inside would otherwise let two pushes both win a rev.
  handle(path, b) {
    const run = () => this.handleOne(path, b);
    this.q = (this.q ?? Promise.resolve()).then(run, run);
    return this.q;
  }

  async handleOne(path, b) {
    if (this.limited(path.startsWith("/media/"))) return { status: 429, body: { error: "slow down" } };
    if (path === "/auth/register") return this.register(b);
    if (path === "/auth/signin") return this.signin(b);
    const acct = await this.authed(b);
    if (!acct) return NOT_FOUND;
    switch (path) {
      case "/sync/pull": {
        await this.touch(acct);
        const blob = await this.s.get("blob");
        if (!blob || b.rev === acct.rev) return OK({ rev: acct.rev });
        return OK({ rev: acct.rev, blob });
      }
      case "/sync/push": {
        if (!checkSize(b.blob))
          return { status: 413, body: { error: "too big" } };
        if (b.rev !== acct.rev) return { status: 409, body: { rev: acct.rev } };
        acct.rev += 1;
        await this.s.put("blob", b.blob);
        await this.touch(acct);
        return OK({ rev: acct.rev });
      }
      case "/media/list":
      case "/media/put":
      case "/media/get":
      case "/media/delete":
        return this.media(path, b, acct);
      case "/account/rewrap": {
        for (const k of ["wrapCode", "wrapPrf"]) {
          if (b[k] === undefined) continue;
          if (!isWrap(b[k])) return BAD;
          acct[k] = b[k];
        }
        await this.touch(acct);
        return OK();
      }
      case "/account/signout":
        delete acct.tokens[await sha256b64u(b.token)];
        await this.s.put("acct", acct);
        return OK();
      case "/account/delete":
        await this.s.deleteAll();
        return OK();
    }
    return BAD;
  }

  // Photos and sound: sealed files under opaque random ids. The server sees ids and sizes only.
  // Index "mindex": { id: { size, n (chunks), used (last upload or download) } }.
  async dropMedia(idx, id) {
    for (let i = 0; i < (idx[id]?.n ?? 0); i++) await this.s.delete(`m:${id}:${i}`);
    delete idx[id];
  }

  async media(path, b, acct) {
    const idx = (await this.s.get("mindex")) ?? {};
    const total = () => Object.values(idx).reduce((n, e) => n + e.size, 0);
    const t = this.now();
    if (path === "/media/list") {
      // Cleanup, lazily on every list: a file nobody used for 36 months goes. A device that still has
      // the photo uploads it again (its reference points at a file the list no longer shows).
      const old = Object.keys(idx).filter((id) => t - idx[id].used >= IDLE_DELETE);
      for (const id of old) await this.dropMedia(idx, id);
      if (old.length) await this.s.put("mindex", idx);
      await this.touch(acct);
      return OK({ items: Object.fromEntries(Object.entries(idx).map(([id, e]) => [id, e.size])), total: total(), cap: MEDIA_CAP });
    }
    if (path === "/media/delete") {
      const ids = Array.isArray(b.ids) ? b.ids.filter((id) => ID_RE.test(id)).slice(0, 200) : [];
      for (const id of ids) await this.dropMedia(idx, id);
      await this.s.put("mindex", idx);
      return OK();
    }
    if (!ID_RE.test(b.id ?? "")) return BAD;
    if (path === "/media/get") {
      const e = idx[b.id];
      if (!e) return NOT_FOUND;
      const out = new Uint8Array(e.size);
      for (let i = 0, at = 0; i < e.n; i++) {
        const part = await this.s.get(`m:${b.id}:${i}`);
        if (!part) return NOT_FOUND;
        out.set(part, at);
        at += part.length;
      }
      e.used = t;
      await this.s.put("mindex", idx);
      return OK({ bytes: out });
    }
    // /media/put
    const f = b.bytes;
    if (!(f instanceof Uint8Array) || f.length < 29) return BAD;
    if (f.length > MEDIA_ITEM_MAX) return { status: 413, body: { error: "item" } };
    if (total() - (idx[b.id]?.size ?? 0) + f.length > MEDIA_CAP) return { status: 413, body: { error: "account" } };
    await this.dropMedia(idx, b.id);
    const n = Math.ceil(f.length / CHUNK);
    for (let i = 0; i < n; i++) await this.s.put(`m:${b.id}:${i}`, f.slice(i * CHUNK, (i + 1) * CHUNK));
    idx[b.id] = { size: f.length, n, used: t };
    await this.s.put("mindex", idx);
    await this.touch(acct);
    return OK();
  }

  async register(b) {
    if (await this.s.get("acct"))
      return { status: 409, body: { error: "exists" } };
    if (
      !ID_RE.test(b.accountId ?? "") ||
      !isWrap(b.wrapCode) ||
      (b.wrapPrf !== undefined && !isWrap(b.wrapPrf))
    )
      return BAD;
    if (typeof b.credentialId !== "string" || b.credentialId.length > 1400)
      return BAD;
    if (!(await checkRegistration(b, { ...this.o, now: this.now() })))
      return BAD;
    const acct = {
      credentials: { [b.credentialId]: b.publicKey },
      tokens: {},
      wrapCode: b.wrapCode,
      wrapPrf: b.wrapPrf ?? null,
      rev: 0,
      touchedAt: 0,
    };
    const token = await this.issueToken(acct);
    await this.touch(acct);
    return OK({ token });
  }

  async signin(b) {
    const acct = await this.s.get("acct");
    const spki = acct?.credentials[b.credentialId];
    if (
      !spki ||
      !(await verifyAssertion({ spki, ...b }, { ...this.o, now: this.now() }))
    )
      return NOT_FOUND;
    // Single use: a captured assertion cannot be replayed within its two minutes.
    let ch;
    try {
      ch = JSON.parse(new TextDecoder().decode(unb64u(b.clientDataJSON))).challenge;
    } catch {}
    const t = this.now();
    acct.used = Object.fromEntries(Object.entries(acct.used ?? {}).filter(([, e]) => e > t));
    if (typeof ch !== "string" || ch in acct.used) return NOT_FOUND;
    acct.used[ch] = t + 5 * 60 * 1000;
    const token = await this.issueToken(acct);
    await this.touch(acct);
    return OK({ token, wrapPrf: acct.wrapPrf, wrapCode: acct.wrapCode });
  }

  // Durable Object alarm: delete the account once it has been idle 36 months, else wait again.
  async alarm() {
    const acct = await this.s.get("acct");
    if (!acct) return;
    if (this.now() - acct.touchedAt >= IDLE_DELETE) await this.s.deleteAll();
    else await this.s.setAlarm(acct.touchedAt + IDLE_DELETE);
  }
}
