/**
 * chunkText.ts
 * Splits plain text into TTS-friendly chunks.
 * Handles PDF, DOCX, and EPUB extraction artifacts.
 */

const MAX_CHUNK_CHARS = 300;

// ---------------------------------------------------------------------------
// PDF / DOCX text cleaning
// ---------------------------------------------------------------------------

export function cleanPdfText(raw: string): string {
  return raw
    .replace(/(\w)-\n(\w)/g, "$1$2") // de-hyphenate line breaks
    .replace(/(?<!\n)\n(?!\n)/g, " ") // single newlines → space
    .replace(/[ \t]{2,}/g, " ") // collapse spaces
    .replace(/\n{3,}/g, "\n\n") // max 2 consecutive newlines
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬀ/g, "ff")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

/** @deprecated Use cleanPdfText instead. Kept for backward compatibility. */
export const cleanText = cleanPdfText;

// ---------------------------------------------------------------------------
// EPUB text cleaning  (text has already had HTML stripped by epubExtractor)
// ---------------------------------------------------------------------------

export function cleanEpubText(raw: string): string {
  return (
    raw
      // Remove any residual HTML tags that slipped through
      .replace(/<[^>]+>/g, " ")
      // Normalise whitespace
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      // Remove lines that are only numbers (page markers from some EPUBs)
      .replace(/^\s*\d+\s*$/gm, "")
      // Remove lines shorter than 2 chars (stray punctuation, etc.)
      .replace(/^.{0,1}$/gm, "")
      .trim()
  );
}

// ---------------------------------------------------------------------------
// Sentence splitter  (shared by PDF, DOCX, and EPUB)
// ---------------------------------------------------------------------------

function splitIntoSentences(text: string): string[] {
  const abbreviations =
    /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|Fig|No|Vol|Ch|pp)\.\s/g;
  const placeholder = "___ABBR___";
  const safe = text.replace(abbreviations, (m) => m.replace(". ", placeholder));

  const parts = safe
    .split(/(?<=[.!?])\s+(?=[A-Z"'\u201C])/)
    .map((s) => s.replace(/___ABBR___/g, ". ").trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [text.trim()];
}

// ---------------------------------------------------------------------------
// Enforce MAX_CHUNK_CHARS
// ---------------------------------------------------------------------------

function enforceMaxLength(sentence: string): string[] {
  if (sentence.length <= MAX_CHUNK_CHARS) return [sentence];

  const chunks: string[] = [];
  const commaParts = sentence.split(/,\s+/);
  let current = "";

  for (const part of commaParts) {
    const candidate = current ? `${current}, ${part}` : part;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
    } else {
      if (current) chunks.push(current.trim());
      if (part.length > MAX_CHUNK_CHARS) {
        const words = part.split(" ");
        current = "";
        for (const word of words) {
          const next = current ? `${current} ${word}` : word;
          if (next.length <= MAX_CHUNK_CHARS) {
            current = next;
          } else {
            if (current) chunks.push(current.trim());
            current = word;
          }
        }
      } else {
        current = part;
      }
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

// ---------------------------------------------------------------------------
// Public: chunk a single text block
// ---------------------------------------------------------------------------

/**
 * Returns an array of ready-to-speak text chunks from a raw text string.
 * The optional `source` parameter selects the appropriate cleaning strategy.
 */
export function chunkText(
  raw: string,
  source: "pdf" | "epub" | "docx" = "pdf",
): string[] {
  const cleaned = source === "epub" ? cleanEpubText(raw) : cleanPdfText(raw);
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    for (const sentence of splitIntoSentences(trimmed)) {
      chunks.push(...enforceMaxLength(sentence));
    }
  }

  return chunks.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A text chunk with metadata for tracking page and global position.
 */
export interface TextChunk {
  text: string;
  /** For PDF/DOCX: 0-based page index. For EPUB: 0-based chapter index. */
  pageIndex: number;
  chunkIndex: number; // global index across all pages
}

// ---------------------------------------------------------------------------
// Public: chunk per-page arrays (PDF / DOCX)
// ---------------------------------------------------------------------------

/**
 * Given an array of per-page text strings, returns a flat chunk list
 * with metadata so the player knows which page each chunk belongs to.
 */
export function chunkPages(pages: string[]): TextChunk[] {
  const result: TextChunk[] = [];
  let globalIndex = 0;

  for (let p = 0; p < pages.length; p++) {
    for (const text of chunkText(pages[p], "pdf")) {
      result.push({ text, pageIndex: p, chunkIndex: globalIndex++ });
    }
  }

  return result;
}

/**
 * Given a single body of text (no page separation), returns chunks
 * all assigned to pageIndex 0.
 */
export function chunkSingleDocument(text: string): TextChunk[] {
  const chunks = chunkText(text);
  return chunks.map((text, i) => ({
    text,
    pageIndex: 0,
    chunkIndex: i,
  }));
}

// ---------------------------------------------------------------------------
// Public: chunk EPUB chapters
// ---------------------------------------------------------------------------

/**
 * Given an array of EPUB chapters, returns a flat chunk list where
 * `pageIndex` represents the chapter index for TTS navigation.
 */
export function chunkEpubChapters(
  chapters: Array<{ index: number; text: string }>,
): TextChunk[] {
  if (__DEV__) {
    console.log(`[chunkEpubChapters] chapters received: ${chapters.length}`);
  }

  const result: TextChunk[] = [];
  let globalIndex = 0;
  for (const chapter of chapters) {
    for (const text of chunkText(chapter.text, "epub")) {
      result.push({
        text,
        pageIndex: chapter.index, // re-uses pageIndex field as chapterIndex
        chunkIndex: globalIndex++,
      });
    }
  }

  if (__DEV__) {
    console.log(`[chunkEpubChapters] chunks produced: ${result.length}`);
  }

  return result;
}
