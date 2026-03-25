/**
 * File Picker Utility
 * Cross-platform file picker for importing documents into the app
 * Production-ready with validation, error handling, and type safety
 */

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Alert } from "react-native";

// ============================================================================
// TYPES
// ============================================================================
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** File extension (lowercase, without dot) */
  extension: string;
  /** Last modified timestamp (if available) */
  lastModified?: number;
}

export interface FilePickerOptions {
  /** Filter by specific file types */
  types?: string[];
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Copy files to cache directory (recommended for persistent access) */
  copyToCacheDirectory?: boolean;
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSize?: number;
  /** Show error alerts to user */
  showAlerts?: boolean;
}

export interface FilePickerResult {
  success: boolean;
  files: PickedFile[];
  error?: string;
  cancelled?: boolean;
}

// ============================================================================
// SUPPORTED FILE TYPES
// ============================================================================
export const SUPPORTED_FILE_TYPES = {
  // Documents
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  DOC: "application/msword",
  TXT: "text/plain",
  RTF: "application/rtf",
  JSON: "application/json",

  // E-books
  EPUB: "application/epub+zip",

  // Spreadsheets
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  XLS: "application/vnd.ms-excel",
  CSV: "text/csv",

  // Presentations
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  PPT: "application/vnd.ms-powerpoint",

  // Images
  JPEG: "image/jpeg",
  PNG: "image/png",
  GIF: "image/gif",
  WEBP: "image/webp",
  HEIC: "image/heic",

  // All documents
  ALL_DOCUMENTS: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/epub+zip",
    "text/plain",
    "application/rtf",
    "application/json",
  ],

  // All images
  ALL_IMAGES: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
  ],

  // All supported types
  ALL: "*/*",
};

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract file extension from filename
 */
const getExtensionFromName = (filename: string): string => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
};

/**
 * Format file size for display
 */
export const formatFileSizeForPicker = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * Validate a picked file
 */
const validatePickedFile = (
  file: { uri: string; name: string; size?: number; mimeType?: string },
  maxFileSize: number,
): { valid: boolean; error?: string } => {
  // Check if file exists
  if (!file || !file.uri) {
    return { valid: false, error: "No file selected" };
  }

  // Check file size
  if (file.size && file.size > maxFileSize) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds maximum size of ${formatFileSizeForPicker(maxFileSize)}`,
    };
  }

  // Check for empty files
  if (file.size === 0) {
    return { valid: false, error: `File "${file.name}" is empty` };
  }

  return { valid: true };
};

/**
 * Get additional file info (size, modification time)
 */
const getFileInfo = async (
  uri: string,
): Promise<{ size?: number; lastModified?: number }> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      return {
        size: info.size,
        lastModified: info.modificationTime,
      };
    }
  } catch (error) {
    console.warn("[FilePicker] Could not get file info:", error);
  }
  return {};
};

// ============================================================================
// FILE PICKER
// ============================================================================

/**
 * Pick a single file from device storage
 * @returns PickedFile or null if cancelled/failed
 */
export async function pickFile(
  options?: FilePickerOptions,
): Promise<PickedFile | null> {
  const result = await pickFilesWithResult({ ...options, multiple: false });
  return result.files.length > 0 ? result.files[0] : null;
}

/**
 * Pick multiple files from device storage
 * @returns Array of PickedFile (empty if cancelled/failed)
 */
export async function pickFiles(
  options?: FilePickerOptions,
): Promise<PickedFile[]> {
  const result = await pickFilesWithResult(options);
  return result.files;
}

// Guard to prevent concurrent document picker calls
let _pickerInProgress = false;

/**
 * Pick files with detailed result including error information
 * @returns FilePickerResult with success status, files, and error details
 */
export async function pickFilesWithResult(
  options?: FilePickerOptions,
): Promise<FilePickerResult> {
  if (_pickerInProgress) {
    console.warn("[FilePicker] Another picker is already open, ignoring call");
    return { success: true, files: [], cancelled: true };
  }

  _pickerInProgress = true;

  try {
    return await _pickFilesWithResultInternal(options);
  } finally {
    _pickerInProgress = false;
  }
}

async function _pickFilesWithResultInternal(
  options?: FilePickerOptions,
): Promise<FilePickerResult> {
  const types = options?.types ?? ["*/*"];
  const multiple = options?.multiple ?? false;
  const copyToCacheDirectory = options?.copyToCacheDirectory ?? true;
  const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const showAlerts = options?.showAlerts ?? true;

  try {
    console.log("[FilePicker] Opening document picker...", { types, multiple });

    const result = await DocumentPicker.getDocumentAsync({
      type: types,
      multiple,
      copyToCacheDirectory,
    });

    // Handle cancellation
    if (result.canceled || !result.assets || result.assets.length === 0) {
      console.log("[FilePicker] User cancelled file selection");
      return { success: true, files: [], cancelled: true };
    }

    console.log("[FilePicker] Files selected:", result.assets.length);

    // Process and validate each file
    const validFiles: PickedFile[] = [];
    const errors: string[] = [];

    for (const asset of result.assets) {
      // Validate file
      const validation = validatePickedFile(
        {
          uri: asset.uri,
          name: asset.name,
          size: asset.size || undefined,
          mimeType: asset.mimeType || undefined,
        },
        maxFileSize,
      );

      if (!validation.valid) {
        errors.push(validation.error || "Unknown validation error");
        continue;
      }

      // Get additional file info
      let fileSize = asset.size || 0;
      let lastModified: number | undefined;

      try {
        const fileInfo = await getFileInfo(asset.uri);
        if (fileInfo.size) fileSize = fileInfo.size;
        lastModified = fileInfo.lastModified;
      } catch {
        // Use asset size as fallback
      }

      // Create PickedFile object
      const pickedFile: PickedFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || "application/octet-stream",
        size: fileSize,
        extension: getExtensionFromName(asset.name),
        lastModified,
      };

      validFiles.push(pickedFile);
      console.log(
        "[FilePicker] File processed:",
        pickedFile.name,
        formatFileSizeForPicker(pickedFile.size),
      );
    }

    // Handle errors
    if (errors.length > 0) {
      const errorMessage = errors.join("\n");
      console.error("[FilePicker] Validation errors:", errorMessage);

      if (showAlerts) {
        Alert.alert(
          "Import Error",
          validFiles.length > 0
            ? `Some files could not be imported:\n${errorMessage}`
            : errorMessage,
          [{ text: "OK" }],
        );
      }

      if (validFiles.length === 0) {
        return { success: false, files: [], error: errorMessage };
      }
    }

    return { success: true, files: validFiles };
  } catch (error) {
    console.error("[FilePicker] Error picking files:", error);

    // Handle specific errors
    if (error instanceof Error) {
      // User cancelled - not an error
      if (
        error.message.includes("cancelled") ||
        error.message.includes("canceled")
      ) {
        return { success: true, files: [], cancelled: true };
      }

      const errorMessage = `Failed to pick file: ${error.message}`;

      if (showAlerts) {
        Alert.alert("Error", errorMessage, [{ text: "OK" }]);
      }

      return { success: false, files: [], error: errorMessage };
    }

    return { success: false, files: [], error: "Unknown error occurred" };
  }
}

/**
 * Pick document files (PDF, DOCX, TXT, etc.)
 */
export async function pickDocuments(
  multiple: boolean = false,
): Promise<PickedFile[]> {
  return pickFiles({
    types: [
      ...SUPPORTED_FILE_TYPES.ALL_DOCUMENTS,
      ...SUPPORTED_FILE_TYPES.ALL_IMAGES,
    ],
    multiple,
    copyToCacheDirectory: true,
  });
}

/**
 * Pick PDF files only
 */
export async function pickPDFs(
  multiple: boolean = false,
): Promise<PickedFile[]> {
  return pickFiles({
    types: [SUPPORTED_FILE_TYPES.PDF],
    multiple,
    copyToCacheDirectory: true,
  });
}

/**
 * Pick PDF file with detailed result
 */
export async function pickPDFWithResult(): Promise<FilePickerResult> {
  return pickFilesWithResult({
    types: [SUPPORTED_FILE_TYPES.PDF],
    multiple: false,
    copyToCacheDirectory: true,
  });
}

/**
 * Pick image files only
 */
export async function pickImages(
  multiple: boolean = false,
): Promise<PickedFile[]> {
  return pickFiles({
    types: SUPPORTED_FILE_TYPES.ALL_IMAGES,
    multiple,
    copyToCacheDirectory: true,
  });
}

/**
 * Check if file picker is available on the current platform
 */
export function isFilePickerAvailable(): boolean {
  return true; // expo-document-picker handles platform differences
}

/**
 * Get human-readable description of allowed file types
 */
export function getAllowedTypesDescription(types: string[]): string {
  const typeNames: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "DOCX",
    "application/msword": "DOC",
    "text/plain": "TXT",
    "text/csv": "CSV",
    "application/json": "JSON",
    "application/rtf": "RTF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/gif": "GIF",
    "image/webp": "WebP",
    "image/heic": "HEIC",
  };

  if (types.includes("*/*")) {
    return "All files";
  }

  const names = types
    .map((type) => typeNames[type] || type.split("/")[1]?.toUpperCase() || type)
    .filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

  return names.join(", ");
}
