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
const NOT_FOUND = { status: 404, body: { error: "not found" } }; // same for "no account" and "wrong token"
const BAD = { status: 400, body: { error: "bad request" } };
const OK = (body = {}) => ({ status: 200, body });
const isWrap = (w) =>
  typeof w === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(w);

// storage: { get, put, deleteAll, setAlarm }. opts: { secret, origins, now? }.
export class VaultCore {
  constructor(storage, opts) {
    this.s = storage;
    this.o = opts;
    this.hits = []; // in-memory request times for the rate limit
  }
  now() {
    return this.o.now ? this.o.now() : Date.now();
  }

  limited() {
    const t = this.now();
    this.hits = this.hits.filter((x) => t - x < 60_000);
    return this.hits.push(t) > RATE;
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
    if (this.limited()) return { status: 429, body: { error: "slow down" } };
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
