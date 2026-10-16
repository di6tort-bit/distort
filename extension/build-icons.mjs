// build-icons.mjs
// Rasterize icons/icon.svg to PNG icons at 16, 32, 48, 128 px using sharp.
// Falls back to a solid-color placeholder PNG encoder (pure JS) if sharp is unavailable.
//
// Run: bun run extension/build-icons.mjs   (from project root)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, 'icons');
const SVG_PATH = join(ICONS_DIR, 'icon.svg');

const SIZES = [16, 32, 48, 128];

// --- Minimal PNG encoder (solid color with alpha) for fallback ----------------
// CRC32 table
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makeSolidPng(size, [r, g, b, a] = [0, 240, 255, 255]) {
  // Build RGBA image data (each row prefixed with filter byte 0)
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const off = y * rowBytes;
    raw[off] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const p = off + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- main ---------------------------------------------------------------------
async function main() {
  await mkdir(ICONS_DIR, { recursive: true });
  let svgBuffer;
  try {
    svgBuffer = await readFile(SVG_PATH);
  } catch {
    svgBuffer = null;
  }

  let sharp = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    sharp = null;
  }

  for (const size of SIZES) {
    const outPath = join(ICONS_DIR, `icon-${size}.png`);
    let ok = false;
    if (sharp && svgBuffer) {
      try {
        await sharp(svgBuffer, { density: 384 })
          .resize(size, size, { fit: 'contain', background: { r: 5, g: 8, b: 20, alpha: 1 } })
          .png()
          .toFile(outPath);
        ok = true;
        console.log(`✓ wrote ${outPath} via sharp`);
      } catch (err) {
        console.warn(`sharp failed for ${size}: ${err.message}`);
      }
    }
    if (!ok) {
      // Fallback: solid cyan placeholder PNG
      const png = makeSolidPng(size, [0, 240, 255, 255]);
      await writeFile(outPath, png);
      console.log(`✓ wrote ${outPath} via fallback encoder`);
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('build-icons failed:', err);
  process.exit(1);
});
