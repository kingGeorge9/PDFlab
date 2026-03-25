/**
 * URL Failure Cache
 * ─────────────────────────────────────────────────────────────────────
 * Remembers download URLs that recently failed so the UI can:
 *   1. Suppress known-bad results from search listings
 *   2. Show a "previously failed" indicator on borderline results
 *
 * Entries auto-expire after TTL_MS (default 24 h) to allow retries
 * when upstream sources recover.
 *
 * Backed by AsyncStorage so failures survive app restarts within TTL.
 * ─────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Config ───────────────────────────────────────────────────────────
const STORAGE_KEY = "@pdflab/url_failure_cache";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 500; // cap to prevent unbounded growth

// ── Types ────────────────────────────────────────────────────────────
interface FailureEntry {
  /** The URL that failed. */
  url: string;
  /** ISO timestamp of last failure. */
  failedAt: number;
  /** Short reason category (for analytics / display). */
  reason: FailureReason;
}

export type FailureReason =
  | "not_pdf"
  | "network"
  | "paywall"
  | "unavailable"
  | "unknown";

// ── In-memory mirror (hot path reads, cold path writes) ─────────────
let cache: Map<string, FailureEntry> = new Map();
let loaded = false;

// ── Public API ───────────────────────────────────────────────────────

/** Ensure cache is hydrated from disk. Safe to call multiple times. */
async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const entries: FailureEntry[] = JSON.parse(raw);
      const now = Date.now();
      for (const entry of entries) {
        if (now - entry.failedAt < TTL_MS) {
          cache.set(entry.url, entry);
        }
      }
    }
  } catch (e) {
    console.warn("[UrlFailureCache] hydration error:", e);
  }
  loaded = true;
}

/** Persist after writes (debounced internally). */
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const entries = Array.from(cache.values());
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn("[UrlFailureCache] persist error:", e);
    }
  }, 1000);
}

/**
 * Record a failed URL so it's suppressed from future results.
 */
export async function recordFailure(
  url: string,
  reason: FailureReason = "unknown",
): Promise<void> {
  await ensureLoaded();

  cache.set(url, { url, failedAt: Date.now(), reason });

  // Evict oldest entries if over cap
  if (cache.size > MAX_ENTRIES) {
    const sorted = Array.from(cache.values()).sort(
      (a, b) => a.failedAt - b.failedAt,
    );
    const toRemove = sorted.slice(0, cache.size - MAX_ENTRIES);
    for (const entry of toRemove) {
      cache.delete(entry.url);
    }
  }

  schedulePersist();
}

/**
 * Check whether a URL has failed recently (within TTL).
 */
export async function hasRecentFailure(url: string): Promise<boolean> {
  await ensureLoaded();
  const entry = cache.get(url);
  if (!entry) return false;

  if (Date.now() - entry.failedAt >= TTL_MS) {
    cache.delete(entry.url);
    return false;
  }
  return true;
}

/**
 * Synchronous check — only valid after `ensureLoaded()` has completed
 * at least once. Useful in hot render paths.
 */
export function hasRecentFailureSync(url: string): boolean {
  const entry = cache.get(url);
  if (!entry) return false;

  if (Date.now() - entry.failedAt >= TTL_MS) {
    cache.delete(entry.url);
    return false;
  }
  return true;
}

/**
 * Filter an array of search results, removing any whose primary
 * download URL has a recent failure cached.
 */
export function filterFailedResults<
  T extends { downloadOptions: { url: string }[] },
>(results: T[]): T[] {
  return results.filter(
    (r) => !r.downloadOptions.some((opt) => hasRecentFailureSync(opt.url)),
  );
}

/**
 * Clear the entire failure cache (e.g., from Settings → Clear Cache).
 */
export async function clearFailureCache(): Promise<void> {
  cache.clear();
  loaded = true;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Pre-warm the cache. Call once at app startup or screen mount.
 */
export async function warmFailureCache(): Promise<void> {
  await ensureLoaded();
}
