// Generates the PWA icons from APP_NAME's first letter. Pure Node: a tiny PNG/ICO encoder (zlib)
// and a supersampled stroke rasterizer. Run: `npx tsx scripts/make-icons.ts`.
// Outputs: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png, src/app/favicon.ico
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { APP_NAME } from "../src/config";
import { BRAND_COLOR, BRAND_ON_COLOR } from "../src/lib/brand";

type Pt = [number, number];
type Glyph = Pt[][]; // polylines in a unit box: x 0..1 left→right, y 0..1 top→bottom

// ---------- PNG / ICO encoding ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encode RGBA pixels (row-major, 4 bytes per pixel) as PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO container with embedded PNG images (supported by all current browsers). */
export function encodeIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((img, i) => {
    const o = i * 16;
    dir[o] = img.size >= 256 ? 0 : img.size;
    dir[o + 1] = img.size >= 256 ? 0 : img.size;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(img.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += img.png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

// ---------- Stroke glyphs (simple geometric capitals) ----------
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps = 24): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

// Angles in degrees, 0 = right, 90 = down (screen coordinates).
const GLYPHS: Record<string, Glyph> = {
  A: [[[0, 1], [0.5, 0], [1, 1]], [[0.2, 0.64], [0.8, 0.64]]],
  B: [[[0, 0], [0, 1]], [[0, 0], [0.6, 0], ...arc(0.6, 0.24, 0.3, 0.24, -90, 90), [0, 0.48]], [[0, 0.48], [0.62, 0.48], ...arc(0.62, 0.74, 0.34, 0.26, -90, 90), [0, 1]]],
  C: [arc(0.55, 0.5, 0.48, 0.5, 45, 315)],
  D: [[[0, 0], [0, 1], [0.45, 1], ...arc(0.45, 0.5, 0.5, 0.5, 90, -90), [0, 0]]],
  E: [[[0.95, 0], [0, 0], [0, 1], [0.95, 1]], [[0, 0.5], [0.75, 0.5]]],
  F: [[[0.95, 0], [0, 0], [0, 1]], [[0, 0.5], [0.75, 0.5]]],
  G: [[...arc(0.55, 0.5, 0.48, 0.5, -45, -315), [0.98, 0.55], [0.6, 0.55]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
  I: [[[0.5, 0], [0.5, 1]], [[0.2, 0], [0.8, 0]], [[0.2, 1], [0.8, 1]]],
  J: [[[0.8, 0], [0.8, 0.7], ...arc(0.5, 0.7, 0.3, 0.3, 0, 180)]],
  K: [[[0, 0], [0, 1]], [[1, 0], [0, 0.6]], [[0.3, 0.42], [1, 1]]],
  L: [[[0, 0], [0, 1], [0.9, 1]]],
  M: [[[0, 1], [0, 0], [0.5, 0.6], [1, 0], [1, 1]]],
  N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
  O: [arc(0.5, 0.5, 0.5, 0.5, 0, 360, 48)],
  P: [[[0, 1], [0, 0], [0.6, 0], ...arc(0.6, 0.27, 0.35, 0.27, -90, 90), [0, 0.54]]],
  Q: [arc(0.5, 0.5, 0.5, 0.5, 0, 360, 48), [[0.6, 0.7], [1, 1.05]]],
  R: [[[0, 1], [0, 0], [0.6, 0], ...arc(0.6, 0.27, 0.35, 0.27, -90, 90), [0, 0.54]], [[0.5, 0.54], [1, 1]]],
  S: [[...arc(0.5, 0.26, 0.42, 0.26, -20, -270), ...arc(0.5, 0.74, 0.45, 0.26, -90, 160)]],
  T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
  U: [[[0, 0], [0, 0.6], ...arc(0.5, 0.6, 0.5, 0.4, 180, 0), [1, 0]]],
  V: [[[0, 0], [0.5, 1], [1, 0]]],
  W: [[[0, 0], [0.25, 1], [0.5, 0.35], [0.75, 1], [1, 0]]],
  X: [[[0, 0], [1, 1]], [[1, 0], [0, 1]]],
  Y: [[[0, 0], [0.5, 0.5], [1, 0]], [[0.5, 0.5], [0.5, 1]]],
  Z: [[[0, 0], [1, 0], [0, 1], [1, 1]]],
};

// ---------- Rasterizer ----------
type Seg = [number, number, number, number];

function segments(glyph: Glyph, x0: number, y0: number, w: number, h: number): Seg[] {
  const segs: Seg[] = [];
  for (const line of glyph) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      segs.push([x0 + ax * w, y0 + ay * h, x0 + bx * w, y0 + by * h]);
    }
  }
  return segs;
}

function distToSeg(px: number, py: number, [ax, ay, bx, by]: Seg): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

function insideRoundedRect(x: number, y: number, size: number, r: number): boolean {
  if (r <= 0) return x >= 0 && y >= 0 && x <= size && y <= size;
  const cx = Math.max(r, Math.min(size - r, x));
  const cy = Math.max(r, Math.min(size - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface IconSpec {
  size: number;
  /** Corner radius as a fraction of size (0 = full-bleed square). */
  radius: number;
  /** Letter height as a fraction of size. */
  letter: number;
}

function renderIcon({ size, radius, letter }: IconSpec, ch: string): Uint8Array {
  const glyph = GLYPHS[ch] ?? GLYPHS.A;
  const bg = hex(BRAND_COLOR);
  const fg = hex(BRAND_ON_COLOR);
  const h = size * letter;
  const w = h * 0.82;
  const x0 = (size - w) / 2;
  const y0 = (size - h) / 2;
  const segs = segments(glyph, x0, y0, w, h);
  const half = (h * 0.15) / 2; // stroke width = 15% of letter height
  const r = size * radius;
  const SS = 4; // 4×4 supersampling
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      let ink = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundedRect(px, py, size, r)) continue;
          cover++;
          for (const s of segs) {
            if (distToSeg(px, py, s) <= half) {
              ink++;
              break;
            }
          }
        }
      }
      const i = (y * size + x) * 4;
      const n = SS * SS;
      const t = cover === 0 ? 0 : ink / cover;
      out[i] = Math.round(bg[0] + (fg[0] - bg[0]) * t);
      out[i + 1] = Math.round(bg[1] + (fg[1] - bg[1]) * t);
      out[i + 2] = Math.round(bg[2] + (fg[2] - bg[2]) * t);
      out[i + 3] = Math.round((cover / n) * 255);
    }
  }
  return out;
}

function main() {
  const root = path.resolve(__dirname, "..");
  const iconsDir = path.join(root, "public", "icons");
  fs.mkdirSync(iconsDir, { recursive: true });
  const ch = (APP_NAME.trim()[0] ?? "A").toUpperCase();

  const specs: { file: string; spec: IconSpec }[] = [
    { file: "icon-192.png", spec: { size: 192, radius: 0.22, letter: 0.56 } },
    { file: "icon-512.png", spec: { size: 512, radius: 0.22, letter: 0.56 } },
    // Maskable: full bleed, letter inside the 80% safe zone.
    { file: "maskable-512.png", spec: { size: 512, radius: 0, letter: 0.44 } },
    // iOS rounds corners itself and shows transparency as black: full bleed.
    { file: "apple-touch-icon.png", spec: { size: 180, radius: 0, letter: 0.56 } },
  ];
  for (const { file, spec } of specs) {
    const png = encodePng(spec.size, spec.size, renderIcon(spec, ch));
    fs.writeFileSync(path.join(iconsDir, file), png);
    console.log(`wrote public/icons/${file} (${png.length} bytes)`);
  }

  const ico = encodeIco(
    [16, 32, 48].map((size) => ({ size, png: encodePng(size, size, renderIcon({ size, radius: 0.18, letter: 0.7 }, ch)) })),
  );
  fs.writeFileSync(path.join(root, "src", "app", "favicon.ico"), ico);
  console.log(`wrote src/app/favicon.ico (${ico.length} bytes)`);
}

main();
