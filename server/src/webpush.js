// Web Push for the Worker: RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID header. WebCrypto only, no dependency.
import { vapidJwt, authHeader } from "./lib.js";

const te = new TextEncoder();
export const fromB64u = (s) =>
  Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export const toB64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const cat = (...a) => {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of a) {
    o.set(x, p);
    p += x.length;
  }
  return o;
};
const hkdf = async (salt, ikm, info, bytes) =>
  new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]),
      bytes * 8,
    ),
  );

// plaintext: Uint8Array. uaPublic: 65-byte receiver key. authSecret: 16 bytes.
// asKeys / salt only for the RFC test vector: { privateKey, publicRaw } and 16 bytes.
export async function encryptPayload(
  plaintext,
  uaPublic,
  authSecret,
  { asKeys, salt = crypto.getRandomValues(new Uint8Array(16)) } = {},
) {
  let priv, asPublic;
  if (asKeys) ({ privateKey: priv, publicRaw: asPublic } = asKeys);
  else {
    const kp = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    priv = kp.privateKey;
    asPublic = new Uint8Array(
      await crypto.subtle.exportKey("raw", kp.publicKey),
    );
  }
  const ua = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, priv, 256),
  );
  const prk = await hkdf(
    authSecret,
    secret,
    cat(te.encode("WebPush: info\0"), uaPublic, asPublic),
    32,
  );
  const cek = await hkdf(
    salt,
    prk,
    te.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    prk,
    te.encode("Content-Encoding: nonce\0"),
    12,
  );
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  const body = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      cat(plaintext, Uint8Array.of(2)),
    ),
  );
  // header: salt(16) | record size 4096 (4 bytes, big endian) | key id length (1) | key id = sender public key
  return cat(
    salt,
    Uint8Array.of(0, 0, 0x10, 0),
    Uint8Array.of(asPublic.length),
    asPublic,
    body,
  );
}

// Sends one message. sub = { endpoint, keys: { p256dh, auth } }. Returns the push service's HTTP status, or 0 when it could not be reached.
export async function sendPush(
  sub,
  text,
  { privateJwk, publicKey, ttl = 60, fetchFn = fetch },
) {
  try {
    const body = await encryptPayload(
      te.encode(text),
      fromB64u(sub.keys.p256dh),
      fromB64u(sub.keys.auth),
    );
    const jwt = await vapidJwt(sub.endpoint, privateJwk);
    const r = await fetchFn(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: String(ttl),
        Urgency: "high",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: authHeader(jwt, publicKey),
      },
      body,
    });
    return r.status;
  } catch {
    return 0;
  }
}
