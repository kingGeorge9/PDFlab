/**
 * Unified File Index Service
 * Single source of truth for all files in the app
 *
 * This service unifies file tracking across:
 * - Created files (PDF/DOCX/PPT etc.)
 * - Saved files
 * - Shared files
 * - Imported files (picked from device)
 * - Downloaded files
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

// ============================================================================
// TYPES
// ============================================================================

/** Source/action tags for files */
export type FileSourceTag = "created" | "imported" | "downloaded" | "shared";

/** File type categories */
export type FileTypeCategory =
  | "pdf"
  | "docx"
  | "ppt"
  | "excel"
  | "image"
  | "epub"
  | "unknown";

/** Unified file record interface */
export interface UnifiedFileRecord {
  /** Unique stable ID */
  id: string;
  /** Display name of the file */
  name: string;
  /** File URI - local path */
  uri: string;
  /** Original URI before caching (if applicable) */
  originalUri?: string;
  /** File type category */
  type: FileTypeCategory;
  /** File extension (lowercase, without dot) */
  extension: string;
  /** MIME type */
  mimeType?: string;
  /** Source tags - how the file entered the app */
  sourceTags: FileSourceTag[];
  /** Timestamp when file was created/added */
  createdAt: number;
  /** Timestamp when file was last opened */
  lastOpenedAt: number;
  /** File size in bytes */
  size?: number;
  /** Whether cached file is valid */
  cacheValid?: boolean;
  /** Source of the file (legacy compatibility) */
  source?: "picked" | "created" | "downloaded" | "imported";
  /** Whether this file requires SAF permission */
  isSafUri?: boolean;
}

export interface UpsertFileParams {
  uri: string;
  name: string;
  type?: FileTypeCategory;
  extension?: string;
  mimeType?: string;
  size?: number;
  sourceTags?: FileSourceTag[];
  originalUri?: string;
  source?: "picked" | "created" | "downloaded" | "imported";
  isSafUri?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const UNIFIED_INDEX_KEY = "@pdflab_unified_file_index";
const MAX_FILES = 500;
const CACHE_DIR = `${FileSystem.documentDirectory}library-cache/`;

// In-memory cache for performance
let memoryCache: UnifiedFileRecord[] | null = null;
let memoryCacheLoaded = false;

// Derived caches – invalidated on every write
let sortedCache: UnifiedFileRecord[] | null = null;
let idMap: Map<string, UnifiedFileRecord> | null = null;
let uriMap: Map<string, UnifiedFileRecord> | null = null;

const invalidateDerivedCaches = () => {
  sortedCache = null;
  idMap = null;
  uriMap = null;
};

const ensureLookupMaps = (files: UnifiedFileRecord[]) => {
  if (idMap && uriMap) return;
  idMap = new Map();
  uriMap = new Map();
  for (const f of files) {
    idMap.set(f.id, f);
    uriMap.set(f.uri, f);
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a stable ID from URI and timestamp
 */
export const generateFileId = (uri: string, timestamp?: number): string => {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    const char = uri.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const ts = timestamp || Date.now();
  return `file_${Math.abs(hash).toString(36)}_${ts.toString(36)}`;
};

/**
 * Extract file extension from filename
 */
export const extractExtension = (filename: string): string => {
  const parts = filename.split(".");
  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() || "";
  }
  return "";
};

/**
 * Determine file type category from extension or mime type
 */
export const determineFileType = (
  extension?: string,
  mimeType?: string,
): FileTypeCategory => {
  const ext = extension?.toLowerCase();

  if (ext === "pdf" || mimeType?.includes("pdf")) return "pdf";
  if (
    ext === "docx" ||
    ext === "doc" ||
    mimeType?.includes("word") ||
    mimeType?.includes("document")
  )
    return "docx";
  if (ext === "epub" || mimeType?.includes("epub")) return "epub";
  if (
    ext === "pptx" ||
    ext === "ppt" ||
    mimeType?.includes("presentation") ||
    mimeType?.includes("powerpoint")
  )
    return "ppt";
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mimeType?.includes("spreadsheet") ||
    mimeType?.includes("excel")
  )
    return "excel";
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp"].includes(ext || "") ||
    mimeType?.startsWith("image/")
  )
    return "image";

  return "unknown";
};

/**
 * Check if URI is a SAF URI
 */
export const isSafUri = (uri: string): boolean => {
  return uri.startsWith("content://");
};

// ============================================================================
// PERSISTENCE LAYER
// ============================================================================

/**
 * Load file index from storage
 */
export const loadFileIndex = async (): Promise<UnifiedFileRecord[]> => {
  if (memoryCacheLoaded && memoryCache !== null) {
    return memoryCache;
  }

  try {
    const data = await AsyncStorage.getItem(UNIFIED_INDEX_KEY);
    if (!data) {
      memoryCache = [];
      memoryCacheLoaded = true;
      return [];
    }

    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      memoryCache = [];
      memoryCacheLoaded = true;
      return [];
    }

    // Validate and migrate data
    const validRecords = parsed
      .filter((record): record is UnifiedFileRecord => {
        return (
          typeof record === "object" &&
          typeof record.id === "string" &&
          typeof record.uri === "string" &&
          typeof record.name === "string"
        );
      })
      .map((record) => {
        // Handle legacy data that might have dateAdded instead of createdAt
        const legacyRecord = record as UnifiedFileRecord & {
          dateAdded?: number;
        };
        return {
          ...record,
          // Ensure sourceTags exists
          sourceTags:
            record.sourceTags ||
            (record.source ? [mapSourceToTag(record.source)] : ["imported"]),
          // Ensure timestamps exist (handle legacy dateAdded field)
          createdAt: record.createdAt || legacyRecord.dateAdded || Date.now(),
          lastOpenedAt:
            record.lastOpenedAt ||
            record.createdAt ||
            legacyRecord.dateAdded ||
            Date.now(),
        };
      });

    memoryCache = validRecords;
    memoryCacheLoaded = true;
    return validRecords;
  } catch (error) {
    console.error("[FileIndex] Failed to load:", error);
    memoryCache = [];
    memoryCacheLoaded = true;
    return [];
  }
};

/**
 * Save file index to storage
 */
const saveFileIndex = async (files: UnifiedFileRecord[]): Promise<void> => {
  try {
    memoryCache = files;
    invalidateDerivedCaches();
    await AsyncStorage.setItem(UNIFIED_INDEX_KEY, JSON.stringify(files));
  } catch (error) {
    console.error("[FileIndex] Failed to save:", error);
    throw new Error("Failed to save file index");
  }
};

/**
 * Map legacy source to tag
 */
const mapSourceToTag = (source: string): FileSourceTag => {
  switch (source) {
    case "created":
      return "created";
    case "downloaded":
      return "downloaded";
    case "picked":
    case "imported":
    default:
      return "imported";
  }
};

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Upsert (insert or update) a file record
 * - If file exists (by URI), update tags + timestamps
 * - If new, insert it
 */
/**
 * Stat a file to get its real size on disk.
 * Returns 0 if stat fails (e.g. file doesn't exist or is a SAF URI).
 */
const getFileSizeFromDisk = async (uri: string): Promise<number> => {
  if (Platform.OS === "web") return 0;
  try {
    // Skip SAF URIs – they can't be stat'd with FileSystem
    if (uri.startsWith("content://")) return 0;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info) {
      return (info as any).size || 0;
    }
  } catch {
    // Silently ignore stat errors
  }
  return 0;
};

export const upsertFileRecord = async (
  params: UpsertFileParams,
): Promise<UnifiedFileRecord> => {
  const files = await loadFileIndex();
  const now = Date.now();

  const extension = params.extension || extractExtension(params.name);
  const type = params.type || determineFileType(extension, params.mimeType);

  // Safety net: if size is missing or 0, try to stat the file to get the real size
  let resolvedSize = params.size;
  if ((!resolvedSize || resolvedSize === 0) && params.uri) {
    const diskSize = await getFileSizeFromDisk(params.uri);
    if (diskSize > 0) {
      resolvedSize = diskSize;
      if (__DEV__) {
        console.log(
          `[FileIndex] Resolved missing size via stat for "${params.name}": ${diskSize} bytes`,
        );
      }
    }
  }

  // Determine source tags
  let sourceTags: FileSourceTag[] = params.sourceTags || [];
  if (sourceTags.length === 0 && params.source) {
    sourceTags = [mapSourceToTag(params.source)];
  }
  if (sourceTags.length === 0) {
    sourceTags = ["imported"];
  }

  // Check if file exists by URI (deduplication)
  const existingIndex = files.findIndex((f) => f.uri === params.uri);

  if (existingIndex >= 0) {
    // Update existing file
    const existing = files[existingIndex];
    const updatedRecord: UnifiedFileRecord = {
      ...existing,
      name: params.name || existing.name,
      lastOpenedAt: now,
      // Merge source tags (deduplicated)
      sourceTags: [...new Set([...existing.sourceTags, ...sourceTags])],
      // Prefer non-zero size: resolved > existing > undefined
      size:
        resolvedSize && resolvedSize > 0
          ? resolvedSize
          : existing.size || resolvedSize,
      mimeType: params.mimeType ?? existing.mimeType,
    };

    // Move to top (most recent)
    const newFiles = [
      updatedRecord,
      ...files.slice(0, existingIndex),
      ...files.slice(existingIndex + 1),
    ];

    await saveFileIndex(newFiles);
    if (__DEV__) console.log("[FileIndex] Updated file:", params.name);
    return updatedRecord;
  }

  // Create new file record
  const newRecord: UnifiedFileRecord = {
    id: generateFileId(params.uri, now),
    name: params.name,
    uri: params.uri,
    originalUri: params.originalUri,
    type,
    extension,
    mimeType: params.mimeType,
    sourceTags,
    createdAt: now,
    lastOpenedAt: now,
    size: resolvedSize,
    cacheValid: true,
    source: params.source || "picked",
    isSafUri: params.isSafUri ?? isSafUri(params.uri),
  };

  // Add to front of list
  let newFiles = [newRecord, ...files];

  // Enforce max limit
  if (newFiles.length > MAX_FILES) {
    newFiles = newFiles.slice(0, MAX_FILES);
  }

  await saveFileIndex(newFiles);
  if (__DEV__) {
    console.log(
      `[FileIndex] Added new file: "${params.name}", size: ${resolvedSize ?? "unknown"}, uri: ${params.uri}`,
    );
  }
  return newRecord;
};

/**
 * Update lastOpenedAt for a file (when opened/viewed)
 */
export const markFileOpened = async (fileId: string): Promise<void> => {
  const files = await loadFileIndex();
  // Try matching by id first, then fall back to matching by uri
  let fileIndex = files.findIndex((f) => f.id === fileId);
  if (fileIndex === -1) {
    fileIndex = files.findIndex((f) => f.uri === fileId);
  }

  if (fileIndex === -1) {
    if (__DEV__)
      console.log("[FileIndex] File not found for markFileOpened:", fileId);
    return;
  }

  const updated = {
    ...files[fileIndex],
    lastOpenedAt: Date.now(),
  };

  // Move to top (most recent)
  const newFiles = [
    updated,
    ...files.slice(0, fileIndex),
    ...files.slice(fileIndex + 1),
  ];

  await saveFileIndex(newFiles);
  if (__DEV__) console.log("[FileIndex] Marked file as opened:", updated.name);
};

/**
 * Add a source tag to a file (e.g., when shared)
 */
export const addSourceTag = async (
  fileId: string,
  tag: FileSourceTag,
): Promise<void> => {
  const files = await loadFileIndex();
  let fileIndex = files.findIndex((f) => f.id === fileId);
  if (fileIndex === -1) {
    fileIndex = files.findIndex((f) => f.uri === fileId);
  }

  if (fileIndex === -1) return;

  const file = files[fileIndex];
  if (!file.sourceTags.includes(tag)) {
    const updated = {
      ...file,
      sourceTags: [...file.sourceTags, tag],
      lastOpenedAt: Date.now(),
    };

    // Move to top
    const newFiles = [
      updated,
      ...files.slice(0, fileIndex),
      ...files.slice(fileIndex + 1),
    ];

    await saveFileIndex(newFiles);
    if (__DEV__)
      console.log("[FileIndex] Added tag to file:", tag, updated.name);
  }
};

/**
 * Remove a file from the index
 */
export const removeFileRecord = async (fileId: string): Promise<boolean> => {
  const files = await loadFileIndex();
  const newFiles = files.filter((f) => f.id !== fileId && f.uri !== fileId);

  if (newFiles.length === files.length) {
    return false; // File not found
  }

  await saveFileIndex(newFiles);
  if (__DEV__) console.log("[FileIndex] Removed file:", fileId);
  return true;
};

/**
 * Clear all files from the index
 */
export const clearFileIndex = async (): Promise<void> => {
  memoryCache = [];
  invalidateDerivedCaches();
  await AsyncStorage.removeItem(UNIFIED_INDEX_KEY);
  if (__DEV__) console.log("[FileIndex] Cleared all files");
};

/**
 * Permanently delete ALL files including downloads.
 * Deletes every file from disk, clears every storage key.
 * NEVER sends to Recycle Bin. Irreversible.
 */
export const clearAllFilesIncludingDownloads = async (): Promise<void> => {
  const [{ downloadsStore }, { clearFileFolderMap }] = await Promise.all([
    import("@/src/services/library/downloadsStore"),
    import("@/services/folderService"),
  ]);

  const files = await loadFileIndex();
  const downloads = await downloadsStore.getAll();

  // Delete all locally-stored file URIs from disk
  for (const file of files) {
    if (!file.uri.startsWith("content://")) {
      try {
        const info = await FileSystem.getInfoAsync(file.uri);
        if (info.exists) await FileSystem.deleteAsync(file.uri, { idempotent: true });
      } catch { /* ignore per-file errors */ }
    }
  }

  // Delete each downloaded file's local URI from disk
  for (const dl of downloads) {
    if (dl.localUri && !dl.localUri.startsWith("content://")) {
      try {
        const info = await FileSystem.getInfoAsync(dl.localUri);
        if (info.exists) await FileSystem.deleteAsync(dl.localUri, { idempotent: true });
      } catch { /* ignore per-file errors */ }
    }
  }

  // Wipe the library cache directory
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (dirInfo.exists) await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  } catch { /* ignore */ }

  // Clear all storage keys in parallel
  await Promise.all([
    AsyncStorage.removeItem(UNIFIED_INDEX_KEY),
    AsyncStorage.removeItem("@docu_assistant_library_files"),
    AsyncStorage.removeItem("@docu_assistant_files"),
    AsyncStorage.removeItem("@docu_assistant_favorites"),
    downloadsStore.clear(),
    clearFileFolderMap(),
  ]);

  // Reset in-memory caches
  memoryCache = [];
  memoryCacheLoaded = true;
  invalidateDerivedCaches();
  if (__DEV__) console.log("[FileIndex] Permanently cleared all files including downloads");
};

/**
 * Permanently delete all files EXCEPT downloaded ones.
 * Deletes physical files for non-downloaded entries only.
 * Preserves downloaded files on disk and in storage.
 * NEVER sends to Recycle Bin. Irreversible.
 */
export const clearAllFilesExceptDownloads = async (): Promise<void> => {
  const { removeFilesFromAllFolders: removeFilesFromFolderMap } = await import("@/services/folderService");

  const files = await loadFileIndex();

  const downloadedFiles = files.filter(
    (f) => f.sourceTags.includes("downloaded") || f.source === "downloaded",
  );
  const nonDownloadedFiles = files.filter(
    (f) => !f.sourceTags.includes("downloaded") && f.source !== "downloaded",
  );

  // Delete physical files for every non-downloaded entry
  for (const file of nonDownloadedFiles) {
    if (!file.uri.startsWith("content://")) {
      try {
        const info = await FileSystem.getInfoAsync(file.uri);
        if (info.exists) await FileSystem.deleteAsync(file.uri, { idempotent: true });
      } catch { /* ignore per-file errors */ }
    }
  }

  // Wipe the library cache directory (contains only picked/imported files)
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (dirInfo.exists) await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  } catch { /* ignore */ }

  // Persist only downloaded files back to the unified index
  memoryCache = downloadedFiles;
  memoryCacheLoaded = true;
  invalidateDerivedCaches();
  await AsyncStorage.setItem(UNIFIED_INDEX_KEY, JSON.stringify(downloadedFiles));

  // Clear legacy storage keys (downloads are not stored there)
  await Promise.all([
    AsyncStorage.removeItem("@docu_assistant_library_files"),
    AsyncStorage.removeItem("@docu_assistant_files"),
    AsyncStorage.removeItem("@docu_assistant_favorites"),
  ]);

  // Remove non-downloaded entries from the file-folder map
  if (nonDownloadedFiles.length > 0) {
    await removeFilesFromFolderMap(nonDownloadedFiles.map((f) => f.id));
  }

  if (__DEV__)
    console.log(
      `[FileIndex] Cleared ${nonDownloadedFiles.length} files, preserved ${downloadedFiles.length} downloads`,
    );
};

/**
 * Clear recent history by resetting lastOpenedAt on all files.
 * Files remain in the index but won't appear as "recently opened".
 */
export const clearRecentHistory = async (): Promise<void> => {
  const files = await loadFileIndex();
  const reset = files.map((f) => ({ ...f, lastOpenedAt: 0 }));
  await saveFileIndex(reset);
  if (__DEV__)
    console.log(
      "[FileIndex] Cleared recent history for",
      files.length,
      "files",
    );
};

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Get all files sorted by lastOpenedAt (most recent first)
 */
export const getAllFiles = async (): Promise<UnifiedFileRecord[]> => {
  if (sortedCache) return sortedCache;
  const files = await loadFileIndex();
  sortedCache = [...files].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return sortedCache;
};

/**
 * Get recent files (for Home screen)
 * @param limit Number of files to return (default 7)
 */
export const getRecentFiles = async (
  limit: number = 7,
): Promise<UnifiedFileRecord[]> => {
  const files = await getAllFiles();
  return files.slice(0, limit);
};

/**
 * Get file by ID
 */
export const getFileById = async (
  fileId: string,
): Promise<UnifiedFileRecord | null> => {
  const files = await loadFileIndex();
  ensureLookupMaps(files);
  return idMap!.get(fileId) || uriMap!.get(fileId) || null;
};

/**
 * Get file by URI
 */
export const getFileByUri = async (
  uri: string,
): Promise<UnifiedFileRecord | null> => {
  const files = await loadFileIndex();
  ensureLookupMaps(files);
  return uriMap!.get(uri) || null;
};

/**
 * Filter files by type
 */
export const getFilesByType = async (
  type: FileTypeCategory,
): Promise<UnifiedFileRecord[]> => {
  const files = await getAllFiles();
  return files.filter((f) => f.type === type);
};

/**
 * Filter files by source tag
 */
export const getFilesBySourceTag = async (
  tag: FileSourceTag,
): Promise<UnifiedFileRecord[]> => {
  const files = await getAllFiles();
  return files.filter((f) => f.sourceTags.includes(tag));
};

/**
 * Search files by name
 */
export const searchFiles = async (
  query: string,
): Promise<UnifiedFileRecord[]> => {
  const files = await getAllFiles();
  const lowerQuery = query.toLowerCase();
  return files.filter((f) => f.name.toLowerCase().includes(lowerQuery));
};

// ============================================================================
// VALIDATION & MAINTENANCE
// ============================================================================

/**
 * Validate that cached files still exist
 * Returns count of invalid files removed
 */
export const validateFileCache = async (): Promise<number> => {
  if (Platform.OS === "web") return 0;

  const files = await loadFileIndex();
  let invalidCount = 0;

  const validatedFiles = await Promise.all(
    files.map(async (file) => {
      // Skip validation for created files or files marked as created
      if (file.sourceTags.includes("created") || file.source === "created") {
        return { file, valid: true };
      }

      try {
        const info = await FileSystem.getInfoAsync(file.uri);
        return {
          file: { ...file, cacheValid: info.exists },
          valid: info.exists,
        };
      } catch {
        return { file: { ...file, cacheValid: false }, valid: false };
      }
    }),
  );

  const validFiles = validatedFiles.filter((v) => v.valid).map((v) => v.file);

  invalidCount = files.length - validFiles.length;

  if (invalidCount > 0) {
    await saveFileIndex(validFiles);
    if (__DEV__)
      console.log("[FileIndex] Removed", invalidCount, "invalid files");
  }

  return invalidCount;
};

/**
 * Force refresh the memory cache from storage.
 * Returns the fresh list so callers can use it directly
 * without a second `loadFileIndex()` round-trip.
 */
export const refreshFileIndex = async (): Promise<UnifiedFileRecord[]> => {
  memoryCacheLoaded = false;
  memoryCache = null;
  invalidateDerivedCaches();
  const files = await loadFileIndex();
  return [...files].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
};

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Migrate files from legacy storage keys to unified index
 * Call this once on app startup
 */
export const migrateFromLegacyStorage = async (): Promise<void> => {
  try {
    // Check if already migrated
    const existingIndex = await AsyncStorage.getItem(UNIFIED_INDEX_KEY);
    if (existingIndex) {
      // Already has unified index, just load it
      await loadFileIndex();
      return;
    }

    if (__DEV__)
      console.log("[FileIndex] Starting migration from legacy storage...");

    const legacyKeys = [
      "@docu_assistant_files",
      "@docu_assistant_library_files",
    ];

    const allLegacyFiles: UnifiedFileRecord[] = [];
    const seenUris = new Set<string>();

    for (const key of legacyKeys) {
      try {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const files = JSON.parse(data);
        if (!Array.isArray(files)) continue;

        for (const file of files) {
          if (!file.uri || seenUris.has(file.uri)) continue;
          seenUris.add(file.uri);

          // Convert to unified format
          const extension =
            file.extension ||
            extractExtension(file.name || file.displayName || "");
          const type = file.type
            ? mapLegacyType(file.type)
            : determineFileType(extension, file.mimeType);

          const record: UnifiedFileRecord = {
            id: file.id || generateFileId(file.uri),
            name: file.name || file.displayName || "Unknown",
            uri: file.uri,
            originalUri: file.originalUri,
            type,
            extension,
            mimeType: file.mimeType,
            sourceTags:
              file.sourceTags ||
              (file.source ? [mapSourceToTag(file.source)] : ["imported"]),
            createdAt:
              file.createdAt ||
              file.dateAdded ||
              file.lastModified ||
              Date.now(),
            lastOpenedAt:
              file.lastOpenedAt ||
              file.lastOpened ||
              file.createdAt ||
              file.dateAdded ||
              Date.now(),
            size: file.size,
            cacheValid: file.cacheValid,
            source: file.source,
            isSafUri: file.isSafUri ?? isSafUri(file.uri),
          };

          allLegacyFiles.push(record);
        }
      } catch (error) {
        console.error("[FileIndex] Error migrating from", key, error);
      }
    }

    // Sort by lastOpenedAt
    allLegacyFiles.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

    // Save to unified index
    if (allLegacyFiles.length > 0) {
      await saveFileIndex(allLegacyFiles);
      if (__DEV__)
        console.log(
          "[FileIndex] Migrated",
          allLegacyFiles.length,
          "files from legacy storage",
        );
    } else {
      // Initialize empty index
      await saveFileIndex([]);
      if (__DEV__) console.log("[FileIndex] Initialized empty file index");
    }

    // Note: We don't delete legacy keys to ensure backward compatibility
    // They will be gradually replaced as files are updated
  } catch (error) {
    console.error("[FileIndex] Migration failed:", error);
    // Initialize empty index on failure
    await saveFileIndex([]);
  }
};

/**
 * Map legacy file type to FileTypeCategory
 */
const mapLegacyType = (type: string): FileTypeCategory => {
  switch (type.toLowerCase()) {
    case "pdf":
      return "pdf";
    case "word":
    case "docx":
    case "doc":
      return "docx";
    case "ppt":
    case "pptx":
    case "presentation":
      return "ppt";
    case "excel":
    case "xlsx":
    case "xls":
      return "excel";
    case "image":
    case "jpg":
    case "jpeg":
    case "png":
      return "image";
    default:
      return "unknown";
  }
};

// ============================================================================
// DOWNLOADS SYNC
// ============================================================================

/**
 * Sync downloaded files from the downloads store to the unified file index
 * This ensures files downloaded from the library sources appear in the Library screen
 */
export const syncDownloadsToFileIndex = async (): Promise<number> => {
  try {
    // Import downloadsStore dynamically to avoid circular dependencies
    const { downloadsStore } =
      await import("@/src/services/library/downloadsStore");

    const downloads = await downloadsStore.getAll();
    if (downloads.length === 0) {
      if (__DEV__) console.log("[FileIndex] No downloads to sync");
      return 0;
    }

    const files = await loadFileIndex();
    const existingUris = new Set(files.map((f) => f.uri));
    const now = Date.now();
    const newRecords: UnifiedFileRecord[] = [];

    for (const download of downloads) {
      // Skip if already in index
      if (existingUris.has(download.localUri)) {
        continue;
      }

      const extension = download.fileType;
      const name = `${download.title}.${extension}`;
      const type = determineFileType(extension);

      newRecords.push({
        id: generateFileId(download.localUri, now + newRecords.length),
        name,
        uri: download.localUri,
        type,
        extension,
        mimeType:
          extension === "pdf" ? "application/pdf" : "application/epub+zip",
        sourceTags: ["downloaded"],
        createdAt: now,
        lastOpenedAt: now,
        size: download.fileSize,
        cacheValid: true,
        source: "downloaded",
        isSafUri: isSafUri(download.localUri),
      });
    }

    // Batch write: single saveFileIndex call instead of N upserts
    if (newRecords.length > 0) {
      let updatedFiles = [...newRecords, ...files];
      if (updatedFiles.length > MAX_FILES) {
        updatedFiles = updatedFiles.slice(0, MAX_FILES);
      }
      await saveFileIndex(updatedFiles);
      if (__DEV__)
        console.log(
          "[FileIndex] Synced",
          newRecords.length,
          "downloads to file index",
        );
    }

    return newRecords.length;
  } catch (error) {
    console.error("[FileIndex] Failed to sync downloads:", error);
    return 0;
  }
};
