/**
 * Type definitions for file system operations
 * Supports both Android SAF and iOS document picker workflows
 */

/**
 * Represents a folder selected by the user
 */
export interface PickedFolder {
  /** Content URI (Android) or file URI (iOS) */
  uri: string;
  /** Folder display name */
  name?: string;
  /** Platform where folder was picked */
  platform: 'android' | 'ios';
}

/**
 * Represents a file or directory in the file system
 */
export interface SafItem {
  /** File/folder name */
  name: string | null;
  /** Content URI */
  uri: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** MIME type (e.g., "application/pdf") */
  mimeType: string | null;
  /** File size in bytes (0 for directories) */
  size: number;
  /** Last modified timestamp in milliseconds */
  lastModified: number;
}

/**
 * Folder location shortcuts
 */
export type FolderLocation = 'downloads' | 'documents' | 'whatsapp';

/**
 * Options for listing folder contents
 */
export interface ListFolderOptions {
  /** Whether to recursively scan subdirectories */
  recursive: boolean;
  /** Filter by MIME types (e.g., ["application/pdf", "image/*"]) */
  mimeTypeFilter?: string[];
  /** Filter by file extensions (e.g., [".pdf", ".docx"]) */
  extensionFilter?: string[];
}

/**
 * Result of a folder listing operation
 */
export interface FolderListResult {
  /** List of files and directories */
  items: SafItem[];
  /** Total number of items found */
  totalCount: number;
  /** Number of files (excluding directories) */
  fileCount: number;
  /** Number of directories */
  directoryCount: number;
  /** Total size of all files in bytes */
  totalSize: number;
}

/**
 * Native SAF module interface
 */
export interface SAFNativeModule {
  /**
   * Open native folder picker and return selected folder
   * @returns Promise with object containing uri and name
   */
  pickFolder(): Promise<{ uri: string; name: string }>;

  /**
   * Persist read/write permissions for a folder URI
   * @param treeUri The tree URI to persist permissions for
   * @returns Promise that resolves when permissions are persisted
   */
  persistFolderPermission(treeUri: string): Promise<boolean>;

  /**
   * List files and folders within a tree URI
   * @param treeUri The tree URI to list
   * @param recursive Whether to recursively list subdirectories
   * @returns Promise with array of SafItem objects
   */
  listFolder(treeUri: string, recursive: boolean): Promise<SafItem[]>;
}

/**
 * Error types for file system operations
 */
export enum FileSystemErrorCode {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FOLDER_NOT_FOUND = 'FOLDER_NOT_FOUND',
  INVALID_URI = 'INVALID_URI',
  PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED',
  USER_CANCELLED = 'USER_CANCELLED',
  NATIVE_MODULE_ERROR = 'NATIVE_MODULE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom error for file system operations
 */
export class FileSystemError extends Error {
  constructor(
    public code: FileSystemErrorCode,
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}
