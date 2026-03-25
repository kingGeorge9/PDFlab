import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { FileMetadata, FolderInfo } from '../types/folder.types';

const MAX_RECURSION_DEPTH = 10;
const BATCH_SIZE = 50; // Process files in batches to avoid UI freeze

export const folderService = {
  /**
   * Pick a folder using Android's Storage Access Framework
   * Uses expo-file-system's StorageAccessFramework
   */
  async pickFolder(): Promise<FolderInfo> {
    if (!FileSystem.StorageAccessFramework) {
      throw new Error('Folder picking is only supported on Android');
    }

    try {
      // Request directory permissions - this opens the native folder picker
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (!permissions.granted) {
        throw new Error('Folder selection cancelled');
      }

      const uri = permissions.directoryUri;

      // Extract folder name from URI
      // URI format: content://com.android.externalstorage.documents/tree/primary:Download
      const segments = uri.split('/');
      const lastSegment = segments[segments.length - 1];
      const name = lastSegment.includes(':')
        ? decodeURIComponent(lastSegment.split(':')[1] || 'Unknown')
        : decodeURIComponent(lastSegment || 'Unknown');

      return {
        uri,
        name,
      };
    } catch (error: any) {
      console.error('Folder picker error:', error);
      throw new Error(`Failed to pick folder: ${error.message}`);
    }
  },

  /**
   * List files in a SAF directory URI
   */
  async listFiles(
    directoryUri: string,
    options: { recursive?: boolean; maxDepth?: number } = {}
  ): Promise<FileMetadata[]> {
    const { recursive = false, maxDepth = MAX_RECURSION_DEPTH } = options;

    try {
      if (recursive) {
        return await this._listRecursive(directoryUri, 0, maxDepth);
      } else {
        return await this._listSingleLevel(directoryUri);
      }
    } catch (error: any) {
      console.error('List files error:', error);
      // Permission might have been revoked
      if (
        error.message?.includes('Permission') ||
        error.message?.includes('denied')
      ) {
        throw new Error('Permission denied. Please select the folder again.');
      }
      throw new Error(`Failed to list files: ${error.message}`);
    }
  },

  /**
   * List files in a single directory (no recursion)
   */
  async _listSingleLevel(directoryUri: string): Promise<FileMetadata[]> {
    const uris =
      await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);

    if (uris.length === 0) {
      return [];
    }

    // Batch process to avoid blocking UI
    const files: FileMetadata[] = [];
    for (let i = 0; i < uris.length; i += BATCH_SIZE) {
      const batch = uris.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((uri: string) => this._getFileInfo(uri))
      );
      files.push(...(batchResults.filter(Boolean) as FileMetadata[]));
    }

    return files;
  },

  /**
   * Recursively list all files and subdirectories
   */
  async _listRecursive(
    directoryUri: string,
    currentDepth: number,
    maxDepth: number
  ): Promise<FileMetadata[]> {
    if (currentDepth >= maxDepth) {
      console.warn(`Max recursion depth ${maxDepth} reached`);
      return [];
    }

    let uris: string[];
    try {
      uris =
        await FileSystem.StorageAccessFramework.readDirectoryAsync(
          directoryUri
        );
    } catch (error) {
      console.warn(`Failed to read directory at depth ${currentDepth}:`, error);
      return [];
    }

    const allFiles: FileMetadata[] = [];

    // Process in batches
    for (let i = 0; i < uris.length; i += BATCH_SIZE) {
      const batch = uris.slice(i, i + BATCH_SIZE);

      for (const uri of batch) {
        const fileInfo = await this._getFileInfo(uri);
        if (!fileInfo) continue;

        allFiles.push(fileInfo);

        // Recurse into subdirectories
        if (fileInfo.isDirectory) {
          try {
            const subFiles = await this._listRecursive(
              uri,
              currentDepth + 1,
              maxDepth
            );
            allFiles.push(...subFiles);
          } catch (error) {
            console.warn(
              `Failed to read subdirectory ${fileInfo.name}:`,
              error
            );
            // Continue with other files
          }
        }
      }
    }

    return allFiles;
  },

  /**
   * Get metadata for a single file/directory
   */
  async _getFileInfo(uri: string): Promise<FileMetadata | null> {
    try {
      const info = await FileSystem.getInfoAsync(uri);

      if (!info.exists) return null;

      // Extract name from URI
      const segments = uri.split('/');
      const encodedName = segments[segments.length - 1];
      const name = decodeURIComponent(encodedName || '');

      return {
        uri,
        name,
        size: info.size || null,
        type: info.isDirectory ? 'directory' : 'file',
        mimeType: null, // SAF doesn't easily expose MIME via getInfoAsync
        modificationTime: info.modificationTime || null,
        isDirectory: info.isDirectory || false,
      };
    } catch (error) {
      console.warn(`Failed to get info for ${uri}:`, error);
      return null;
    }
  },

  /**
   * Release persistent access to a folder (cleanup)
   * Note: Expo's SAF doesn't provide a direct way to release permissions
   * Permissions can be managed through Android Settings
   */
  async releaseFolderAccess(_folderUri: string): Promise<void> {
    if (Platform.OS !== 'android') return;

    // Note: There's no direct API to release SAF permissions in Expo
    // Users can manage this in Android Settings > Apps > [App] > Storage
    console.log('Folder access cleared from app storage');
  },

  /**
   * Copy file to app's cache directory
   */
  async copyToCache(fileUri: string): Promise<string> {
    const fileName = fileUri.split('/').pop() || 'file';
    const cacheUri = FileSystem.cacheDirectory + fileName;

    await FileSystem.copyAsync({
      from: fileUri,
      to: cacheUri,
    });

    return cacheUri;
  },

  /**
   * Read file content as string (for text files)
   */
  async readFileContent(fileUri: string): Promise<string> {
    try {
      return await FileSystem.readAsStringAsync(fileUri);
    } catch (error: any) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  },
};
