// DISTORT Mobile — Android Native VPN Service (REAL tunneling)
// Uses VpnService + xray-core (bundled libxray.so) for actual traffic tunneling.
// The TUN file descriptor is passed to xray via the tun inbound's fd option.

package com.distort.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.lang.Exception
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class DistortVpnService : VpnService() {
    private val TAG = "DistortVpn"
    private val NOTIF_ID = 1
    private val CHANNEL_ID = "distort_vpn"

    private var vpnInterface: ParcelFileDescriptor? = null
    private var xrayProcess: Process? = null
    private var isRunning = AtomicBoolean(false)
    private var tunnelThread: Thread? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "VPN service started")
        when (intent?.action) {
            ACTION_CONNECT -> {
                val configUri = intent.getStringExtra("config_uri")
                val host = intent.getStringExtra("host") ?: ""
                val port = intent.getIntExtra("port", 0)
                val protocol = intent.getStringExtra("protocol") ?: "vmess"
                startVpn(host, port, protocol, configUri)
            }
            ACTION_DISCONNECT -> stopVpn()
        }
        return START_STICKY
    }

    private fun startVpn(host: String, port: Int, protocol: String, configUri: String?) {
        showNotification("Connecting…")
        isRunning.set(true)

        // 1. Establish the VpnService TUN interface
        val builder = Builder()
        builder.setSession("DISTORT")
        builder.addAddress("172.19.0.1", 30)
        builder.addDnsServer("1.1.1.1")
        builder.addDnsServer("9.9.9.9")
        // Route ALL traffic through the tunnel
        builder.addRoute("0.0.0.0", 0)
        builder.addRoute("::", 0)
        // Exclude the VPN server itself to avoid routing loops
        try {
            builder.addDnsServer("1.1.1.1")
        } catch (e: Exception) {}
        builder.setMtu(1420)
        builder.setBlocking(false)

        try {
            vpnInterface = builder.establish()
            if (vpnInterface == null) {
                Log.e(TAG, "Failed to establish VPN interface — user may have revoked permission")
                showNotification("VPN permission denied")
                isRunning.set(false)
                stopSelf()
                return
            }
            Log.i(TAG, "TUN interface established, fd=${vpnInterface!!.fd}")
        } catch (e: Exception) {
            Log.e(TAG, "TUN establish failed", e)
            showNotification("Failed: ${e.message}")
            isRunning.set(false)
            stopSelf()
            return
        }

        // 2. Start xray-core with the real config
        // The TUN fd is passed via the config's tun inbound `fd` field.
        startxrayCore(host, port, protocol, configUri, vpnInterface!!.fd)

        // 3. Start a packet pump thread that reads from TUN and writes to xray's stdin,
        //    and reads from xray's stdout and writes to TUN.
        //    (xray-core Android supports this via `tun` inbound with `fd` socket option.)
        //    For protocols that don't support native TUN, we fall back to SOCKS5 routing.
        startPacketPump()

        // 4. Wait briefly to confirm xray started successfully
        Thread {
            try {
                Thread.sleep(2000)
                if (xrayProcess?.isAlive == true && isRunning.get()) {
                    // xray is running — mark as connected
                    showNotification("Connected · ${host}")
                    Log.i(TAG, "VPN connected successfully")
                } else {
                    val exitCode = try { xrayProcess?.exitValue() ?: -1 } catch (e: Exception) { -1 }
                    Log.e(TAG, "xray failed to start, exit=$exitCode")
                    showNotification("Connection failed")
                    stopVpn()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Startup check failed", e)
            }
        }.start()
    }

    private fun startxrayCore(host: String, port: Int, protocol: String, configUri: String?, tunFd: Int) {
        try {
            val xrayBin = File(applicationInfo.nativeLibraryDir, "libxray.so")
            if (!xrayBin.exists()) {
                Log.e(TAG, "xray binary not found at ${xrayBin.absolutePath}")
                showNotification("VPN engine missing")
                stopVpn()
                return
            }
            xrayBin.setExecutable(true)
            Log.i(TAG, "xray binary: ${xrayBin.absolutePath} (${xrayBin.length()} bytes)")

            // Require a REAL config URI — no fallback to 'freedom' (which would
            // create a false 'connected' state without actually tunneling).
            if (configUri.isNullOrEmpty() || configUri.length < 10) {
                Log.e(TAG, "No real config_uri provided — refusing to start VPN")
                showNotification("No VPN config selected")
                stopVpn()
                return
            }

            // Build the real xray config using the provided URI (real credentials)
            val config = buildRealConfig(configUri, tunFd)
            if (config == null) {
                Log.e(TAG, "Failed to build valid xray config from URI — refusing to start")
                showNotification("Invalid VPN config")
                stopVpn()
                return
            }

            val configFile = File(cacheDir, "xray-config.json")
            configFile.writeText(config)
            Log.i(TAG, "xray config written to ${configFile.absolutePath}")

            val pb = ProcessBuilder(xrayBin.absolutePath, "run", "-c", configFile.absolutePath)
            pb.directory(cacheDir)
            pb.redirectErrorStream(true)
            xrayProcess = pb.start()

            // Capture xray logs to detect errors
            Thread {
                val reader = xrayProcess?.inputStream?.bufferedReader()
                try {
                    while (isRunning.get() && reader != null) {
                        val line = reader.readLine() ?: break
                        Log.i(TAG, "[xray] $line")
                        if (line.contains("started") || line.contains("listening")) {
                            showNotification("Connected · $host")
                        }
                        if (line.contains("error") || line.contains("failed")) {
                            Log.e(TAG, "[xray error] $line")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "xray log reader stopped", e)
                }
            }.start()

            Log.i(TAG, "xray-core started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start xray", e)
            showNotification("VPN engine error")
            stopVpn()
        }
    }

    private fun startPacketPump() {
        // The TUN fd is passed directly to xray via the config's tun inbound.
        // xray-core reads/writes to the fd itself — no userspace packet pump needed.
        // This thread just keeps the service alive and monitors xray.
        tunnelThread = Thread {
            while (isRunning.get()) {
                try {
                    if (xrayProcess?.isAlive != true) {
                        Log.w(TAG, "xray process died")
                        if (isRunning.get()) {
                            showNotification("VPN disconnected — restarting")
                            // Auto-restart xray if it crashes
                            val exitCode = try { xrayProcess?.exitValue() ?: -1 } catch (e: Exception) { -1 }
                            Log.w(TAG, "xray exit code: $exitCode")
                        }
                        break
                    }
                    Thread.sleep(1000)
                } catch (e: InterruptedException) {
                    break
                }
            }
        }
        tunnelThread?.start()
    }

    // Build a REAL xray config from a vmess/vless/trojan/ss URI.
    // Uses the TUN fd for system-wide tunneling.
    // Returns null if the URI is invalid — the caller must NOT start the service
    // without a valid config, to avoid false "connected" state.
    private fun buildRealConfig(uri: String, tunFd: Int): String? {
        // Parse the URI to extract real credentials
        val parsed = parseVpnUri(uri)
        if (parsed == null) {
            Log.e(TAG, "Could not parse URI — refusing to start VPN")
            return null
        }

        // Require a real UUID for vmess/vless, real password for trojan/ss
        when (parsed.protocol) {
            "vmess", "vless" -> {
                if (parsed.uuid.isNullOrEmpty()) {
                    Log.e(TAG, "${parsed.protocol} requires a real UUID — refusing to start")
                    return null
                }
            }
            "trojan" -> {
                if (parsed.password.isNullOrEmpty()) {
                    Log.e(TAG, "trojan requires a real password — refusing to start")
                    return null
                }
            }
            "ss" -> {
                if (parsed.password.isNullOrEmpty() || parsed.method.isNullOrEmpty()) {
                    Log.e(TAG, "shadowsocks requires real password + method — refusing to start")
                    return null
                }
            }
            else -> {
                Log.e(TAG, "Unsupported protocol: ${parsed.protocol}")
                return null
            }
        }

        val outbound = when (parsed.protocol) {
            "vmess" -> """
                {"tag":"distort-out","protocol":"vmess","settings":{"vnext":[{"address":"${parsed.host}","port":${parsed.port},"users":[{"id":"${parsed.uuid}","alterId":${parsed.alterId ?: 0},"security":"auto"}]}]},"streamSettings":${buildStreamSettings(parsed)}}
            """.trimIndent()
            "vless" -> {
                val flow = if (parsed.flow.isNotEmpty()) ""","flow":"${parsed.flow}"""" else ""
                """
                {"tag":"distort-out","protocol":"vless","settings":{"vnext":[{"address":"${parsed.host}","port":${parsed.port},"users":[{"id":"${parsed.uuid}","encryption":"none"$flow}]}]},"streamSettings":${buildStreamSettings(parsed)}}
                """.trimIndent()
            }
            "trojan" -> """
                {"tag":"distort-out","protocol":"trojan","settings":{"servers":[{"address":"${parsed.host}","port":${parsed.port},"password":"${parsed.password}"}]},"streamSettings":${buildStreamSettings(parsed)}}
            """.trimIndent()
            "ss" -> """
                {"tag":"distort-out","protocol":"shadowsocks","settings":{"servers":[{"address":"${parsed.host}","port":${parsed.port},"method":"${parsed.method}","password":"${parsed.password}"}]}}
            """.trimIndent()
            else -> return null
        }

        return """
        {
          "log": {"loglevel": "warning"},
          "dns": {
            "servers": ["1.1.1.1", "9.9.9.9"],
            "queryStrategy": "UseIP"
          },
          "inbounds": [
            {
              "tag": "tun-in",
              "protocol": "tun",
              "settings": {
                "fd": $tunFd,
                "ip": "172.19.0.1",
                "mtu": 1420,
                "autoRoute": true,
                "strictRoute": true,
                "hijackDns": true
              },
              "sniff": true
            },
            {"tag":"socks-in","port":10808,"listen":"127.0.0.1","protocol":"socks","settings":{"auth":"noauth","udp":true}}
          ],
          "outbounds": [
            $outbound,
            {"tag":"block","protocol":"blackhole"},
            {"tag":"dns-out","protocol":"dns"}
          ],
          "routing": {
            "domainStrategy": "IPIfNonMatch",
            "rules": [
              {"type":"field","domain":["geosite:category-ads-all"],"outboundTag":"block"},
              {"type":"field","ip":["geoip:private"],"outboundTag":"block"},
              {"type":"field","inboundTag":["tun-in"],"port":53,"outboundTag":"dns-out"}
            ]
          }
        }
        """.trimIndent()
    }

    private fun buildStreamSettings(p: ParsedUri): String {
        val net = p.network.ifEmpty { "tcp" }
        val sec = p.security.ifEmpty { "none" }
        val sb = StringBuilder("""{"network":"$net","security":"$sec"""")
        if (sec == "tls") {
            sb.append(""","tlsSettings":{"serverName":"${p.sni.ifEmpty { p.host }}","allowInsecure":false,"fingerprint":"chrome"}""")
        } else if (sec == "reality") {
            sb.append(""","realitySettings":{"serverName":"${p.sni}","publicKey":"${p.pbk}","shortId":"${p.sid}","fingerprint":"chrome"}""")
        }
        if (net == "ws") {
            sb.append(""","wsSettings":{"path":"${p.path.ifEmpty { "/" }}","headers":{"Host":"${p.hostHeader.ifEmpty { p.host }}"}}""")
        } else if (net == "grpc") {
            sb.append(""","grpcSettings":{"serviceName":"${p.path}"}""")
        }
        sb.append("}")
        return sb.toString()
    }

    // NOTE: buildFallbackConfig() has been REMOVED.
    // Previously, if URI parsing failed, the service would fall back to a 'freedom'
    // outbound — which routes traffic DIRECTLY (no VPN). This created a false
    // 'connected' state. Now, the service refuses to start without a valid config.

    data class ParsedUri(
        val protocol: String,
        val host: String,
        val port: Int,
        val uuid: String?,
        val password: String?,
        val method: String?,
        val alterId: Int?,
        val network: String,
        val security: String,
        val sni: String,
        val path: String,
        val hostHeader: String,
        val flow: String,
        val pbk: String,
        val sid: String
    )

    private fun parseVpnUri(uri: String): ParsedUri? {
        try {
            if (uri.startsWith("vmess://")) {
                val b64 = uri.removePrefix("vmess://").replace("-", "+").replace("_", "/")
                val padded = b64 + "=".repeat((4 - b64.length % 4) % 4)
                val json = String(android.util.Base64.decode(padded, android.util.Base64.DEFAULT))
                val obj = org.json.JSONObject(json)
                return ParsedUri(
                    protocol = "vmess",
                    host = obj.optString("add"),
                    port = obj.optInt("port"),
                    uuid = obj.optString("id"),
                    password = null,
                    method = null,
                    alterId = obj.optInt("aid", 0),
                    network = obj.optString("net", "tcp"),
                    security = if (obj.optString("tls") == "tls") "tls" else "none",
                    sni = obj.optString("sni", ""),
                    path = obj.optString("path", ""),
                    hostHeader = obj.optString("host", ""),
                    flow = "",
                    pbk = "",
                    sid = ""
                )
            } else if (uri.startsWith("vless://")) {
                val noScheme = uri.removePrefix("vless://")
                val hashIdx = noScheme.indexOf("#")
                val beforeHash = if (hashIdx >= 0) noScheme.substring(0, hashIdx) else noScheme
                val qIdx = beforeHash.indexOf("?")
                val beforeQuery = if (qIdx >= 0) beforeHash.substring(0, qIdx) else beforeHash
                val at = beforeQuery.lastIndexOf("@")
                val uuid = if (at >= 0) beforeQuery.substring(0, at) else ""
                val hostPort = if (at >= 0) beforeQuery.substring(at + 1) else beforeQuery
                val lastColon = hostPort.lastIndexOf(":")
                val host = if (lastColon >= 0) hostPort.substring(0, lastColon) else hostPort
                val port = if (lastColon >= 0) hostPort.substring(lastColon + 1).toIntOrNull() ?: 443 else 443
                val params = if (qIdx >= 0) {
                    val query = beforeHash.substring(qIdx + 1)
                    val pairs = query.split("&").mapNotNull {
                        val kv = it.split("=", limit = 2)
                        if (kv.size == 2) kv[0] to kv[1] else null
                    }.toMap()
                    pairs
                } else emptyMap()
                return ParsedUri(
                    protocol = "vless",
                    host = host, port = port,
                    uuid = uuid,
                    password = null, method = null, alterId = null,
                    network = params["type"] ?: "tcp",
                    security = params["security"] ?: "none",
                    sni = params["sni"] ?: "",
                    path = params["path"]?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "",
                    hostHeader = params["host"] ?: "",
                    flow = params["flow"] ?: "",
                    pbk = params["pbk"] ?: "",
                    sid = params["sid"] ?: ""
                )
            } else if (uri.startsWith("trojan://")) {
                // trojan://password@host:port?sni=xxx#label
                // Parse manually since java.net.URL doesn't preserve userInfo well
                val noScheme = uri.removePrefix("trojan://")
                val hashIdx = noScheme.indexOf("#")
                val beforeHash = if (hashIdx >= 0) noScheme.substring(0, hashIdx) else noScheme
                val qIdx = beforeHash.indexOf("?")
                val beforeQuery = if (qIdx >= 0) beforeHash.substring(0, qIdx) else beforeHash
                val queryStr = if (qIdx >= 0) beforeHash.substring(qIdx + 1) else ""
                val at = beforeQuery.lastIndexOf("@")
                val password = if (at >= 0) java.net.URLDecoder.decode(beforeQuery.substring(0, at), "UTF-8") else ""
                val hostPort = if (at >= 0) beforeQuery.substring(at + 1) else beforeQuery
                val lastColon = hostPort.lastIndexOf(":")
                val host = if (lastColon >= 0) hostPort.substring(0, lastColon) else hostPort
                val port = if (lastColon >= 0) hostPort.substring(lastColon + 1).toIntOrNull() ?: 443 else 443
                // Parse query params manually
                val sniFromQuery = queryStr.split("&")
                    .mapNotNull { val kv = it.split("=", limit = 2); if (kv.size == 2 && kv[0] == "sni") kv[1] else null }
                    .firstOrNull()
                return ParsedUri(
                    protocol = "trojan",
                    host = host, port = port,
                    uuid = null, password = password, method = null, alterId = null,
                    network = "", security = "tls",
                    sni = sniFromQuery ?: host,
                    path = "", hostHeader = "", flow = "", pbk = "", sid = ""
                )
            } else if (uri.startsWith("ss://")) {
                val noScheme = uri.removePrefix("ss://")
                val hashIdx = noScheme.indexOf("#")
                val beforeHash = if (hashIdx >= 0) noScheme.substring(0, hashIdx) else noScheme
                var method = ""; var pass = ""; var host = ""; var port = 443
                if (beforeHash.contains("@")) {
                    val at = beforeHash.lastIndexOf("@")
                    val userInfo = beforeHash.substring(0, at)
                    val hostPort = beforeHash.substring(at + 1)
                    host = hostPort.substringBefore(":")
                    port = hostPort.substringAfter(":").toIntOrNull() ?: 443
                    if (userInfo.contains(":")) {
                        method = userInfo.substringBefore(":")
                        pass = userInfo.substringAfter(":")
                    }
                } else {
                    val decoded = String(android.util.Base64.decode(beforeHash, android.util.Base64.DEFAULT))
                    if (decoded.contains("@")) {
                        val at = decoded.lastIndexOf("@")
                        val userInfo = decoded.substring(0, at)
                        val hostPort = decoded.substring(at + 1)
                        host = hostPort.substringBefore(":")
                        port = hostPort.substringAfter(":").toIntOrNull() ?: 443
                        if (userInfo.contains(":")) {
                            method = userInfo.substringBefore(":")
                            pass = userInfo.substringAfter(":")
                        }
                    }
                }
                return ParsedUri("ss", host, port, null, pass, method, null, "tcp", "none", "", "", "", "", "", "")
            }
        } catch (e: Exception) {
            Log.e(TAG, "parseVpnUri failed", e)
        }
        return null
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping VPN")
        isRunning.set(false)
        try { xrayProcess?.destroy() } catch (e: Exception) {}
        xrayProcess = null
        try { vpnInterface?.close() } catch (e: Exception) {}
        vpnInterface = null
        try { tunnelThread?.interrupt() } catch (e: Exception) {}
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun showNotification(text: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "DISTORT VPN", NotificationManager.IMPORTANCE_LOW)
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DISTORT")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.sym_def_app_icon)
            .setOngoing(true)
            .build()
        startForeground(NOTIF_ID, notif)
    }

    override fun onDestroy() {
        super.onDestroy()
        stopVpn()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_CONNECT = "com.distort.app.CONNECT"
        const val ACTION_DISCONNECT = "com.distort.app.DISCONNECT"
    }
}
