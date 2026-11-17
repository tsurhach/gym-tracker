import { isValidState } from "./store.js";

// "Full backup": the normal backup document plus every stored photo, video and sound as base64.
// The data keeps its usual top-level fields, so an older app still reads the data part.
export const FULL_FORMAT = "gym-tracker-full-backup";
export const NOT_BACKUP = "This file is not a Gym Tracker backup.";
export const BAD_MEDIA =
  "The photos or sound in this backup file are damaged. Nothing was changed.";

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const KINDS = ["blob", "image", "video"];
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

export function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64) {
  if (typeof b64 !== "string" || b64.length % 4 || !B64.test(b64))
    throw new Error(BAD_MEDIA);
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const blobJson = async (b) => ({
  type: b.type,
  data: bytesToBase64(new Uint8Array(await b.arrayBuffer())),
});

// One stored item -> the JSON text of one entry in `media`; null for something we do not know.
// Items are encoded one at a time so only one base64 copy exists besides the output parts.
export async function encodeMedia(key, value) {
  if (value instanceof Blob)
    return JSON.stringify({ key, kind: "blob", ...(await blobJson(value)) });
  if (!isObj(value) || !(value.blob instanceof Blob) || !["image", "video"].includes(value.kind))
    return null;
  return JSON.stringify({
    key,
    kind: value.kind,
    ...(await blobJson(value.blob)),
    thumb: value.thumb instanceof Blob ? await blobJson(value.thumb) : null,
  });
}

// File text = fullHead(state) + items joined by "," + FULL_TAIL.
export const fullHead = (state) =>
  JSON.stringify({ ...state, backupFormat: FULL_FORMAT, backupVersion: 1 }, null, 2).replace(
    /\s*\}\s*$/,
    ',\n  "media": [',
  );
export const FULL_TAIL = "]}";

const toBlob = (j) => {
  if (!isObj(j) || typeof j.type !== "string") throw new Error(BAD_MEDIA);
  return new Blob([base64ToBytes(j.data)], { type: j.type });
};

// One entry of `media` -> { key, value } ready for IndexedDB. Throws BAD_MEDIA when malformed.
export function decodeMedia(item) {
  if (!isObj(item) || typeof item.key !== "string" || !item.key || !KINDS.includes(item.kind))
    throw new Error(BAD_MEDIA);
  const blob = toBlob(item);
  if (item.kind === "blob") return { key: item.key, value: blob };
  const thumb = item.thumb == null ? null : toBlob(item.thumb);
  return { key: item.key, value: { kind: item.kind, blob, thumb } };
}

// Reads a backup file's text. Plain: { state, media: null }. Full: { state, media: [decoded] }.
// Everything is validated and decoded before returning, so the caller can write safely.
export function readBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {}
  if (!isValidState(parsed)) throw new Error(NOT_BACKUP);
  if (parsed.backupFormat !== FULL_FORMAT) return { state: parsed, media: null };
  if (parsed.backupVersion !== 1 || !Array.isArray(parsed.media))
    throw new Error(BAD_MEDIA);
  const media = parsed.media.map(decodeMedia);
  delete parsed.media;
  delete parsed.backupFormat;
  delete parsed.backupVersion;
  return { state: parsed, media };
}

export function fmtSize(bytes) {
  return bytes < 1e6
    ? `${Math.max(1, Math.round(bytes / 1e3))} KB`
    : `${(bytes / 1e6).toFixed(1)} MB`;
}
