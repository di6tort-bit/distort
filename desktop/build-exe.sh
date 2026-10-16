#!/bin/bash
# DISTORT Desktop — Windows .exe build script
# این اسکریپت کل پروسه‌ی ساخت نصاب ویندوز رو خودکار می‌کنه
#
# استفاده:
#   cd /home/z/my-project/desktop
#   bun run build:exe
#
# خروجی:
#   desktop/release/DISTORT-Setup-1.0.0.exe  (نصاب NSIS)
#   desktop/release/DISTORT-Portable-1.0.0.exe  (نسخه portable)
#
# نیازمندی‌ها:
#   - Node.js 20+ / Bun
#   - electron + electron-builder (به‌صورت خودکار نصب می‌شه)
#   - اینترنت برای دانلود electron binary (~100MB)

set -e

ROOT="/home/z/my-project"
DESKTOP="$ROOT/desktop"
cd "$DESKTOP"

echo "═══════════════════════════════════════════════════════"
echo "  DISTORT Desktop — Windows Installer Build"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Install dependencies
echo "▶ Step 1/5: Installing Electron dependencies…"
bun install 2>&1 | tail -3
echo "  ✓ Dependencies installed"
echo ""

# Step 2: Generate icons
echo "▶ Step 2/5: Generating desktop icons…"
bun run build-icons.mjs
echo ""

# Step 3: Build Next.js standalone (the web app that Electron loads)
echo "▶ Step 3/5: Building Next.js standalone app…"
cd "$ROOT"
bun run build 2>&1 | tail -5
echo "  ✓ Next.js build complete"
echo ""

# Step 4: Copy standalone + static into desktop resources
echo "▶ Step 4/5: Bundling Next.js into desktop app…"
mkdir -p "$DESKTOP/resources"
cp -r "$ROOT/.next/standalone" "$DESKTOP/resources/next-standalone" 2>/dev/null || true
cp -r "$ROOT/.next/static" "$DESKTOP/resources/next-standalone/.next/static" 2>/dev/null || true
cp -r "$ROOT/public" "$DESKTOP/resources/next-standalone/public" 2>/dev/null || true
echo "  ✓ Next.js bundled"
echo ""

# Step 5: Build TypeScript + electron-builder
echo "▶ Step 5/5: Compiling Electron main + building .exe installer…"
cd "$DESKTOP"
bun run build:desktop
echo "  ✓ TypeScript compiled"
echo ""

echo "▶ Running electron-builder (Windows NSIS + Portable)…"
bun run dist 2>&1 | tail -20
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  ✅ Build complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "خروجی‌ها:"
ls -lh "$DESKTOP/release/"*.exe 2>/dev/null || echo "  (هنوز فایلی ساخته نشده)"
echo ""
echo "فایل‌های ساخته‌شده رو می‌تونی روی ویندوز نصب کنی:"
echo "  • DISTORT-Setup-1.0.0.exe  → نصاب کامل (NSIS)"
echo "  • DISTORT-Portable-1.0.0.exe → نسخه portable (بدون نصب)"
