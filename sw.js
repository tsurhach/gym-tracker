// Caches static files only. Never touches localStorage or user data.
// VERSION is stamped by `npm run stamp` (content hash of the precached files); a release is a new VERSION.
const VERSION = "7ab4c259fa71";
const SHELL = `gym-tracker-shell-${VERSION}`;
const IMAGES = "gym-tracker-img-v1"; // photos never change per id, so not tied to VERSION

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
  "./js/media.js",
  "./js/picker.js",
  "./js/proposal.js",
  "./js/push.js",
  "./js/rest.js",
  "./js/session.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/weight.js",
  "./js/update.js",
  "./js/screens/exercise.js",
  "./js/screens/history.js",
  "./js/screens/muscles.js",
  "./js/screens/plan.js",
  "./js/screens/setup.js",
  "./js/screens/today.js",
  "./js/screens/weight.js",
  "./js/screens/workout.js",
];

const IMAGE_BATCH = 6;

// The whole shell is cached atomically; if any file fails, install fails and the old worker stays in charge.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))),
      )
      // A new version takes over on its own; the page reloads itself on controllerchange.
      .then(() => self.skipWaiting()),
  );
});

// Only touch our own old shell caches; the origin may be shared with other apps.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("gym-tracker-shell-") && k !== SHELL)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function imageFirst(event) {
  const cache = await caches.open(IMAGES);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const res = await fetch(event.request);
  if (res.ok)
    event.waitUntil(cache.put(event.request, res.clone()).catch(() => {}));
  return res;
}

// One version of every file: serve the shell from the cache, never mix with the network.
async function shellFirst(event) {
  const { request } = event;
  const shell = await caches.open(SHELL);
  const cached = await shell.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch (err) {
    if (request.mode === "navigate") {
      const index = await shell.match("./index.html");
      if (index) return index;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (/\/img\/ex\//.test(url.pathname)) event.respondWith(imageFirst(event));
  else if (
    request.mode === "navigate" ||
    /\.(html|css|js|json|webmanifest)$|\/icons\//.test(url.pathname)
  )
    event.respondWith(shellFirst(event));
});

// The server sends an empty push when a rest ends and the app is not open.
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Rest over", {
      body: "Time for your next set.",
      tag: "rest",
      renotify: true,
      icon: "./icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((all) => (all[0] ? all[0].focus() : self.clients.openWindow("./"))),
  );
});

// The page sends one message once the worker is active: fetch every exercise photo.
self.addEventListener("message", (event) => {
  event.waitUntil(cacheExerciseImages().catch(() => {}));
});

async function cacheExerciseImages() {
  const cache = await caches.open(IMAGES);
  const shell = await caches.open(SHELL);
  const res =
    (await shell.match("./data/exercises.json")) ||
    (await fetch("./data/exercises.json"));
  const library = await res.json();
  const urls = library
    .filter((e) => e.images === 2)
    .flatMap((e) => [`./img/ex/${e.id}/0.jpg`, `./img/ex/${e.id}/1.jpg`]);
  for (let i = 0; i < urls.length; i += IMAGE_BATCH) {
    await Promise.all(
      urls.slice(i, i + IMAGE_BATCH).map(async (u) => {
        try {
          if (await cache.match(u)) return;
          const r = await fetch(u);
          if (r.ok) await cache.put(u, r);
        } catch {
          // ignore individual failures
        }
      }),
    );
  }
}
