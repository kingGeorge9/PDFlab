/**
 * useFileIndex Hook
 * React hook for accessing the unified file index
 */

import {
    clearAllFilesExceptDownloads,
    clearAllFilesIncludingDownloads,
    clearFileIndex,
    getAllFiles,
    markFileOpened,
    migrateFromLegacyStorage,
    refreshFileIndex,
    removeFileRecord,
    syncDownloadsToFileIndex,
    upsertFileRecord,
    validateFileCache,
    type FileSourceTag,
    type FileTypeCategory,
    type UnifiedFileRecord,
    type UpsertFileParams,
} from "@/services/fileIndexService";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// TYPES
// ============================================================================
export interface FileIndexState {
  files: UnifiedFileRecord[];
  isLoading: boolean;
  error: string | null;
}

export interface FileIndexFilters {
  type?: FileTypeCategory | null;
  sourceTag?: FileSourceTag | null;
  searchQuery?: string;
}

// ============================================================================
// HOOK
// ============================================================================
export function useFileIndex(options?: { autoLoad?: boolean }) {
  const { autoLoad = true } = options || {};

  const [state, setState] = useState<FileIndexState>({
    files: [],
    isLoading: true,
    error: null,
  });

  const isMountedRef = useRef(true);
  const isInitializedRef = useRef(false);

  // Load files from unified index
  const loadFiles = useCallback(async () => {
    if (!isMountedRef.current) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Migrate from legacy storage on first load
      if (!isInitializedRef.current) {
        await migrateFromLegacyStorage();
        // Sync downloads from the downloads store to the file index
        await syncDownloadsToFileIndex();
        isInitializedRef.current = true;
      }

      const files = await getAllFiles();

      if (isMountedRef.current) {
        setState({ files, isLoading: false, error: null });
      }
    } catch (error) {
      console.error("[useFileIndex] Failed to load files:", error);
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to load files",
        }));
      }
    }
  }, []);

  // Load on mount
  useEffect(() => {
    isMountedRef.current = true;
    if (autoLoad) {
      loadFiles();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [autoLoad, loadFiles]);

  // Get recent files (for Home screen)
  const getRecentFiles = useCallback(
    (limit: number = 7): UnifiedFileRecord[] => {
      return state.files.slice(0, limit);
    },
    [state.files],
  );

  // Filter files by criteria
  const getFilteredFiles = useCallback(
    (filters: FileIndexFilters): UnifiedFileRecord[] => {
      let result = state.files;

      // Filter by type
      if (filters.type) {
        result = result.filter((f) => f.type === filters.type);
      }

      // Filter by source tag
      if (filters.sourceTag) {
        result = result.filter((f) =>
          f.sourceTags.includes(filters.sourceTag!),
        );
      }

      // Filter by search query
      if (filters.searchQuery?.trim()) {
        const query = filters.searchQuery.toLowerCase();
        result = result.filter((f) => f.name.toLowerCase().includes(query));
      }

      return result;
    },
    [state.files],
  );

  // Update last opened timestamp
  const updateLastOpened = useCallback(async (id: string): Promise<void> => {
    try {
      await markFileOpened(id);

      // Optimistically update local state
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

        return { ...prev, files: newFiles };
      });
    } catch (error) {
      console.error("[useFileIndex] Failed to update last opened:", error);
    }
  }, []);

  // Add a file — optimistic state update instead of full re-read
  const addFile = useCallback(
    async (params: UpsertFileParams): Promise<UnifiedFileRecord | null> => {
      try {
        const record = await upsertFileRecord(params);

        // Optimistically prepend the record to state (upsertFileRecord already
        // updated the memory cache + AsyncStorage, so a full loadFiles() call
        // would just read the same data back).
        setState((prev) => {
          // Deduplicate: remove any existing entry with the same id/uri
          const filtered = prev.files.filter(
            (f) => f.id !== record.id && f.uri !== record.uri,
          );
          return { ...prev, files: [record, ...filtered] };
        });

        return record;
      } catch (error) {
        console.error("[useFileIndex] Failed to add file:", error);
        return null;
      }
    },
    [],
  );

  // Remove a file
  const removeFile = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await removeFileRecord(id);

      if (success) {
        setState((prev) => ({
          ...prev,
          files: prev.files.filter((f) => f.id !== id),
        }));
      }

      return success;
    } catch (error) {
      console.error("[useFileIndex] Failed to remove file:", error);
      return false;
    }
  }, []);

  // Clear all files
  const clearAll = useCallback(async (): Promise<boolean> => {
    try {
      await clearFileIndex();
      setState((prev) => ({ ...prev, files: [], error: null }));
      return true;
    } catch (error) {
      console.error("[useFileIndex] Failed to clear all:", error);
      return false;
    }
  }, []);

  // Permanently delete ALL files including downloads — no recycle, no recovery
  const clearAllIncludingDownloads = useCallback(async (): Promise<boolean> => {
    try {
      await clearAllFilesIncludingDownloads();
      setState((prev) => ({ ...prev, files: [], error: null }));
      return true;
    } catch (error) {
      console.error("[useFileIndex] Failed to clear all including downloads:", error);
      return false;
    }
  }, []);

  // Permanently delete all files EXCEPT downloads — no recycle, no recovery
  const clearAllExceptDownloads = useCallback(async (): Promise<boolean> => {
    try {
      await clearAllFilesExceptDownloads();
      setState((prev) => ({
        ...prev,
        files: prev.files.filter((f) => f.sourceTags.includes("downloaded") || f.source === "downloaded"),
        error: null,
      }));
      return true;
    } catch (error) {
      console.error("[useFileIndex] Failed to clear all except downloads:", error);
      return false;
    }
  }, []);

  // Validate cache and remove invalid files
  const validateCache = useCallback(async (): Promise<number> => {
    try {
      const invalidCount = await validateFileCache();
      if (invalidCount > 0) {
        await loadFiles(); // Refresh list
      }
      return invalidCount;
    } catch (error) {
      console.error("[useFileIndex] Failed to validate cache:", error);
      return 0;
    }
  }, [loadFiles]);

  // Refresh files (single round-trip — refreshFileIndex already returns sorted data)
  const refresh = useCallback(async () => {
    if (!isMountedRef.current) return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const files = await refreshFileIndex();
      if (isMountedRef.current) {
        setState({ files, isLoading: false, error: null });
      }
    } catch (error) {
      console.error("[useFileIndex] Refresh failed:", error);
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to refresh files",
        }));
      }
    }
  }, []);

  // Get file by ID
  const getFile = useCallback(
    (id: string): UnifiedFileRecord | undefined => {
      return state.files.find((f) => f.id === id);
    },
    [state.files],
  );

  // Get files by type
  const getFilesByType = useCallback(
    (type: FileTypeCategory): UnifiedFileRecord[] => {
      return state.files.filter((f) => f.type === type);
    },
    [state.files],
  );

  // Get files by source tag
  const getFilesBySourceTag = useCallback(
    (tag: FileSourceTag): UnifiedFileRecord[] => {
      return state.files.filter((f) => f.sourceTags.includes(tag));
    },
    [state.files],
  );

  return {
    // State
    files: state.files,
    isLoading: state.isLoading,
    error: state.error,
    fileCount: state.files.length,

    // Query methods
    getRecentFiles,
    getFilteredFiles,
    getFile,
    getFilesByType,
    getFilesBySourceTag,

    // Actions
    addFile,
    removeFile,
    updateLastOpened,
    clearAll,
    clearAllIncludingDownloads,
    clearAllExceptDownloads,
    refresh,
    validateCache,
  };
}

// Re-export types for convenience
export type {
    FileSourceTag,
    FileTypeCategory,
    UnifiedFileRecord,
    UpsertFileParams
} from "@/services/fileIndexService";

