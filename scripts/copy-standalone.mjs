// Cross-platform copy script for Next.js standalone build
// Copies .next/static and public/ into .next/standalone/
// Works on Windows, macOS, and Linux (uses Node.js fs)

import { cpSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const standaloneDir = join(root, ".next", "standalone");
const staticSrc = join(root, ".next", "static");
const staticDest = join(standaloneDir, ".next", "static");
const publicSrc = join(root, "public");
const publicDest = join(standaloneDir, "public");

if (!existsSync(standaloneDir)) {
  console.error("✗ Standalone dir not found. Did `next build` run?");
  process.exit(1);
}

console.log("→ Copying .next/static → .next/standalone/.next/static");
mkdirSync(dirname(staticDest), { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });
console.log("  ✓ Done");

console.log("→ Copying public/ → .next/standalone/public");
cpSync(publicSrc, publicDest, { recursive: true });
console.log("  ✓ Done");

console.log("✓ Standalone bundle complete");
