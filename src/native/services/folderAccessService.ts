/**
 * Folder access service for Android
 * Handles folder selection, permission persistence, and file listing
 * Uses expo-file-system StorageAccessFramework for proper SAF support
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
    FileSystemError,
    FileSystemErrorCode,
    FolderListResult,
    ListFolderOptions,
    PickedFolder,
    SafItem,
} from "../types/fileSystem.types";

/**
 * Check if a URI is a proper SAF tree URI that supports directory operations
 * Some content:// URIs (like Downloads) don't support SAF operations
 */
const isSAFTreeUri = (uri: string): boolean => {
  if (!uri.startsWith("content://")) return false;

  // Downloads provider and some other providers don't support SAF tree operations
  const unsupportedProviders = [
    "com.android.providers.downloads.documents",
    "com.android.providers.media.documents",
  ];

  for (const provider of unsupportedProviders) {
    if (uri.includes(provider)) {
      return false;
    }
  }

  // Check if it's a tree URI (contains /tree/)
  return uri.includes("/tree/");
};

/**
 * Pick a folder on Android using SAF (Storage Access Framework)
 * Uses requestDirectoryPermissionsAsync for proper directory access
 *
 * @throws {FileSystemError} If platform is not Android or user cancels
 * @returns Promise with the picked folder information
 */
export async function pickFolderAndroid(): Promise<PickedFolder> {
  if (Platform.OS !== "android") {
    throw new FileSystemError(
      FileSystemErrorCode.PLATFORM_NOT_SUPPORTED,
      "Folder picking is only available on Android",
    );
  }

  try {
    // Use SAF directory permissions - this is the correct way to pick a folder
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permissions.granted) {
      throw new FileSystemError(
        FileSystemErrorCode.USER_CANCELLED,
        "Folder selection cancelled by user",
      );
    }

    const directoryUri = permissions.directoryUri;
    // Extract folder name from the URI
    const uriParts = directoryUri.split("%2F");
    const name =
      decodeURIComponent(uriParts[uriParts.length - 1]) || "Selected Folder";

    return {
      uri: directoryUri,
      name,
      platform: "android",
    };
  } catch (error) {
    // Re-throw FileSystemError as-is
    if (error instanceof FileSystemError) {
      throw error;
    }

    throw new FileSystemError(
      FileSystemErrorCode.UNKNOWN_ERROR,
      "Failed to pick folder",
      error,
    );
  }
}

/**
 * Filter items based on MIME types and extensions
 */
function filterItems(items: SafItem[], options: ListFolderOptions): SafItem[] {
  let filtered = items;

  // Filter by MIME type if specified
  if (options.mimeTypeFilter && options.mimeTypeFilter.length > 0) {
    filtered = filtered.filter((item) => {
      if (item.isDirectory) return false;
      if (!item.mimeType) return false;

      return options.mimeTypeFilter!.some((filter) => {
        // Support wildcards like "image/*"
        if (filter.endsWith("/*")) {
          const prefix = filter.slice(0, -2);
          return item.mimeType?.startsWith(prefix);
        }
        return item.mimeType === filter;
      });
    });
  }

  // Filter by extension if specified
  if (options.extensionFilter && options.extensionFilter.length > 0) {
    filtered = filtered.filter((item) => {
      if (item.isDirectory) return false;
      if (!item.name) return false;

      const nameLower = item.name.toLowerCase();
      return options.extensionFilter!.some((ext) => {
        const extLower = ext.toLowerCase();
        return nameLower.endsWith(extLower);
      });
    });
  }

  return filtered;
}

/**
 * Calculate statistics for folder listing result
 */
function calculateStats(items: SafItem[]): Omit<FolderListResult, "items"> {
  let fileCount = 0;
  let directoryCount = 0;
  let totalSize = 0;

  for (const item of items) {
    if (item.isDirectory) {
      directoryCount++;
    } else {
      fileCount++;
      totalSize += item.size;
    }
  }

  return {
    totalCount: items.length,
    fileCount,
    directoryCount,
    totalSize,
  };
}

/**
 * List files and folders within a folder URI
 * Uses expo-file-system for directory listing
 *
 * @param folderUri - The folder tree URI to list
 * @param options - Options for filtering and recursion
 * @throws {FileSystemError} If folder listing fails
 * @returns Promise with folder listing result including statistics
 */
export async function listFolderContents(
  folderUri: string,
  options: ListFolderOptions = { recursive: false },
): Promise<FolderListResult> {
  if (!folderUri) {
    throw new FileSystemError(
      FileSystemErrorCode.INVALID_URI,
      "Folder URI is required",
    );
  }

  try {
    // Use expo-file-system for directory listing
    const allItems = await listFolderWithFileSystem(
      folderUri,
      options.recursive ?? false,
    );

    // Apply filters
    const filteredItems = filterItems(allItems, options);

    // Calculate statistics
    const stats = calculateStats(filteredItems);

    return {
      items: filteredItems,
      ...stats,
    };
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    throw new FileSystemError(
      FileSystemErrorCode.UNKNOWN_ERROR,
      "Failed to list folder contents",
      error,
    );
  }
}

/**
 * Helper function to list folder contents using expo-file-system
 */
async function listFolderWithFileSystem(
  folderUri: string,
  recursive: boolean,
  depth: number = 0,
  maxDepth: number = 10,
): Promise<SafItem[]> {
  if (depth >= maxDepth) {
    return [];
  }

  const items: SafItem[] = [];

  try {
    // Try SAF read for content:// URIs that support it
    if (folderUri.startsWith("content://") && isSAFTreeUri(folderUri)) {
      let uris: string[];
      try {
        uris =
          await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
      } catch (safError: any) {
        // If SAF fails, log and return empty array
        if (safError.message?.includes("not a Storage Access Framework URI")) {
          console.warn(
            "[FolderAccessService] URI does not support SAF operations:",
            folderUri,
          );
          return [];
        }
        throw safError;
      }

      for (const uri of uris) {
        try {
          // Try to get file info, but don't fail if it doesn't work
          let info: {
            isDirectory?: boolean;
            size?: number;
            modificationTime?: number;
          } = {};
          try {
            info = await FileSystem.getInfoAsync(uri);
          } catch {
            // getInfoAsync failed - use defaults
            console.warn(
              `[FolderAccessService] Could not get info for ${uri}, using defaults`,
            );
          }

          const name = decodeURIComponent(uri.split("/").pop() || "Unknown");

          const item: SafItem = {
            name,
            uri,
            isDirectory: info.isDirectory ?? false,
            mimeType: null,
            size: info.size ?? 0,
            lastModified: info.modificationTime ?? Date.now(),
          };

          items.push(item);

          // Recurse into subdirectories if needed
          if (recursive && item.isDirectory) {
            const subItems = await listFolderWithFileSystem(
              uri,
              true,
              depth + 1,
              maxDepth,
            );
            items.push(...subItems);
          }
        } catch (itemError) {
          console.warn(`Failed to process ${uri}:`, itemError);
        }
      }
    } else if (folderUri.startsWith("content://")) {
      // Non-SAF content:// URI - cannot list directory contents
      console.warn(
        "[FolderAccessService] Cannot list non-SAF content URI:",
        folderUri,
      );
      return [];
    } else {
      // Regular file:// URI
      const contents = await FileSystem.readDirectoryAsync(folderUri);

      for (const name of contents) {
        const uri = `${folderUri}/${name}`;
        try {
          const info = await FileSystem.getInfoAsync(uri);

          if (!info.exists) {
            continue;
          }

          const item: SafItem = {
            name,
            uri,
            isDirectory: info.isDirectory ?? false,
            mimeType: null,
            size: "size" in info ? (info.size ?? 0) : 0,
            lastModified:
              "modificationTime" in info
                ? (info.modificationTime ?? Date.now())
                : Date.now(),
          };

          items.push(item);

          if (recursive && item.isDirectory) {
            const subItems = await listFolderWithFileSystem(
              uri,
              true,
              depth + 1,
              maxDepth,
            );
            items.push(...subItems);
          }
        } catch (itemError) {
          console.warn(`Failed to get info for ${uri}:`, itemError);
        }
      }
    }
  } catch (error) {
    console.error("Error listing folder:", error);
    throw error;
  }

  return items;
}

/**
 * List only document files from a folder
 * Filters for PDF, Word, Excel, PowerPoint, and text files
 *
 * @param folderUri - The folder tree URI to list
 * @param recursive - Whether to scan subdirectories
 * @returns Promise with document files only
 */
export async function listDocuments(
  folderUri: string,
  recursive: boolean = false,
): Promise<FolderListResult> {
  const documentMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ];

  const documentExtensions = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
  ];

  return listFolderContents(folderUri, {
    recursive,
    mimeTypeFilter: documentMimeTypes,
    extensionFilter: documentExtensions,
  });
}

/**
 * List only image files from a folder
 *
 * @param folderUri - The folder tree URI to list
 * @param recursive - Whether to scan subdirectories
 * @returns Promise with image files only
 */
export async function listImages(
  folderUri: string,
  recursive: boolean = false,
): Promise<FolderListResult> {
  return listFolderContents(folderUri, {
    recursive,
    mimeTypeFilter: ["image/*"],
    extensionFilter: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"],
  });
}

/**
 * Check if folder access is available on the current platform
 * @returns true if folder access can be used
 */
export function isFolderAccessAvailable(): boolean {
  return Platform.OS === "android";
}
