/**
 * Quick Access Hook
 * Persistent storage and management of recently opened/imported files
 */

import {
    clearFileIndex,
    markFileOpened as markFileOpenedInIndex,
    removeFileRecord,
    upsertFileRecord
} from "@/services/fileIndexService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// TYPES
// ============================================================================
export interface QuickAccessFile {
  /** Unique stable ID (hash of URI) */
  id: string;
  /** File URI - points to local cached copy */
  uri: string;
  /** Original file URI (before copying to app sandbox) */
  originalUri: string;
  /** Display name of the file */
  displayName: string;
  /** File extension (lowercase, without dot) */
  extension: string;
  /** MIME type if available */
  mimeType?: string;
  /** File size in bytes if available */
  size?: number;
  /** Timestamp when file was last opened */
  lastOpenedAt: number;
  /** Timestamp when file was first added */
  dateAdded: number;
  /** Source of the file */
  source: "picked" | "created";
  /** Whether this file requires SAF permission */
  isSafUri: boolean;
  /** Whether the cached file is confirmed to exist */
  cacheValid?: boolean;
}

export interface QuickAccessState {
  files: QuickAccessFile[];
  isLoading: boolean;
  error: string | null;
}

export interface AddFileParams {
  uri: string;
  displayName?: string;
  mimeType?: string;
  size?: number;
  source?: "picked" | "created";
}

export interface AddFileResult {
  success: boolean;
  file: QuickAccessFile | null;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const STORAGE_KEY = "@docu_assistant_library_files";
const MAX_FILES = 100;
const CACHE_DIR = `${FileSystem.documentDirectory}library-cache/`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a stable ID from a URI
 */
export const generateId = (uri: string): string => {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    const char = uri.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `file_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
};

/**
 * Extract file extension from filename
 */
export const getExtension = (filename: string): string => {
  const parts = filename.split(".");
  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() || "";
  }
  return "";
};

/**
 * Check if URI is a SAF (Storage Access Framework) URI
 */
export const isSafUri = (uri: string): boolean => {
  return uri.startsWith("content://");
};

/**
 * Extract display name from URI if not provided
 */
export const extractDisplayName = (uri: string): string => {
  try {
    const decoded = decodeURIComponent(uri);
    const parts = decoded.split(/[/\\]/);
    return parts.pop() || "Unknown File";
  } catch {
    return "Unknown File";
  }
};

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
const cacheService = {
  async ensureCacheDir(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        console.log("[CacheService] Created cache directory:", CACHE_DIR);
      }
    } catch (error) {
      console.error("[CacheService] Failed to ensure cache directory:", error);
      throw new Error("Failed to initialize file cache");
    }
  },

  async copyToCache(sourceUri: string, fileName: string): Promise<string> {
    await this.ensureCacheDir();

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const cachedFileName = `${timestamp}_${randomSuffix}_${safeFileName}`;
    const cachedUri = `${CACHE_DIR}${cachedFileName}`;

    try {
      console.log("[CacheService] Copying file to cache:", {
        sourceUri,
        cachedUri,
      });

      // Check if source file exists and is accessible
      const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
      if (!sourceInfo.exists) {
        throw new Error("Source file does not exist or is not accessible");
      }

      await FileSystem.copyAsync({
        from: sourceUri,
        to: cachedUri,
      });

      // Verify the copy was successful
      const cachedInfo = await FileSystem.getInfoAsync(cachedUri);
      if (!cachedInfo.exists) {
        throw new Error("File copy failed - cached file not found");
      }

      console.log("[CacheService] File copied successfully:", cachedFileName);
      return cachedUri;
    } catch (error) {
      console.error("[CacheService] Failed to copy file to cache:", error);
      throw new Error(
        `Failed to cache file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },

  async deleteFromCache(cachedUri: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(cachedUri);
      if (info.exists) {
        await FileSystem.deleteAsync(cachedUri, { idempotent: true });
        console.log("[CacheService] Deleted cached file:", cachedUri);
      }
    } catch (error) {
      console.error("[CacheService] Failed to delete cached file:", error);
    }
  },

  async validateCache(cachedUri: string): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(cachedUri);
      return info.exists && !info.isDirectory;
    } catch {
      return false;
    }
  },

  async clearAllCache(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
        console.log("[CacheService] Cleared all cache");
      }
    } catch (error) {
      console.error("[CacheService] Failed to clear cache:", error);
    }
  },

  async getCacheSize(): Promise<number> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!dirInfo.exists) return 0;

      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      let totalSize = 0;

      for (const file of files) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(`${CACHE_DIR}${file}`);
          if (fileInfo.exists && !fileInfo.isDirectory) {
            totalSize += fileInfo.size || 0;
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return totalSize;
    } catch (error) {
      console.error("[CacheService] Failed to get cache size:", error);
      return 0;
    }
  },
};

// ============================================================================
// PERSISTENCE LAYER
// ============================================================================
const storage = {
  async save(files: QuickAccessFile[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    } catch (error) {
      console.error("[QuickAccess] Failed to save:", error);
      throw new Error("Failed to save library files");
    }
  },

  async load(): Promise<QuickAccessFile[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (!data) return [];

      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];

      // Validate and migrate data if needed
      return parsed.filter((file): file is QuickAccessFile => {
        return (
          typeof file === "object" &&
          typeof file.id === "string" &&
          typeof file.uri === "string" &&
          typeof file.displayName === "string"
        );
      });
    } catch (error) {
      console.error("[QuickAccess] Failed to load:", error);
      return [];
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("[QuickAccess] Failed to clear:", error);
      throw new Error("Failed to clear library files");
    }
  },
};

// ============================================================================
// HOOK
// ============================================================================
export function useQuickAccess() {
  const [state, setState] = useState<QuickAccessState>({
    files: [],
    isLoading: true,
    error: null,
  });

  // Track if component is mounted
  const isMountedRef = useRef(true);

  // Load files on mount
  useEffect(() => {
    isMountedRef.current = true;
    loadFiles();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadFiles = useCallback(async () => {
    if (!isMountedRef.current) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const files = await storage.load();
      // Sort by lastOpenedAt descending
      files.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

      if (isMountedRef.current) {
        setState({ files, isLoading: false, error: null });
      }
    } catch (error) {
      console.error("[QuickAccess] Failed to load files:", error);
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to load library files",
        }));
      }
    }
  }, []);

  /**
   * Add or update a file in library
   * Copies the file to app sandbox for persistent access
   * @returns AddFileResult with success status and file or error
   */
  const addFile = useCallback(
    async (params: AddFileParams): Promise<AddFileResult> => {
      const { uri, displayName, mimeType, size, source = "picked" } = params;

      try {
        console.log("[QuickAccess] Adding file:", {
          uri,
          displayName,
          mimeType,
          size,
        });

        const name = displayName || extractDisplayName(uri);
        const extension = getExtension(name);
        const now = Date.now();

        // Copy file to app sandbox for persistent access
        let cachedUri: string;
        try {
          cachedUri = await cacheService.copyToCache(uri, name);
        } catch (cacheError) {
          const errorMessage =
            cacheError instanceof Error
              ? cacheError.message
              : "Failed to cache file";
          console.error("[QuickAccess] Cache error:", errorMessage);
          return { success: false, file: null, error: errorMessage };
        }

        const id = generateId(cachedUri);

        const newFile: QuickAccessFile = {
          id,
          uri: cachedUri,
          originalUri: uri,
          displayName: name,
          extension,
          mimeType,
          size,
          lastOpenedAt: now,
          dateAdded: now,
          source,
          isSafUri: isSafUri(uri),
          cacheValid: true,
        };

        const addedFile: QuickAccessFile = newFile;

        setState((prev) => {
          // Check if a file with the same name already exists
          const existingIndex = prev.files.findIndex(
            (f) => f.displayName === name,
          );
          let newFiles: QuickAccessFile[];

          if (existingIndex >= 0) {
            // Replace existing file and move to top
            const oldFile = prev.files[existingIndex];
            // Delete old cached file asynchronously
            cacheService.deleteFromCache(oldFile.uri).catch(console.error);

            newFiles = [
              newFile,
              ...prev.files.slice(0, existingIndex),
              ...prev.files.slice(existingIndex + 1),
            ];
            console.log("[QuickAccess] Replaced existing file:", name);
          } else {
            // Add new file at top
            newFiles = [newFile, ...prev.files];
            console.log("[QuickAccess] Added new file:", name);
          }

          // Enforce max limit
          if (newFiles.length > MAX_FILES) {
            const removed = newFiles.slice(MAX_FILES);
            // Clean up cached files for removed entries
            removed.forEach((f) =>
              cacheService.deleteFromCache(f.uri).catch(console.error),
            );
            newFiles = newFiles.slice(0, MAX_FILES);
          }

          // Persist asynchronously
          storage.save(newFiles).catch(console.error);

          return { ...prev, files: newFiles, error: null };
        });

        // Also sync to unified file index
        upsertFileRecord({
          uri: cachedUri,
          name,
          extension,
          mimeType,
          size,
          originalUri: uri,
          source,
          sourceTags: [source === "created" ? "created" : "imported"],
          isSafUri: isSafUri(uri),
        }).catch(console.error);

        return { success: true, file: addedFile };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to add file to library";
        console.error("[QuickAccess] Failed to add file:", error);

        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));

        return { success: false, file: null, error: errorMessage };
      }
    },
    [],
  );

  /**
   * Update last opened timestamp for a file
   */
  const updateLastOpened = useCallback(async (id: string): Promise<void> => {
    setState((prev) => {
      const fileIndex = prev.files.findIndex((f) => f.id === id);
      if (fileIndex === -1) return prev;

      const updated = {
        ...prev.files[fileIndex],
        lastOpenedAt: Date.now(),
      };

      const newFiles = [
        updated,
        ...prev.files.slice(0, fileIndex),
        ...prev.files.slice(fileIndex + 1),
      ];

      storage.save(newFiles).catch(console.error);

      // Also sync to unified file index
      markFileOpenedInIndex(id).catch(console.error);

      return { ...prev, files: newFiles };
    });
  }, []);

  /**
   * Remove a file from library
   */
  const removeFile = useCallback(async (id: string): Promise<boolean> => {
    try {
      setState((prev) => {
        const file = prev.files.find((f) => f.id === id);
        if (file) {
          // Delete cached file
          cacheService.deleteFromCache(file.uri).catch(console.error);
          console.log("[QuickAccess] Removed file:", file.displayName);
        }

        const newFiles = prev.files.filter((f) => f.id !== id);
        storage.save(newFiles).catch(console.error);

        // Also remove from unified file index
        removeFileRecord(id).catch(console.error);

        return { ...prev, files: newFiles };
      });
      return true;
    } catch (error) {
      console.error("[QuickAccess] Failed to remove file:", error);
      return false;
    }
  }, []);

  /**
   * Clear all library files
   */
  const clearAll = useCallback(async (): Promise<boolean> => {
    try {
      // Delete all cached files
      await cacheService.clearAllCache();
      await storage.clear();
      // Also clear unified file index
      await clearFileIndex();
      setState((prev) => ({ ...prev, files: [], error: null }));
      console.log("[QuickAccess] Cleared all files");
      return true;
    } catch (error) {
      console.error("[QuickAccess] Failed to clear all:", error);
      setState((prev) => ({
        ...prev,
        error: "Failed to clear library files",
      }));
      return false;
    }
  }, []);

  /**
   * Validate cache for all files and remove invalid entries
   */
  const validateAllCache = useCallback(async (): Promise<number> => {
    let invalidCount = 0;

    const validatedFiles = await Promise.all(
      state.files.map(async (file) => {
        const isValid = await cacheService.validateCache(file.uri);
        if (!isValid) invalidCount++;
        return { ...file, cacheValid: isValid };
      }),
    );

    // Remove invalid files
    const validFiles = validatedFiles.filter((f) => f.cacheValid);

    if (invalidCount > 0) {
      console.log("[QuickAccess] Removed", invalidCount, "invalid files");
      setState((prev) => ({ ...prev, files: validFiles }));
      storage.save(validFiles).catch(console.error);
    }

    return invalidCount;
  }, [state.files]);

  /**
   * Get a file by ID
   */
  const getFile = useCallback(
    (id: string): QuickAccessFile | undefined => {
      return state.files.find((f) => f.id === id);
    },
    [state.files],
  );

  /**
   * Get recent files (for home screen)
   */
  const getRecentFiles = useCallback(
    (limit: number = 3): QuickAccessFile[] => {
      return state.files.slice(0, limit);
    },
    [state.files],
  );

  /**
   * Get files by extension
   */
  const getFilesByExtension = useCallback(
    (extension: string): QuickAccessFile[] => {
      return state.files.filter(
        (f) => f.extension.toLowerCase() === extension.toLowerCase(),
      );
    },
    [state.files],
  );

  /**
   * Get cache size in bytes
   */
  const getCacheSize = useCallback(async (): Promise<number> => {
    return cacheService.getCacheSize();
  }, []);

  return {
    // State
    files: state.files,
    isLoading: state.isLoading,
    error: state.error,
    fileCount: state.files.length,

    // Actions
    addFile,
    removeFile,
    updateLastOpened,
    clearAll,
    refresh: loadFiles,
    validateAllCache,
    getFile,
    getRecentFiles,
    getFilesByExtension,
    getCacheSize,
  };
}

// Export alias for backward compatibility
export const useLibrary = useQuickAccess;
