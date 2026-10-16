// DISTORT Desktop — icon generator
// Generates Windows .ico, .png icons from the Distort SVG logo.
// Run: bun run desktop/build-icons.mjs

import sharp from "sharp";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD_DIR = join(__dirname, "build");

const SVG_PATH = join(ROOT, "public", "logo.svg");

if (!existsSync(SVG_PATH)) {
  console.error(`✗ Logo SVG not found at ${SVG_PATH}`);
  process.exit(1);
}

const svgBuffer = readFileSync(SVG_PATH);
mkdirSync(BUILD_DIR, { recursive: true });

async function buildIcons() {
  console.log("✓ Generating Distort desktop icons…");

  // Generate PNGs at multiple sizes
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  const pngs = {};
  for (const size of sizes) {
    const png = await sharp(svgBuffer, { density: 384 })
      .resize(size, size, { fit: "contain", background: { r: 5, g: 8, b: 20, alpha: 1 } })
      .png()
      .toBuffer();
    pngs[size] = png;
    writeFileSync(join(BUILD_DIR, `icon-${size}.png`), png);
    console.log(`  ✓ icon-${size}.png`);
  }

  // icon.png (256 for general use)
  writeFileSync(join(BUILD_DIR, "icon.png"), pngs[256]);
  console.log("  ✓ icon.png (256)");

  // Build .ico for Windows (multi-size)
  // ICO format: header (6 bytes) + directory entries (16 bytes each) + image data
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoEntries = [];
  let offset = 6 + icoSizes.length * 16;

  for (const size of icoSizes) {
    const png = pngs[size];
    icoEntries.push({
      width: size === 256 ? 0 : size, // 0 means 256
      height: size === 256 ? 0 : size,
      size: png.length,
      offset,
      data: png,
    });
    offset += png.length;
  }

  const headerSize = 6;
  const dirSize = icoEntries.length * 16;
  const totalSize = headerSize + dirSize + icoEntries.reduce((s, e) => s + e.data.length, 0);
  const buf = Buffer.alloc(totalSize);
  let pos = 0;

  // ICONDIR header
  buf.writeUInt16LE(0, pos); pos += 2; // reserved
  buf.writeUInt16LE(1, pos); pos += 2; // type = icon
  buf.writeUInt16LE(icoEntries.length, pos); pos += 2; // count

  // Directory entries
  for (const e of icoEntries) {
    buf.writeUInt8(e.width, pos); pos += 1;
    buf.writeUInt8(e.height, pos); pos += 1;
    buf.writeUInt8(0, pos); pos += 1; // color count (0 = ≥256)
    buf.writeUInt8(0, pos); pos += 1; // reserved
    buf.writeUInt16LE(1, pos); pos += 2; // planes
    buf.writeUInt16LE(32, pos); pos += 2; // bpp
    buf.writeUInt32LE(e.size, pos); pos += 4;
    buf.writeUInt32LE(e.offset, pos); pos += 4;
  }

  // Image data
  for (const e of icoEntries) {
    e.data.copy(buf, pos);
    pos += e.data.length;
  }

  writeFileSync(join(BUILD_DIR, "icon.ico"), buf);
  console.log(`  ✓ icon.ico (multi-size: ${icoSizes.join(", ")})`);

  // Copy SVG too
  writeFileSync(join(BUILD_DIR, "icon.svg"), svgBuffer);
  console.log("  ✓ icon.svg");

  console.log(`\n✓ All icons generated in ${BUILD_DIR}`);
}

buildIcons().catch((e) => {
  console.error("✗ Icon generation failed:", e);
  process.exit(1);
});
