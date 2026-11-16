// Keeps the page and the service-worker cache on the same version. Pure decisions first, DOM wiring below.
export const SHELL_PREFIX = "gym-tracker-shell-";
export const CHECK_GAP_MS = 60000;

// hadController: a worker already controlled the page at load, so a controller change is an update, not the first install.
export function reloadAction({ hadController, reloaded, typing }) {
  if (!hadController || reloaded) return "none";
  return typing ? "defer" : "now";
}

export const shouldCheck = (now, last) => now - last >= CHECK_GAP_MS;

export const versionFromKeys = (keys) =>
  keys.find((k) => k.startsWith(SHELL_PREFIX))?.slice(SHELL_PREFIX.length) ?? null;

const isTyping = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "");

// Reload once when a new worker takes over; if the user is typing, wait for the next return to the app or route change.
export function reloadOnUpdate(hadController) {
  let reloaded = false;
  let pending = false;
  const go = () => {
    reloaded = true;
    location.reload();
  };
  const retry = () => {
    if (!pending || reloaded || isTyping()) return;
    go();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const act = reloadAction({ hadController, reloaded, typing: isTyping() });
    if (act === "now") go();
    else if (act === "defer") pending = true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retry();
  });
  window.addEventListener("hashchange", retry);
}

// An installed iOS app can stay suspended for days, so ask for a new worker whenever it comes back.
export function checkOnForeground(reg) {
  let last = Date.now();
  const check = () => {
    if (!shouldCheck(Date.now(), last)) return;
    last = Date.now();
    reg.update().catch(() => {});
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("pageshow", check);
}

export async function runningVersion() {
  try {
    return versionFromKeys(await caches.keys());
  } catch {
    return null;
  }
}
