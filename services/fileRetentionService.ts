/**
 * File Retention Service
 *
 * Enforces the "Keep Imported Files Permanently" setting.
 * When the user sets a retention duration (10 / 20 / 30 days), imported files
 * that were added before the cutoff are permanently deleted on app startup —
 * they do NOT go to the Recycle Bin.
 *
 * Call `runImportedFileRetentionCheck()` once at startup from the root layout.
 */

import * as FileSystem from "expo-file-system/legacy";

import { getAllFiles as getAllIndexFiles, removeFileRecord } from "@/services/fileIndexService";
import { deleteFileReference } from "@/services/fileService";
import { removeFileFromAllFolders } from "@/services/folderService";
import { loadSettings } from "@/services/settingsService";

const MS_PER_DAY = 86_400_000;

/**
 * Runs once at startup. If `keepImportedFiles` is OFF, deletes all imported
 * files whose `createdAt` timestamp is older than `importRetentionDays` days.
 * Files are permanently deleted from all locations — no Recycle Bin.
 */
export async function runImportedFileRetentionCheck(): Promise<number> {
  try {
    const settings = await loadSettings();

    // Nothing to do when permanently keeping files
    if (settings.keepImportedFiles) return 0;

    const cutoff = Date.now() - settings.importRetentionDays * MS_PER_DAY;

    // Fetch all files from the unified index
    const allFiles = await getAllIndexFiles();

    // Filter to imported files that have exceeded the retention window
    const expired = allFiles.filter((f) => {
      const isImported =
        f.source === "imported" ||
        f.source === "picked" ||
        (f.sourceTags && f.sourceTags.includes("imported"));
      return isImported && f.createdAt < cutoff;
    });

    if (expired.length === 0) return 0;

    for (const file of expired) {
      // 1. Delete physical file from device storage
      if (file.uri && !file.uri.startsWith("content://")) {
        try {
          const info = await FileSystem.getInfoAsync(file.uri);
          if (info.exists) {
            await FileSystem.deleteAsync(file.uri, { idempotent: true });
          }
        } catch {
          // Skip per-file errors, continue with cleanup
        }
      }

      // 2. Remove from unified file index
      await removeFileRecord(file.id).catch(console.error);

      // 3. Remove from legacy fileService storage
      await deleteFileReference(file.id).catch(console.error);

      // 4. Remove from all folder mappings
      await removeFileFromAllFolders(file.id).catch(console.error);
    }

    if (__DEV__) {
      console.log(
        `[FileRetention] Permanently deleted ${expired.length} expired imported file(s) (retention: ${settings.importRetentionDays} days).`,
      );
    }

    return expired.length;
  } catch (error) {
    console.error("[FileRetention] Retention check failed:", error);
    return 0;
  }
}
