import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { precacheList, computeVersion } from "../tools/stamp-sw.mjs";

const root = new URL("../", import.meta.url);
const sw = readFileSync(new URL("sw.js", root), "utf8");
const listed = precacheList(sw);

function jsFiles(dir) {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? jsFiles(`${dir}${e.name}/`)
      : e.name.endsWith(".js")
        ? [`./${dir}${e.name}`]
        : [],
  );
}

test("every precached file exists", () => {
  for (const u of listed) {
    assert.ok(existsSync(new URL(u === "./" ? "index.html" : u, root)), u);
  }
});

test("every js file is precached", () => {
  for (const f of jsFiles("js/")) assert.ok(listed.includes(f), `missing ${f}`);
});

test("every static file the page loads is precached", () => {
  for (const f of [
    "./index.html",
    "./styles.css",
    "./manifest.webmanifest",
    "./data/exercises.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png",
  ])
    assert.ok(listed.includes(f), `missing ${f}`);
});

test("sw.js VERSION matches the precached files", () => {
  const version = sw.match(/const VERSION = "([^"]*)";/)[1];
  assert.equal(
    version,
    computeVersion(sw),
    "sw.js VERSION is stale: run `npm run stamp` and commit sw.js",
  );
});

// --- behaviour, run against sw.js in a vm with in-memory caches and no network ---
function boot({ failOn } = {}) {
  const stores = new Map();
  const net = [];
  let offline = false;
  const keyOf = (r, search = true) => {
    const u = new URL(typeof r === "string" ? r : r.url, "http://x.test/app/");
    return search ? u.href : u.origin + u.pathname;
  };
  const makeCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      addAll: async (reqs) => {
        for (const r of reqs) {
          if (failOn && keyOf(r).endsWith(failOn)) throw new TypeError("fail");
        }
        for (const r of reqs) m.set(keyOf(r), new Response("body of " + keyOf(r)));
      },
      put: async (r, res) => void m.set(keyOf(r), res),
      match: async (r, o) => {
        const k = keyOf(r, !o?.ignoreSearch);
        for (const [mk, v] of m) if (o?.ignoreSearch ? mk.split("?")[0] === k : mk === k) return v.clone();
      },
    };
  };
  const listeners = {};
  const ctx = {
    self: {
      addEventListener: (t, f) => (listeners[t] = f),
      clients: { claim: async () => {} },
    },
    location: { origin: "http://x.test" },
    caches: {
      open: async (n) => makeCache(n),
      keys: async () => [...stores.keys()],
      delete: async (n) => stores.delete(n),
    },
    fetch: async (r) => {
      net.push(keyOf(r));
      if (offline) throw new TypeError("offline");
      return new Response("net " + keyOf(r));
    },
    Request: class { constructor(url, init) { this.url = new URL(url, "http://x.test/app/").href; this.init = init; } },
    Response, URL, Promise, JSON, Array, Error, TypeError, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(sw, ctx);
  const fire = async (type, ev = {}) => {
    const waits = [];
    let response;
    await listeners[type]({ ...ev, waitUntil: (p) => waits.push(p), respondWith: (p) => (response = p) });
    await Promise.all(waits);
    return response && (await response);
  };
  return { stores, net, fire, listeners, setOffline: (v) => (offline = v) };
}
const VERSION = sw.match(/const VERSION = "([^"]*)";/)[1];
const req = (path, mode = "no-cors", method = "GET") => ({ url: "http://x.test/app/" + path, method, mode });

test("install caches every PRECACHE url into the versioned shell cache", async () => {
  const w = boot();
  await w.fire("install");
  assert.equal(w.stores.get(`gym-tracker-shell-${VERSION}`).size, new Set(listed.map((u) => new URL(u, "http://x.test/app/").href)).size);
});

test("install fails if any precached file fails", async () => {
  const w = boot({ failOn: "/js/store.js" });
  await assert.rejects(w.fire("install"));
});

test("activate deletes only old gym-tracker shell caches", async () => {
  const w = boot();
  for (const n of ["gym-tracker-shell-old", "gym-tracker-img-v1", "other-app-v1", `gym-tracker-shell-${VERSION}`])
    w.stores.set(n, new Map());
  await w.fire("activate");
  assert.deepEqual([...w.stores.keys()].sort(), ["gym-tracker-img-v1", `gym-tracker-shell-${VERSION}`, "other-app-v1"].sort());
});

test("shell requests come from the cache without touching the network", async () => {
  const w = boot();
  await w.fire("install");
  const res = await w.fire("fetch", { request: req("js/app.js") });
  assert.match(await res.text(), /js\/app\.js/);
  const nav = await w.fire("fetch", { request: req("?sw=1", "navigate") });
  assert.ok(nav);
  assert.deepEqual(w.net, []);
});

test("offline navigation falls back to index.html; cross-origin and POST pass through", async () => {
  const w = boot();
  await w.fire("install");
  w.setOffline(true);
  const res = await w.fire("fetch", { request: req("somewhere", "navigate") });
  assert.match(await res.text(), /index\.html/);
  assert.equal(await w.fire("fetch", { request: { url: "https://other.test/a.js", method: "GET", mode: "cors" } }), undefined);
  assert.equal(await w.fire("fetch", { request: req("js/app.js", "cors", "POST") }), undefined);
});

test("images are cached on first fetch in the unversioned image cache", async () => {
  const w = boot();
  await w.fire("fetch", { request: req("img/ex/a/0.jpg") });
  assert.ok(w.stores.get("gym-tracker-img-v1").size === 1);
  await w.fire("fetch", { request: req("img/ex/a/0.jpg") });
  assert.equal(w.net.length, 1);
});

test("a new worker never skips waiting", () => {
  assert.ok(!sw.includes("skipWaiting"));
});

test("icons come from the versioned shell cache, not the image cache", async () => {
  const w = boot();
  await w.fire("install");
  const res = await w.fire("fetch", { request: req("icons/icon-192.png") });
  assert.match(await res.text(), /icons\/icon-192\.png/);
  assert.deepEqual(w.net, []);
  assert.equal(w.stores.has("gym-tracker-img-v1"), false);
});
