/**
 * EPUB Service
 *
 * Lightweight service for EPUB file handling:
 *  - URI normalisation (SAF / file:// / bare paths)
 *  - Reading EPUB as base64 for WebView
 *  - Reading-progress & reader-settings persistence (AsyncStorage)
 *  - Display-name extraction
 *
 * The actual rendering is handled by epub.js inside a WebView
 * (see app/epub-viewer.tsx + services/epubBundledScripts.ts).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

// ============================================================================
// TYPES
// ============================================================================

export interface ReadingProgress {
  /** epub.js CFI string – the last known location */
  cfi: string | null;
  /** 0–100 progress percentage */
  percentage: number;
  /** Unix-ms of last read */
  lastRead: number;
}

export interface EpubReaderSettings {
  fontSize: number; // epub.js uses percentage (e.g. 100 = default)
  theme: "light" | "dark" | "sepia";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const READING_PROGRESS_KEY = "@epub_reading_progress_v2";
const READER_SETTINGS_KEY = "@epub_reader_settings_v2";

const DEFAULT_READER_SETTINGS: EpubReaderSettings = {
  fontSize: 100,
  theme: "light",
};

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Normalise an EPUB URI so it can be read by expo-file-system.
 * Handles SAF `content://` URIs by copying to the cache directory.
 */
export async function normalizeEpubUri(uri: string): Promise<string> {
  if (uri.startsWith("content://")) {
    const cacheDir = FileSystem.cacheDirectory;
    const fileName = `epub_${Date.now()}.epub`;
    const destPath = `${cacheDir}${fileName}`;
    try {
      await FileSystem.copyAsync({ from: uri, to: destPath });
      return destPath;
    } catch (error) {
      console.error("[EpubService] Error copying SAF URI:", error);
      throw new Error("Failed to access EPUB file");
    }
  }
  if (uri.startsWith("file://")) return uri;
  return uri;
}

/**
 * Read an EPUB file and return its contents as a base64 string.
 */
export async function readEpubAsBase64(uri: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    console.error("[EpubService] Error reading EPUB as base64:", error);
    throw new Error("Failed to read EPUB file");
  }
}

// ============================================================================
// READING PROGRESS
// ============================================================================

/** Save reading progress for an EPUB file. */
export async function saveReadingProgress(
  fileUri: string,
  progress: ReadingProgress,
): Promise<void> {
  try {
    const key = progressKey(fileUri);
    const allJson = await AsyncStorage.getItem(READING_PROGRESS_KEY);
    const all: Record<string, ReadingProgress> = allJson
      ? JSON.parse(allJson)
      : {};
    all[key] = progress;
    await AsyncStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(all));
  } catch (error) {
    console.error("[EpubService] Error saving reading progress:", error);
  }
}

/** Load reading progress for an EPUB file. */
export async function loadReadingProgress(
  fileUri: string,
): Promise<ReadingProgress | null> {
  try {
    const key = progressKey(fileUri);
    const allJson = await AsyncStorage.getItem(READING_PROGRESS_KEY);
    if (!allJson) return null;
    const all: Record<string, ReadingProgress> = JSON.parse(allJson);
    return all[key] ?? null;
  } catch (error) {
    console.error("[EpubService] Error loading reading progress:", error);
    return null;
  }
}

function progressKey(fileUri: string): string {
  const parts = fileUri.split("/");
  return parts[parts.length - 1] || fileUri;
}

// ============================================================================
// READER SETTINGS
// ============================================================================

export function getDefaultReaderSettings(): EpubReaderSettings {
  return { ...DEFAULT_READER_SETTINGS };
}

export async function saveReaderSettings(
  settings: EpubReaderSettings,
): Promise<void> {
  try {
    await AsyncStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("[EpubService] Error saving reader settings:", error);
  }
}

export async function loadReaderSettings(): Promise<EpubReaderSettings> {
  try {
    const json = await AsyncStorage.getItem(READER_SETTINGS_KEY);
    if (!json) return DEFAULT_READER_SETTINGS;
    return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(json) };
  } catch (error) {
    console.error("[EpubService] Error loading reader settings:", error);
    return DEFAULT_READER_SETTINGS;
  }
}

// ============================================================================
// DISPLAY NAME
// ============================================================================

/** Extract a human-friendly name from an EPUB file URI. */
export function getEpubDisplayName(uri: string): string {
  const parts = uri.split("/");
  const filename = parts[parts.length - 1] || "document.epub";
  return decodeURIComponent(filename);
}
