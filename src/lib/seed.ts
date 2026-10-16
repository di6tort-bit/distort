// DISTORT — DB seed
// Run: bun run db:seed
import { db } from "./db";
import { SEED_SERVERS } from "./vpn-data";
import { fetchAndParseSubscription } from "./subscription-fetcher";

async function main() {
  // wipe
  await db.session.deleteMany();
  await db.importedConfig.deleteMany();
  await db.subscription.deleteMany();
  await db.vpnServer.deleteMany();
  await db.vpnConfig.deleteMany();
  await db.communityConfig.deleteMany();
  await db.userSetting.deleteMany();
  await db.user.deleteMany();

  for (const s of SEED_SERVERS) {
    await db.vpnServer.create({
      data: {
        code: s.code,
        country: s.country,
        countryCode: s.countryCode,
        city: s.city,
        flag: s.flag,
        host: s.host,
        port: s.port,
        protocols: s.protocols.join(","),
        load: s.load,
        ping: s.ping,
        upMbps: s.upMbps,
        downMbps: s.downMbps,
        online: s.online,
        premium: s.premium,
        stealth: s.stealth,
        note: s.note ?? null,
      },
    });
  }

  await db.userSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  // A few community anti-censor configs (Iran-focused, anonymized placeholders)
  const community = [
    { protocol: "trojan", uri: "trojan://d1st0rt@ir-relay.distort.local:8443?type=ws&host=cdn.distort.net&path=/distort#IR-Relay-1", country: "Iran Relay", note: "Domestic relay → borders" },
    { protocol: "vless", uri: "vless://d1st0rt@de-fra-01.distort.net:8443?type=ws&security=tls&host=de-fra-01.distort.net&path=/distort#DE-Frankfurt", country: "Germany", note: "CDN-fronted, stealth" },
    { protocol: "vmess", uri: "vmess://eyJ2IjoiMiIsInBzIjoiRElTVE9SVC1OVCIsImFkZCI6Im5sLWFtcy0wMS5kaXN0b3J0Lm5ldCIsInBvcnQiOiI4NDQzIiwiaWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJhaWQiOjAsInNjeSI6ImF1dG8iLCJuZXQiOiJ3cyIsInR5cGUiOiJub25lIiwiaG9zdCI6Im5sLWFtcy0wMS5kaXN0b3J0Lm5ldCIsInBhdGgiOiIvZGlzdG9ydCIsInRscyI6InRscyJ9", country: "Netherlands", note: "VMess WS+TLS" },
    { protocol: "ss", uri: "ss://YWVzLTI1Ni1nY206ZDFzdDBydA==@fi-hel-01.distort.net:8443/?plugin=v2ray-plugin%3Btls%3Bhost%3Dfi-hel-01.distort.net%3Bpath%3D%2Fdistort#FI-Helsinki", country: "Finland", note: "SS + v2ray-plugin TLS" },
  ];
  for (const c of community) {
    await db.communityConfig.create({ data: c });
  }

  // A demo account
  await db.user.create({
    data: {
      email: "founder@distort.app",
      name: "Distort Founder",
      tier: "free",
      referral: "FREEDOM",
    },
  });

  // Demo sessions so the Statistics view has something to show.
  const demoServers = await db.vpnServer.findMany({ take: 6, orderBy: { ping: "asc" } });
  const protocols = ["wireguard", "v2ray", "trojan", "shadowsocks"];
  for (let i = 0; i < 22; i++) {
    const srv = demoServers[i % demoServers.length];
    const proto = protocols[i % protocols.length];
    const daysAgo = Math.floor(i / 4);
    const started = new Date(Date.now() - daysAgo * 86400000 - i * 1800000);
    const dur = 300 + (i % 10) * 240;
    const ended = new Date(started.getTime() + dur * 1000);
    await db.session.create({
      data: {
        serverId: srv.id,
        protocol: proto,
        status: "disconnected",
        bytesDown: (50 + (i % 12) * 80) * 1_000_000,
        bytesUp: (8 + (i % 6) * 12) * 1_000_000,
        durationSec: dur,
        startedAt: started,
        endedAt: ended,
      },
    });
  }

  const counts = {
    servers: await db.vpnServer.count(),
    sessions: await db.session.count(),
    configs: await db.vpnConfig.count(),
    community: await db.communityConfig.count(),
    settings: await db.userSetting.count(),
    users: await db.user.count(),
    subscriptions: await db.subscription.count(),
    importedConfigs: await db.importedConfig.count(),
  };

  console.log("✅ Distort DB seeded:", counts);

  // Fetch the curated Iran config-collector subscription so the Community Mesh
  // tab is populated out of the box. Non-fatal if the network is unreachable.
  try {
    const sub = await db.subscription.create({
      data: {
        label: "Iran Config Collector (Milad Tahanian)",
        url: "https://raw.githubusercontent.com/miladtahanian/Config-Collector/main/mixed_iran.txt",
        kind: "community",
        enabled: true,
        intervalMin: 60,
      },
    });
    const n = await fetchAndParseSubscription(sub);
    console.log(`✅ Curated Iran subscription fetched: ${n} configs parsed`);
  } catch (e) {
    console.warn("⚠️  Could not fetch the Iran subscription during seed:", (e as Error).message);
    console.warn("   You can refresh it later from the Community Mesh tab.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
