#!/bin/bash
# DISTORT Android APK build script
# این اسکریپت روی ویندوز/مک/لینوکس با Android Studio کار می‌کنه

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/mobile"
ANDROID_DIR="$MOBILE/android"

echo "═══════════════════════════════════════════════════"
echo "  DISTORT Android APK Build"
echo "═══════════════════════════════════════════════════"

# Check Android SDK
if [ -z "$ANDROID_HOME" ]; then
  echo "⚠️  ANDROID_HOME not set."
  echo "   Install Android Studio: https://developer.android.com/studio"
  echo "   Then: export ANDROID_HOME=\$HOME/Android/Sdk"
  exit 1
fi

mkdir -p "$ANDROID_DIR"
cd "$ANDROID_DIR"

# Download xray-core Android binary
echo "▶ Downloading xray-core for Android…"
mkdir -p app/src/main/jniLibs/arm64-v8a
mkdir -p app/src/main/jniLibs/armeabi-v7a
mkdir -p app/src/main/jniLibs/x86_64

curl -sL -o xray-android.zip "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-android-arm64-v8a.zip"
unzip -o xray-android.zip -d app/src/main/jniLibs/arm64-v8a/
mv app/src/main/jniLibs/arm64-v8a/xray app/src/main/jniLibs/arm64-v8a/libxray.so
chmod +x app/src/main/jniLibs/arm64-v8a/libxray.so
rm xray-android.zip

echo "▶ Building APK…"
./gradlew assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  cp "$APK" "$ROOT/download/DISTORT-Android-1.0.0.apk"
  echo ""
  echo "✅ APK ساخته شد:"
  ls -lh "$ROOT/download/DISTORT-Android-1.0.0.apk"
else
  echo "❌ APK build failed"
  exit 1
fi
