# DISTORT Android — Native Kotlin VPN Client

A 100% free, anti-censorship VPN for Android. Uses Android's `VpnService` +
bundled `xray-core` binary for real tunneling.

## ساخت APK

### پیش‌نیازها
1. Android Studio (یا فقط Android SDK + JDK 17)
2. Java JDK 17+

### Build
```bash
export ANDROID_HOME=$HOME/Android/Sdk   # مسیر SDK
cd /home/z/my-project/mobile/android

# دانلود xray-core Android binary
mkdir -p app/src/main/jniLibs/arm64-v8a
cd app/src/main/jniLibs/arm64-v8a
curl -sL -o xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-android-arm64-v8a.zip
unzip xray.zip
mv xray libxray.so
chmod +x libxray.so
rm xray.zip
cd -

# Build APK
./gradlew assembleDebug

# APK ساخته می‌شه در:
# app/build/outputs/apk/debug/app-debug.apk
```

### نصب روی گوشی
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```
یا فایل APK رو روی گوشی کپی کن و نصب کن.

## معماری
- `MainActivity.kt` — UI اصلی (دکمه Quick Connect)
- `DistortVpnService.kt` — VpnService + xray-core integration
- `libxray.so` — باینری xray-core (arm64-v8a, armeabi-v7a, x86_64)
- `xray-config.json` — کانفیگ داینامیک بر اساس پروتکل انتخابی

## پروتکل‌ها
- WireGuard (fastest)
- VMess WS+TLS (stealth)
- Trojan (HTTPS disguise)
- Shadowsocks (AEAD)
- SSH (fallback)

## مجوزها
- `INTERNET` — اتصال به سرور
- `FOREGROUND_SERVICE_SPECIAL_USE` — VPN service در پس‌زمینه
- `BIND_VPN_SERVICE` — ایجاد tunnel

## لایسنس
MIT — 100% free forever.
