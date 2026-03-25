/**
 * File Manager Service
 * Handles picking, storing, and managing files permanently in the app
 */

import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";

// Storage directory name
const STORAGE_DIR_NAME = "my-documents";

export interface StoredFile {
  id: string;
  name: string;
  uri: string;
  type: string;
  size: number;
  dateAdded: number;
}

/**
 * Get the storage directory
 */
const getStorageDir = (): Directory => {
  return new Directory(Paths.document, STORAGE_DIR_NAME);
};

/**
 * Initialize storage directory
 */
export const initializeStorage = async (): Promise<void> => {
  const storageDir = getStorageDir();
  if (!storageDir.exists) {
    storageDir.create();
  }
};

/**
 * Pick and save file permanently
 */
export const pickAndSaveFile = async (): Promise<StoredFile | null> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });

    if (result.canceled) return null;

    const asset = result.assets[0];
    const fileId = Date.now().toString();
    const fileExtension = asset.name.split(".").pop();
    const fileName = `${fileId}.${fileExtension}`;

    // Ensure storage directory exists
    await initializeStorage();

    // Copy file to permanent storage
    const sourceFile = new File(asset.uri);
    const storageDir = getStorageDir();
    const destFile = new File(storageDir, fileName);

    await sourceFile.copy(destFile);

    const storedFile: StoredFile = {
      id: fileId,
      name: asset.name,
      uri: destFile.uri,
      type: asset.mimeType || "application/octet-stream",
      size: asset.size || 0,
      dateAdded: Date.now(),
    };

    return storedFile;
  } catch (error) {
    console.error("Error picking file:", error);
    return null;
  }
};

/**
 * Get all stored files
 */
export const listStoredFiles = async (): Promise<StoredFile[]> => {
  try {
    await initializeStorage();
    const storageDir = getStorageDir();
    const entries = storageDir.list();

    const storedFiles: StoredFile[] = [];
    for (const entry of entries) {
      if (entry instanceof File) {
        const file = entry as File;
        storedFiles.push({
          id: file.name.split(".")[0],
          name: file.name,
          uri: file.uri,
          type: getFileType(file.name),
          size: file.size || 0,
          dateAdded: file.modificationTime || 0,
        });
      }
    }

    return storedFiles;
  } catch (error) {
    console.error("Error listing files:", error);
    return [];
  }
};

/**
 * Delete a file from storage
 */
export const deleteFile = async (uri: string): Promise<boolean> => {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
    return true;
  } catch (error) {
    console.error("Error deleting file:", error);
    return false;
  }
};

/**
 * Get file info
 */
export const getFileInfo = (
  uri: string,
): { exists: boolean; size?: number; modificationTime?: number } | null => {
  try {
    const file = new File(uri);
    if (file.exists) {
      return {
        exists: true,
        size: file.size ?? undefined,
        modificationTime: file.modificationTime ?? undefined,
      };
    }
    return { exists: false };
  } catch (error) {
    console.error("Error getting file info:", error);
    return null;
  }
};

/**
 * Check if a file exists
 */
export const fileExists = (uri: string): boolean => {
  try {
    const file = new File(uri);
    return file.exists;
  } catch {
    return false;
  }
};

/**
 * Get the storage directory path
 */
export const getStorageDirectory = (): string => getStorageDir().uri;

/**
 * Helper function to determine file MIME type from filename
 */
const getFileType = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    json: "application/json",
    xml: "application/xml",
    zip: "application/zip",
  };
  return types[ext || ""] || "application/octet-stream";
};
