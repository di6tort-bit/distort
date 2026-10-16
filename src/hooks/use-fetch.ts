"use client";

import { useEffect, useState } from "react";

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

// Lightweight fetch hook (no external dep) — derived loading state to avoid
// synchronous setState inside the effect body (React 19 rule).
export function useFetch<T = unknown>(url: string | null): State<T> {
  const [cache, setCache] = useState<{ url: string | null; data: T | null; error: string | null }>({
    url: null,
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then((d) => {
        if (!cancelled) setCache({ url, data: d, error: null });
      })
      .catch((e) => {
        if (!cancelled) setCache({ url, data: null, error: e?.message ?? "Network error" });
      });
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const loading = !!url && cache.url !== url && !cache.error;
  const data = cache.url === url ? cache.data : null;
  const error = cache.url === url ? cache.error : null;

  return { data, loading, error, refetch: () => setNonce((n) => n + 1) };
}

export async function postJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function putJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
