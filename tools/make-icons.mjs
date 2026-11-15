// Draws the app icon (accent dumbbell on the dark background) as PNGs using only Node built-ins.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0x0f, 0x11, 0x15]; // --bg
const FG = [0xc8, 0xf0, 0x4a]; // --accent

// Rounded rects in unit coordinates: [x0, y0, x1, y1, radius].
const SHAPES = [
  [0.22, 0.46, 0.78, 0.54, 0.02], // bar
  [0.3, 0.3, 0.4, 0.7, 0.03], // inner plates
  [0.6, 0.3, 0.7, 0.7, 0.03],
  [0.18, 0.38, 0.27, 0.62, 0.03], // outer plates
  [0.73, 0.38, 0.82, 0.62, 0.03],
];

function inside(x, y) {
  return SHAPES.some(([x0, y0, x1, y1, r]) => {
    const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
    const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && dx * dx + dy * dy <= r * r;
  });
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size) {
  const SS = 3; // 3x3 supersampling for smooth edges
  const raw = Buffer.alloc((size * 3 + 1) * size); // filter byte 0 + RGB per row
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++)
          if (inside((x + (i + 0.5) / SS) / size, (y + (j + 0.5) / SS) / size)) hit++;
      const t = hit / (SS * SS);
      for (let c = 0; c < 3; c++)
        raw[row + 1 + x * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(new URL(name, dir), png(size));
  console.log("wrote icons/" + name);
}
