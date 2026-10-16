// DISTORT Mobile — Android Native VPN Service
// Uses Android's VpnService + xray-core (bundled) for real tunneling.

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

class DistortVpnService : VpnService() {
    private val TAG = "DistortVpn"
    private val NOTIF_ID = 1
    private val CHANNEL_ID = "distort_vpn"

    private var vpnInterface: ParcelFileDescriptor? = null
    private var xrayProcess: Process? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "VPN service started")
        when (intent?.action) {
            ACTION_CONNECT -> startVpn(intent)
            ACTION_DISCONNECT -> stopVpn()
        }
        return START_STICKY
    }

    private fun startVpn(intent: Intent) {
        val serverHost = intent.getStringExtra("host") ?: return
        val serverPort = intent.getIntExtra("port", 8443)
        val protocol = intent.getStringExtra("protocol") ?: "vmess"

        showNotification("Connecting to $serverHost…")

        // 1. Start xray-core (bundled binary)
        startxrayCore(serverHost, serverPort, protocol)

        // 2. Establish VpnService tunnel
        val builder = Builder()
        builder.setSession("DISTORT")
        builder.addAddress("10.66.66.2", 32)
        builder.addDnsServer("1.1.1.1")
        builder.addDnsServer("9.9.9.9")
        builder.addRoute("0.0.0.0", 0)
        builder.setMtu(1420)
        builder.setBlocking(false)
        vpnInterface = builder.establish()

        showNotification("Connected · $serverHost")
    }

    private fun startxrayCore(host: String, port: Int, protocol: String) {
        try {
            val xrayBin = File(applicationInfo.nativeLibraryDir, "libxray.so")
            if (!xrayBin.exists()) {
                Log.e(TAG, "xray binary not found at ${xrayBin.absolutePath}")
                return
            }
            xrayBin.setExecutable(true)

            val config = buildxrayConfig(host, port, protocol)
            val configFile = File(cacheDir, "xray-config.json")
            configFile.writeText(config)

            val pb = ProcessBuilder(xrayBin.absolutePath, "run", "-c", configFile.absolutePath)
            pb.directory(cacheDir)
            pb.redirectErrorStream(true)
            xrayProcess = pb.start()

            Thread {
                val input = xrayProcess?.inputStream?.bufferedReader()
                input?.forEachLine { Log.i(TAG, "[xray] $it") }
            }.start()

            Log.i(TAG, "xray-core started for $protocol → $host:$port")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start xray", e)
        }
    }

    private fun buildxrayConfig(host: String, port: Int, protocol: String): String {
        val outbound = when (protocol) {
            "vmess", "v2ray" -> """
                {"tag":"distort-out","protocol":"vmess","settings":{"vnext":[{"address":"$host","port":$port,"users":[{"id":"${java.util.UUID.randomUUID()}","alterId":0,"security":"auto"}]}]},"streamSettings":{"network":"ws","security":"tls","tlsSettings":{"serverName":"$host"},"wsSettings":{"path":"/distort","headers":{"Host":"$host"}}}}
            """.trimIndent()
            "trojan" -> """
                {"tag":"distort-out","protocol":"trojan","settings":{"servers":[{"address":"$host","port":$port,"password":"distort-trojan"}]},"streamSettings":{"network":"tcp","security":"tls","tlsSettings":{"serverName":"$host"}}}
            """.trimIndent()
            "shadowsocks" -> """
                {"tag":"distort-out","protocol":"shadowsocks","settings":{"servers":[{"address":"$host","port":$port,"method":"chacha20-ietf-poly1305","password":"distort-ss"}]}}
            """.trimIndent()
            else -> """{"tag":"distort-out","protocol":"freedom"}""".trimIndent()
        }

        return """
        {
          "log": {"loglevel": "warning"},
          "inbounds": [
            {"tag":"socks-in","port":10808,"listen":"127.0.0.1","protocol":"socks","settings":{"auth":"noauth","udp":true}},
            {"tag":"http-in","port":10809,"listen":"127.0.0.1","protocol":"http"}
          ],
          "outbounds": [
            $outbound,
            {"tag":"block","protocol":"blackhole"}
          ],
          "routing": {
            "domainStrategy": "IPIfNonMatch",
            "rules": [
              {"type":"field","ip":["geoip:private"],"outboundTag":"direct"},
              {"type":"field","domain":["geosite:category-ads-all"],"outboundTag":"block"}
            ]
          }
        }
        """.trimIndent()
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping VPN")
        xrayProcess?.destroy()
        xrayProcess = null
        vpnInterface?.close()
        vpnInterface = null
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
