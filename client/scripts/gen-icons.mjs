// Generates PWA PNG icons with zero external dependencies.
// Draws a teal brand tile with a white "receipt" mark (matches favicon.svg).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../public/icons');

const TEAL = [14, 124, 107];
const AMBER = [207, 132, 32];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };

  // Full-bleed teal background (safe for maskable)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, TEAL);

  // Receipt body
  const x0 = Math.round(size * 0.28);
  const x1 = Math.round(size * 0.72);
  const y0 = Math.round(size * 0.22);
  const yb = Math.round(size * 0.74);
  const corner = Math.round(size * 0.05);
  const toothH = Math.round(size * 0.045);
  const toothW = Math.max(2, Math.round(size * 0.055));

  for (let x = x0; x <= x1; x++) {
    // zigzag bottom edge
    const phase = ((x - x0) % toothW) / toothW;
    const tri = Math.abs(phase - 0.5) * 2; // 0..1
    const bottom = yb - Math.round(tri * toothH);
    for (let y = y0; y <= bottom; y++) {
      // rounded top corners
      if (y < y0 + corner) {
        if (x < x0 + corner) {
          const dx = x0 + corner - x;
          const dy = y0 + corner - y;
          if (dx * dx + dy * dy > corner * corner) continue;
        } else if (x > x1 - corner) {
          const dx = x - (x1 - corner);
          const dy = y0 + corner - y;
          if (dx * dx + dy * dy > corner * corner) continue;
        }
      }
      set(x, y, WHITE);
    }
  }

  // Text lines inside the receipt
  const lineX0 = Math.round(size * 0.35);
  const lineX1 = Math.round(size * 0.65);
  const lineH = Math.max(2, Math.round(size * 0.035));
  const lines = [
    { y: size * 0.34, color: TEAL, x1: lineX1 },
    { y: size * 0.45, color: TEAL, x1: lineX1 },
    { y: size * 0.56, color: AMBER, x1: Math.round(size * 0.54) },
  ];
  for (const ln of lines) {
    const ly = Math.round(ln.y);
    for (let y = ly; y < ly + lineH; y++) {
      for (let x = lineX0; x <= ln.x1; x++) set(x, y, ln.color);
    }
  }

  return buf;
}

function write(name, size) {
  const png = encodePng(size, size, drawIcon(size));
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`  ✓ ${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('Generating PWA icons →', OUT_DIR);
write('icon-192.png', 192);
write('icon-512.png', 512);
write('icon-512-maskable.png', 512);
write('apple-touch-icon.png', 180);
console.log('Done.');
