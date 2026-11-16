import { DurableObject } from "cloudflare:workers";
import { ORIGINS, MAX_BODY, parseBody, vapidJwt, authHeader } from "./lib.js";

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
