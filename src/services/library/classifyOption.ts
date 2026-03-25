/**
 * Download Option Classification
 * ─────────────────────────────────────────────────────────────────────
 * Classifies each `DownloadOption` URL as one of:
 *
 *   • "pdf"      — URL is a direct-downloadable PDF
 *   • "epub"     — URL is a direct-downloadable EPUB
 *   • "site"     — URL is a web page / landing page / unknown format
 *
 * Classification uses:
 *   1. The `type` field already set by the adapter
 *   2. File extension in the URL path
 *   3. Known source URL patterns (deterministic, no network)
 *   4. Query-string / fragment heuristics
 *
 * This module is synchronous (no HEAD requests) so it can be called
 * inside render without blocking. The download pipeline still does a
 * proper Content-Type check at download time as a second gate.
 * ─────────────────────────────────────────────────────────────────────
 */

import type { DownloadOption, LibrarySource } from "@/src/types/library.types";

// ── Types ────────────────────────────────────────────────────────────

export type OptionKind = "pdf" | "epub" | "site";

export interface ClassifiedOption {
  /** The underlying download option from the adapter. */
  option: DownloadOption;
  /** Original index in `downloadOptions[]`. */
  index: number;
  /** What the UI should display. */
  kind: OptionKind;
}

// ── Known direct-download URL patterns ──────────────────────────────
// These hosts serve the actual binary file at the given URL.

const DIRECT_PDF_PATTERNS: readonly RegExp[] = [
  /arxiv\.org\/pdf\//i,
  /europepmc\.org\/backend\/ptpmcrender\.fcgi/i, // PMC PDF render
  /gutenberg\.org\/.*\.pdf/i,
  /archive\.org\/download\/.*\.pdf/i,
  /zenodo\.org\/api\/files\//i,
  /courtlistener\.com\//i, // court docs are always PDF
];

const DIRECT_EPUB_PATTERNS: readonly RegExp[] = [
  /gutenberg\.org\/.*\.epub/i,
  /archive\.org\/download\/.*\.epub/i,
];

// URLs matching these patterns are NOT direct files — they're web pages
const WEBPAGE_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/doi\.org\//i, // DOI redirects → publisher landing page
  /^https?:\/\/dx\.doi\.org\//i,
  /^https?:\/\/.*\/abstract/i,
  /^https?:\/\/.*\/abs\//i, // arXiv abstract page
  /^https?:\/\/.*\/article\/view\//i,
  /^https?:\/\/.*\/html?\//i,
];

// ── Classification logic ────────────────────────────────────────────

/**
 * Classify a single download option URL.
 */
function classifyUrl(url: string, adapterType: "pdf" | "epub"): OptionKind {
  const lower = url.toLowerCase();

  // ── Step 1: Reject known web pages immediately ─────────────────
  for (const pat of WEBPAGE_PATTERNS) {
    if (pat.test(url)) return "site";
  }

  // ── Step 2: Check known direct-download patterns ───────────────
  for (const pat of DIRECT_PDF_PATTERNS) {
    if (pat.test(url)) return "pdf";
  }
  for (const pat of DIRECT_EPUB_PATTERNS) {
    if (pat.test(url)) return "epub";
  }

  // ── Step 3: File extension heuristic ───────────────────────────
  // Strip query strings / fragments before checking extension
  const pathOnly = lower.split("?")[0].split("#")[0];
  if (pathOnly.endsWith(".pdf")) return "pdf";
  if (pathOnly.endsWith(".epub")) return "epub";

  // ── Step 4: Trust the adapter's `type` for known reliable sources
  // These sources only emit URLs that are real files:
  // Gutenberg, arXiv, Zenodo, PMC, CourtListener
  // (Open Library HEAD-checks during search, CORE is less reliable.)

  // ── Step 5: If the URL still looks plausible (no obvious web
  //            page markers), trust the adapter's declared type
  //            as a best-effort fallback. The download pipeline
  //            will catch bad files at runtime.
  if (
    !lower.includes("/search") &&
    !lower.includes("/browse") &&
    !lower.includes("/article/") &&
    !lower.includes("/record/") &&
    !lower.includes("/full") &&
    !lower.includes("login")
  ) {
    return adapterType;
  }

  // ── Fallback: treat as a website link ──────────────────────────
  return "site";
}

/**
 * Classify all download options for a search result.
 *
 * Returns an array of `ClassifiedOption` — one per `downloadOption` —
 * sorted so real downloadable files appear before "site" links.
 */
export function classifyOptions(
  downloadOptions: DownloadOption[],
  _source: LibrarySource,
): ClassifiedOption[] {
  return downloadOptions
    .map((option, index) => ({
      option,
      index,
      kind: classifyUrl(option.url, option.type),
    }))
    .sort((a, b) => {
      // Downloadable files first, then "site"
      const order: Record<OptionKind, number> = { pdf: 0, epub: 1, site: 2 };
      return order[a.kind] - order[b.kind];
    });
}

/**
 * Quick check: does the result have at least one direct-downloadable file?
 */
export function hasDirectDownload(
  downloadOptions: DownloadOption[],
  source: LibrarySource,
): boolean {
  return classifyOptions(downloadOptions, source).some(
    (co) => co.kind === "pdf" || co.kind === "epub",
  );
}
