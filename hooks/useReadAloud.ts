/**
 * useReadAloud.ts
 * The single source of truth for Read-Aloud playback state.
 *
 * Responsibilities:
 *  - Owns playback state (status, currentChunkIndex, currentPageIndex)
 *  - Drives the TTS service (expo-speech)
 *  - Provides play / pause / stop / skip / setRate / jumpToChunk actions
 *  - Page-based skipping (next/prev page)
 *  - Time-based skipping (~10 s forward/backward via chunk estimation)
 *  - Cleans up on unmount
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  notifyReadAloudEndOfFile,
  notifyReadAloudPlaying,
  notifyReadAloudStopped,
} from "@/services/notificationService";
import { readAloudPersistence } from "@/services/readAloudPersistence";
import {
    speakChunk,
    stopSpeaking,
    setRate as ttsSetRate,
} from "@/services/ttsService";
import type { TextChunk } from "@/utils/chunkText";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReadAloudStatus =
  | "idle"
  | "speaking"
  | "paused"
  | "finished"
  | "error";

/** Result from page-skip helpers so the UI can show a toast. */
export type SkipResult =
  | { kind: "jumped"; message: string }
  | { kind: "boundary"; message: string };

export interface UseReadAloudOptions {
  /** Full flat chunk list (across all pages). */
  chunks: TextChunk[];
  /** Called whenever playback advances to a new chunk. */
  onChunkChange?: (chunk: TextChunk) => void;
  /** Initial playback rate (0.75 – 2.0). Defaults to 1.0. */
  initialRate?: number;
  /** Document ID for persistence. If provided, state will be saved/restored. */
  documentId?: string;
  /** Whether to persist Read Aloud state. Defaults to true if documentId is provided. */
  persistState?: boolean;
  /** Display name of the document — used in Read Aloud notifications. */
  documentName?: string;
}

export interface ReadAloudControls {
  status: ReadAloudStatus;
  currentChunkIndex: number;
  currentPageIndex: number;
  rate: number;
  totalChunks: number;
  totalPages: number;
  play: (fromIndex?: number) => void;
  pause: () => void;
  stop: () => void;
  /** Jump to next page. Returns a message for toast display. */
  skipPageForward: () => SkipResult;
  /** Jump to previous page. Returns a message for toast display. */
  skipPageBack: () => SkipResult;
  /** Skip forward ~10 s of speech (chunk-based approximation). */
  skipForward10s: () => void;
  /** Skip backward ~10 s of speech (chunk-based approximation). */
  skipBack10s: () => void;
  jumpToChunk: (index: number) => void;
  setRate: (rate: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Average words-per-minute at 1× speed (conservative estimate). */
const BASE_WPM = 155;

/** Count words in a string. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Estimate duration (seconds) of a chunk given the current playback rate.
 */
function estimateChunkDuration(chunk: TextChunk, rate: number): number {
  const wpm = BASE_WPM * rate;
  return (wordCount(chunk.text) / wpm) * 60;
}

// ---------------------------------------------------------------------------
// Persistence helper
// ---------------------------------------------------------------------------

function saveReadAloudState(
  documentId: string | undefined,
  persistState: boolean,
  status: ReadAloudStatus,
  chunkIndex: number,
  rate: number,
): void {
  if (persistState && documentId) {
    readAloudPersistence
      .saveState({
        documentId,
        chunkIndex,
        status,
        rate,
        timestamp: Date.now(),
      })
      .catch((error) => {
        console.warn("[useReadAloud] Failed to save state:", error);
      });
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReadAloud({
  chunks,
  onChunkChange,
  initialRate = 1.0,
  documentId,
  persistState = !!documentId,
  documentName,
}: UseReadAloudOptions): ReadAloudControls {
  const [status, setStatus] = useState<ReadAloudStatus>("idle");
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [rate, setRateState] = useState(initialRate);

  // Keep refs so TTS callbacks always read the latest values
  const indexRef = useRef(0);
  const statusRef = useRef<ReadAloudStatus>("idle");
  const chunksRef = useRef<TextChunk[]>(chunks);
  const rateRef = useRef(initialRate);
  const mountedRef = useRef(true);
  const documentIdRef = useRef(documentId);
  const persistStateRef = useRef(persistState);
  const documentNameRef = useRef(documentName ?? "document");
  // Tracks whether we've fired the "playing" notification for the current session
  const hasNotifiedPlayingRef = useRef(false);

  // Sync refs when props change
  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  useEffect(() => {
    documentIdRef.current = documentId;
    persistStateRef.current = persistState;
  }, [documentId, persistState]);

  useEffect(() => {
    documentNameRef.current = documentName ?? "document";
  }, [documentName]);

  // Load persisted state on mount
  useEffect(() => {
    if (persistState && documentId) {
      readAloudPersistence.getState(documentId).then((savedState) => {
        if (savedState && mountedRef.current) {
          // Only restore if we have the same document and chunks are loaded
          if (chunks.length > 0 && savedState.chunkIndex < chunks.length) {
            indexRef.current = savedState.chunkIndex;
            setCurrentChunkIndex(savedState.chunkIndex);
            statusRef.current = savedState.status;
            setStatus(savedState.status);
            if (savedState.rate !== rate) {
              setRateState(savedState.rate);
              rateRef.current = savedState.rate;
              ttsSetRate(savedState.rate);
            }
          }
        }
      });
    }
  }, [persistState, documentId, chunks.length, rate]);

  // Bootstrap rate
  useEffect(() => {
    ttsSetRate(initialRate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track mount status
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Page index helpers ─────────────────────────────────────────
  /** Build a map from pageIndex → first chunk index on that page. */
  const pageStartMap = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < chunks.length; i++) {
      const p = chunks[i].pageIndex;
      if (!map.has(p)) map.set(p, i);
    }
    return map;
  }, [chunks]);

  /** Sorted unique page indices. */
  const sortedPages = useMemo(
    () => Array.from(pageStartMap.keys()).sort((a, b) => a - b),
    [pageStartMap],
  );

  const totalPages = sortedPages.length;

  // ---------------------------------------------------------------------------
  // Core: speak a specific chunk by index
  // ---------------------------------------------------------------------------
  const speakAt = useCallback(
    (index: number) => {
      const list = chunksRef.current;
      if (index >= list.length) {
        // Finished reading the whole document
        if (mountedRef.current) {
          setStatus("finished");
          statusRef.current = "finished";
          setCurrentChunkIndex(Math.max(0, list.length - 1));
          hasNotifiedPlayingRef.current = false;
          // Save finished state
          saveReadAloudState(
            documentIdRef.current,
            persistStateRef.current,
            "finished",
            Math.max(0, list.length - 1),
            rateRef.current,
          );
          // Notify end of file
          notifyReadAloudEndOfFile(documentNameRef.current).catch(() => {});
        }
        return;
      }

      const chunk = list[index];
      indexRef.current = index;
      if (mountedRef.current) {
        setCurrentChunkIndex(index);
        setStatus("speaking");
      }
      statusRef.current = "speaking";
      onChunkChange?.(chunk);

      // Fire "playing" notification once per play session
      if (!hasNotifiedPlayingRef.current) {
        hasNotifiedPlayingRef.current = true;
        notifyReadAloudPlaying(documentNameRef.current).catch(() => {});
      }

      // Save state when starting playback
      saveReadAloudState(
        documentIdRef.current,
        persistStateRef.current,
        "speaking",
        index,
        rateRef.current,
      );

      // Stop any current speech before starting a new one
      stopSpeaking();

      // Small delay to ensure previous stop completes
      setTimeout(() => {
        if (!mountedRef.current) return;
        // Guard: if status changed while waiting (e.g. user paused/stopped)
        if (statusRef.current !== "speaking") return;
        speakChunk(chunk.text, {
          onDone: () => {
            // Auto-advance when we're still speaking (not manually stopped)
            if (statusRef.current === "speaking" && mountedRef.current) {
              speakAt(indexRef.current + 1);
            }
          },
          onStopped: () => {
            // Stopped manually — don't auto-advance
          },
          onError: () => {
            if (mountedRef.current) {
              setStatus("error");
              statusRef.current = "error";
            }
          },
        });
      }, 50);
    },
    [onChunkChange],
  );

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  const play = useCallback(
    (fromIndex?: number) => {
      const idx = fromIndex !== undefined ? fromIndex : indexRef.current;
      speakAt(idx);
    },
    [speakAt],
  );

  /**
   * Pause: freeze at the current chunk. On resume, playback restarts from
   * this chunk (the best granularity expo-speech supports).
   *
   * CRITICAL: set statusRef BEFORE calling stopSpeaking() so that any
   * synchronous onDone/onStopped callback from Speech.stop() sees "paused"
   * and does NOT auto-advance.
   */
  const pause = useCallback(() => {
    statusRef.current = "paused";
    setStatus("paused");
    hasNotifiedPlayingRef.current = false;
    stopSpeaking();
    // Add a small delay to ensure stop completes and prevent race conditions
    setTimeout(() => {
      if (mountedRef.current && statusRef.current === "paused") {
        // Double-check we're still paused and stop again if needed
        stopSpeaking();
      }
    }, 100);
    saveReadAloudState(
      documentIdRef.current,
      persistStateRef.current,
      "paused",
      indexRef.current,
      rateRef.current,
    );
  }, []);

  const stop = useCallback(() => {
    const wasPlaying = statusRef.current === "speaking";
    statusRef.current = "idle";
    setStatus("idle");
    stopSpeaking();
    indexRef.current = 0;
    setCurrentChunkIndex(0);
    hasNotifiedPlayingRef.current = false;
    // Clear persisted state when stopped
    if (persistStateRef.current && documentIdRef.current) {
      readAloudPersistence.clearState(documentIdRef.current);
    }
    // Notify stopped only if playback was active
    if (wasPlaying) {
      notifyReadAloudStopped(documentNameRef.current).catch(() => {});
    }
  }, []);

  // ── Page-based skipping ────────────────────────────────────────

  const skipPageForward = useCallback((): SkipResult => {
    const currentPage = chunksRef.current[indexRef.current]?.pageIndex ?? 0;
    const pagePos = sortedPages.indexOf(currentPage);

    if (pagePos === -1 || pagePos >= sortedPages.length - 1) {
      return { kind: "boundary", message: "Already on last page" };
    }

    const nextPage = sortedPages[pagePos + 1];
    const nextChunkIdx = pageStartMap.get(nextPage) ?? 0;

    // Set status before stopping to prevent auto-advance
    const wasSpeaking = statusRef.current === "speaking";
    statusRef.current = "paused";
    stopSpeaking();

    if (wasSpeaking) {
      speakAt(nextChunkIdx);
    } else {
      // If paused/idle, just move position (don't auto-play)
      indexRef.current = nextChunkIdx;
      setCurrentChunkIndex(nextChunkIdx);
      onChunkChange?.(chunksRef.current[nextChunkIdx]);
    }
    return { kind: "jumped", message: "Skipped forward to next page" };
  }, [sortedPages, pageStartMap, speakAt, onChunkChange]);

  const skipPageBack = useCallback((): SkipResult => {
    const currentPage = chunksRef.current[indexRef.current]?.pageIndex ?? 0;
    const pagePos = sortedPages.indexOf(currentPage);

    if (pagePos <= 0) {
      return { kind: "boundary", message: "Already on first page" };
    }

    const prevPage = sortedPages[pagePos - 1];
    const prevChunkIdx = pageStartMap.get(prevPage) ?? 0;

    const wasSpeaking = statusRef.current === "speaking";
    statusRef.current = "paused";
    stopSpeaking();

    if (wasSpeaking) {
      speakAt(prevChunkIdx);
    } else {
      indexRef.current = prevChunkIdx;
      setCurrentChunkIndex(prevChunkIdx);
      onChunkChange?.(chunksRef.current[prevChunkIdx]);
    }
    return { kind: "jumped", message: "Skipped backward to previous page" };
  }, [sortedPages, pageStartMap, speakAt, onChunkChange]);

  // ── 10-second time-based skipping ───────────────────────────────

  const skipForward10s = useCallback(() => {
    const list = chunksRef.current;
    const curRate = rateRef.current;
    let accumulated = 0;
    let target = indexRef.current;

    // Walk forward through chunks until ~10 s accumulated
    for (let i = indexRef.current; i < list.length; i++) {
      accumulated += estimateChunkDuration(list[i], curRate);
      target = i;
      if (accumulated >= 10) break;
    }

    // Advance at least 1 chunk
    target = Math.min(Math.max(target, indexRef.current + 1), list.length - 1);

    const wasSpeaking = statusRef.current === "speaking";
    statusRef.current = "paused";
    stopSpeaking();

    if (wasSpeaking) {
      speakAt(target);
    } else {
      indexRef.current = target;
      setCurrentChunkIndex(target);
      onChunkChange?.(list[target]);
    }
  }, [speakAt, onChunkChange]);

  const skipBack10s = useCallback(() => {
    const list = chunksRef.current;
    const curRate = rateRef.current;
    let accumulated = 0;
    let target = indexRef.current;

    // Walk backward through chunks until ~10 s accumulated
    for (let i = indexRef.current; i >= 0; i--) {
      accumulated += estimateChunkDuration(list[i], curRate);
      target = i;
      if (accumulated >= 10) break;
    }

    // Go back at least 1 chunk
    target = Math.max(Math.min(target, indexRef.current - 1), 0);

    const wasSpeaking = statusRef.current === "speaking";
    statusRef.current = "paused";
    stopSpeaking();

    if (wasSpeaking) {
      speakAt(target);
    } else {
      indexRef.current = target;
      setCurrentChunkIndex(target);
      onChunkChange?.(list[target]);
    }
  }, [speakAt, onChunkChange]);

  // ── Legacy chunk-level skip (kept for jumpToChunk) ────────────

  const jumpToChunk = useCallback(
    (index: number) => {
      const wasSpeaking = statusRef.current === "speaking";
      statusRef.current = "paused";
      stopSpeaking();

      const clamped = Math.max(
        0,
        Math.min(index, chunksRef.current.length - 1),
      );
      if (wasSpeaking) {
        speakAt(clamped);
      } else {
        indexRef.current = clamped;
        setCurrentChunkIndex(clamped);
      }
    },
    [speakAt],
  );

  const setRate = useCallback((newRate: number) => {
    ttsSetRate(newRate);
    setRateState(newRate);
    rateRef.current = newRate;
    saveReadAloudState(
      documentIdRef.current,
      persistStateRef.current,
      statusRef.current,
      indexRef.current,
      newRate,
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  // Reset when chunks change (new document loaded)
  // But don't reset if we have persistence enabled and will load state
  useEffect(() => {
    if (!persistStateRef.current || !documentIdRef.current) {
      statusRef.current = "idle";
      stopSpeaking();
      setStatus("idle");
      indexRef.current = 0;
      setCurrentChunkIndex(0);
    }
  }, [chunks]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const currentPageIndex = chunks[currentChunkIndex]?.pageIndex ?? 0;

  return {
    status,
    currentChunkIndex,
    currentPageIndex,
    rate,
    totalChunks: chunks.length,
    totalPages,
    play,
    pause,
    stop,
    skipPageForward,
    skipPageBack,
    skipForward10s,
    skipBack10s,
    jumpToChunk,
    setRate,
  };
}
