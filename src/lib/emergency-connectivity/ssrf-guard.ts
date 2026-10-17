// DISTORT — SSRF guard for the Emergency Connectivity validate endpoint
//
// Rejects any host that resolves to / looks like a private or loopback
// address before we open a TCP connection to it. This prevents the
// validate endpoint from being abused as an internal port-scanner.

/**
 * Returns true if the host string is a private / loopback / link-local / ULA
 * address (or hostname). Conservative: false-positive (rejecting a public
 * hostname that *looks* like an internal one) is fine; false-negative is not.
 */
export function isPrivateHost(host: string): boolean {
  const h = (host || "").toLowerCase().trim();
  if (!h) return true; // empty = treat as private to be safe
  if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local
  if (/^::1$/.test(h)) return true;
  if (/^fc00:/i.test(h) || /^fd00:/i.test(h)) return true; // ULA
  // .local mDNS
  if (/\.local$/.test(h)) return true;
  // IPv6 bracketed
  if (h.startsWith("[") && h.endsWith("]")) {
    const inner = h.slice(1, -1);
    if (inner === "::1" || /^fc00:/i.test(inner) || /^fd00:/i.test(inner)) return true;
  }
  return false;
}
