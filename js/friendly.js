// Plain-language helpers for the sync / sharing screens. Pure, so they test in Node.
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "just now", "5 min ago", "3 h ago", "2 days ago"
export function ago(ms, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 2880) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

// A failed fetch is a TypeError ("Load failed" on iPhone, "Failed to fetch" elsewhere): never show that.
export function friendlyError(e) {
  if (e?.name === "NotAllowedError") return "";
  if (e instanceof TypeError || /load failed|failed to fetch|networkerror/i.test(e?.message ?? ""))
    return "No internet connection. Try again when you are online.";
  return e?.message || "Something went wrong.";
}
