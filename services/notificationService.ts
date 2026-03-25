/**
 * Notification Service
 * Provides in-app and local notifications for processing, downloads, and AI tasks.
 * Uses expo-notifications when available, falls back to Alert-based notifications.
 */
import { loadSettings } from "@/services/settingsService";
import { Alert, Platform } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "processing_complete"
  | "download_complete"
  | "ai_complete"
  | "read_aloud_playing"
  | "read_aloud_stopped"
  | "read_aloud_end_of_file";

interface NotificationPayload {
  title: string;
  body: string;
  type: NotificationType;
}

// ─── Lazy load expo-notifications ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Notifications: any = null;
let _notificationsLoaded = false;

async function getNotifications() {
  if (_notificationsLoaded) return _Notifications;
  try {
    // Dynamic require — resolves only if expo-notifications is installed
    // String concat prevents static analysis from resolving the module
    const prefix = "expo-";
    const suffix = "notifications";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _Notifications = require(prefix + suffix);
    _notificationsLoaded = true;
    return _Notifications;
  } catch {
    _notificationsLoaded = true;
    _Notifications = null;
    return null;
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let _initialized = false;

export async function initNotifications(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  const Notifications = await getNotifications();
  if (!Notifications) return;

  try {
    // Request permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      console.warn("[Notifications] Permission not granted");
      return;
    }

    // Set notification handler (show notification even when app is in foreground)
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Android notification channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("pdflab-tasks", {
        name: "Task Notifications",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 100],
        lightColor: "#6366F1",
      });
    }
  } catch (e) {
    console.warn("[Notifications] Init failed:", e);
  }
}

// ─── Send Notification ────────────────────────────────────────────────────────

async function sendLocalNotification(payload: NotificationPayload) {
  const Notifications = await getNotifications();

  if (Notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.body,
          data: { type: payload.type },
          ...(Platform.OS === "android" ? { channelId: "pdflab-tasks" } : {}),
        },
        trigger: null, // immediate
      });
      return;
    } catch {
      // Fall through to Alert
    }
  }

  // Fallback: in-app alert
  Alert.alert(payload.title, payload.body);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Notify user that a file processing task completed.
 * Respects `notifyProcessingComplete` setting.
 */
export async function notifyProcessingComplete(
  fileName: string,
): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notifyProcessingComplete) return;

  await sendLocalNotification({
    title: "Processing Complete",
    body: `"${fileName}" has been processed successfully.`,
    type: "processing_complete",
  });
}

/**
 * Notify user that a download completed.
 * Respects `notifyDownloadsComplete` setting.
 */
export async function notifyDownloadComplete(fileName: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notifyDownloadsComplete) return;

  await sendLocalNotification({
    title: "Download Complete",
    body: `"${fileName}" has been downloaded successfully.`,
    type: "download_complete",
  });
}

/**
 * Notify user that an AI task completed.
 * Respects `notifyAIComplete` setting.
 */
export async function notifyAIComplete(taskName: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notifyAIComplete) return;

  await sendLocalNotification({
    title: "AI Task Complete",
    body: `${taskName} has finished.`,
    type: "ai_complete",
  });
}

/**
 * Notify user that Read Aloud has started playing.
 * Respects `notifyReadAloudPlaying` setting.
 */
export async function notifyReadAloudPlaying(fileName: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notifyReadAloudPlaying) return;

  await sendLocalNotification({
    title: "Read Aloud Playing",
    body: `Now reading: "${fileName}"`,
    type: "read_aloud_playing",
  });
}

/**
 * Notify user that Read Aloud has been stopped.
 * Respects `notifyReadAloudStopped` setting.
 */
export async function notifyReadAloudStopped(fileName: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notifyReadAloudStopped) return;

  await sendLocalNotification({
    title: "Read Aloud Stopped",
    body: `Stopped reading: "${fileName}"`,
    type: "read_aloud_stopped",
  });
}

/**
 * Notify user that Read Aloud has reached the end of the file.
 * Respects `notifyReadAloudEndOfFile` setting.
 */
export async function notifyReadAloudEndOfFile(fileName: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notifyReadAloudEndOfFile) return;

  await sendLocalNotification({
    title: "Read Aloud Finished",
    body: `Finished reading: "${fileName}"`,
    type: "read_aloud_end_of_file",
  });
}
