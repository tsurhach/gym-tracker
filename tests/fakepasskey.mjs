// Test helpers: a fake authenticator (ES256 passkeys like a phone makes them) and an in-memory server.
import { makeChallenge } from "../server/src/syncauth.js";
import { VaultCore } from "../server/src/vault.js";
import { b64u } from "../js/synccrypto.js";

export const ORIGIN = "https://tsurhach.github.io";
export const SECRET = "test-secret";
const utf8 = (s) => new TextEncoder().encode(s);
const sha = async (b) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", b));

export function rawToDer(raw) {
  const int = (b) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    b = b.slice(i);
    if (b[0] & 0x80) b = Uint8Array.from([0, ...b]);
    return [0x02, b.length, ...b];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return Uint8Array.from([0x30, body.length, ...body]);
}

// One authenticator shared by all "devices" (the iCloud keychain). prf: 32 bytes, or null for no PRF.
export function authenticator() {
  const creds = new Map();
  return {
    creds,
    device({ prf = null, origin = ORIGIN } = {}) {
      return {
        usePrf: () => prf !== null,
        async register({ challenge, accountId }) {
          const kp = await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign", "verify"],
          );
          const id = b64u(crypto.getRandomValues(new Uint8Array(16)));
          creds.set(id, { key: kp.privateKey, accountId });
          const cdj = {
            type: "webauthn.create",
            challenge: b64u(utf8(challenge)),
            origin,
          };
          return {
            credentialId: id,
            publicKey: b64u(
              await crypto.subtle.exportKey("spki", kp.publicKey),
            ),
            alg: -7,
            clientDataJSON: b64u(utf8(JSON.stringify(cdj))),
            prf: null,
          };
        },
        async assert({ challenge, credentialId }) {
          const id = credentialId ?? [...creds.keys()][0];
          const c = creds.get(id);
          const cdj = utf8(
            JSON.stringify({
              type: "webauthn.get",
              challenge: b64u(utf8(challenge)),
              origin,
            }),
          );
          const ad = new Uint8Array(37);
          ad.set(await sha(utf8(new URL(origin).hostname)));
          ad[32] = 0x05;
          const signed = new Uint8Array([...ad, ...(await sha(cdj))]);
          const raw = new Uint8Array(
            await crypto.subtle.sign(
              { name: "ECDSA", hash: "SHA-256" },
              c.key,
              signed,
            ),
          );
          return {
            credentialId: id,
            userHandle: c.accountId,
            clientDataJSON: b64u(cdj),
            authenticatorData: b64u(ad),
            signature: b64u(rawToDer(raw)),
            prf,
          };
        },
      };
    },
  };
}

export function memStorage() {
  const m = new Map();
  return {
    m,
    alarm: null,
    get: async (k) => structuredClone(m.get(k)),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    deleteAll: async () => m.clear(),
    async setAlarm(t) {
      this.alarm = t;
    },
  };
}

// In-memory server with the real VaultCore; also a fetch() the client can use.
export function memServer({ now = () => Date.now() } = {}) {
  const vaults = new Map();
  const seen = []; // every request body, to check the server only ever sees sealed data
  const core = (id) => {
    if (!vaults.has(id)) {
      const st = memStorage();
      vaults.set(id, {
        st,
        core: new VaultCore(st, { secret: SECRET, origins: [ORIGIN], now }),
      });
    }
    return vaults.get(id);
  };
  async function fetchFn(url, { body }) {
    seen.push(body);
    const path = new URL(url).pathname;
    let r;
    if (path === "/auth/challenge")
      r = {
        status: 200,
        body: { challenge: await makeChallenge(SECRET, now()) },
      };
    else {
      const b = JSON.parse(body);
      r = await core(b.accountId).core.handle(path, b);
    }
    return { status: r.status, json: async () => r.body };
  }
  return { vaults, core, seen, fetch: fetchFn };
}
