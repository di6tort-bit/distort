// DISTORT — global relay mesh seed data
// Includes Iran-resilient (stealth) nodes tuned for national-intranet scenarios.

export type SeedServer = {
  code: string;
  country: string;
  countryCode: string;
  city: string;
  flag: string;
  host: string;
  port: number;
  protocols: string[];
  load: number;
  ping: number;
  upMbps: number;
  downMbps: number;
  online: boolean;
  premium: boolean;
  stealth: boolean;
  note?: string;
};

// 32 nodes across 26 countries. Stealth nodes are tuned to bypass DPI / national filtering.
export const SEED_SERVERS: SeedServer[] = [
  // --- Stealth / Iran-resilient core ---
  { code: "de-fra-01", country: "Germany", countryCode: "DE", city: "Frankfurt", flag: "🇩🇪", host: "de-fra-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan", "shadowsocks"], load: 18, ping: 42, upMbps: 10000, downMbps: 10000, online: true, premium: false, stealth: true, note: "10Gbps backbone · anti-censor ready" },
  { code: "nl-ams-01", country: "Netherlands", countryCode: "NL", city: "Amsterdam", flag: "🇳🇱", host: "nl-ams-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan", "shadowsocks"], load: 22, ping: 48, upMbps: 10000, downMbps: 10000, online: true, premium: false, stealth: true, note: "Obfuscated TLS front · Iran optimized" },
  { code: "fi-hel-01", country: "Finland", countryCode: "FI", city: "Helsinki", flag: "🇫🇮", host: "fi-hel-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan"], load: 12, ping: 55, upMbps: 5000, downMbps: 5000, online: true, premium: false, stealth: true, note: "Low-latency to MENA · stealth" },
  { code: "fr-par-01", country: "France", countryCode: "FR", city: "Paris", flag: "🇫🇷", host: "fr-par-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan", "shadowsocks"], load: 26, ping: 44, upMbps: 10000, downMbps: 10000, online: true, premium: false, stealth: true, note: "CDN-fronted entry · DPI bypass" },
  { code: "ch-zrh-01", country: "Switzerland", countryCode: "CH", city: "Zurich", flag: "🇨🇭", host: "ch-zrh-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan"], load: 9, ping: 52, upMbps: 5000, downMbps: 5000, online: true, premium: false, stealth: true, note: "Privacy jurisdiction · stealth" },

  // --- Europe standard ---
  { code: "uk-lon-01", country: "United Kingdom", countryCode: "GB", city: "London", flag: "🇬🇧", host: "uk-lon-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 31, ping: 58, upMbps: 5000, downMbps: 5000, online: true, premium: false, stealth: false },
  { code: "se-sto-01", country: "Sweden", countryCode: "SE", city: "Stockholm", flag: "🇸🇪", host: "se-sto-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 14, ping: 62, upMbps: 5000, downMbps: 5000, online: true, premium: false, stealth: false, note: "Privacy-friendly jurisdiction" },
  { code: "es-mad-01", country: "Spain", countryCode: "ES", city: "Madrid", flag: "🇪🇸", host: "es-mad-01.distort.net", port: 51820, protocols: ["wireguard", "trojan"], load: 17, ping: 60, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: false },

  // --- North America ---
  { code: "us-nyc-01", country: "United States", countryCode: "US", city: "New York", flag: "🇺🇸", host: "us-nyc-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray", "trojan"], load: 38, ping: 110, upMbps: 10000, downMbps: 10000, online: true, premium: false, stealth: false },
  { code: "us-lax-01", country: "United States", countryCode: "US", city: "Los Angeles", flag: "🇺🇸", host: "us-lax-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 33, ping: 140, upMbps: 10000, downMbps: 10000, online: true, premium: false, stealth: false },
  { code: "ca-tor-01", country: "Canada", countryCode: "CA", city: "Toronto", flag: "🇨🇦", host: "ca-tor-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 19, ping: 120, upMbps: 5000, downMbps: 5000, online: true, premium: false, stealth: false },

  // --- Asia ---
  { code: "sg-sin-01", country: "Singapore", countryCode: "SG", city: "Singapore", flag: "🇸🇬", host: "sg-sin-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan", "shadowsocks"], load: 28, ping: 88, upMbps: 10000, downMbps: 10000, online: true, premium: false, stealth: true, note: "Asia hub · stealth for censored regions" },
  { code: "jp-tyo-01", country: "Japan", countryCode: "JP", city: "Tokyo", flag: "🇯🇵", host: "jp-tyo-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan"], load: 21, ping: 95, upMbps: 5000, downMbps: 5000, online: true, premium: false, stealth: true },
  { code: "tr-ist-01", country: "Turkey", countryCode: "TR", city: "Istanbul", flag: "🇹🇷", host: "tr-ist-01.distort.net", port: 8443, protocols: ["v2ray", "trojan", "shadowsocks"], load: 24, ping: 18, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Closest low-latency to Iran · stealth" },
  { code: "ae-dxb-01", country: "UAE", countryCode: "AE", city: "Dubai", flag: "🇦🇪", host: "ae-dxb-01.distort.net", port: 8443, protocols: ["v2ray", "trojan", "shadowsocks"], load: 16, ping: 24, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Gulf hub · obfuscated" },
  { code: "in-mum-01", country: "India", countryCode: "IN", city: "Mumbai", flag: "🇮🇳", host: "in-mum-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 27, ping: 78, upMbps: 5000, downMbps: 5000, online: true, premium: false, stealth: false },

  // --- Oceania ---
  { code: "au-syd-01", country: "Australia", countryCode: "AU", city: "Sydney", flag: "🇦🇺", host: "au-syd-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 12, ping: 210, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: false },

  // --- South America ---
  { code: "br-sao-01", country: "Brazil", countryCode: "BR", city: "São Paulo", flag: "🇧🇷", host: "br-sao-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 15, ping: 180, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: false },

  // --- Africa ---
  { code: "za-jnb-01", country: "South Africa", countryCode: "ZA", city: "Johannesburg", flag: "🇿🇦", host: "za-jnb-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 8, ping: 160, upMbps: 1000, downMbps: 1000, online: true, premium: false, stealth: false },

  // --- Middle East / neighbors ---
  { code: "ge-tbs-01", country: "Georgia", countryCode: "GE", city: "Tbilisi", flag: "🇬🇪", host: "ge-tbs-01.distort.net", port: 8443, protocols: ["v2ray", "trojan", "shadowsocks"], load: 11, ping: 32, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Caucasus gateway · stealth" },
  { code: "am-evn-01", country: "Armenia", countryCode: "AM", city: "Yerevan", flag: "🇦🇲", host: "am-evn-01.distort.net", port: 8443, protocols: ["v2ray", "trojan", "shadowsocks"], load: 7, ping: 28, upMbps: 1000, downMbps: 1000, online: true, premium: false, stealth: true, note: "Neighbor node · low-latency from Iran" },

  // --- Premium tier (still free during beta) ---
  { code: "us-sea-01", country: "United States", countryCode: "US", city: "Seattle", flag: "🇺🇸", host: "us-sea-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 9, ping: 150, upMbps: 20000, downMbps: 20000, online: true, premium: true, stealth: false, note: "20Gbps · beta-early-access" },
  { code: "gb-man-01", country: "United Kingdom", countryCode: "GB", city: "Manchester", flag: "🇬🇧", host: "gb-man-01.distort.net", port: 51820, protocols: ["wireguard", "v2ray"], load: 11, ping: 62, upMbps: 20000, downMbps: 20000, online: true, premium: true, stealth: false },

  // --- Offline (realism) ---
  { code: "ru-mow-01", country: "Russia", countryCode: "RU", city: "Moscow", flag: "🇷🇺", host: "ru-mow-01.distort.net", port: 51820, protocols: ["wireguard"], load: 0, ping: 0, upMbps: 2500, downMbps: 2500, online: false, premium: false, stealth: false, note: "Maintenance" },

  // --- Extra stealth for hard-line regions ---
  { code: "lu-lux-01", country: "Luxembourg", countryCode: "LU", city: "Luxembourg", flag: "🇱🇺", host: "lu-lux-01.distort.net", port: 8443, protocols: ["v2ray", "trojan", "shadowsocks"], load: 6, ping: 50, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Quiet jurisdiction · stealth" },
  { code: "is-rey-01", country: "Iceland", countryCode: "IS", city: "Reykjavik", flag: "🇮🇸", host: "is-rey-01.distort.net", port: 8443, protocols: ["wireguard", "v2ray", "trojan"], load: 4, ping: 70, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Strong privacy law · stealth" },
  { code: "ee-tll-01", country: "Estonia", countryCode: "EE", city: "Tallinn", flag: "🇪🇪", host: "ee-tll-01.distort.net", port: 8443, protocols: ["v2ray", "trojan", "shadowsocks"], load: 8, ping: 58, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Baltic stealth node" },
  { code: "pl-waw-01", country: "Poland", countryCode: "PL", city: "Warsaw", flag: "🇵🇱", host: "pl-waw-01.distort.net", port: 8443, protocols: ["v2ray", "trojan", "shadowsocks"], load: 13, ping: 54, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Central Europe · stealth" },
  { code: "at-vie-01", country: "Austria", countryCode: "AT", city: "Vienna", flag: "🇦🇹", host: "at-vie-01.distort.net", port: 8443, protocols: ["v2ray", "trojan"], load: 10, ping: 50, upMbps: 2500, downMbps: 2500, online: true, premium: false, stealth: true, note: "Stealth · CDN-fronted" },
  { code: "ir-nrt-relay", country: "Iran (Relay)", countryCode: "IR", city: "Tehran Relay", flag: "🇮🇷", host: "relay.distort.local", port: 8443, protocols: ["shadowsocks", "trojan"], load: 35, ping: 6, upMbps: 1000, downMbps: 1000, online: true, premium: false, stealth: true, note: "Domestic relay · only routes to borders, no exit" },
];

export const PROTOCOLS = [
  {
    id: "wireguard",
    name: "WireGuard",
    description: "Modern, fast, audited. Best for stable networks.",
    speed: 95,
    resilience: 60,
    badge: "Fastest",
  },
  {
    id: "v2ray",
    name: "V2Ray (VMess)",
    description: "Pluggable transport. Disguises traffic as HTTPS.",
    speed: 80,
    resilience: 92,
    badge: "Stealth",
  },
  {
    id: "trojan",
    name: "Trojan",
    description: "Looks like normal TLS traffic. Defeats DPI.",
    speed: 82,
    resilience: 95,
    badge: "Anti-DPI",
  },
  {
    id: "shadowsocks",
    name: "Shadowsocks",
    description: "Lightweight SOCKS5 proxy with AEAD ciphers.",
    speed: 88,
    resilience: 78,
    badge: "Light",
  },
  {
    id: "ssh",
    name: "SSH Tunnel",
    description: "Last-resort fallback. Looks like remote shell.",
    speed: 50,
    resilience: 90,
    badge: "Fallback",
  },
] as const;
