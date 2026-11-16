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
