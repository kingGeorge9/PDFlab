import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";

// Storage keys for permission status
const PERMISSION_STORAGE_KEYS = {
  STORAGE: "@permission_storage_status",
  CAMERA: "@permission_camera_status",
  MEDIA: "@permission_media_status",
  LAST_CHECK: "@permission_last_check",
  DENIAL_COUNT: "@permission_denial_count",
};

export type PermissionStatus =
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable"
  | "limited";

export type PermissionType = "storage" | "camera" | "media" | "microphone";

interface PermissionResult {
  status: PermissionStatus;
  canAskAgain: boolean;
}

interface StoredPermissionState {
  status: PermissionStatus;
  lastChecked: number;
  denialCount: number;
}

interface PermissionUIOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  showSettingsOnBlock?: boolean;
}

// Default UI messages for different permission types
const DEFAULT_UI_OPTIONS: Record<PermissionType, PermissionUIOptions> = {
  storage: {
    title: "Storage Access Required",
    message:
      "This app needs access to your storage to open and save PDF documents.",
    confirmText: "Allow Access",
    cancelText: "Not Now",
    showSettingsOnBlock: true,
  },
  camera: {
    title: "Camera Access Required",
    message: "This app needs camera access to scan documents.",
    confirmText: "Allow Camera",
    cancelText: "Not Now",
    showSettingsOnBlock: true,
  },
  media: {
    title: "Media Access Required",
    message: "This app needs access to your photos and media files.",
    confirmText: "Allow Access",
    cancelText: "Not Now",
    showSettingsOnBlock: true,
  },
  microphone: {
    title: "Microphone Access Required",
    message: "This app needs microphone access for voice features.",
    confirmText: "Allow Microphone",
    cancelText: "Not Now",
    showSettingsOnBlock: true,
  },
};

/**
 * Permission Service for handling storage and file access permissions
 * Uses Expo APIs for cross-platform compatibility
 */
class PermissionService {
  private permissionCache: Map<string, PermissionResult> = new Map();

  // ==================== HELPER METHODS ====================

  /**
   * Map Expo permission status to our PermissionResult type
   */
  private mapExpoPermissionStatus(
    status: ImagePicker.PermissionStatus,
    canAskAgain: boolean = true,
  ): PermissionResult {
    switch (status) {
      case ImagePicker.PermissionStatus.GRANTED:
        return { status: "granted", canAskAgain: false };
      case ImagePicker.PermissionStatus.DENIED:
        return { status: canAskAgain ? "denied" : "blocked", canAskAgain };
      case ImagePicker.PermissionStatus.UNDETERMINED:
        return { status: "denied", canAskAgain: true };
      default:
        return { status: "unavailable", canAskAgain: false };
    }
  }

  // ==================== STORAGE OPERATIONS ====================

  /**
   * Store permission status to AsyncStorage
   */
  private async storePermissionStatus(
    type: PermissionType,
    status: PermissionStatus,
  ): Promise<void> {
    try {
      const key = `@permission_${type}_status`;
      const state: StoredPermissionState = {
        status,
        lastChecked: Date.now(),
        denialCount: await this.getDenialCount(type),
      };
      await AsyncStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error("Error storing permission status:", error);
    }
  }

  /**
   * Get stored permission status
   */
  async getStoredPermissionStatus(
    type: PermissionType,
  ): Promise<StoredPermissionState | null> {
    try {
      const key = `@permission_${type}_status`;
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error("Error getting stored permission status:", error);
    }
    return null;
  }

  /**
   * Increment denial count for a permission type
   */
  private async incrementDenialCount(type: PermissionType): Promise<void> {
    try {
      const key = `@permission_${type}_denial_count`;
      const current = await AsyncStorage.getItem(key);
      const count = current ? parseInt(current, 10) + 1 : 1;
      await AsyncStorage.setItem(key, count.toString());
    } catch (error) {
      console.error("Error incrementing denial count:", error);
    }
  }

  /**
   * Get denial count for a permission type
   */
  async getDenialCount(type: PermissionType): Promise<number> {
    try {
      const key = `@permission_${type}_denial_count`;
      const count = await AsyncStorage.getItem(key);
      return count ? parseInt(count, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Reset denial count (call when permission is granted)
   */
  private async resetDenialCount(type: PermissionType): Promise<void> {
    try {
      const key = `@permission_${type}_denial_count`;
      await AsyncStorage.setItem(key, "0");
    } catch (error) {
      console.error("Error resetting denial count:", error);
    }
  }

  /**
   * Clear all stored permission data
   */
  async clearStoredPermissions(): Promise<void> {
    try {
      const keys = Object.values(PERMISSION_STORAGE_KEYS);
      await AsyncStorage.multiRemove(keys);
      this.permissionCache.clear();
    } catch (error) {
      console.error("Error clearing stored permissions:", error);
    }
  }

  // ==================== PERMISSION CHECKS ====================

  /**
   * Check current storage/media permission status using Expo ImagePicker
   */
  async checkStoragePermission(): Promise<PermissionResult> {
    // On web, permissions work differently
    if (Platform.OS === "web") {
      return { status: "granted", canAskAgain: false };
    }

    try {
      const { status, canAskAgain } =
        await ImagePicker.getMediaLibraryPermissionsAsync();
      return this.mapExpoPermissionStatus(status, canAskAgain);
    } catch (error) {
      console.error("Error checking storage permission:", error);
      return { status: "unavailable", canAskAgain: false };
    }
  }

  /**
   * Request storage permission using Expo ImagePicker
   */
  async requestStoragePermission(): Promise<PermissionResult> {
    if (Platform.OS === "web") {
      return { status: "granted", canAskAgain: false };
    }

    try {
      const { status, canAskAgain } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      return this.mapExpoPermissionStatus(status, canAskAgain);
    } catch (error) {
      console.error("Error requesting storage permission:", error);
      return { status: "unavailable", canAskAgain: false };
    }
  }

  /**
   * Check camera permission
   */
  async checkCameraPermission(): Promise<PermissionResult> {
    if (Platform.OS === "web") {
      return { status: "granted", canAskAgain: false };
    }

    try {
      const { status, canAskAgain } =
        await ImagePicker.getCameraPermissionsAsync();
      return this.mapExpoPermissionStatus(status, canAskAgain ?? true);
    } catch (error) {
      console.error("Error checking camera permission:", error);
      return { status: "unavailable", canAskAgain: false };
    }
  }

  /**
   * Request camera permission
   */
  async requestCameraPermission(): Promise<PermissionResult> {
    if (Platform.OS === "web") {
      return { status: "granted", canAskAgain: false };
    }

    try {
      const { status, canAskAgain } =
        await ImagePicker.requestCameraPermissionsAsync();
      return this.mapExpoPermissionStatus(status, canAskAgain ?? true);
    } catch (error) {
      console.error("Error requesting camera permission:", error);
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Check media permission (same as storage for our purposes)
   */
  async checkMediaPermission(): Promise<PermissionResult> {
    return this.checkStoragePermission();
  }

  /**
   * Check microphone permission
   * Note: Microphone permissions require expo-av which is not installed
   */
  async checkMicrophonePermission(): Promise<PermissionResult> {
    if (Platform.OS === "web") {
      return { status: "granted", canAskAgain: false };
    }

    // Microphone permissions require expo-av, return unavailable for now
    console.warn("Microphone permissions require expo-av package");
    return { status: "unavailable", canAskAgain: false };
  }

  /**
   * Request microphone permission
   * Note: Microphone permissions require expo-av which is not installed
   */
  async requestMicrophonePermission(): Promise<PermissionResult> {
    if (Platform.OS === "web") {
      return { status: "granted", canAskAgain: false };
    }

    // Microphone permissions require expo-av, return unavailable for now
    console.warn("Microphone permissions require expo-av package");
    return { status: "unavailable", canAskAgain: false };
  }

  /**
   * Check permission by type
   */
  async checkPermission(type: PermissionType): Promise<PermissionResult> {
    switch (type) {
      case "storage":
        return this.checkStoragePermission();
      case "camera":
        return this.checkCameraPermission();
      case "media":
        return this.checkMediaPermission();
      case "microphone":
        return this.checkMicrophonePermission();
      default:
        return { status: "unavailable", canAskAgain: false };
    }
  }

  /**
   * Request permission by type
   */
  async requestPermission(type: PermissionType): Promise<PermissionResult> {
    switch (type) {
      case "storage":
        return this.requestStoragePermission();
      case "camera":
        return this.requestCameraPermission();
      case "media":
        return this.requestStoragePermission();
      case "microphone":
        return this.requestMicrophonePermission();
      default:
        return { status: "unavailable", canAskAgain: false };
    }
  }

  /**
   * Open app settings
   */
  async openAppSettings(): Promise<void> {
    try {
      if (Platform.OS === "ios") {
        await Linking.openURL("app-settings:");
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error("Error opening settings:", error);
      // Try generic settings as fallback
      try {
        await Linking.openSettings();
      } catch {
        console.error("Could not open settings");
      }
    }
  }

  // ==================== ENHANCED UI PERMISSION REQUESTS ====================

  /**
   * Request permission with proper UI flow
   */
  async requestPermissionWithUI(
    type: PermissionType,
    options?: Partial<PermissionUIOptions>,
  ): Promise<PermissionResult> {
    const uiOptions = { ...DEFAULT_UI_OPTIONS[type], ...options };
    const denialCount = await this.getDenialCount(type);

    // Check current status first
    const currentStatus = await this.checkPermission(type);

    // If already granted, return immediately
    if (
      currentStatus.status === "granted" ||
      currentStatus.status === "limited"
    ) {
      await this.storePermissionStatus(type, currentStatus.status);
      return currentStatus;
    }

    // If blocked, show settings prompt
    if (currentStatus.status === "blocked" && uiOptions.showSettingsOnBlock) {
      return this.showBlockedPermissionUI(type, uiOptions);
    }

    // If denied multiple times, show more compelling message
    if (denialCount >= 2) {
      return this.showPersistentDenialUI(type, uiOptions, denialCount);
    }

    // Show rationale before requesting
    return new Promise((resolve) => {
      Alert.alert(
        uiOptions.title || "Permission Required",
        uiOptions.message ||
          "This app needs this permission to function properly.",
        [
          {
            text: uiOptions.cancelText || "Not Now",
            style: "cancel",
            onPress: async () => {
              await this.incrementDenialCount(type);
              await this.storePermissionStatus(type, "denied");
              resolve({ status: "denied", canAskAgain: true });
            },
          },
          {
            text: uiOptions.confirmText || "Allow",
            onPress: async () => {
              const result = await this.requestPermission(type);
              if (result.status === "granted" || result.status === "limited") {
                await this.resetDenialCount(type);
              } else {
                await this.incrementDenialCount(type);
              }
              await this.storePermissionStatus(type, result.status);
              resolve(result);
            },
          },
        ],
      );
    });
  }

  /**
   * Show UI for blocked permission (needs settings)
   */
  private showBlockedPermissionUI(
    type: PermissionType,
    options: PermissionUIOptions,
  ): Promise<PermissionResult> {
    return new Promise((resolve) => {
      Alert.alert(
        "Permission Blocked",
        `${options.message}\n\nThis permission was previously denied. Please enable it in Settings to continue.`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve({ status: "blocked", canAskAgain: false }),
          },
          {
            text: "Open Settings",
            onPress: async () => {
              await this.openAppSettings();
              // Re-check after user returns from settings
              const newStatus = await this.checkPermission(type);
              await this.storePermissionStatus(type, newStatus.status);
              resolve(newStatus);
            },
          },
        ],
      );
    });
  }

  /**
   * Show UI for persistent denial (user denied multiple times)
   */
  private showPersistentDenialUI(
    type: PermissionType,
    options: PermissionUIOptions,
    denialCount: number,
  ): Promise<PermissionResult> {
    return new Promise((resolve) => {
      Alert.alert(
        "Permission Required",
        `${options.message}\n\nThis feature won't work without this permission. You've declined ${denialCount} times.`,
        [
          {
            text: "Keep Disabled",
            style: "cancel",
            onPress: async () => {
              await this.storePermissionStatus(type, "denied");
              resolve({ status: "denied", canAskAgain: true });
            },
          },
          {
            text: "Try Again",
            onPress: async () => {
              const result = await this.requestPermission(type);
              if (result.status === "granted" || result.status === "limited") {
                await this.resetDenialCount(type);
              }
              await this.storePermissionStatus(type, result.status);
              resolve(result);
            },
          },
        ],
      );
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if permission is granted (quick check)
   */
  async isGranted(type: PermissionType): Promise<boolean> {
    const result = await this.checkPermission(type);
    return result.status === "granted" || result.status === "limited";
  }

  /**
   * Get all permission statuses
   */
  async getAllPermissionStatuses(): Promise<
    Record<PermissionType, PermissionResult>
  > {
    const [storage, camera, media, microphone] = await Promise.all([
      this.checkPermission("storage"),
      this.checkPermission("camera"),
      this.checkPermission("media"),
      this.checkPermission("microphone"),
    ]);

    return { storage, camera, media, microphone };
  }

  /**
   * Handle graceful denial - returns a fallback or shows appropriate message
   */
  async handleGracefulDenial(
    type: PermissionType,
    fallbackAction?: () => void,
  ): Promise<void> {
    const denialCount = await this.getDenialCount(type);
    const options = DEFAULT_UI_OPTIONS[type];

    if (denialCount >= 3) {
      // User has denied many times, respect their choice
      Alert.alert(
        "Feature Unavailable",
        `This feature requires ${type} access which has been disabled. You can enable it later in Settings.`,
        [
          { text: "OK", onPress: fallbackAction },
          {
            text: "Settings",
            onPress: () => this.openAppSettings(),
          },
        ],
      );
    } else {
      // Offer to try again
      Alert.alert(
        "Permission Needed",
        options.message || "This feature requires additional permissions.",
        [
          { text: "Cancel", style: "cancel", onPress: fallbackAction },
          {
            text: "Grant Permission",
            onPress: () => this.requestPermissionWithUI(type),
          },
        ],
      );
    }
  }

  /**
   * Ensure permission is granted before action
   * Returns true if granted, false otherwise
   */
  async ensurePermission(type: PermissionType): Promise<boolean> {
    const status = await this.checkPermission(type);

    if (status.status === "granted" || status.status === "limited") {
      return true;
    }

    const result = await this.requestPermissionWithUI(type);
    return result.status === "granted" || result.status === "limited";
  }

  /**
   * Check if file access is available
   * This is a simplified check that returns true to allow the app to attempt file operations
   */
  async checkFileAccessPermission(): Promise<PermissionResult> {
    return this.checkStoragePermission();
  }

  /**
   * Request file access permission
   */
  async requestFileAccessWithPrompt(): Promise<PermissionResult> {
    return this.requestPermissionWithUI("storage");
  }

  /**
   * Request permission for saving files to downloads
   */
  async requestDownloadPermission(): Promise<PermissionResult> {
    // On modern Android/iOS, we use scoped storage which doesn't need explicit permission
    if (Platform.OS === "web") {
      return { status: "granted", canAskAgain: false };
    }
    return this.requestStoragePermission();
  }

  /**
   * Request all media permissions
   */
  async requestMediaPermissions(): Promise<{
    images: PermissionResult;
    video: PermissionResult;
    audio: PermissionResult;
  }> {
    const storageResult = await this.requestStoragePermission();
    return {
      images: storageResult,
      video: storageResult,
      audio: storageResult,
    };
  }

  /**
   * Show rationale for why permission is needed
   */
  showPermissionRationale(onContinue: () => void, onCancel: () => void): void {
    Alert.alert(
      "Storage Permission Needed",
      "This app needs access to your storage to:\n\n• Open PDF documents\n• Save generated PDFs\n• Access your files",
      [
        {
          text: "Not Now",
          style: "cancel",
          onPress: onCancel,
        },
        {
          text: "Continue",
          onPress: onContinue,
        },
      ],
    );
  }
}

export const permissionService = new PermissionService();
export default permissionService;
