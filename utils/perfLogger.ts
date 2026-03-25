/**
 * perfLogger.ts
 *
 * Lightweight performance logging utility.
 * Measures durations of async/sync operations and logs them.
 * Controlled by a global flag — disabled in production by default.
 *
 * Usage:
 *   const end = perfMark('PDF.save');
 *   await doWork();
 *   end(); // logs "[Perf] PDF.save: 142ms"
 *
 *   // Or wrap a promise:
 *   const result = await perfWrap('PDF.save', doWork());
 */

// ── Configuration ──────────────────────────────────────────────────────────

/** Set to `true` to enable performance logs in dev. Always `false` in prod. */
export const PERF_LOGGING_ENABLED = __DEV__;

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Start a performance marker. Returns a function that, when called,
 * logs the elapsed duration and returns it in milliseconds.
 */
export function perfMark(label: string): () => number {
  if (!PERF_LOGGING_ENABLED) return () => 0;

  const start = performance.now();
  return () => {
    const elapsed = Math.round(performance.now() - start);
    console.log(`[Perf] ${label}: ${elapsed}ms`);
    return elapsed;
  };
}

/**
 * Wrap an async operation with a performance marker.
 * Returns the result of the promise and logs the duration.
 */
export async function perfWrap<T>(
  label: string,
  promise: Promise<T>,
): Promise<T> {
  if (!PERF_LOGGING_ENABLED) return promise;

  const end = perfMark(label);
  try {
    const result = await promise;
    end();
    return result;
  } catch (err) {
    end();
    throw err;
  }
}

/**
 * Log a one-shot performance note (no timing, just a tag).
 */
export function perfLog(label: string, detail?: string): void {
  if (!PERF_LOGGING_ENABLED) return;
  console.log(`[Perf] ${label}${detail ? `: ${detail}` : ""}`);
}
