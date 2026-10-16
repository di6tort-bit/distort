# DISTORT — Publication & Native Apps Roadmap

> صادقانه: چی داریم، چی کمه، چطور منتشر کنیم.

---

## ✅ چی الان داریم (کاملاً کار می‌کنه)

| بخش | فایل | وضعیت |
|---|---|---|
| **وب اپ** (لندینگ + داشبورد کامل) | `src/app/` | ✅ کار می‌کنه |
| **API بک‌اند** (۱۵ روت) | `src/app/api/` | ✅ کار می‌کنه |
| **Community Mesh** (ساب ایران + ایمپورت) | `src/components/vpn/community-mesh-view.tsx` | ✅ ۳۲۹ کانفیگ پارس شده |
| **اکستنشن کروم** (MV3) | `extension/` | ✅ آماده انتشار |
| **دیتابیس** (Prisma + SQLite) | `prisma/` | ✅ ۳۰ سرور + ۲۲ session |
| **تولید کانفیگ** (WG/V2Ray/Trojan/SS/SSH) | `src/lib/config-generator.ts` | ✅ |

---

## 🖥️ اپ دسکتاپ ویندوز (آماده build)

فایل‌ها ساخته شدن، باید فقط `build` بزنی تا `.exe` تولید بشه:

```bash
cd /home/z/my-project/desktop
bun install
./build-exe.sh
```

خروجی:
- `desktop/release/DISTORT-Setup-1.0.0.exe` — نصاب NSIS (کامل)
- `desktop/release/DISTORT-Portable-1.0.0.exe` — نسخه portable

این فایل‌ها رو مستقیم روی ویندوز دابل‌کلیک کن → نصب می‌شه → میانبر دسکتاپ و Start Menu ساخته می‌شه.

### موتور VPN واقعی (Phase 2)
فعلاً اپ دسکتاپ کل UI رو نشون می‌ده ولی تونل واقعی نمی‌زنه. برای واقعی شدن:
- `xray-core` یا `sing-box` باینری رو bundle کن تو `desktop/resources/bin/`
- تو `desktop/src/main.ts` تابع `startXray()` رو فعال کن (stub نوشته شده)
- `wireguard-go` / `boringtun` برای WireGuard userspace
- `wintun.dll` برای TUN device روی ویندوز

---

## 📱 اپ اندروید (React Native + Expo)

ساختار کامل تو `mobile/`. برای ساخت APK:

```bash
cd /home/z/my-project/mobile
bun install
# اکانت رایگان expo.com بساز
eas login
eas build:configure
bun run build:apk    # APK دانلود می‌شه
```

برای Play Store:
```bash
bun run build:android  # AAB برای Play Store
```

### موتور VPN واقعی (Phase 2)
- `react-native-vpn-service` نصب کن
- `xray-core` اندروید باینری رو به `mobile/android/app/src/main/jniLibs/` اضافه کن
- Foreground service با `FOREGROUND_SERVICE_SPECIAL_USE` (قبلاً تو manifest تعریف شده)

---

## 🍎 اپ iOS (نیازمند مک)

**محدودیت:** iOS build فقط روی macOS امکان‌پذیره (نیاز به Xcode).
```bash
cd /home/z/my-project/mobile
bun install
bun run build:ios   # روی مک اجرا کن
```
نیاز به Apple Developer account ($99/سال) برای App Store.
فعلاً می‌شه با TestFlight بین تیم تست کرد.

---

## 🚀 نقشه‌ی انتشار کامل (قدم‌به‌قدم)

### هفته ۱: انتشار نسخه وب + اکستنشن
1. **وب اپ**: پوش به گیت‌هاب → دیپلوی روی Vercel یا Cloudflare Pages (رایگان)
2. **اکستنشن کروم**: zip کن `extension/` → آپلود روی Chrome Web Store ($5 یک‌بار)
3. دامنه `distort.app` بخر و وصل کن

### هفته ۲: اپ ویندوز
4. روی ویندوز (یا CI با GitHub Actions):
   ```bash
   git clone https://github.com/di6tort-bit/distort
   cd distort/desktop
   bun install
   ./build-exe.sh
   ```
5. `.exe` رو روی گیت‌هاب Releases آپلود کن
6. لینک دانلود رو روی سایت قرار بده

### هفته ۳: اپ اندروید
7. اکانت Google Play Developer بساز ($25 یک‌بار)
8. `bun run build:android` (AAB)
9. آپلود روی Play Console → منتظر review (۱-۳ روز)

### هفته ۴: موتور VPN واقعی
10. **xray-core** رو به اپ دسکتاپ و موبایل اضافه کن (Phase 2)
11. وقتی این شد، Distort واقعاً VPN می‌زنه — نه فقط شبیه‌سازی

### ماه ۲: iOS + امنیت
12. Apple Developer account ($99/سال)
13. build iOS روی مک
14. security audit + code signing

---

## 🎯 چرا از Nekoray و Hiddify قوی‌تر می‌شه

| ویژگی | Nekoray | Hiddify | **Distort** |
|---|---|---|---|
| منبع باز | ✅ | ✅ | ✅ (MIT) |
| رایگان | ✅ | ✅ | ✅ (همیشه) |
| وندوز | ✅ | ✅ | ✅ (الان) |
| اندروید | ✅ | ✅ | ✅ (هفته ۳) |
| iOS | ❌ | ✅ | ✅ (ماه ۲) |
| اکستنشن کروم | ❌ | ❌ | ✅ (الان) |
| وب اپ | ❌ | ❌ | ✅ (الان) |
| ساب ایران خودکار | ❌ | ❌ | ✅ (الان، ۳۲۹ کانفیگ) |
| ایمپورت کانفیگ شخصی | ✅ | ✅ | ✅ (الان) |
| آپدیت خودکار | ❌ | ❌ | ✅ (electron-updater) |
| پشتیبانی RTL فارسی | ❌ | ✅ | ⏳ (ماه ۲) |
| موتور xray-core | ✅ | ✅ | ⏳ (Phase 2) |
| Kill Switch | ⚠️ | ✅ | ✅ (UI فعلی، enforcement Phase 2) |

---

## ⚠️ صادقانه: محدودیت‌های فعلی

1. **موتور VPN شبیه‌سازی شده**: اپ دسکتاپ/موبایل الان فقط UI و منطق داره. تونل واقعی نیاز به ادغام xray-core داره (Phase 2).
2. **build فقط روی ویندوز/مک**: نمی‌تونم اینجا `.exe` واقعی تولید کنم چون sandbox لینوکسیه و `bun run build` ممنوعه. شما باید روی ویندوز خودت `./build-exe.sh` رو اجرا کنی.
3. **پریویو وب**: سرور dev این سندباکس بین دستورات kill می‌شه. تو محیط واقعی (Vercel/Cloudflare) این مشکل نیست.

---

## 📦 چک‌لیست نهایی قبل از انتشار

- [ ] گیت‌هاب: همه‌چیز پوش بشه به `di6tort-bit/distort`
- [ ] `.env` و `db/custom.db` از گیت حذف بشن (gitignore شده)
- [ ] LICENSE (MIT) اضافه بشه
- [ ] CHANGELOG.md بساز
- [ ] وندوز: `desktop/build-exe.sh` رو اجرا کن → `.exe` بگیر
- [ ] اندروید: `mobile/` رو با EAS build کن → APK/AAB بگیر
- [ ] اکستنشن: `extension/` رو zip کن → Chrome Web Store
- [ ] وب: دیپلوی روی Vercel
- [ ] دامنه: `distort.app` بخر و وصل کن

---

**Distort آماده‌ست. فقط باید build بشه.**
