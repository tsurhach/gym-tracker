// Pure parts of the rest-notify Worker: request validation and the VAPID JWT. No Cloudflare APIs here.

export const ORIGINS = [
  "https://tsurhach.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
export const SUBJECT = "https://tsurhach.github.io/gym-tracker/";
export const MAX_BODY = 2048; // bytes; a real body is ~300
const MAX_AHEAD = 2 * 60 * 60 * 1000;
const MAX_PAST = 60 * 1000;

const PUSH_HOSTS = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

// Parsed endpoint URL if it is an https push-service URL, else null.
export function pushUrl(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return null;
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return null;
  return PUSH_HOSTS.some((re) => re.test(u.hostname)) ? u : null;
}

// Body text -> { endpoint, at? } or null. `at` is required for schedule.
export function parseBody(text, { needAt, now = Date.now() }) {
  if (text.length > MAX_BODY) return null;
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return null;
  }
  if (b === null || typeof b !== "object" || Array.isArray(b)) return null;
  const u = pushUrl(b.endpoint);
  if (!u) return null;
  if (!needAt) return { endpoint: u.href };
  if (typeof b.at !== "number" || !Number.isFinite(b.at)) return null;
  if (b.at > now + MAX_AHEAD || b.at < now - MAX_PAST) return null;
  return { endpoint: u.href, at: Math.max(b.at, now) };
}

const b64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));

// ES256 JWT for one push service origin. privateJwk: the private key as a JWK object.
export async function vapidJwt(endpoint, privateJwk, now = Date.now()) {
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const head = enc({ typ: "JWT", alg: "ES256" });
  const claims = enc({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: SUBJECT,
  });
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${head}.${claims}`),
  );
  return `${head}.${claims}.${b64u(sig)}`; // WebCrypto gives raw r||s, which is what JWS wants
}

export const authHeader = (jwt, publicKey) => `vapid t=${jwt}, k=${publicKey}`;
