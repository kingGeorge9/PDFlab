/**
 * Bridge to native Android Storage Access Framework (SAF) module
 * Handles folder permission persistence and file listing
 */

import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import {
    FileSystemError,
    FileSystemErrorCode,
    SAFNativeModule,
    SafItem,
} from '../types/fileSystem.types';

/**
 * Lazy-loaded native module instance
 * Only initialized when needed to prevent crashes on unsupported platforms
 */
let nativeModule: SAFNativeModule | null = null;

/**
 * Get the native SAF module instance
 * @throws {FileSystemError} If module is not available or platform is not Android
 */
function getSAFModule(): SAFNativeModule {
  if (Platform.OS !== 'android') {
    throw new FileSystemError(
      FileSystemErrorCode.PLATFORM_NOT_SUPPORTED,
      'SAF module is only available on Android'
    );
  }

  if (!nativeModule) {
    try {
      nativeModule = requireNativeModule<SAFNativeModule>('SAF');
    } catch (error) {
      throw new FileSystemError(
        FileSystemErrorCode.NATIVE_MODULE_ERROR,
        'Failed to load native SAF module. Ensure the module is properly configured.',
        error
      );
    }
  }

  return nativeModule;
}

/**
 * Open native folder picker
 * @throws {FileSystemError} If picker fails or user cancels
 * @returns Promise with object containing uri and name
 */
export async function pickFolder(): Promise<{ uri: string; name: string }> {
  try {
    const module = getSAFModule();
    return await module.pickFolder();
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    // Handle common errors
    const errorMessage = String(error);
    if (
      errorMessage.includes('ERR_USER_CANCELLED') ||
      errorMessage.includes('cancelled')
    ) {
      throw new FileSystemError(
        FileSystemErrorCode.USER_CANCELLED,
        'Folder selection cancelled by user',
        error
      );
    }

    throw new FileSystemError(
      FileSystemErrorCode.UNKNOWN_ERROR,
      'Failed to open folder picker',
      error
    );
  }
}

/**
 * Persist read/write permissions for a folder URI
 * This allows the app to access the folder even after restart
 *
 * @param treeUri - The content tree URI to persist permissions for
 * @throws {FileSystemError} If permission persistence fails
 * @returns Promise that resolves to true when successful
 */
export async function persistFolderPermission(
  treeUri: string
): Promise<boolean> {
  if (!treeUri || typeof treeUri !== 'string') {
    throw new FileSystemError(
      FileSystemErrorCode.INVALID_URI,
      'Invalid tree URI provided'
    );
  }

  try {
    const module = getSAFModule();
    const result = await module.persistFolderPermission(treeUri);

    if (!result) {
      throw new FileSystemError(
        FileSystemErrorCode.PERMISSION_DENIED,
        'Failed to persist folder permissions'
      );
    }

    return result;
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    throw new FileSystemError(
      FileSystemErrorCode.PERMISSION_DENIED,
      'Unable to persist folder permissions',
      error
    );
  }
}

/**
 * List files and folders within a tree URI
 *
 * @param treeUri - The content tree URI to list
 * @param recursive - Whether to recursively scan subdirectories
 * @throws {FileSystemError} If folder listing fails
 * @returns Promise with array of SafItem objects
 */
export async function listFolder(
  treeUri: string,
  recursive: boolean = false
): Promise<SafItem[]> {
  if (!treeUri || typeof treeUri !== 'string') {
    throw new FileSystemError(
      FileSystemErrorCode.INVALID_URI,
      'Invalid tree URI provided'
    );
  }

  try {
    const module = getSAFModule();
    const items = await module.listFolder(treeUri, recursive);

    // Validate and sanitize the returned items
    return items.map(item => ({
      name: item.name ?? 'Unnamed',
      uri: item.uri,
      isDirectory: Boolean(item.isDirectory),
      mimeType: item.mimeType ?? null,
      size: Math.max(0, item.size ?? 0),
      lastModified: item.lastModified ?? Date.now(),
    }));
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    // Handle common native errors
    const errorMessage = String(error);
    if (errorMessage.includes('permission')) {
      throw new FileSystemError(
        FileSystemErrorCode.PERMISSION_DENIED,
        'Permission missing or revoked. Please select the folder again.',
        error
      );
    }

    if (errorMessage.includes('not found')) {
      throw new FileSystemError(
        FileSystemErrorCode.FOLDER_NOT_FOUND,
        'Folder no longer exists or is inaccessible',
        error
      );
    }

    throw new FileSystemError(
      FileSystemErrorCode.UNKNOWN_ERROR,
      'Failed to list folder contents',
      error
    );
  }
}

/**
 * Check if the SAF module is available on the current platform
 * @returns true if SAF module can be used
 */
export function isSAFAvailable(): boolean {
  return Platform.OS === 'android';
}

/**
 * Export types for consumers
 */
export type { SAFNativeModule, SafItem };

