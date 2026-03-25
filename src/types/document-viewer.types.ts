/**
 * Document Viewer Types
 * Shared type definitions for PDF & DOCX viewer upgrade features:
 * Mobile View, Search, Highlighting, Text Extraction.
 */

// ============================================================================
// VIEW MODE
// ============================================================================
export type ViewMode = "original" | "mobile";

// ============================================================================
// READER SETTINGS
// ============================================================================
export type ReaderTheme = "light" | "sepia" | "dark";

export interface ReaderSettings {
  fontSize: number; // 12–32
  lineHeight: number; // 1.2–2.4
  theme: ReaderTheme;
  fontFamily: string;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.6,
  theme: "light",
  fontFamily: "system-ui",
};

// ============================================================================
// REFLOW API RESPONSE
// ============================================================================
export interface ReflowResponse {
  success: boolean;
  html?: string;
  plainText?: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    hasImages?: boolean;
    extractionQuality?: string;
  };
  // Error fields (422)
  error?: string;
  message?: string;
  isScanned?: boolean;
}

// ============================================================================
// SEARCH
// ============================================================================
export interface SearchState {
  query: string;
  matchCount: number;
  currentIndex: number; // -1 if none
  isSearching: boolean;
}

export const INITIAL_SEARCH_STATE: SearchState = {
  query: "",
  matchCount: 0,
  currentIndex: -1,
  isSearching: false,
};

// ============================================================================
// HIGHLIGHTS
// ============================================================================
export interface Highlight {
  id: string;
  fileUri: string;
  /** Offset-based for Mobile View */
  startOffset?: number;
  endOffset?: number;
  /** Page-based for Original PDF */
  pageNumber?: number;
  /** The selected text snippet */
  text: string;
  color: string;
  createdAt: number;
}

export const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "rgba(255,235,59,0.4)" },
  { label: "Green", value: "rgba(76,175,80,0.4)" },
  { label: "Blue", value: "rgba(33,150,243,0.4)" },
  { label: "Pink", value: "rgba(233,30,99,0.4)" },
  { label: "Orange", value: "rgba(255,152,0,0.4)" },
];

// ============================================================================
// SCROLL POSITION
// ============================================================================
export interface ScrollPosition {
  scrollY: number;
  scrollPercent: number;
  timestamp: number;
}

// ============================================================================
// WEBVIEW MESSAGES (from injected JS)
// ============================================================================
export type WebViewMessage =
  | { type: "ready" }
  | { type: "scroll"; scrollY: number; scrollPercent: number }
  | { type: "search-result"; count: number; current: number }
  | {
      type: "text-selected";
      text: string;
      startOffset: number;
      endOffset: number;
    }
  | {
      type: "selection";
      text: string;
      startOffset: number;
      endOffset: number;
      rect: { x: number; y: number; width: number; height: number };
      scrollX: number;
      scrollY: number;
    }
  | { type: "selection_clear" }
  | {
      type: "annotation_applied";
      success: boolean;
      id?: string;
      kind?: "highlight" | "underline";
    }
  | { type: "read-aloud-text"; text: string };

// ============================================================================
// UNDERLINE ANNOTATIONS
// ============================================================================
export interface Underline {
  id: string;
  fileUri: string;
  startOffset: number;
  endOffset: number;
  text: string;
  createdAt: number;
}

// ============================================================================
// SELECTION MENU
// ============================================================================
export type SelectionAction =
  | "copy"
  | "highlight"
  | "underline"
  | "share"
  | "search"
  | "explain";

export interface SelectionPayload {
  text: string;
  startOffset: number;
  endOffset: number;
  rect: { x: number; y: number; width: number; height: number };
  scrollX: number;
  scrollY: number;
}
