/**
 * Settings Service
 * Centralized settings store using AsyncStorage.
 * Provides typed defaults, persistence, and a React hook.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeMode = "system" | "light" | "dark";
export type StartScreen = "home" | "ai" | "library" | "tools" | "downloads" | "folders";
export type PageRangeFormat = "comma" | "dash";
export type ReadingVoice = "system" | "voice_a" | "voice_b";
export type StorageLocation = "internal" | "external";
export type DeleteBehavior = "app_only" | "device";
export type ImportRetentionDays = 10 | 20 | 30;

export interface ScreenLockSettings {
  recentFiles: boolean;
  library: boolean;
  downloads: boolean;
  createFiles: boolean;
  shareFiles: boolean;
}

export interface AuthState {
  isSignedIn: boolean;
  name: string;
  email: string;
  plan: "free" | "premium";
}

export interface AppSettings {
  // ── Theme ──
  themeMode: ThemeMode;

  // ── General ──
  confirmBeforeClosing: boolean;
  autoSave: boolean;
  defaultStartScreen: StartScreen;

  // ── File & Storage ──
  storageLocation: StorageLocation;
  keepImportedFiles: boolean;
  importRetentionDays: ImportRetentionDays;
  showFileSizeBeforeProcessing: boolean;
  deleteBehavior: DeleteBehavior;

  // ── Document Behavior ──
  defaultPageRangeFormat: PageRangeFormat;
  rememberLastPage: boolean;

  // ── Accessibility & Reading ──
  readAloud: boolean;
  autoDetectLanguage: boolean;
  readingVoice: ReadingVoice;
  readingSpeed: number; // 0.5 – 2.0

  // ── Voice & OCR ──
  enableVoiceDictation: boolean;
  autoCreateDocFromVoice: boolean;
  enableOCR: boolean;

  // ── Notifications ──
  notifyProcessingComplete: boolean;
  notifyDownloadsComplete: boolean;
  notifyAIComplete: boolean;
  notifyReadAloudPlaying: boolean;
  notifyReadAloudStopped: boolean;
  notifyReadAloudEndOfFile: boolean;

  // ── Security & Privacy ──
  appLock: boolean;
  pinHash: string; // SHA-256 hash of PIN
  screenLocks: ScreenLockSettings;
  hideRecentFiles: boolean;

  // ── Auth (mock) ──
  auth: AuthState;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: "system",

  confirmBeforeClosing: true,
  autoSave: true,
  defaultStartScreen: "home",

  storageLocation: "internal",
  keepImportedFiles: true,
  importRetentionDays: 30,
  showFileSizeBeforeProcessing: false,
  deleteBehavior: "app_only",

  defaultPageRangeFormat: "dash",
  rememberLastPage: true,

  readAloud: false,
  autoDetectLanguage: true,
  readingVoice: "system",
  readingSpeed: 1.0,

  enableVoiceDictation: false,
  autoCreateDocFromVoice: false,
  enableOCR: false,

  notifyProcessingComplete: true,
  notifyDownloadsComplete: true,
  notifyAIComplete: true,
  notifyReadAloudPlaying: true,
  notifyReadAloudStopped: true,
  notifyReadAloudEndOfFile: true,

  appLock: false,
  pinHash: "",
  screenLocks: {
    recentFiles: false,
    library: false,
    downloads: false,
    createFiles: false,
    shareFiles: false,
  },
  hideRecentFiles: false,

  auth: {
    isSignedIn: false,
    name: "",
    email: "",
    plan: "free",
  },
};

// ─── Storage key ──────────────────────────────────────────────────────────────

const SETTINGS_KEY = "@pdflab_settings";

// ─── Read / Write ─────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    // Merge with defaults for safe migration when new keys are added
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      auth: { ...DEFAULT_SETTINGS.auth, ...parsed.auth },
      screenLocks: { ...DEFAULT_SETTINGS.screenLocks, ...parsed.screenLocks },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings", e);
  }
}

// ─── React Hook ───────────────────────────────────────────────────────────────

let _listeners: Array<(s: AppSettings) => void> = [];
let _cache: AppSettings | null = null;

function notify(s: AppSettings) {
  _cache = s;
  _listeners.forEach((fn) => fn(s));
}

/**
 * Global settings hook. Settings are loaded once, cached in memory, and shared
 * across all consumers. Calls to `updateSetting` persist immediately and
 * re-render all subscribers.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(
    _cache ?? DEFAULT_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(_cache === null);

  useEffect(() => {
    // Subscribe
    _listeners.push(setSettings);

    // Initial load (only once globally)
    if (_cache === null) {
      loadSettings().then((s) => {
        notify(s);
        setIsLoading(false);
      });
    } else {
      setSettings(_cache);
      setIsLoading(false);
    }

    return () => {
      _listeners = _listeners.filter((fn) => fn !== setSettings);
    };
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      const next = { ...(_cache ?? DEFAULT_SETTINGS), [key]: value };
      notify(next);
      await saveSettings(next);
    },
    [],
  );

  const updateAuth = useCallback(async (auth: Partial<AuthState>) => {
    const current = _cache ?? DEFAULT_SETTINGS;
    const nextAuth = { ...current.auth, ...auth };
    const next = { ...current, auth: nextAuth };
    notify(next);
    await saveSettings(next);
  }, []);

  const resetSettings = useCallback(async () => {
    notify({ ...DEFAULT_SETTINGS });
    await saveSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return { settings, isLoading, updateSetting, updateAuth, resetSettings };
}
