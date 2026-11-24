import { DurableObject } from "cloudflare:workers";
import { ORIGINS, MAX_BODY, parseBody, vapidJwt, authHeader } from "./lib.js";
import { ID_RE, MAX_SYNC_BODY, makeChallenge, parseMediaFrame, parseSyncBody } from "./syncauth.js";
import { MEDIA_ITEM_MAX, VaultCore } from "./vault.js";
import { InviteCore, SHARE_PATHS, shareRoute } from "./share.js";
import { CalendarCore, calRoute, calFeed } from "./calendar.js";

const SYNC_PATHS = new Set(["/auth/register", "/auth/signin", "/sync/pull", "/sync/push", "/account/rewrap", "/account/signout", "/account/delete", "/media/list", "/media/put", "/media/get", "/media/delete", ...SHARE_PATHS]);

// Per-IP limited: account creation, sign-in, pushes, and invite code entry (guessing).
const RL_PATHS = new Set(["/auth/challenge", "/auth/register", "/auth/signin", "/sync/push", "/invite/peek", "/invite/accept"]);

const json = (status, body, cors) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin");
    const cors = ORIGINS.includes(origin)
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
          vary: "origin",
        }
      : {};
    if (req.method === "OPTIONS")
      return new Response(null, { status: cors["access-control-allow-origin"] ? 204 : 403, headers: cors });
    const path = new URL(req.url).pathname;
    // Calendar feed. The URL holds the secret, so it is never logged; no CORS (calendar apps are not pages).
    if (req.method === "GET" && path.startsWith("/cal/")) return calFeed(req, env, path);
    if (req.method === "POST" && path.startsWith("/cal/")) return calRoute(req, env, path, cors);
    if (req.method === "POST" && (path === "/auth/challenge" || SYNC_PATHS.has(path)))
      return syncRoute(req, env, path, cors);
    if (req.method !== "POST" || (path !== "/schedule" && path !== "/cancel"))
      return json(400, { error: "bad request" }, cors);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY)
      return json(400, { error: "bad request" }, cors);
    const text = await req.text();
    const body = parseBody(text, { needAt: path === "/schedule" });
    if (!body) return json(400, { error: "bad request" }, cors);
    // One object per endpoint; the name is the endpoint itself (never logged).
    const stub = env.REST.get(env.REST.idFromName(body.endpoint));
    if (path === "/schedule") await stub.schedule(body.endpoint, body.at);
    else await stub.cancel();
    return json(200, { ok: true }, cors);
  },
};

// Sync routes. The server only passes sealed data along; it never sees a key or a workout.
async function syncRoute(req, env, path, cors) {
  const bad = () => json(400, { error: "bad request" }, cors);
  const put = path === "/media/put";
  if (Number(req.headers.get("content-length") ?? 0) > (put ? MEDIA_ITEM_MAX + 2000 : MAX_SYNC_BODY))
    return json(413, { error: "too big" }, cors);
  // Optional per-IP limit (see README). The IP is only a counter key; nothing is stored or logged.
  if (env.RL && RL_PATHS.has(path)) {
    const { success } = await env.RL.limit({ key: req.headers.get("cf-connecting-ip") ?? "x" });
    if (!success) return json(429, { error: "slow down" }, cors);
  }
  if (!env.CHALLENGE_KEY) return json(503, { error: "not set up" }, cors);
  if (path === "/auth/challenge") return json(200, { challenge: await makeChallenge(env.CHALLENGE_KEY) }, cors);
  const body = put ? parseMediaFrame(await req.arrayBuffer()) : parseSyncBody(await req.text());
  // At sign-in the account id is the passkey's userHandle.
  if (!body || !ID_RE.test(body.accountId ?? "")) return bad();
  const stub = env.VAULT.get(env.VAULT.idFromName(body.accountId));
  const r = SHARE_PATHS.includes(path) || path === "/account/delete" ? await shareRoute(path, body, shareCtx(env)) : await stub.run(path, body);
  if (r.body?.bytes) return new Response(r.body.bytes, { headers: { "content-type": "application/octet-stream", ...cors } });
  return json(r.status, r.body, cors);
}

// How the sharing code reaches other accounts' Vaults and the one-per-invite objects.
const shareCtx = (env) => ({
  vault: (id) => (p, b) => env.VAULT.get(env.VAULT.idFromName(id)).run(p, b),
  invite: (lookup) => (p, b) => env.INVITE.get(env.INVITE.idFromName(lookup)).run(p, b),
});

export class Invite extends DurableObject {
  core() {
    const s = this.ctx.storage;
    return new InviteCore({ get: (k) => s.get(k), put: (k, v) => s.put(k, v), delete: (k) => s.delete(k), deleteAll: () => s.deleteAll(), setAlarm: (t) => s.setAlarm(t) });
  }
  run(path, body) {
    return this.core().run(path, body);
  }
  alarm() {
    return this.core().alarm();
  }
}

export class Calendar extends DurableObject {
  core() {
    const s = this.ctx.storage;
    return new CalendarCore({ get: (k) => s.get(k), put: (k, v) => s.put(k, v), deleteAll: () => s.deleteAll(), setAlarm: (t) => s.setAlarm(t), deleteAlarm: () => s.deleteAlarm() });
  }
  run(path, body) {
    return this.core().run(path, body);
  }
  alarm() {
    return this.core().alarm();
  }
}

export class Vault extends DurableObject {
  core() {
    const s = this.ctx.storage;
    return new VaultCore(
      { get: (k) => s.get(k), put: (k, v) => s.put(k, v), delete: (k) => s.delete(k), deleteAll: () => s.deleteAll(), setAlarm: (t) => s.setAlarm(t) },
      { secret: this.env.CHALLENGE_KEY, origins: ORIGINS },
    );
  }
  run(path, body) {
    this.rate ??= this.core(); // one core per instance, so its rate counter lives as long as the object does
    return this.rate.handle(path, body);
  }
  alarm() {
    return this.core().alarm();
  }
}

export class Rest extends DurableObject {
  async schedule(endpoint, at) {
    await this.ctx.storage.put("endpoint", endpoint);
    await this.ctx.storage.setAlarm(at);
  }

  async cancel() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm() {
    const endpoint = await this.ctx.storage.get("endpoint");
    await this.ctx.storage.deleteAll();
    if (!endpoint) return;
    try {
      const jwt = await vapidJwt(endpoint, JSON.parse(this.env.VAPID_PRIVATE_JWK));
      // No payload, so nothing to encrypt. 404/410 (subscription gone) and other failures are ignored.
      await fetch(endpoint, {
        method: "POST",
        headers: {
          TTL: "60",
          Urgency: "high",
          Authorization: authHeader(jwt, this.env.VAPID_PUBLIC_KEY),
        },
      });
    } catch {} // a missed alert is not worth retrying: the rest is over by then
  }
}
