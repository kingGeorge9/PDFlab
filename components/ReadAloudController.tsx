/**
 * ReadAloudController.tsx
 * Self-contained Read Aloud integration component for viewer screens.
 *
 * Drop this into any viewer screen that can provide text content.
 * It handles:
 *  - ReadAloudBar (slides up when active)
 *  - VoicePicker modal
 *  - Chunking, playback state, cleanup
 *  - "Preparing text…" loading state while extraction runs
 *  - "No text" alert only after extraction timeout
 *
 * The parent opens/closes via the `active` prop (e.g. from a 3-dots menu).
 *
 * Usage:
 *   <ReadAloudController
 *     text="Full document text here..."
 *     colorScheme="dark"
 *     active={showReadAloud}
 *     onRequestClose={() => setShowReadAloud(false)}
 *   />
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { colors as brandColors } from "@/constants/theme";
import { useReadAloud } from "@/hooks/useReadAloud";
import type { TextChunk } from "@/utils/chunkText";
import { chunkPages, chunkSingleDocument } from "@/utils/chunkText";

import { ReadAloudBar } from "./ReadAloudBar";
import { VoicePicker } from "./VoicePicker";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max time (ms) to wait for text extraction before declaring "no text". */
const EXTRACTION_TIMEOUT_MS = 8_000;

/** Minimum character count to consider text "extractable". */
const MIN_TEXT_LENGTH = 10;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReadAloudControllerProps {
  /** Full document text (single body). Use this OR pageTexts, not both. */
  text?: string;
  /** Per-page text array. Preferred for PDFs with page structure. */
  pageTexts?: string[];
  /** "dark" or "light" to match the viewer's appearance */
  colorScheme?: "dark" | "light";
  /** Called when the Read Aloud chunk changes page (for PDF page sync) */
  onPageChange?: (pageIndex: number) => void;
  /** Called on every chunk change with the chunk and total chunk count (for proportional auto-scroll) */
  onChunkChange?: (chunk: TextChunk, totalChunks: number) => void;
  /** Whether the Read Aloud bar is open (controlled by parent via 3-dots menu). */
  active: boolean;
  /** Request the parent to close the Read Aloud UI. */
  onRequestClose: () => void;
  /** Document ID for persistence. If provided, Read Aloud state will be saved/restored. */
  documentId?: string;
  /** Whether to persist Read Aloud state. Defaults to true if documentId is provided. */
  persistState?: boolean;
  /** Display name of the document — used in Read Aloud notifications. */
  documentName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ReadAloudController: React.FC<ReadAloudControllerProps> = ({
  text,
  pageTexts,
  colorScheme = "dark",
  onPageChange,
  onChunkChange,
  active,
  onRequestClose,
  documentId,
  persistState = !!documentId,
  documentName,
}) => {
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const hasAutoStarted = useRef(false);
  const extractionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Theme accent — always use the Home header gradient color ─
  const accentColor = brandColors.gradientStart; // "#4F46E5" — same as Home header

  // ── Helpers ──────────────────────────────────────────────────
  const clearExtractionTimer = useCallback(() => {
    if (extractionTimerRef.current) {
      clearTimeout(extractionTimerRef.current);
      extractionTimerRef.current = null;
    }
  }, []);

  // ── Chunk the text ───────────────────────────────────────────
  const chunks: TextChunk[] = useMemo(() => {
    if (pageTexts && pageTexts.length > 0) {
      return chunkPages(pageTexts);
    }
    if (text && text.trim().length >= MIN_TEXT_LENGTH) {
      return chunkSingleDocument(text);
    }
    return [];
  }, [text, pageTexts]);

  const hasContent = chunks.length > 0;

  // ── Hook ─────────────────────────────────────────────────────
  const readAloud = useReadAloud({
    chunks,
    initialRate: 1.0,
    documentId,
    persistState,
    documentName,
    onChunkChange: useCallback(
      (chunk: TextChunk) => {
        onPageChange?.(chunk.pageIndex);
        onChunkChange?.(chunk, chunks.length);
      },
      [onPageChange, onChunkChange, chunks.length],
    ),
  });

  // ── Activation logic ─────────────────────────────────────────
  // When parent activates Read Aloud:
  //   - If text is already available → start playback immediately
  //   - If text is not yet available → show "Preparing…" and wait
  //     up to EXTRACTION_TIMEOUT_MS for extraction to finish
  //   - On timeout with still no text → show "unavailable" alert
  useEffect(() => {
    if (active && !hasAutoStarted.current) {
      if (hasContent) {
        // Text is ready — start immediately
        clearExtractionTimer();
        setExtracting(false);
        hasAutoStarted.current = true;

        if (__DEV__) {
          const src = text ? text : (pageTexts?.join(" ") ?? "");
          console.log(
            `[ReadAloud] Starting playback — ${chunks.length} chunks, ${src.length} chars`,
          );
        }

        if (readAloud.status === "idle" || readAloud.status === "finished") {
          readAloud.play(0);
        }
        // If status is "paused" (restored from persistence), show the bar
        // but do NOT auto-play — the user will explicitly press Play to resume.
      } else if (!extracting) {
        // No text yet — start the extraction wait
        setExtracting(true);

        if (__DEV__) {
          console.log("[ReadAloud] Waiting for text extraction…");
        }

        clearExtractionTimer();
        extractionTimerRef.current = setTimeout(() => {
          if (__DEV__) {
            console.warn(
              "[ReadAloud] Extraction timed out. text length:",
              text?.length ?? 0,
              "pageTexts count:",
              pageTexts?.length ?? 0,
            );
          }
          setExtracting(false);
          Alert.alert(
            "Read Aloud Unavailable",
            "This document doesn't have extractable text. Read Aloud can't be used with image-only or scanned documents.",
            [{ text: "OK", onPress: onRequestClose }],
          );
        }, EXTRACTION_TIMEOUT_MS);
      }
    }

    // Reset when deactivated
    if (!active) {
      hasAutoStarted.current = false;
      setExtracting(false);
      clearExtractionTimer();
    }
  }, [active, hasContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pause playback when parent deactivates ───────────────────
  // Use pause (not stop) so persisted state is preserved when the user
  // navigates away or closes the Read Aloud bar. The Stop button calls
  // stop() explicitly via handleStop, which clears persistence.
  useEffect(() => {
    if (!active && readAloud.status === "speaking") {
      readAloud.pause();
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => clearExtractionTimer();
  }, [clearExtractionTimer]);

  // ── Handle stop — tell parent to close ───────────────────────
  const handleStop = useCallback(() => {
    readAloud.stop();
    onRequestClose();
  }, [readAloud, onRequestClose]);

  // ── Render ───────────────────────────────────────────────────
  if (!active) return null;

  // Show "Preparing text…" while waiting for extraction
  if (extracting && !hasContent) {
    return (
      <View style={raStyles.extractingContainer} pointerEvents="box-none">
        <View style={raStyles.extractingPill}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={raStyles.extractingText}>Preparing text…</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      {/* ReadAloudBar */}
      <ReadAloudBar
        {...readAloud}
        stop={handleStop}
        visible={active && hasContent}
        colorScheme={colorScheme}
        accentColor={accentColor}
        onVoicePress={() => setShowVoicePicker(true)}
      />

      {/* VoicePicker */}
      <VoicePicker
        visible={showVoicePicker}
        onClose={() => setShowVoicePicker(false)}
        colorScheme={colorScheme}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Styles for the extraction loading indicator
// ---------------------------------------------------------------------------
const raStyles = StyleSheet.create({
  extractingContainer: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
  },
  extractingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 10,
  },
  extractingText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
});
