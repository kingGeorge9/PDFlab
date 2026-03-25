/**
 * ttsService.ts
 * A thin wrapper around expo-speech for the Read Aloud feature.
 *
 * Responsibilities:
 *  - Expose speak / stop / setRate / getVoices helpers
 *  - Forward TTS lifecycle events via callbacks
 *  - Shield the rest of the app from platform differences
 *  - Persist selected voice across sessions via AsyncStorage
 *  - Resolve the bundled voice registry against installed system voices
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { Platform } from "react-native";

import {
    BUNDLED_VOICES,
    type BundledVoice,
    type ResolvedVoice,
} from "./voiceRegistry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TTSStatus = "idle" | "speaking" | "paused" | "error";

export interface TTSCallbacks {
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: unknown) => void;
}

/** Raw system voice shape from expo-speech. */
interface SystemVoice {
  identifier: string;
  name: string;
  language: string;
  quality: number;
}

// ---------------------------------------------------------------------------
// Persistence key
// ---------------------------------------------------------------------------

const VOICE_STORAGE_KEY = "@pdfiq_selected_voice";

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let currentRate = 1.0; // 0.75 – 2.0 human-friendly
let currentVoice: string | undefined;
let currentLanguage = "en-US";
let _autoDetectLanguage = false;
let _savedVoiceLoaded = false;

/**
 * Monotonically increasing counter used to detect stale TTS callbacks.
 *
 * Each call to speakChunk() captures the current value. stopSpeaking()
 * increments it so that any onDone/onStopped/onError from a previous
 * utterance is silently discarded — regardless of platform quirks where
 * Speech.stop() may fire onDone instead of onStopped.
 */
let _currentSpeakId = 0;

// ---------------------------------------------------------------------------
// Core speak / stop
// ---------------------------------------------------------------------------

/**
 * Speak a chunk of text with lifecycle callbacks.
 *
 * expo-speech handles one utterance at a time. Calling speak() while
 * already speaking queues the utterance, but we always stop first
 * to avoid stacking.
 */
export function speakChunk(text: string, callbacks?: TTSCallbacks): void {
  if (!text?.trim()) {
    callbacks?.onDone?.();
    return;
  }

  // Capture the speak ID for this utterance so callbacks can self-validate.
  // stopSpeaking() increments _currentSpeakId, which makes any in-flight
  // callbacks from this utterance become no-ops — fixing the race where
  // Android fires onDone instead of onStopped after Speech.stop().
  const speakId = ++_currentSpeakId;

  // Stop any current utterance to avoid stacking
  Speech.stop();

  Speech.speak(text, {
    // When autoDetectLanguage is ON, omit language so the OS engine handles it
    language: _autoDetectLanguage ? undefined : currentLanguage,
    rate: currentRate,
    voice: currentVoice,
    onStart: () => {
      if (_currentSpeakId === speakId) callbacks?.onStart?.();
    },
    onDone: () => {
      if (_currentSpeakId === speakId) callbacks?.onDone?.();
    },
    onStopped: () => {
      if (_currentSpeakId === speakId) callbacks?.onStopped?.();
    },
    onError: (err) => {
      if (_currentSpeakId === speakId) callbacks?.onError?.(err);
    },
  });
}

export function stopSpeaking(): void {
  // Invalidate any pending callbacks from the current utterance before stopping.
  _currentSpeakId++;
  Speech.stop();
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

// ---------------------------------------------------------------------------
// Rate & voice controls
// ---------------------------------------------------------------------------

/**
 * @param rate  Human-friendly scale: 0.75 – 2.0
 */
export function setRate(rate: number): void {
  currentRate = Math.min(2.0, Math.max(0.5, rate));
}

export function getRate(): number {
  return currentRate;
}

export function setLanguage(lang: string): void {
  currentLanguage = lang;
}

export function setAutoDetectLanguage(enabled: boolean): void {
  _autoDetectLanguage = enabled;
}

// ---------------------------------------------------------------------------
// Voice resolution — bundled registry → installed system voices
// ---------------------------------------------------------------------------

/**
 * Returns every voice in the bundled registry, each tagged available/unavailable
 * based on what is actually installed on the current device.
 *
 * Resolution order per voice:
 *  1. Exact platform ID match   (iosIds / androidIds)
 *  2. Name-hint + language match
 *  3. Language-prefix-only match (last resort)
 */
export async function getResolvedVoices(): Promise<ResolvedVoice[]> {
  if (!_savedVoiceLoaded) {
    await loadSavedVoice();
  }

  let systemVoices: SystemVoice[] = [];
  try {
    const raw = await Speech.getAvailableVoicesAsync();
    // On Android, voices can be slow to load — retry once after a short delay
    if (raw.length === 0 && Platform.OS === "android") {
      await new Promise((r) => setTimeout(r, 500));
      const retry = await Speech.getAvailableVoicesAsync();
      systemVoices = retry.map(normaliseVoice);
    } else {
      systemVoices = raw.map(normaliseVoice);
    }
  } catch {
    // No TTS engine — all voices will be unavailable
  }

  return BUNDLED_VOICES.map((b) => resolveVoice(b, systemVoices));
}

function normaliseVoice(v: Speech.Voice): SystemVoice {
  return {
    identifier: v.identifier,
    name: v.name,
    language: v.language,
    quality: typeof v.quality === "number" ? v.quality : Number(v.quality) || 0,
  };
}

function resolveVoice(
  bundled: BundledVoice,
  system: SystemVoice[],
): ResolvedVoice {
  const ids = Platform.OS === "ios" ? bundled.iosIds : bundled.androidIds;

  // 1 — exact ID match
  for (const id of ids) {
    const hit = system.find((v) => v.identifier === id);
    if (hit) return { ...bundled, available: true, systemId: hit.identifier };
  }

  // 2 — name hint + language prefix
  const lang5 = bundled.language.substring(0, 5); // "en-US"
  const byName = system.find(
    (v) =>
      v.name?.toLowerCase().includes(bundled.nameHint) &&
      v.language?.replace("_", "-").startsWith(lang5),
  );
  if (byName)
    return { ...bundled, available: true, systemId: byName.identifier };

  // 3 — language prefix only
  const byLang = system.find((v) =>
    v.language?.replace("_", "-").startsWith(lang5),
  );
  if (byLang)
    return { ...bundled, available: true, systemId: byLang.identifier };

  return { ...bundled, available: false, systemId: null };
}

// ---------------------------------------------------------------------------
// Voice selection & persistence
// ---------------------------------------------------------------------------

/**
 * Set and persist the selected voice.
 */
export async function setVoice(voiceId: string): Promise<void> {
  currentVoice = voiceId;
  try {
    await AsyncStorage.setItem(VOICE_STORAGE_KEY, voiceId);
  } catch (e) {
    console.error("[ttsService] Failed to persist voice selection", e);
  }
}

/**
 * Load the saved voice from AsyncStorage into the singleton.
 */
export async function loadSavedVoice(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(VOICE_STORAGE_KEY);
    if (stored) currentVoice = stored;
  } catch {}
  _savedVoiceLoaded = true;
}

/**
 * Get the currently saved voice identifier (synchronous — reads from cache).
 * Returns undefined if no voice has been explicitly selected.
 */
export function getSavedVoiceId(): string | undefined {
  return currentVoice;
}

export function clearVoice(): void {
  currentVoice = undefined;
  AsyncStorage.removeItem(VOICE_STORAGE_KEY).catch(() => {});
}
