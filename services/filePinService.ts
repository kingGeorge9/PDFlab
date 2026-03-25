/**
 * File Pin Service
 * Persists pinned file IDs (max 4) in AsyncStorage.
 * Pinned files are surfaced prominently in the Library.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PIN_KEY = "@pdflab_pinned_files";

/** Maximum number of files that can be pinned simultaneously */
export const MAX_PINS = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readPins(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PIN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function writePins(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(PIN_KEY, JSON.stringify(ids));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return all currently-pinned file IDs (order is preserved). */
export async function getPinnedFileIds(): Promise<string[]> {
  return readPins();
}

/**
 * Pin a file.
 *  - If already pinned: no-op (success).
 *  - If the pin list is at MAX_PINS: returns failure with user-facing error.
 */
export async function pinFile(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const pins = await readPins();
  if (pins.includes(id)) return { success: true };
  if (pins.length >= MAX_PINS) {
    return { success: false, error: "You can only pin 4 files." };
  }
  await writePins([...pins, id]);
  return { success: true };
}

/** Remove a file from the pin list (no-op if not pinned). */
export async function unpinFile(id: string): Promise<void> {
  const pins = await readPins();
  await writePins(pins.filter((p) => p !== id));
}

/** Toggle pin state. Returns the new pinned state on success. */
export async function togglePinFile(
  id: string,
): Promise<{ pinned: boolean; error?: string }> {
  const pins = await readPins();
  if (pins.includes(id)) {
    await unpinFile(id);
    return { pinned: false };
  }
  const result = await pinFile(id);
  if (!result.success) return { pinned: false, error: result.error };
  return { pinned: true };
}

/** Check whether a specific file is currently pinned. */
export async function isFilePinned(id: string): Promise<boolean> {
  const pins = await readPins();
  return pins.includes(id);
}
