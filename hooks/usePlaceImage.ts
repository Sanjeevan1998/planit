'use client';

import { useState, useEffect } from 'react';

// Module-level caches persist for the browser session — no duplicate fetches
const resolved = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Returns a resolved image URL for the given query.
 * If `provided` is already a valid HTTP URL it is returned immediately.
 * Otherwise the hook fetches /api/images and caches the result.
 */
export function usePlaceImage(provided: string | undefined, query: string): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (provided?.startsWith('http')) return provided;
    const hit = resolved.get(query);
    return hit !== undefined ? hit : null;
  });

  useEffect(() => {
    if (provided?.startsWith('http')) {
      setSrc(provided);
      return;
    }

    const hit = resolved.get(query);
    if (hit !== undefined) {
      setSrc(hit);
      return;
    }

    let promise = inflight.get(query);
    if (!promise) {
      promise = fetch(`/api/images?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d: { url: string | null }) => d.url)
        .catch(() => null)
        .then((url) => {
          resolved.set(query, url);
          inflight.delete(query);
          return url;
        });
      inflight.set(query, promise);
    }

    promise.then(setSrc);
  }, [provided, query]);

  return src;
}
