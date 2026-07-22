/**
 * Authenticated Image Loader
 *
 * Standard <img src> requests cannot attach the `apikey` header the
 * serve-asset edge function requires in production, so images from the
 * private bucket fail with 401. This helper fetches the asset with the
 * correct headers, converts the response into an object URL, and caches
 * the result so subsequent renders (and subsequent faults with the same
 * code) resolve instantly.
 *
 * Public API:
 *   - loadAuthenticatedImage(paths)   → Promise<string | null>
 *   - useAuthenticatedImage(paths)    → { url, loading, failed }
 */

import { useEffect, useState } from 'react';
import { fetchAuthenticatedAsset } from './assetAuth';

// path -> blob object URL (resolved) OR pending promise
const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
// paths we've already tried and confirmed missing — don't retry every render
const missCache = new Set<string>();

async function tryLoad(path: string): Promise<string | null> {
  if (urlCache.has(path)) return urlCache.get(path)!;
  if (missCache.has(path)) return null;

  const existing = inflight.get(path);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetchAuthenticatedAsset(path);
      if (!res.ok) {
        // consume body to avoid resource leak, then remember the miss
        try { await res.arrayBuffer(); } catch { /* ignore */ }
        missCache.add(path);
        return null;
      }
      const blob = await res.blob();
      if (!blob.size) {
        missCache.add(path);
        return null;
      }
      const objectUrl = URL.createObjectURL(blob);
      urlCache.set(path, objectUrl);
      return objectUrl;
    } catch {
      missCache.add(path);
      return null;
    } finally {
      inflight.delete(path);
    }
  })();

  inflight.set(path, promise);
  return promise;
}

/**
 * Try a list of candidate paths in order and return the first URL that
 * loads successfully. Returns null if every candidate fails.
 */
export async function loadAuthenticatedImage(
  candidatePaths: string[]
): Promise<string | null> {
  for (const path of candidatePaths) {
    if (!path) continue;
    const url = await tryLoad(path);
    if (url) return url;
  }
  return null;
}

/**
 * React hook: resolves the first working URL from `candidatePaths`. Returns
 * a stable object URL that can be dropped straight into <img src>.
 */
export function useAuthenticatedImage(candidatePaths: string[]): {
  url: string | null;
  loading: boolean;
  failed: boolean;
} {
  // Stable cache key so effect only re-runs when the candidate set changes.
  const key = candidatePaths.join('|');
  const [state, setState] = useState<{ url: string | null; loading: boolean; failed: boolean }>(() => {
    // Synchronously surface an already-cached hit to avoid a flash.
    for (const p of candidatePaths) {
      if (p && urlCache.has(p)) return { url: urlCache.get(p)!, loading: false, failed: false };
    }
    return { url: null, loading: true, failed: false };
  });

  useEffect(() => {
    let cancelled = false;
    // Reset when the candidate set changes.
    let initial: { url: string | null; loading: boolean; failed: boolean } = {
      url: null,
      loading: true,
      failed: false,
    };
    for (const p of candidatePaths) {
      if (p && urlCache.has(p)) {
        initial = { url: urlCache.get(p)!, loading: false, failed: false };
        break;
      }
    }
    setState(initial);
    if (!initial.loading) return;

    loadAuthenticatedImage(candidatePaths).then((url) => {
      if (cancelled) return;
      if (url) setState({ url, loading: false, failed: false });
      else setState({ url: null, loading: false, failed: true });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
