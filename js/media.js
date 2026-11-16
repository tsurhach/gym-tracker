import { showBanner } from "./ui.js";

// Photo or video attached to a custom exercise. Lives in IndexedDB (not the JSON doc, which is
// limited to ~5 MB). One record per exercise id. Everything fails soft: media is never required.
export const MAX_SIDE = 1200;
export const THUMB = 160;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const TOO_BIG =
  "That video is too large. Try a shorter clip, under about 20 seconds.";

// Pure: size after scaling so the longest side is at most max; never upscales.
export function fitSize(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

// Pure: { ok: true, kind } or { ok: false, message }.
export function checkFile(file) {
  const type = file?.type ?? "";
  if (type.startsWith("image/")) return { ok: true, kind: "image" };
  if (type.startsWith("video/"))
    return file.size > MAX_VIDEO_BYTES
      ? { ok: false, message: TOO_BIG }
      : { ok: true, kind: "video" };
  return { ok: false, message: "Choose a photo or a video." };
}

const DB = "gym-media";
const STORE = "media";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(new Error("no indexedDB"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

const toJpeg = (canvas, q) =>
  new Promise((res) => canvas.toBlob(res, "image/jpeg", q));

function drawTo(canvas, src, sw, sh, dw, dh, sx = 0, sy = 0) {
  canvas.width = dw;
  canvas.height = dh;
  canvas.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
}

// Centre-cropped square JPEG.
function thumbOf(src, w, h) {
  const canvas = document.createElement("canvas");
  const s = Math.min(w, h);
  drawTo(canvas, src, s, s, THUMB, THUMB, (w - s) / 2, (h - s) / 2);
  return toJpeg(canvas, 0.7);
}

function loadEl(el, url, ok) {
  return new Promise((resolve, reject) => {
    el.addEventListener(ok, () => resolve(el), { once: true });
    el.addEventListener("error", () => reject(new Error("decode")), {
      once: true,
    });
    el.src = url;
  });
}

async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadEl(new Image(), url, "load");
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const { w: dw, h: dh } = fitSize(w, h);
    const c = document.createElement("canvas");
    drawTo(c, img, w, h, dw, dh);
    const blob = await toJpeg(c, 0.8);
    return { kind: "image", blob, thumb: await thumbOf(c, dw, dh) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A missing thumbnail is fine: the picker shows the neutral placeholder.
async function videoThumb(file) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    // iOS does not fire loadeddata for a video that is not playing; metadata is enough to seek.
    await loadEl(v, url, "loadedmetadata");
    const seeked = new Promise((res, rej) => {
      v.addEventListener("seeked", res, { once: true });
      v.addEventListener("error", rej, { once: true });
    });
    v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
    await Promise.race([
      seeked,
      new Promise((_, rej) => setTimeout(rej, 4000)),
    ]);
    return await thumbOf(v, v.videoWidth, v.videoHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Throws on a rejected file or a failed write; callers use saveMedia.
export async function putMedia(id, file) {
  const chk = checkFile(file);
  if (!chk.ok) throw new Error(chk.message);
  const rec =
    chk.kind === "image"
      ? await prepareImage(file)
      : {
          kind: "video",
          blob: file,
          // Never let a stuck thumbnail stop the video itself from saving.
          thumb: await Promise.race([
            videoThumb(file),
            new Promise((res) => setTimeout(res, 6000, null)),
          ]),
        };
  await tx("readwrite", (s) => s.put(rec, id));
}

// null when there is none or IndexedDB is unavailable.
export async function getMedia(id) {
  try {
    return (await tx("readonly", (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteMedia(id) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {}
}

// putMedia that shows a plain banner instead of throwing. Resolves true when saved.
export async function saveMedia(id, file) {
  try {
    await putMedia(id, file);
    return true;
  } catch (err) {
    const msg = [TOO_BIG, "Choose a photo or a video."].includes(err.message)
      ? err.message
      : "Could not save that photo or video. Your workout data is fine.";
    showBanner(msg);
    return false;
  }
}
