import { addSourceTag, getFileByUri } from "@/services/fileIndexService";
import { File, Paths } from "expo-file-system";
import { Alert, Platform } from "react-native";

/**
 * Sanitize a user-entered document title into a safe filename.
 * Strips illegal filesystem characters, trims whitespace, collapses
 * multiple spaces, and falls back to a timestamped default.
 */
export function sanitizeFilename(raw: string): string {
  let name = raw
    .replace(/[\/\\:*?"<>|]/g, "") // strip illegal chars
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
  if (!name) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    name = `Untitled Document ${ts}`;
  }
  return name;
}

// Lazy import to prevent crashes when native module is not available
const getSharing = async () => {
  try {
    return await import("expo-sharing");
  } catch {
    return null;
  }
};

/**
 * Options for saving a file
 */
export interface FileSaveOptions {
  /** The URI of the source file to save */
  sourceUri: string;
  /** The desired filename (with extension) */
  fileName: string;
  /** MIME type of the file */
  mimeType: string;
  /** UTI for iOS (e.g., "com.adobe.pdf") */
  uti?: string;
  /** Dialog title shown to the user */
  dialogTitle?: string;
}

/**
 * MIME types for common document formats
 */
export const MIME_TYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  TXT: "text/plain",
  PNG: "image/png",
  JPEG: "image/jpeg",
} as const;

/**
 * UTI types for iOS
 */
export const UTI_TYPES = {
  PDF: "com.adobe.pdf",
  DOCX: "org.openxmlformats.wordprocessingml.document",
  XLSX: "org.openxmlformats.spreadsheetml.sheet",
  PPTX: "org.openxmlformats.presentationml.presentation",
  TXT: "public.plain-text",
  PNG: "public.png",
  JPEG: "public.jpeg",
} as const;

/**
 * Prepare a file for saving by copying it to cache with the desired filename.
 * Returns the prepared file's URI.
 */
async function prepareFileForSave(
  sourceUri: string,
  fileName: string,
): Promise<string> {
  const sourceFile = new File(sourceUri);
  const preparedFile = new File(Paths.cache, fileName);

  // Delete existing file if it exists to avoid copy error
  if (preparedFile.exists) {
    await preparedFile.delete();
  }

  await sourceFile.copy(preparedFile);
  return preparedFile.uri;
}

/**
 * Save a file to a user-chosen location.
 *
 * On Android: Opens the system file picker (Storage Access Framework) to let users
 * choose where to save the file (Downloads, Google Drive, etc.)
 *
 * On iOS: Opens the share sheet where users can choose "Save to Files"
 *
 * @param options - File save options
 * @returns Promise that resolves when save is complete (or user cancels)
 */
export async function saveFileToDevice(
  options: FileSaveOptions,
): Promise<boolean> {
  const {
    sourceUri,
    fileName,
    mimeType,
    uti,
    dialogTitle = "Save File",
  } = options;

  try {
    // Prepare the file with the desired filename
    const preparedUri = await prepareFileForSave(sourceUri, fileName);

    if (Platform.OS === "android") {
      // On Android, use the share sheet which includes "Save to device" options
      // The share dialog on Android allows saving to Downloads, Drive, etc.
      const Sharing = await getSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(preparedUri, {
          mimeType,
          dialogTitle,
        });

        // Show a tip to help users find the save option
        // (Android share sheet varies by device)
        return true;
      } else {
        Alert.alert("Error", "File saving is not available on this device");
        return false;
      }
    } else {
      // On iOS, use share sheet with "Save to Files" option
      const Sharing = await getSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(preparedUri, {
          mimeType,
          dialogTitle,
          UTI: uti,
        });
        return true;
      } else {
        Alert.alert("Error", "File saving is not available on this device");
        return false;
      }
    }
  } catch (error) {
    console.error("Save file error:", error);
    throw error;
  }
}

/**
 * Save a DOCX file to a user-chosen location
 */
export async function saveDocxToDevice(
  sourceUri: string,
  fileName: string,
): Promise<boolean> {
  // Ensure filename has .docx extension
  const finalFileName = fileName.endsWith(".docx")
    ? fileName
    : `${fileName}.docx`;

  return saveFileToDevice({
    sourceUri,
    fileName: finalFileName,
    mimeType: MIME_TYPES.DOCX,
    uti: UTI_TYPES.DOCX,
    dialogTitle: "Save Document",
  });
}

/**
 * Save a PDF file to a user-chosen location
 */
export async function savePdfToDevice(
  sourceUri: string,
  fileName: string,
): Promise<boolean> {
  // Ensure filename has .pdf extension
  const finalFileName = fileName.endsWith(".pdf")
    ? fileName
    : `${fileName}.pdf`;

  return saveFileToDevice({
    sourceUri,
    fileName: finalFileName,
    mimeType: MIME_TYPES.PDF,
    uti: UTI_TYPES.PDF,
    dialogTitle: "Save PDF",
  });
}

/**
 * Share a file (for sending to apps like email, messaging, etc.)
 * Unlike save, this is meant for sharing with other people/apps
 */
export async function shareFile(options: FileSaveOptions): Promise<boolean> {
  const {
    sourceUri,
    fileName,
    mimeType,
    uti,
    dialogTitle = "Share File",
  } = options;

  try {
    const preparedUri = await prepareFileForSave(sourceUri, fileName);

    const Sharing = await getSharing();
    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(preparedUri, {
        mimeType,
        dialogTitle,
        UTI: uti,
      });

      // Add shared tag to the file in unified index
      const fileRecord = await getFileByUri(sourceUri);
      if (fileRecord) {
        addSourceTag(fileRecord.id, "shared").catch(console.error);
      }

      return true;
    } else {
      Alert.alert("Error", "Sharing is not available on this device");
      return false;
    }
  } catch (error) {
    console.error("Share file error:", error);
    throw error;
  }
}

/**
 * Sanitize a string to be used as a filename
 */
export function sanitizeFileName(
  input: string,
  maxLength: number = 50,
): string {
  return input
    .trim()
    .replace(/[^a-z0-9\s-]/gi, "") // Remove special characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .substring(0, maxLength); // Limit length
}

/**
 * Generate a filename with timestamp fallback
 */
export function generateFileName(
  baseName: string | undefined,
  extension: string,
): string {
  const sanitized = sanitizeFileName(baseName || "");
  const ext = extension.startsWith(".") ? extension : `.${extension}`;

  return sanitized ? `${sanitized}${ext}` : `Document_${Date.now()}${ext}`;
}
