package com.distort.app

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private val VPN_REQUEST_CODE = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildUI())
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
        val status = TextView(this).apply {
            text = "● Disconnected"
            textSize = 14f
            setTextColor(Color.parseColor("#8aa0c4"))
            gravity = Gravity.CENTER
            setPadding(0, 48, 0, 16)
            id = View.generateViewId()
        }
        container.addView(status)

        // Config URI input
        val configLabel = TextView(this).apply {
            text = "Community Mesh Config URI"
            textSize = 11f
            setTextColor(Color.parseColor("#5cf2ff"))
            letterSpacing = 0.1f
            setPadding(0, 24, 0, 8)
        }
        container.addView(configLabel)

        val configInput = EditText(this).apply {
            hint = "vless://... or vmess://... or trojan://... or ss://..."
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#444a5e"))
            setBackgroundColor(Color.parseColor("#0d1426"))
            setPadding(24, 16, 24, 16)
            inputType = InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 3
            maxLines = 5
            id = View.generateViewId()
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

        // Connect button
        val connectBtn = Button(this).apply {
            text = "QUICK CONNECT"
            setBackgroundColor(Color.parseColor("#00f0ff"))
            setTextColor(Color.parseColor("#02131a"))
            textSize = 14f
            letterSpacing = 0.15f
            setPadding(48, 32, 48, 32)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(32, 32, 32, 0)
            layoutParams = params
            setOnClickListener {
                val configUri = configInput.text.toString().trim()
                if (configUri.isEmpty()) {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("No config provided")
                        .setMessage("Please paste a real Community Mesh config URI (vless://, vmess://, trojan://, or ss://).\n\nYou can get one from the Distort web dashboard → Community Mesh tab, or from any V2Ray subscription.")
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
                requestVpnPermissionAndConnect(configUri)
            }
        }
        container.addView(connectBtn)

        // Disconnect button
        val disconnectBtn = Button(this).apply {
            text = "DISCONNECT"
            setBackgroundColor(Color.parseColor("#ff4d6d"))
            setTextColor(Color.WHITE)
            textSize = 12f
            setPadding(32, 16, 32, 16)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(32, 16, 32, 0)
            layoutParams = params
            setOnClickListener {
                val intent = Intent(this@MainActivity, DistortVpnService::class.java).apply {
                    action = DistortVpnService.ACTION_DISCONNECT
                }
                startService(intent)
                status.text = "● Disconnected"
                status.setTextColor(Color.parseColor("#8aa0c4"))
            }
        }
        container.addView(disconnectBtn)

        // Help text
        val help = TextView(this).apply {
            text = "Tip: Copy a config from the web dashboard's Community Mesh tab, then tap PASTE FROM CLIPBOARD here."
            textSize = 10f
            setTextColor(Color.parseColor("#5a6478"))
            setPadding(0, 24, 0, 0)
            gravity = Gravity.CENTER
        }
        container.addView(help)

        // Version
        val version = TextView(this).apply {
            text = "v1.0.0 · 100% Free · MIT"
            textSize = 10f
            setTextColor(Color.parseColor("#8aa0c4"))
            gravity = Gravity.CENTER
            setPadding(0, 48, 0, 0)
            letterSpacing = 0.1f
        }
        container.addView(version)

        // Store status view for updates
        appStatusView = status

        return container
    }

    companion object {
        @Volatile var appStatusView: TextView? = null
    }

    private fun requestVpnPermissionAndConnect(configUri: String) {
        val intent = Intent(this, DistortVpnService::class.java).apply {
            action = DistortVpnService.ACTION_CONNECT
            putExtra("config_uri", configUri)
            putExtra("protocol", "") // service will detect from URI
        }

        val vpnIntent = android.net.VpnService.prepare(this)
        if (vpnIntent != null) {
            // Need user permission
            lastConfigUri = configUri
            startActivityForResult(vpnIntent, VPN_REQUEST_CODE)
        } else {
            // Already have permission
            startForegroundService(intent)
            appStatusView?.text = "● Connecting…"
            appStatusView?.setTextColor(Color.parseColor("#ffb020"))
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
            appStatusView?.text = "● Connecting…"
            appStatusView?.setTextColor(Color.parseColor("#ffb020"))
        } else if (requestCode == VPN_REQUEST_CODE) {
            Toast.makeText(this, "VPN permission denied", Toast.LENGTH_SHORT).show()
        }
    }
}
