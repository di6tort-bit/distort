# DISTORT Mobile — Android & iOS

> A 100% free, anti-censorship VPN client for Android and iOS.
> Built with React Native (Expo). Designed to outperform Nekoray & Hiddify.

## Build APK / IPA

### Android (APK)
```bash
cd /home/z/my-project/mobile
bun install
eas login          # create free Expo account
eas build:configure
bun run build:apk  # produces a downloadable .apk
```

### Android (Play Store AAB)
```bash
bun run build:android   # produces .aab for Google Play
```

### iOS (requires macOS)
```bash
bun run build:ios   # produces .ipa for App Store / TestFlight
```

## Run on device (development)
```bash
bun install
bun start           # opens Expo DevTools
# Scan QR with Expo Go app (Android/iOS)
```

## Native VPN integration (Phase 2)

The mobile app currently uses a **simulated** tunnel. To make it a real VPN:

### Android
- Use `react-native-vpn-service` or write a native module that wraps `VpnService.Builder`
- Create a foreground service (already declared in manifest: `FOREGROUND_SERVICE_SPECIAL_USE`)
- Bundle `xray-core` Android binary or use `sing-box` Android library
- Routes traffic via the TUN interface

### iOS
- Use `NetworkExtension` framework (requires Apple Developer account, $99/yr)
- Bundle `xray-core` iOS binary
- Config via `NEVPNProtocolIKEv2` or packet tunnel provider

## Distort control plane

The app connects to the Distort web API for:
- Server list: `GET /api/servers`
- Recommended: `GET /api/servers/recommended`
- Community mesh: `GET /api/imported-configs?bucket=optimized`
- Connect/disconnect: `POST /api/connect`
- Speed test: `POST /api/speedtest`
- Settings: `GET/PUT /api/settings`

Update the `API_BASE` constant in `src/api.ts` (when created) to point to your deployed Distort instance.

## Iran-resilience

The mobile app inherits the Distort protocol ladder:
1. WireGuard (fastest)
2. V2Ray VMess (WS+TLS)
3. Trojan (HTTPS disguise)
4. Shadowsocks (AEAD)
5. SSH fallback

Plus the Community Mesh — users can paste VLESS/VMess URIs and the app parses + scores them.

## License

MIT — 100% free forever.
