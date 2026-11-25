// "Rest over" push: tells a tiny server when to wake the phone, since iOS freezes the page in the background.
// Every call here is best effort: nothing throws, nothing waits, nothing redraws.
// The phone is known to the server only by a random device id made here (never an account, never synced).

export const SERVER = "https://gym-tracker-rest.gym-tracker-rest.workers.dev";
export const VAPID_PUBLIC_KEY =
  "BHKtgaMJrKosNvPeNtGIjG0KJH4VY6GGk2FNsf3bXmNxit1luCZpmY4fGOag-JWkdr2JFioQeeBpvD_xpCHUcwc";
export const DEVICE_KEY = "gymtracker.pushDevice";
export const REG_KEY = "gymtracker.pushReg"; // the push endpoint the server last accepted

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

export const newDeviceId = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function deviceId(store = localStorage) {
  let id = store.getItem(DEVICE_KEY);
  if (!id) store.setItem(DEVICE_KEY, (id = newDeviceId()));
  return id;
}

// One call to the server for this phone's subscription. Registers first when the server has not seen this
// endpoint yet (or iOS gave a new one); a 404 on schedule (server forgot us) registers and tries once more.
// Returns the HTTP status, or undefined when nothing was sent.
export async function sendTo(
  sub,
  path,
  extra,
  { fetchFn = fetch, store = localStorage } = {},
) {
  const device = deviceId(store);
  const post = async (p, x) =>
    (
      await fetchFn(SERVER + p, {
        method: "POST",
        keepalive: true,
        // text/plain keeps this a simple request (no preflight); the server reads the body as JSON.
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ device, ...x }),
      })
    ).status;
  const register = async () => {
    const st = await post("/rest/register", { sub: sub.toJSON() });
    if (st === 200) store.setItem(REG_KEY, sub.endpoint);
    return st;
  };
  if (path === "/rest/register") return register();
  if (
    path !== "/rest/unregister" &&
    store.getItem(REG_KEY) !== sub.endpoint &&
    (await register()) !== 200
  )
    return;
  let st = await post(path, extra);
  if (st === 404 && path === "/rest/schedule" && (await register()) === 200)
    st = await post(path, extra);
  return st;
}

// Call straight from a tap: iOS only shows the permission prompt then, so no await before it.
export async function enable() {
  try {
    if (!supported() || (await Notification.requestPermission()) !== "granted")
      return false;
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key(),
      }));
    await sendTo(sub, "/rest/register").catch(() => {}); // retried on the first schedule if this fails
    return true;
  } catch {
    return false;
  }
}

const send = (path, extra) => {
  try {
    if (
      !supported() ||
      Notification.permission !== "granted" ||
      navigator.onLine === false
    )
      return;
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((sub) => sub && sendTo(sub, path, extra))
      .catch(() => {});
  } catch {}
};

export const schedule = (endsAt) => send("/rest/schedule", { endsAt });
export const cancel = () => send("/rest/cancel");

export async function disable() {
  try {
    const sub = await (
      await navigator.serviceWorker.ready
    ).pushManager.getSubscription();
    if (!sub) return;
    await sendTo(sub, "/rest/unregister").catch(() => {});
    localStorage.removeItem(REG_KEY);
    await sub.unsubscribe();
  } catch {}
}
