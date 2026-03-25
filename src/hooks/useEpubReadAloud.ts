/**
 * useEpubReadAloud.ts
 *
 * Orchestrates the full EPUB → extract → chunk → TTS pipeline.
 * Wraps useReadAloud so the screen only needs to hand it a file path.
 *
 * Usage:
 *   const epub = useEpubReadAloud({ filePath });
 *
 *   // Show loading state
 *   if (epub.status === 'extracting') return <Spinner />;
 *
 *   // Spread controls onto ReadAloudBar exactly like PDF
 *   <ReadAloudBar {...epub.controls} visible={epub.ready} />
 */

import { ReadAloudControls, useReadAloud } from "@/hooks/useReadAloud";
import { chunkEpubChapters, TextChunk } from "@/utils/chunkText";
import { useCallback, useEffect, useRef, useState } from "react";
import { EpubBook, EpubChapter, extractEpub } from "../utils/epubExtractor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EpubLoadStatus = "idle" | "extracting" | "ready" | "error";

export interface UseEpubReadAloudOptions {
  filePath: string | null;
  /** Called when the reader advances to a new chapter. */
  onChapterChange?: (chapterIndex: number, chapter: EpubChapter) => void;
  /** Called on every chunk change with chunk and total count (for auto-scroll). */
  onChunkChange?: (chunk: TextChunk, totalChunks: number) => void;
  initialRate?: number;
}

export interface UseEpubReadAloudReturn {
  /** Overall load + extraction status. */
  loadStatus: EpubLoadStatus;
  errorMessage: string | null;
  book: EpubBook | null;
  chunks: TextChunk[];
  /** True once extraction is done and chunks exist. */
  ready: boolean;
  /** Current chapter index (0-based). */
  currentChapterIndex: number;
  /** Jump to the first chunk of a specific chapter. */
  jumpToChapter: (chapterIndex: number) => void;
  /** All ReadAloud controls — spread onto <ReadAloudBar />. */
  controls: ReadAloudControls;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEpubReadAloud({
  filePath,
  onChapterChange,
  onChunkChange: onChunkChangeProp,
  initialRate = 1.0,
}: UseEpubReadAloudOptions): UseEpubReadAloudReturn {
  const [loadStatus, setLoadStatus] = useState<EpubLoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [book, setBook] = useState<EpubBook | null>(null);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  const bookRef = useRef<EpubBook | null>(null);

  // ── Extraction ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!filePath) return;

    let cancelled = false;
    setLoadStatus("extracting");
    setErrorMessage(null);
    setBook(null);
    setChunks([]);

    if (__DEV__) {
      console.log("[useEpubReadAloud] Starting extraction", { filePath });
    }

    extractEpub(filePath)
      .then((epubBook) => {
        if (cancelled) return;

        if (__DEV__) {
          console.log("[useEpubReadAloud] Extracted book", {
            chapters: epubBook.chapters.length,
            totalChars: epubBook.totalChars,
          });
          epubBook.chapters.forEach((chapter) => {
            console.log(
              `[useEpubReadAloud] Chapter ${chapter.index + 1} chars: ${chapter.text.length}`,
            );
          });
        }

        bookRef.current = epubBook;
        setBook(epubBook);

        const flat = chunkEpubChapters(epubBook.chapters);
        if (__DEV__) {
          console.log("[useEpubReadAloud] Chunking complete", {
            chunks: flat.length,
          });
        }

        if (flat.length === 0) {
          const msg =
            "EPUB extraction succeeded, but no readable chunks were produced.";
          setErrorMessage(msg);
          setLoadStatus("error");
          setChunks([]);
          console.warn("[useEpubReadAloud]", msg);
          return;
        }

        setChunks(flat);
        setLoadStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to extract EPUB.";
        setErrorMessage(msg);
        setLoadStatus("error");
        console.error("[useEpubReadAloud]", err);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // ── Read-Aloud core ───────────────────────────────────────────────────────

  const controls = useReadAloud({
    chunks,
    initialRate,
    documentId: filePath || undefined,
    persistState: true,
    onChunkChange: (chunk) => {
      const newChapter = chunk.pageIndex; // pageIndex == chapterIndex for EPUBs
      if (newChapter !== currentChapterIndex) {
        setCurrentChapterIndex(newChapter);
        const chapter = bookRef.current?.chapters[newChapter];
        if (chapter) onChapterChange?.(newChapter, chapter);
      }
      // Forward chunk change for auto-scroll
      onChunkChangeProp?.(chunk, chunks.length);
    },
  });

  // ── Jump to chapter ───────────────────────────────────────────────────────

  const jumpToChapter = useCallback(
    (chapterIndex: number) => {
      const firstChunk = chunks.find((c) => c.pageIndex === chapterIndex);
      if (firstChunk) controls.jumpToChunk(firstChunk.chunkIndex);
    },
    [chunks, controls],
  );

  return {
    loadStatus,
    errorMessage,
    book,
    chunks,
    ready: loadStatus === "ready" && chunks.length > 0,
    currentChapterIndex,
    jumpToChapter,
    controls,
  };
}
