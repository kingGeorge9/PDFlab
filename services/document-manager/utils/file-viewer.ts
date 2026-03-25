/**
 * File Viewer Utility
 * Cross-platform file opening with in-app viewers and fallback to system apps
 */

import * as IntentLauncher from "expo-intent-launcher";
import { Alert, Platform } from "react-native";

// Lazy import to prevent crashes when native module is not available
const getSharing = async () => {
  try {
    return await import("expo-sharing");
  } catch {
    return null;
  }
};

import { getMimeType } from "./file-utils";

// ============================================================================
// TYPES
// ============================================================================
export interface FileViewerOptions {
  uri: string;
  mimeType?: string;
  displayName?: string;
}

export type ViewerResult = {
  success: boolean;
  method: "in-app" | "system" | "share";
  error?: string;
};

// ============================================================================
// SUPPORTED IN-APP VIEWERS
// ============================================================================

/**
 * Check if a file type can be viewed in-app
 */
export function canViewInApp(mimeType: string): boolean {
  const inAppViewableTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/plain",
  ];

  return inAppViewableTypes.includes(mimeType);
}

/**
 * Get the appropriate viewer type for a file
 */
export function getViewerType(
  mimeType: string,
): "pdf" | "image" | "text" | "system" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/")) return "text";
  return "system";
}

// ============================================================================
// FILE OPENING
// ============================================================================

/**
 * Open a file using the system's default app
 * Falls back to share sheet if no app is available
 */
export async function openWithSystemApp(
  options: FileViewerOptions,
): Promise<ViewerResult> {
  const { uri, mimeType, displayName } = options;
  const finalMimeType = mimeType || getMimeType(displayName || uri);

  if (Platform.OS === "android") {
    return openWithAndroidIntent(uri, finalMimeType);
  } else {
    return openWithIOSShare(uri, finalMimeType, displayName);
  }
}

/**
 * Open file using Android Intent (ACTION_VIEW)
 */
async function openWithAndroidIntent(
  uri: string,
  mimeType: string,
): Promise<ViewerResult> {
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: uri,
      type: mimeType,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });

    return { success: true, method: "system" };
  } catch (error) {
    console.error("[FileViewer] Android intent failed:", error);

    // Try share sheet as fallback
    try {
      const Sharing = await getSharing();
      if (Sharing) {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, { mimeType });
          return { success: true, method: "share" };
        }
      }
    } catch (shareError) {
      console.error("[FileViewer] Share fallback failed:", shareError);
    }

    return {
      success: false,
      method: "system",
      error: "No app available to open this file type",
    };
  }
}

/**
 * Open file using iOS Share Sheet
 */
async function openWithIOSShare(
  uri: string,
  mimeType: string,
  displayName?: string,
): Promise<ViewerResult> {
  try {
    const Sharing = await getSharing();
    if (!Sharing) {
      return {
        success: false,
        method: "share",
        error: "Sharing module is not available",
      };
    }
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return {
        success: false,
        method: "share",
        error: "Sharing is not available on this device",
      };
    }

    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: displayName ? `Open ${displayName}` : "Open File",
    });

    return { success: true, method: "share" };
  } catch (error) {
    console.error("[FileViewer] iOS share failed:", error);
    return {
      success: false,
      method: "share",
      error: "Failed to open file",
    };
  }
}

// ============================================================================
// ALERT HELPERS
// ============================================================================

/**
 * Show an alert when file open fails
 */
export function showOpenFailedAlert(filename: string, error?: string): void {
  Alert.alert(
    "Unable to Open File",
    error ||
      `Could not open "${filename}". No app is installed that can open this file type.`,
    [{ text: "OK" }],
  );
}

/**
 * Show a dialog to choose how to open a file
 */
export function showOpenWithDialog(
  options: FileViewerOptions,
  onOpenInApp?: () => void,
  onOpenExternal?: () => void,
): void {
  const buttons: {
    text: string;
    onPress?: () => void;
    style?: "cancel" | "default" | "destructive";
  }[] = [];

  if (onOpenInApp) {
    buttons.push({ text: "Open in App", onPress: onOpenInApp });
  }

  if (onOpenExternal) {
    buttons.push({ text: "Open with...", onPress: onOpenExternal });
  }

  buttons.push({ text: "Cancel", style: "cancel" });

  Alert.alert(
    options.displayName || "Open File",
    "How would you like to open this file?",
    buttons,
  );
}
