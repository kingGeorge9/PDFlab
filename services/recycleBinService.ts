/**
 * Recycle Bin Service
 *
 * Manages soft-deleted files. Files stay in the recycle bin for 15 days
 * before being permanently removed (from app or device, per user setting).
 */
import { loadSettings } from "@/services/settingsService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecycledFile {
  id: string;
  name: string;
  uri: string;
  size: number;
  type: string;
  mimeType: string;
  deletedAt: number; // timestamp
  expiresAt: number; // timestamp (deletedAt + 15 days)
  originalSource?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECYCLE_KEY = "@pdflab_recycle_bin";
const RETENTION_DAYS = 15;
const MS_PER_DAY = 86_400_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readBin(): Promise<RecycledFile[]> {
  try {
    const raw = await AsyncStorage.getItem(RECYCLE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeBin(items: RecycledFile[]): Promise<void> {
  await AsyncStorage.setItem(RECYCLE_KEY, JSON.stringify(items));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Get all files currently in the recycle bin (excludes expired). */
export async function getRecycledFiles(): Promise<RecycledFile[]> {
  await purgeExpired(); // auto-purge on read
  return readBin();
}

/** Move a file to the recycle bin (soft delete). */
export async function recycleFile(file: {
  id: string;
  name: string;
  uri: string;
  size: number;
  type: string;
  mimeType: string;
  source?: string;
}): Promise<void> {
  const now = Date.now();
  const entry: RecycledFile = {
    id: file.id,
    name: file.name,
    uri: file.uri,
    size: file.size,
    type: file.type,
    mimeType: file.mimeType,
    deletedAt: now,
    expiresAt: now + RETENTION_DAYS * MS_PER_DAY,
    originalSource: file.source,
  };

  const bin = await readBin();
  // Avoid duplicates
  const filtered = bin.filter((f) => f.id !== file.id);
  filtered.push(entry);
  await writeBin(filtered);
}

/** Restore a file from the recycle bin (returns it for re-insertion into the library). */
export async function restoreFile(
  fileId: string,
): Promise<RecycledFile | null> {
  const bin = await readBin();
  const item = bin.find((f) => f.id === fileId);
  if (!item) return null;

  await writeBin(bin.filter((f) => f.id !== fileId));
  return item;
}

/** Permanently delete one file from the recycle bin. Respects deleteBehavior setting. */
export async function permanentlyDelete(fileId: string): Promise<void> {
  const bin = await readBin();
  const item = bin.find((f) => f.id === fileId);
  if (!item) return;

  const settings = await loadSettings();
  if (settings.deleteBehavior === "device") {
    try {
      const info = await FileSystem.getInfoAsync(item.uri);
      if (info.exists) {
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
      }
    } catch (e) {
      console.warn("Could not delete file from device:", e);
    }
  }

  await writeBin(bin.filter((f) => f.id !== fileId));
}

/** Empty the entire recycle bin. Respects deleteBehavior setting. */
export async function emptyRecycleBin(): Promise<void> {
  const bin = await readBin();
  const settings = await loadSettings();

  if (settings.deleteBehavior === "device") {
    for (const item of bin) {
      try {
        const info = await FileSystem.getInfoAsync(item.uri);
        if (info.exists) {
          await FileSystem.deleteAsync(item.uri, { idempotent: true });
        }
      } catch {
        // skip
      }
    }
  }

  await writeBin([]);
}

/** Purge files that have exceeded their 15-day retention. */
export async function purgeExpired(): Promise<number> {
  const bin = await readBin();
  const now = Date.now();
  const expired = bin.filter((f) => f.expiresAt <= now);
  const remaining = bin.filter((f) => f.expiresAt > now);

  if (expired.length === 0) return 0;

  const settings = await loadSettings();
  if (settings.deleteBehavior === "device") {
    for (const item of expired) {
      try {
        const info = await FileSystem.getInfoAsync(item.uri);
        if (info.exists) {
          await FileSystem.deleteAsync(item.uri, { idempotent: true });
        }
      } catch {
        // skip
      }
    }
  }

  await writeBin(remaining);
  return expired.length;
}

/** Get the count of files in the recycle bin. */
export async function getRecycleCount(): Promise<number> {
  const bin = await readBin();
  return bin.length;
}

/** Returns days remaining before a recycled file expires. */
export function daysRemaining(file: RecycledFile): number {
  const ms = file.expiresAt - Date.now();
  return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}
