import { t } from "./i18n/index.js";
// Plain-language helpers for the sync / sharing screens. Pure, so they test in Node.
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "just now", "5 min ago", "3 h ago", "2 days ago"
export function ago(ms, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return t("friendly.now");
  if (m < 60) return t("friendly.min", { n: m });
  if (m < 2880) return t("friendly.hours", { n: Math.round(m / 60) });
  return t("friendly.days", { n: Math.round(m / 1440) });
}

// A failed fetch is a TypeError ("Load failed" on iPhone, "Failed to fetch" elsewhere): never show that.
export function friendlyError(e) {
  if (e?.name === "NotAllowedError") return "";
  if (e instanceof TypeError || /load failed|failed to fetch|networkerror/i.test(e?.message ?? ""))
    return t("friendly.offline");
  return e?.message || t("friendly.wrong");
}

// syncNow() never throws: judge the result by the status text. Banner kind "ok" only when it really synced.
export const syncOutcome = (status, ok = /^Synced/.test(status)) =>
  ok ? { text: t("friendly.synced"), kind: "ok" } : { text: status, kind: "error" };
