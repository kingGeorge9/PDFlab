import { addSourceTag, getFileByUri } from "@/services/fileIndexService";
import { Alert, Platform } from "react-native";

// Lazy import to prevent crashes when native module is not available
const getSharing = async () => {
  try {
    return await import("expo-sharing");
  } catch {
    return null;
  }
};

interface SavePdfOptions {
  pdfUri: string;
  fileName?: string;
  dialogTitle?: string;
}

interface SharePdfOptions {
  pdfUri: string;
  fileName?: string;
  dialogTitle?: string;
}

/**
 * Save PDF to device storage
 */
export async function savePdf({
  pdfUri,
  fileName = "document.pdf",
  dialogTitle = "Save PDF",
}: SavePdfOptions): Promise<boolean> {
  try {
    if (!pdfUri) {
      Alert.alert("Error", "No PDF file to save");
      return false;
    }

    // Ensure filename has .pdf extension
    const sanitizedFileName = fileName.endsWith(".pdf")
      ? fileName
      : `${fileName}.pdf`;

    if (Platform.OS === "android") {
      // On Android, use Sharing to save/export
      const Sharing = await getSharing();
      if (!Sharing) {
        Alert.alert("Error", "Sharing module is not available.");
        return false;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Error",
          "Sharing is not available on this device. PDF was created but cannot be saved.",
        );
        return false;
      }

      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        dialogTitle: dialogTitle,
        UTI: "com.adobe.pdf",
      });

      return true;
    } else if (Platform.OS === "ios") {
      // On iOS, use Sharing
      const Sharing = await getSharing();
      if (!Sharing) {
        Alert.alert("Error", "Sharing module is not available.");
        return false;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Error",
          "Sharing is not available on this device. PDF was created but cannot be saved.",
        );
        return false;
      }

      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        dialogTitle: dialogTitle,
        UTI: "com.adobe.pdf",
      });

      return true;
    } else {
      // Web or other platforms
      Alert.alert(
        "Not Supported",
        "Saving PDFs is not supported on this platform",
      );
      return false;
    }
  } catch (error) {
    console.error("Save PDF error:", error);
    Alert.alert(
      "Save Failed",
      `Failed to save PDF: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Share PDF via system share sheet
 */
export async function sharePdf({
  pdfUri,
  fileName = "document.pdf",
  dialogTitle = "Share PDF",
}: SharePdfOptions): Promise<boolean> {
  try {
    if (!pdfUri) {
      Alert.alert("Error", "No PDF file to share");
      return false;
    }

    const Sharing = await getSharing();
    if (!Sharing) {
      Alert.alert("Error", "Sharing module is not available.");
      return false;
    }
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert(
        "Error",
        "Sharing is not available on this device. PDF was created but cannot be shared.",
      );
      return false;
    }

    await Sharing.shareAsync(pdfUri, {
      mimeType: "application/pdf",
      dialogTitle: dialogTitle,
      UTI: "com.adobe.pdf",
    });

    // Add shared tag to the file in unified index
    const fileRecord = await getFileByUri(pdfUri);
    if (fileRecord) {
      addSourceTag(fileRecord.id, "shared").catch(console.error);
    }

    return true;
  } catch (error) {
    console.error("Share PDF error:", error);
    Alert.alert(
      "Share Failed",
      `Failed to share PDF: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Generate a filename for PDF based on title
 */
export function generatePdfFileName(baseName?: string): string {
  const sanitizedBaseName = baseName
    ? baseName
        .trim()
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .replace(/\s+/g, "_")
    : "Untitled";
  return `${sanitizedBaseName}.pdf`;
}
