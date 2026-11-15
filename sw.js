// Caches static files only. Never touches localStorage or user data.
const CACHE = "gym-tracker-v1";

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./data/exercises.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./js/app.js",
  "./js/constants.js",
  "./js/logic.js",
  "./js/picker.js",
  "./js/proposal.js",
  "./js/session.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/screens/exercise.js",
  "./js/screens/history.js",
  "./js/screens/muscles.js",
  "./js/screens/plan.js",
  "./js/screens/setup.js",
  "./js/screens/today.js",
  "./js/screens/workout.js",
];

const NETWORK_TIMEOUT_MS = 3000;
const IMAGE_BATCH = 6;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function store(request, response) {
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

// Shell files: network first (so updates arrive), cache when offline or slow.
async function networkFirst(request) {
  try {
    return await store(
      request,
      await fetch(request, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) }),
    );
  } catch {
    const cached =
      (await caches.match(request)) ||
      (request.mode === "navigate" ? await caches.match("./index.html") : null);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || store(request, await fetch(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  const isImage = /\/(img\/ex|icons)\//.test(url.pathname);
  const isShell =
    request.mode === "navigate" ||
    /\.(html|css|js|json|webmanifest)$/.test(url.pathname);
  if (isImage) event.respondWith(cacheFirst(request));
  else if (isShell) event.respondWith(networkFirst(request));
});

// The page sends one message once the worker is active: fetch every exercise photo.
self.addEventListener("message", (event) => {
  event.waitUntil(cacheExerciseImages());
});

async function cacheExerciseImages() {
  const cache = await caches.open(CACHE);
  const library = await (await fetch("./data/exercises.json")).json();
  const urls = library
    .filter((e) => e.images === 2)
    .flatMap((e) => [`./img/ex/${e.id}/0.jpg`, `./img/ex/${e.id}/1.jpg`]);
  for (let i = 0; i < urls.length; i += IMAGE_BATCH) {
    await Promise.all(
      urls.slice(i, i + IMAGE_BATCH).map(async (u) => {
        try {
          if (await cache.match(u)) return;
          const res = await fetch(u);
          if (res.ok) await cache.put(u, res);
        } catch {
          // ignore individual failures
        }
      }),
    );
  }
}
