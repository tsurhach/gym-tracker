// "Rest over" push: tells a tiny server when to wake the phone, since iOS freezes the page in the background.
// Every call here is best effort: nothing throws, nothing waits, nothing redraws.

export const SERVER = "https://gym-tracker-rest.gym-tracker-rest.workers.dev";
export const VAPID_PUBLIC_KEY =
  "BHKtgaMJrKosNvPeNtGIjG0KJH4VY6GGk2FNsf3bXmNxit1luCZpmY4fGOag-JWkdr2JFioQeeBpvD_xpCHUcwc";

// Needs the installed app (iOS only offers PushManager there) with a working service worker.
export const supported = () =>
  "serviceWorker" in navigator &&
  !!navigator.serviceWorker.controller &&
  "PushManager" in window &&
  "Notification" in window;

const key = () => {
  const s = atob(VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

// Call straight from a tap: iOS only shows the permission prompt then, so no await before it.
export async function enable() {
  try {
    if (!supported() || (await Notification.requestPermission()) !== "granted")
      return false;
    const reg = await navigator.serviceWorker.ready;
    await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key(),
    });
    return true;
  } catch {
    return false;
  }
}

const post = (path, sub, extra) =>
  fetch(SERVER + path, {
    method: "POST",
    keepalive: true,
    // text/plain keeps this a simple request (no preflight); the server reads the body as JSON.
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ endpoint: sub.endpoint, ...extra }),
  });

const send = (path, extra) => {
  try {
    if (!supported() || Notification.permission !== "granted" || navigator.onLine === false) return;
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((sub) => sub && post(path, sub, extra))
      .catch(() => {});
  } catch {}
};

export const schedule = (at) => send("/schedule", { at });
export const cancel = () => send("/cancel");

export async function disable() {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return;
    await post("/cancel", sub).catch(() => {});
    await sub.unsubscribe();
  } catch {}
}
