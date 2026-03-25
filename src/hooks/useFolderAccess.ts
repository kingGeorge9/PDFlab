import { useCallback, useEffect, useState } from "react";
import { folderService } from "../services/folderService";
import { storageService } from "../services/storageService";
import { FolderAccessState } from "../types/folder.types";

export const useFolderAccess = () => {
  const [state, setState] = useState<FolderAccessState>({
    folder: null,
    files: [],
    loading: false,
    error: null,
    permissionStatus: "unknown",
  });

  // Restore persisted folder on mount
  useEffect(() => {
    restorePersistedFolder();
  }, []);

  const restorePersistedFolder = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const folder = await storageService.getFolder();

      if (folder) {
        // Verify we still have access by trying to list
        try {
          const files = await folderService.listFiles(folder.uri, {
            recursive: false,
          });
          setState({
            folder,
            files,
            loading: false,
            error: null,
            permissionStatus: "granted",
          });
        } catch {
          // Permission was revoked
          await storageService.clearFolder();
          setState({
            folder: null,
            files: [],
            loading: false,
            error: "Permission revoked. Please select folder again.",
            permissionStatus: "denied",
          });
        }
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    } catch (error: any) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
    }
  }, []);

  const pickFolder = useCallback(async () => {
    console.log("[useFolderAccess] pickFolder called");
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const folder = await folderService.pickFolder();
      console.log("[useFolderAccess] Folder picked:", folder.name);

      await storageService.saveFolder(folder);
      console.log("[useFolderAccess] Folder saved to storage");

      // List files immediately
      const files = await folderService.listFiles(folder.uri, {
        recursive: false,
      });

      console.log("[useFolderAccess] Files loaded:", files.length);

      setState({
        folder,
        files,
        loading: false,
        error: null,
        permissionStatus: "granted",
      });
    } catch (error: any) {
      console.error("[useFolderAccess] pickFolder error:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || "Failed to pick folder",
      }));
    }
  }, []);

  const refreshFiles = useCallback(
    async (recursive: boolean = false) => {
      if (!state.folder) {
        setState((prev) => ({ ...prev, error: "No folder selected" }));
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const files = await folderService.listFiles(state.folder.uri, {
          recursive,
          maxDepth: recursive ? 5 : 1,
        });

        setState((prev) => ({
          ...prev,
          files,
          loading: false,
        }));
      } catch (error: any) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error.message,
        }));
      }
    },
    [state.folder],
  );

  const clearFolder = useCallback(async () => {
    if (state.folder) {
      await folderService.releaseFolderAccess(state.folder.uri);
      await storageService.clearFolder();
    }

    setState({
      folder: null,
      files: [],
      loading: false,
      error: null,
      permissionStatus: "unknown",
    });
  }, [state.folder]);

  return {
    folder: state.folder,
    files: state.files,
    loading: state.loading,
    error: state.error,
    permissionStatus: state.permissionStatus,
    actions: {
      pick: pickFolder,
      refresh: refreshFiles,
      clear: clearFolder,
    },
  };
};
