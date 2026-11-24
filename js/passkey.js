// Thin wrapper around navigator.credentials. No server calls here; sync.js drives it.
import { b64u, unb64u, prfSalt } from "./synccrypto.js";
import { t } from "./i18n/index.js";

// [major, minor] of iOS/iPadOS from a user agent, or null for anything else.
export function iosVersion(ua) {
  const m = /(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)/.exec(ua ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}
// PRF on iOS only from 18.4 (earlier 18.x had data-loss bugs); elsewhere it is tried and checked.
export function prfAllowed(ua) {
  const v = iosVersion(ua);
  return !v || v[0] > 18 || (v[0] === 18 && v[1] >= 4);
}

export const supported = () =>
  typeof PublicKeyCredential !== "undefined" && !!navigator.credentials;
export const usePrf = () => prfAllowed(navigator.userAgent);

const prfOf = (cred) => {
  const r = cred.getClientExtensionResults?.().prf?.results?.first;
  return r ? new Uint8Array(r) : null;
};
const challengeBytes = (c) => new TextEncoder().encode(c);

// -> { credentialId, publicKey (DER SPKI), alg, clientDataJSON, prf }. Throws unless ES256.
export async function register({ challenge, accountId }) {
  const prf = usePrf()
    ? { prf: { eval: { first: await prfSalt() } } }
    : undefined;
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: challengeBytes(challenge),
      rp: { name: "Gym Tracker" },
      user: {
        id: unb64u(accountId),
        name: "Gym Tracker",
        displayName: "Gym Tracker",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      attestation: "none",
      extensions: prf,
    },
  });
  const alg = cred.response.getPublicKeyAlgorithm();
  if (alg !== -7)
    throw new Error(t("passkey.badType"));
  return {
    credentialId: b64u(cred.rawId),
    publicKey: b64u(cred.response.getPublicKey()),
    alg,
    clientDataJSON: b64u(cred.response.clientDataJSON),
    prf: prfOf(cred),
  };
}

// credentialId given: that passkey only (PRF re-read). Omitted: any passkey for this site (sign-in).
export async function assert({ challenge, credentialId }) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes(challenge),
      userVerification: "required",
      allowCredentials: credentialId
        ? [{ type: "public-key", id: unb64u(credentialId) }]
        : [],
      extensions: usePrf()
        ? { prf: { eval: { first: await prfSalt() } } }
        : undefined,
    },
  });
  const r = cred.response;
  return {
    credentialId: b64u(cred.rawId),
    userHandle: r.userHandle ? b64u(r.userHandle) : null,
    clientDataJSON: b64u(r.clientDataJSON),
    authenticatorData: b64u(r.authenticatorData),
    signature: b64u(r.signature),
    prf: prfOf(cred),
  };
}
