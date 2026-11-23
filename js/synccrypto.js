// WebCrypto only. The server never sees a key or plaintext: everything it stores is sealed here first.
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64u(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

// Recovery code: 128 random bits as 26 Crockford base32 characters, shown in groups of four.
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function makeRecoveryCode(bytes = randomBytes(16)) {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  bits = bits.padEnd(130, "0");
  let out = "";
  for (let i = 0; i < 130; i += 5) out += ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{1,4}/g).join("-");
}
// Accepts spaces, dashes, lower case, and the usual O/I/L look-alikes. Returns 16 bytes or null.
export function parseRecoveryCode(text) {
  const t = String(text).toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (t.length !== 26) return null;
  let bits = "";
  for (const c of t) {
    const i = ALPHA.indexOf(c);
    if (i < 0) return null;
    bits += i.toString(2).padStart(5, "0");
  }
  if (bits.slice(128) !== "00") return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

// The data key (AES-GCM 256) encrypts everything uploaded. Extractable only so it can be re-wrapped.
export const newDataKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

async function kek(secret, info) {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(info) },
    base,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}
// kind: "prf" (secret = 32-byte passkey PRF output) or "code" (secret = 16 recovery-code bytes).
export async function wrapDataKey(dataKey, secret, kind) {
  const w = await crypto.subtle.wrapKey("raw", dataKey, await kek(secret, `gym-tracker wrap ${kind}`), "AES-KW");
  return b64u(w);
}
// Throws when the secret is wrong.
export async function unwrapDataKey(wrapped, secret, kind) {
  return crypto.subtle.unwrapKey(
    "raw",
    unb64u(wrapped),
    await kek(secret, `gym-tracker wrap ${kind}`),
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

const AAD = enc.encode("gym-tracker data v1");
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
// object -> gzip -> AES-GCM -> base64url (iv || ciphertext)
export async function seal(dataKey, obj) {
  const iv = randomBytes(12);
  const zipped = await pipe(enc.encode(JSON.stringify(obj)), new CompressionStream("gzip"));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, dataKey, zipped));
  const all = new Uint8Array(12 + ct.length);
  all.set(iv);
  all.set(ct, 12);
  return b64u(all);
}
// Throws on a wrong key or any tampering.
export async function open(dataKey, blob) {
  const all = unb64u(blob);
  const zipped = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: AAD }, dataKey, all.slice(12)),
  );
  return JSON.parse(dec.decode(await pipe(zipped, new DecompressionStream("gzip"))));
}

export const PRF_SALT_TEXT = "gym-tracker sync prf v1";
export const prfSalt = async () => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(PRF_SALT_TEXT)));
