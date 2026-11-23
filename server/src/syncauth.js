// Sync: passkey checks, challenges and body checks. Pure; WebCrypto only; no Cloudflare APIs.

export const CHALLENGE_TTL = 2 * 60 * 1000;
export const MAX_SYNC_BODY = 2_100_000; // JSON text; the blob inside is capped lower
export const MAX_BLOB = 1_900_000; // base64url characters (~1.4 MB sealed); a Durable Object row holds 2 MB
export const ID_RE = /^[A-Za-z0-9_-]{22}$/; // 16 random bytes, base64url

export const b64u = (bytes) => {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s) => {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "=".repeat((4 - (t.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
};
const utf8 = (s) => new TextEncoder().encode(s);
export const sha256 = async (bytes) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
export const sha256b64u = async (text) => b64u(await sha256(utf8(text)));

const hmacKey = (secret) =>
  crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

// Stateless challenge "time.random.mac": nothing stored, valid for two minutes.
export async function makeChallenge(secret, now = Date.now()) {
  const head = `${now.toString(36)}.${b64u(crypto.getRandomValues(new Uint8Array(16)))}`;
  const mac = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    utf8(head),
  );
  return `${head}.${b64u(mac)}`;
}
export async function checkChallenge(secret, challenge, now = Date.now()) {
  const parts = typeof challenge === "string" ? challenge.split(".") : [];
  if (parts.length !== 3 || challenge.length > 200) return false;
  const [t, rnd, mac] = parts;
  const at = parseInt(t, 36);
  if (!Number.isFinite(at) || now - at > CHALLENGE_TTL || at - now > 5000)
    return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      unb64u(mac),
      utf8(`${t}.${rnd}`),
    );
  } catch {
    return false;
  }
}

// ASN.1 DER ECDSA signature -> raw r||s (64 bytes), which is what WebCrypto verifies. Throws if malformed.
export function derToRaw(der) {
  const d = der instanceof Uint8Array ? der : new Uint8Array(der);
  let i = 0;
  const need = (c) => {
    if (d[i++] !== c) throw new Error("bad der");
  };
  const len = () => {
    const b = d[i++];
    if (b < 0x80) return b;
    if (b !== 0x81) throw new Error("bad der");
    return d[i++];
  };
  need(0x30);
  if (len() !== d.length - i) throw new Error("bad der");
  const out = new Uint8Array(64);
  for (const o of [0, 32]) {
    need(0x02);
    let n = len();
    if (n < 1 || i + n > d.length) throw new Error("bad der");
    while (n > 32 && d[i] === 0) {
      i++;
      n--; // strip the sign padding
    }
    if (n > 32) throw new Error("bad der");
    out.set(d.subarray(i, i + n), o + 32 - n);
    i += n;
  }
  if (i !== d.length) throw new Error("bad der");
  return out;
}

// clientDataJSON checks shared by registration and sign-in. -> parsed object or null.
export async function checkClientData(b64, type, { secret, origins, now }) {
  let cd;
  try {
    cd = JSON.parse(new TextDecoder().decode(unb64u(b64)));
  } catch {
    return null;
  }
  if (
    !cd ||
    cd.type !== type ||
    !origins.includes(cd.origin) ||
    cd.crossOrigin === true
  )
    return null;
  let challenge;
  try {
    challenge = new TextDecoder().decode(unb64u(cd.challenge));
  } catch {
    return null;
  }
  return (await checkChallenge(secret, challenge, now)) ? cd : null;
}

// ES256 passkey sign-in: type, our own challenge, origin, rpId hash, user present + verified, signature.
// spki: base64url DER SubjectPublicKeyInfo stored at registration. -> true/false, never throws.
export async function verifyAssertion(
  { spki, clientDataJSON, authenticatorData, signature },
  { secret, origins, now = Date.now() },
) {
  try {
    const cd = await checkClientData(clientDataJSON, "webauthn.get", {
      secret,
      origins,
      now,
    });
    if (!cd) return false;
    const ad = unb64u(authenticatorData);
    if (ad.length < 37) return false;
    const rpHash = await sha256(utf8(new URL(cd.origin).hostname));
    if (!rpHash.every((b, i) => b === ad[i])) return false;
    if ((ad[32] & 0x05) !== 0x05) return false; // user present (1) and user verified (4)
    const signed = new Uint8Array(ad.length + 32);
    signed.set(ad);
    signed.set(await sha256(unb64u(clientDataJSON)), ad.length);
    const key = await crypto.subtle.importKey(
      "spki",
      unb64u(spki),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      derToRaw(unb64u(signature)),
      signed,
    );
  } catch {
    return false;
  }
}

// Registration: the browser's own getPublicKey() (ES256 only), checked to be a real P-256 key.
export async function checkRegistration(
  b,
  { secret, origins, now = Date.now() },
) {
  try {
    if (b.alg !== -7) return false;
    if (
      !(await checkClientData(b.clientDataJSON, "webauthn.create", {
        secret,
        origins,
        now,
      }))
    )
      return false;
    await crypto.subtle.importKey(
      "spki",
      unb64u(b.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return true;
  } catch {
    return false;
  }
}

// Request text -> object, or null when too big or not a JSON object.
export function parseSyncBody(text, max = MAX_SYNC_BODY) {
  if (typeof text !== "string" || text.length > max) return null;
  try {
    const b = JSON.parse(text);
    return b !== null && typeof b === "object" && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}
// Binary media upload body: 4-byte big-endian header length, header JSON { accountId, token, id }, then the
// sealed file. Sent as text/plain, so the browser needs no preflight. -> { ...header, bytes } or null.
export function parseMediaFrame(buf) {
  const u = new Uint8Array(buf);
  if (u.length < 5) return null;
  const n = new DataView(u.buffer, u.byteOffset).getUint32(0);
  if (n < 2 || n > 1000 || 4 + n > u.length) return null;
  const h = parseSyncBody(new TextDecoder().decode(u.subarray(4, 4 + n)), 1000);
  return h && { ...h, bytes: u.slice(4 + n) };
}

export const checkSize = (blob) =>
  typeof blob === "string" &&
  blob.length > 0 &&
  blob.length <= MAX_BLOB &&
  /^[A-Za-z0-9_-]+$/.test(blob);
