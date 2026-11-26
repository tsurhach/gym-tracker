// Makes a new VAPID key pair for the rest-alert server. Run: node tools/gen-vapid.mjs
// Public key -> server/wrangler.jsonc (VAPID_PUBLIC_KEY) and js/push.js. Private JWK -> `npx wrangler secret put VAPID_PRIVATE_JWK`.
// Never commit the private line. The key pair already deployed works as is; only run this to rotate (everyone must then re-enable the alert).
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
console.log("PUBLIC (safe to commit):\n" + pub + "\n");
console.log("PRIVATE (secret, paste into wrangler, never commit):\n" + JSON.stringify(jwk));
