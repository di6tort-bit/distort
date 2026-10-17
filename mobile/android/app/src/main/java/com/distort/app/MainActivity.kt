package com.distort.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.VpnService
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
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
            setPadding(0, 64, 0, 32)
        }
        container.addView(status)

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
            params.setMargins(32, 0, 32, 0)
            layoutParams = params
            setOnClickListener {
                val intent = Intent(VpnService.prepare(this@MainActivity))
                if (intent != null) {
                    startActivityForResult(intent, VPN_REQUEST_CODE)
                } else {
                    startVpn()
                }
            }
        }
        container.addView(connectBtn)

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

        return container
    }

    private fun startVpn() {
        val intent = Intent(this, DistortVpnService::class.java).apply {
            action = DistortVpnService.ACTION_CONNECT
            // Pass a REAL Community Mesh config URI here.
            // In production, this comes from the config selector UI.
            // For now, we require a valid URI — the service will NOT start without one.
            // Example real VLESS Reality config (replace with one from Community Mesh):
            putExtra("config_uri", "")
            putExtra("host", "")
            putExtra("port", 0)
            putExtra("protocol", "vless")
        }

        // If no config_uri is provided, show a clear error instead of starting
        // a broken connection. The user must select a real config first.
        if (intent.getStringExtra("config_uri").isNullOrEmpty()) {
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("No VPN config selected")
                .setMessage("Quick Connect requires a real Community Mesh config.\n\nPlease open the Distort web dashboard, go to Community Mesh, select an optimized config, and use the desktop app's Quick Connect button instead.\n\nThe Android app's config selector is coming in the next release.")
                .setPositiveButton("OK", null)
                .show()
            return
        }

        startForegroundService(intent)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == VPN_REQUEST_CODE && resultCode == Activity.RESULT_OK) {
            startVpn()
        }
    }
}
