package com.distort.app

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val VPN_REQUEST_CODE = 1001
    private var statusText: TextView? = null
    private var speedText: TextView? = null
    private var exitIpText: TextView? = null
    private val handler = Handler(Looper.getMainLooper())
    private var speedUpdateRunnable: Runnable? = null

    // In-app update checker — created lazily so the Activity doesn't pay
    // for the constructor cost until first use.
    private val updateChecker by lazy { UpdateChecker(this) }
    // Tracks whether an update dialog is already visible so the auto-check
    // and a manual button tap don't both pop a dialog at the same time.
    private var updateDialogShowing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildUI())
        // Auto-check for updates shortly after launch. We delay 3s so the
        // first frame paints first; failures are silent (see checkForUpdate).
        lifecycleScope.launch {
            delay(3000)
            checkForUpdate(showToastIfUpToDate = false, showToastOnError = false)
        }
    }

    private fun buildUI(): View {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#050814"))
            setPadding(48, 96, 48, 48)
            gravity = Gravity.CENTER_HORIZONTAL
        }

        // Logo
        val logo = TextView(this).apply {
            text = "D"
            textSize = 64f
            setTextColor(Color.parseColor("#00f0ff"))
            setShadowLayer(32f, 0f, 0f, Color.parseColor("#2962ff"))
            gravity = Gravity.CENTER
        }
        container.addView(logo)

        // Brand
        val brand = TextView(this).apply {
            text = "DISTORT"
            textSize = 32f
            setTextColor(Color.WHITE)
            letterSpacing = 0.2f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 0)
        }
        container.addView(brand)

        // Tagline
        val tagline = TextView(this).apply {
            text = "Freedom Beyond Borders"
            textSize = 12f
            setTextColor(Color.parseColor("#8aa0c4"))
            letterSpacing = 0.3f
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 0)
        }
        container.addView(tagline)

        // Status
        statusText = TextView(this).apply {
            text = "● Disconnected"
            textSize = 14f
            setTextColor(Color.parseColor("#8aa0c4"))
            gravity = Gravity.CENTER
            setPadding(0, 32, 0, 8)
        }
        container.addView(statusText)

        // Speed display (shows upload/download when connected)
        speedText = TextView(this).apply {
            text = ""
            textSize = 12f
            setTextColor(Color.parseColor("#10d9a0"))
            gravity = Gravity.CENTER
            setPadding(0, 4, 0, 8)
            visibility = View.GONE
        }
        container.addView(speedText)

        // Exit IP display
        exitIpText = TextView(this).apply {
            text = ""
            textSize = 11f
            setTextColor(Color.parseColor("#5cf2ff"))
            gravity = Gravity.CENTER
            setPadding(0, 4, 0, 8)
            visibility = View.GONE
        }
        container.addView(exitIpText)

        // === MODE 0: Web Dashboard (native bridge to RecoveryEngine) ===
        //
        // Launches DashboardWebViewActivity which loads https://distort.app
        // inside an Android WebView with the RecoveryBridge JavascriptInterface
        // injected as `window.DistortNative`. The dashboard's RecoveryEngine
        // detects this and uses AndroidNativeEngine to actually drive the VPN
        // service (spawn xray via VpnService, verify real traffic, etc.).
        //
        // This is the recommended way to use Distort on Android — the web UI
        // is far more capable than the minimal native UI below, and the bridge
        // makes the Emergency Connectivity button ACTUALLY connect (instead of
        // honestly reporting "browser-only cannot connect").
        val webDashboardLabel = TextView(this).apply {
            text = "MODE 0: Web Dashboard (Emergency Connectivity engine)"
            textSize = 11f
            setTextColor(Color.parseColor("#10d9a0"))
            letterSpacing = 0.1f
            setPadding(0, 16, 0, 8)
        }
        container.addView(webDashboardLabel)

        val openDashboardBtn = Button(this).apply {
            text = "🌐 OPEN WEB DASHBOARD"
            setBackgroundColor(Color.parseColor("#10d9a0"))
            setTextColor(Color.parseColor("#02131a"))
            textSize = 14f
            letterSpacing = 0.1f
            setPadding(48, 32, 48, 32)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(0, 0, 0, 16)
            layoutParams = params
            setOnClickListener {
                val intent = Intent(this@MainActivity, DashboardWebViewActivity::class.java)
                startActivity(intent)
            }
        }
        container.addView(openDashboardBtn)

        // === MODE 1: Quick Connect (auto config) ===
        val quickConnectLabel = TextView(this).apply {
            text = "MODE 1: Quick Connect (auto config)"
            textSize = 11f
            setTextColor(Color.parseColor("#5cf2ff"))
            letterSpacing = 0.1f
            setPadding(0, 16, 0, 8)
        }
        container.addView(quickConnectLabel)

        val quickConnectBtn = Button(this).apply {
            text = "⚡ QUICK CONNECT (auto)"
            setBackgroundColor(Color.parseColor("#00f0ff"))
            setTextColor(Color.parseColor("#02131a"))
            textSize = 14f
            letterSpacing = 0.1f
            setPadding(48, 32, 48, 32)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(0, 0, 0, 16)
            layoutParams = params
            setOnClickListener {
                // Try to get a config from the Distort API (Community Mesh)
                // This is the "auto" mode — user doesn't need to paste anything
                statusText?.text = "● Connecting (auto)…"
                statusText?.setTextColor(Color.parseColor("#ffb020"))

                // For now, try the cached config first
                val cachedConfig = getCachedConfig()
                if (cachedConfig != null) {
                    requestVpnPermissionAndConnect(cachedConfig)
                } else {
                    // No cached config — show message
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("No auto config available")
                        .setMessage("No cached config found. Please use MODE 2 below to paste a config URI.\n\nThe app will cache the config for future Quick Connect use.")
                        .setPositiveButton("OK", null)
                        .show()
                    statusText?.text = "● No auto config — use manual mode below"
                    statusText?.setTextColor(Color.parseColor("#ff4d6d"))
                }
            }
        }
        container.addView(quickConnectBtn)

        // === MODE 2: Manual Config (paste URI) ===
        val manualLabel = TextView(this).apply {
            text = "MODE 2: Manual Config (paste URI)"
            textSize = 11f
            setTextColor(Color.parseColor("#8b5cf6"))
            letterSpacing = 0.1f
            setPadding(0, 8, 0, 8)
        }
        container.addView(manualLabel)

        val configInput = EditText(this).apply {
            hint = "vless://... or vmess://... or trojan://... or ss://..."
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#444a5e"))
            setBackgroundColor(Color.parseColor("#0d1426"))
            setPadding(24, 16, 24, 16)
            inputType = InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 2
            maxLines = 4
            textSize = 11f
        }
        container.addView(configInput)

        // Paste from clipboard button
        val pasteBtn = Button(this).apply {
            text = "📋 PASTE FROM CLIPBOARD"
            setBackgroundColor(Color.parseColor("#1a2138"))
            setTextColor(Color.parseColor("#5cf2ff"))
            textSize = 11f
            setPadding(32, 16, 32, 16)
            setOnClickListener {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = clipboard.primaryClip
                if (clip != null && clip.itemCount > 0) {
                    val text = clip.getItemAt(0).coerceToText(this@MainActivity).toString()
                    if (text.startsWith("vless://") || text.startsWith("vmess://") ||
                        text.startsWith("trojan://") || text.startsWith("ss://")) {
                        configInput.setText(text)
                        Toast.makeText(this@MainActivity, "✓ Config pasted", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "Clipboard doesn't contain a VPN URI", Toast.LENGTH_LONG).show()
                    }
                } else {
                    Toast.makeText(this@MainActivity, "Clipboard is empty", Toast.LENGTH_SHORT).show()
                }
            }
        }
        container.addView(pasteBtn)

        // Connect button (manual)
        val connectBtn = Button(this).apply {
            text = "🔌 CONNECT (manual config)"
            setBackgroundColor(Color.parseColor("#8b5cf6"))
            setTextColor(Color.WHITE)
            textSize = 14f
            letterSpacing = 0.1f
            setPadding(48, 32, 48, 32)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(0, 16, 0, 16)
            layoutParams = params
            setOnClickListener {
                val configUri = configInput.text.toString().trim()
                if (configUri.isEmpty()) {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("No config provided")
                        .setMessage("Please paste a real Community Mesh config URI (vless://, vmess://, trojan://, or ss://).\n\nYou can get one from the Distort web dashboard → Community Mesh tab.")
                        .setPositiveButton("OK", null)
                        .show()
                    return@setOnClickListener
                }
                if (!(configUri.startsWith("vless://") || configUri.startsWith("vmess://") ||
                      configUri.startsWith("trojan://") || configUri.startsWith("ss://"))) {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("Invalid config")
                        .setMessage("Config URI must start with vless://, vmess://, trojan://, or ss://")
                        .setPositiveButton("OK", null)
                        .show()
                    return@setOnClickListener
                }

                // Cache this config for future Quick Connect use
                cacheConfig(configUri)

                requestVpnPermissionAndConnect(configUri)
            }
        }
        container.addView(connectBtn)

        // Disconnect button
        val disconnectBtn = Button(this).apply {
            text = "⏹ DISCONNECT"
            setBackgroundColor(Color.parseColor("#ff4d6d"))
            setTextColor(Color.WHITE)
            textSize = 12f
            setPadding(32, 16, 32, 16)
            setOnClickListener {
                val intent = Intent(this@MainActivity, DistortVpnService::class.java).apply {
                    action = DistortVpnService.ACTION_DISCONNECT
                }
                startService(intent)
                statusText?.text = "● Disconnected"
                statusText?.setTextColor(Color.parseColor("#8aa0c4"))
                speedText?.visibility = View.GONE
                exitIpText?.visibility = View.GONE
                stopSpeedUpdates()
            }
        }
        container.addView(disconnectBtn)

        // Help text
        val help = TextView(this).apply {
            text = "Mode 1: Auto-connect with cached/best config\nMode 2: Paste your own config URI\n\nThe app caches your last config for Quick Connect."
            textSize = 10f
            setTextColor(Color.parseColor("#5a6478"))
            setPadding(0, 16, 0, 0)
            gravity = Gravity.CENTER
        }
        container.addView(help)

        // === In-app update checker ===
        //
        // Tapping this button hits GitHub Releases for the latest published
        // APK. If a newer version is available we show a dialog with the
        // release notes + a Download & Install button. The auto-check on
        // launch will also pop the same dialog silently 3s after the
        // activity creates.
        //
        // HONEST NOTE: installing a release-signed APK over a debug-signed
        // build (or vice versa) will be REFUSED by the system installer
        // due to signature mismatch — the user must uninstall first. This
        // is by Android design and we can't bypass it.
        val checkUpdatesBtn = Button(this).apply {
            text = "🔄 CHECK FOR UPDATES"
            setBackgroundColor(Color.parseColor("#0d1426"))
            setTextColor(Color.parseColor("#5cf2ff"))
            textSize = 11f
            letterSpacing = 0.1f
            setPadding(32, 16, 32, 16)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(0, 16, 0, 0)
            layoutParams = params
            setOnClickListener {
                checkForUpdate(
                    showToastIfUpToDate = true,
                    showToastOnError = true
                )
            }
        }
        container.addView(checkUpdatesBtn)

        // Version
        val version = TextView(this).apply {
            // BuildConfig.VERSION_NAME is injected by gradle from VERSION_CODE
            // (e.g. "1.0.4") — keeps the displayed version honest with the
            // installed versionCode.
            text = "v${BuildConfig.VERSION_NAME} · 100% Free · MIT"
            textSize = 10f
            setTextColor(Color.parseColor("#8aa0c4"))
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 0)
            letterSpacing = 0.1f
        }
        container.addView(version)

        return container
    }

    // ─── In-app updates ───────────────────────────────────────────────
    //
    // checkForUpdate() queries GitHub Releases for the latest APK and shows
    // a dialog if a newer version exists. The auto-check on launch calls
    // this with both showToast* flags false (silent); the manual button
    // calls it with both true (loud).
    private fun checkForUpdate(
        showToastIfUpToDate: Boolean,
        showToastOnError: Boolean
    ) {
        if (updateDialogShowing) return
        Toast.makeText(this, "Checking for updates…", Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            val update = updateChecker.checkForUpdate()
            if (update == null) {
                // checkForUpdate returns null for: (a) up-to-date,
                // (b) no APK asset in release, (c) network/parse error.
                // We can't distinguish (a) from (c) here without an extra
                // return channel — by design, the auto-check stays silent
                // in all of those cases.
                if (showToastIfUpToDate) {
                    Toast.makeText(
                        this@MainActivity,
                        "Distort is up to date (v${BuildConfig.VERSION_NAME})",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                return@launch
            }
            showUpdateAvailableDialog(update)
        }
    }

    private fun showUpdateAvailableDialog(update: UpdateChecker.UpdateInfo) {
        updateDialogShowing = true
        val sizeMb = if (update.apkSize > 0)
            String.format("%.1f MB", update.apkSize / 1_048_576.0)
        else "unknown size"

        val notes = if (update.releaseNotes.isNotEmpty()) {
            // Cap release notes at ~500 chars so the dialog doesn't get
            // enormous on a phone screen. Markdown is shown as plain text
            // (Android AlertDialog doesn't render markdown).
            val raw = update.releaseNotes.take(500)
            if (update.releaseNotes.length > 500) "$raw…" else raw
        } else {
            "(no release notes provided)"
        }

        val message = buildString {
            appendLine("A new version of Distort is available.")
            appendLine()
            appendLine("Installed:  v${BuildConfig.VERSION_NAME} (code ${BuildConfig.VERSION_CODE})")
            appendLine("Available:  ${update.tag} (code ${update.versionCode})")
            appendLine("APK size:   $sizeMb")
            appendLine()
            appendLine("Release notes:")
            append(notes)
        }

        AlertDialog.Builder(this)
            .setTitle("Update available")
            .setMessage(message)
            .setPositiveButton("Download & Install") { _, _ ->
                updateDialogShowing = false
                downloadAndInstall(update)
            }
            .setNegativeButton("Later") { _, _ ->
                updateDialogShowing = false
            }
            .setOnCancelListener {
                updateDialogShowing = false
            }
            .show()
    }

    private fun downloadAndInstall(update: UpdateChecker.UpdateInfo) {
        // Progress dialog with a horizontal ProgressBar + a percentage label.
        // We keep references so we can update them from the download coroutine.
        val progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
        }
        val progressLabel = TextView(this).apply {
            text = "Downloading ${update.apkName}… 0%"
            textSize = 12f
            setTextColor(Color.parseColor("#5cf2ff"))
            setPadding(0, 16, 0, 0)
            gravity = Gravity.CENTER
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 16)
            addView(progressBar)
            addView(progressLabel)
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle("Downloading update")
            .setView(container)
            .setCancelable(false)
            // No buttons — we dismiss programmatically when the download
            // either completes or fails.
            .create()
        dialog.show()

        lifecycleScope.launch {
            try {
                val apkFile = updateChecker.downloadApk(update) { frac ->
                    // UpdateChecker invokes onProgress from the IO dispatcher;
                    // the ProgressBar / TextView are not thread-safe so we
                    // hop to the main thread via the Handler.
                    val percent = (frac * 100f).toInt().coerceIn(0, 100)
                    handler.post {
                        if (dialog.isShowing) {
                            progressBar.progress = percent
                            progressLabel.text =
                                "Downloading ${update.apkName}… $percent%"
                        }
                    }
                }
                dialog.dismiss()
                Toast.makeText(
                    this@MainActivity,
                    "Download complete — launching installer",
                    Toast.LENGTH_SHORT
                ).show()
                updateChecker.installApk(apkFile)
            } catch (e: Exception) {
                dialog.dismiss()
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Update failed")
                    .setMessage(
                        "Couldn't download the update.\n\n" +
                        "Reason: ${e.javaClass.simpleName}: ${e.message}\n\n" +
                        "Check your network connection and try again, or " +
                        "download the APK manually from GitHub Releases."
                    )
                    .setPositiveButton("OK", null)
                    .show()
            }
        }
    }

    // Cache config to SharedPreferences for Quick Connect
    private fun cacheConfig(uri: String) {
        val prefs = getSharedPreferences("distort", Context.MODE_PRIVATE)
        prefs.edit().putString("cached_config_uri", uri).apply()
        Toast.makeText(this, "✓ Config cached for Quick Connect", Toast.LENGTH_SHORT).show()
    }

    private fun getCachedConfig(): String? {
        val prefs = getSharedPreferences("distort", Context.MODE_PRIVATE)
        return prefs.getString("cached_config_uri", null)
    }

    private fun requestVpnPermissionAndConnect(configUri: String) {
        val intent = Intent(this, DistortVpnService::class.java).apply {
            action = DistortVpnService.ACTION_CONNECT
            putExtra("config_uri", configUri)
            putExtra("protocol", "")
        }

        val vpnIntent = android.net.VpnService.prepare(this)
        if (vpnIntent != null) {
            lastConfigUri = configUri
            startActivityForResult(vpnIntent, VPN_REQUEST_CODE)
        } else {
            startForegroundService(intent)
            statusText?.text = "● Connecting…"
            statusText?.setTextColor(Color.parseColor("#ffb020"))
            startSpeedUpdates()
        }
    }

    private var lastConfigUri: String = ""

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == VPN_REQUEST_CODE && resultCode == Activity.RESULT_OK) {
            val intent = Intent(this, DistortVpnService::class.java).apply {
                action = DistortVpnService.ACTION_CONNECT
                putExtra("config_uri", lastConfigUri)
                putExtra("protocol", "")
            }
            startForegroundService(intent)
            statusText?.text = "● Connecting…"
            statusText?.setTextColor(Color.parseColor("#ffb020"))
            startSpeedUpdates()
        } else if (requestCode == VPN_REQUEST_CODE) {
            Toast.makeText(this, "VPN permission denied", Toast.LENGTH_SHORT).show()
            statusText?.text = "● Permission denied"
            statusText?.setTextColor(Color.parseColor("#ff4d6d"))
        }
    }

    // Speed update loop — reads from SharedPreferences that VpnService updates
    private fun startSpeedUpdates() {
        stopSpeedUpdates()
        speedUpdateRunnable = object : Runnable {
            override fun run() {
                val prefs = getSharedPreferences("distort", Context.MODE_PRIVATE)
                val connected = prefs.getBoolean("vpn_connected", false)
                val downSpeed = prefs.getLong("vpn_down_speed", 0)
                val upSpeed = prefs.getLong("vpn_up_speed", 0)
                val totalDown = prefs.getLong("vpn_total_down", 0)
                val totalUp = prefs.getLong("vpn_total_up", 0)
                val exitIp = prefs.getString("vpn_exit_ip", null)
                val exitCountry = prefs.getString("vpn_exit_country", null)

                if (connected) {
                    statusText?.text = "● Connected"
                    statusText?.setTextColor(Color.parseColor("#10d9a0"))

                    // Show live speed
                    speedText?.visibility = View.VISIBLE
                    speedText?.text = "↓ ${formatSpeed(downSpeed)}  ↑ ${formatSpeed(upSpeed)}  |  Total: ↓ ${formatBytes(totalDown)} ↑ ${formatBytes(totalUp)}"

                    // Show exit IP + country
                    if (exitIp != null) {
                        exitIpText?.visibility = View.VISIBLE
                        exitIpText?.text = "Exit: $exitIp ($exitCountry)"
                    }
                } else {
                    // Check if service is still running
                    val serviceRunning = prefs.getBoolean("vpn_service_running", false)
                    if (serviceRunning) {
                        statusText?.text = "● Verifying tunnel…"
                        statusText?.setTextColor(Color.parseColor("#ffb020"))
                        speedText?.visibility = View.GONE
                        exitIpText?.visibility = View.GONE
                    } else {
                        statusText?.text = "● Disconnected"
                        statusText?.setTextColor(Color.parseColor("#8aa0c4"))
                        speedText?.visibility = View.GONE
                        exitIpText?.visibility = View.GONE
                        stopSpeedUpdates()
                    }
                }

                handler.postDelayed(this, 1000)
            }
        }
        handler.post(speedUpdateRunnable!!)
    }

    private fun stopSpeedUpdates() {
        speedUpdateRunnable?.let { handler.removeCallbacks(it) }
        speedUpdateRunnable = null
    }

    private fun formatSpeed(bps: Long): String {
        if (bps < 1000) return "${bps} B/s"
        if (bps < 1_000_000) return String.format("%.1f KB/s", bps / 1000.0)
        return String.format("%.1f MB/s", bps / 1_000_000.0)
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "${bytes} B"
        if (bytes < 1_048_576) return String.format("%.1f KB", bytes / 1024.0)
        if (bytes < 1_073_741_824) return String.format("%.1f MB", bytes / 1_048_576.0)
        return String.format("%.2f GB", bytes / 1_073_741_824.0)
    }

    override fun onResume() {
        super.onResume()
        // Start monitoring when app comes to foreground
        startSpeedUpdates()
    }

    override fun onPause() {
        super.onPause()
        // Keep monitoring in background — the service updates SharedPreferences
        // We'll read it when the app comes back
    }

    override fun onDestroy() {
        super.onDestroy()
        stopSpeedUpdates()
    }
}
