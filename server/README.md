# Rest-over push server

A Cloudflare Worker plus one Durable Object class. When the app starts a rest it tells this server the time; at that time the server sends a Web Push with no payload and the service worker shows "Rest over". The app cancels it when it is open, skipped or finished.

- `POST /schedule` `{ endpoint, at }` and `POST /cancel` `{ endpoint }`. CORS only for the GitHub Pages origin and localhost:5173.
- Stored: the anonymous push endpoint URL and the time. Deleted when the push is sent or cancelled. Nothing is logged.
- The private signing key is the Worker secret `VAPID_PRIVATE_JWK`; the public key is `VAPID_PUBLIC_KEY` in `wrangler.jsonc` and `js/push.js`.

## Redeploy
```
cd server
npm install
npx wrangler deploy
```

## Rotate the keys
Existing subscriptions are tied to the old public key, so everyone has to untick and re-tick "Notify me when rest is over" afterwards.
1. Generate a P-256 pair with Node `crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })`. The public key is `04 || x || y` from the private JWK, base64url.
2. `npx wrangler secret put VAPID_PRIVATE_JWK` and paste the private JWK as one line of JSON.
3. Put the public key in `wrangler.jsonc` and `js/push.js`, then `npx wrangler deploy`, `npm run stamp` and ship the app.

## Sync (accounts and encrypted data)

The same Worker also serves sync: `POST /auth/challenge|register|signin`, `/sync/pull|push`, `/account/rewrap|signout|delete`. A second Durable Object class, `Vault`, holds one account each: the passkey public key, wrapped (locked) copies of the data key, hashes of session tokens and one encrypted blob. It never sees a key, a name or a workout. Code: `src/syncauth.js` (passkey and challenge checks), `src/vault.js` (account logic, tested with an in-memory store), routes in `src/index.js`. The app side stays hidden until `SYNC_ENABLED` is set to `true` in `js/sync.js`.

### Deploy (owner steps, in order)
1. `cd server` then `npm install` (once; already done if you deployed the rest server).
2. Make the challenge secret and store it: run `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, copy the line, then `npx wrangler secret put CHALLENGE_KEY` and paste it. (Without it every sync route answers 503 "not set up".)
3. `npx wrangler deploy`. This adds the `Vault` class (migration `v2`). The existing rest server is unchanged.
4. In the app repo set `SYNC_ENABLED = true` in `js/sync.js`, run `npm run stamp`, commit, push.
5. On the iPhone: Plan, Settings, Sync and sign-in, Turn on sync. Save the recovery code.

No new account is needed: this uses the same Cloudflare account and Worker as the rest server. Free plan only; over a limit requests fail, nothing is billed.

### Per-IP limit
`wrangler.jsonc` now declares a Rate Limiting binding `RL` (20 per 60 s per IP on challenge, register, sign-in and push). Each account also allows 60 requests a minute. If `npx wrangler deploy` refuses the `ratelimits` entry on your plan, delete that one line from `wrangler.jsonc` and deploy again (the code skips the check when `RL` is absent), and tell me so a daily registration cap can be added instead.

### Local checks
`npm test` in the app root runs the server logic against an in-memory store (`tests/server-sync.test.mjs`, `tests/sync-flow.test.mjs`). Nothing here needs an account.
