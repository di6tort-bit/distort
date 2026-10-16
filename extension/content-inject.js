// content-inject.js — Minimal content script (optional).
// Currently a no-op placeholder. It is NOT registered in manifest.json because
// MV3 content scripts require an explicit "content_scripts" entry which we omit
// to keep the extension's surface area small and avoid broad host_permissions
// enforcement surprises.
//
// Intended future use:
//   - Inject a Distort banner on the user's first tab after connecting.
//   - Detect DPI throttling in-page by timing fetch probes.
//   - Mirror "Iran-resilience" status to the toolbar badge.
//
// This file is preserved as a stub for that future work. It is safe to delete
// if not needed.

(() => {
  'use strict';
  if (window.__distortContentInjected) return;
  window.__distortContentInjected = true;
  // Intentionally does nothing for now.
})();
