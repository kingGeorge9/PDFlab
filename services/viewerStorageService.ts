/**
 * Viewer Storage Service
 * Persists per-file view mode, reader settings, scroll positions, and highlights.
 */
import type {
    Highlight,
    ReaderSettings,
    Underline,
    ViewMode
} from "@/src/types/document-viewer.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSettings } from "@/services/settingsService";

const KEYS = {
  VIEW_MODE: "@viewer_mode_",
  SCROLL: "@viewer_scroll_",
  PAGE: "@viewer_page_",
  HIGHLIGHTS: "@viewer_highlights_",
  UNDERLINES: "@viewer_underlines_",
  READER_SETTINGS: "@viewer_reader_settings",
  SEARCH_HISTORY: "@viewer_search_history",
};

// ============================================================================
// VIEW MODE
// ============================================================================
export async function getViewMode(fileUri: string): Promise<ViewMode> {
  try {
    const val = await AsyncStorage.getItem(KEYS.VIEW_MODE + fileUri);
    return (val as ViewMode) || "original";
  } catch {
    return "original";
  }
}

export async function setViewMode(
  fileUri: string,
  mode: ViewMode,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.VIEW_MODE + fileUri, mode);
  } catch (e) {
    console.warn("[ViewerStorage] setViewMode error:", e);
  }
}

// ============================================================================
// READER SETTINGS (global, not per-file)
// ============================================================================
export async function getReaderSettings(): Promise<ReaderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.READER_SETTINGS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    fontSize: 16,
    lineHeight: 1.6,
    theme: "light",
    fontFamily: "system-ui",
  };
}

export async function setReaderSettings(
  settings: ReaderSettings,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.READER_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.warn("[ViewerStorage] setReaderSettings error:", e);
  }
}

// ============================================================================
// PAGE POSITION (per-file, for PDF original mode)
// Respects the "Remember last page" setting: when OFF, always opens from page 1.
// ============================================================================
export async function getPagePosition(fileUri: string): Promise<number | null> {
  try {
    // If "remember last page" is disabled, always open from the beginning
    const settings = await loadSettings();
    if (!settings.rememberLastPage) return null;

    const val = await AsyncStorage.getItem(KEYS.PAGE + fileUri);
    return val ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

export async function setPagePosition(
  fileUri: string,
  page: number,
): Promise<void> {
  try {
    // Only persist page position when the setting is enabled
    const settings = await loadSettings();
    if (!settings.rememberLastPage) return;

    await AsyncStorage.setItem(KEYS.PAGE + fileUri, page.toString());
  } catch (e) {
    console.warn("[ViewerStorage] setPagePosition error:", e);
  }
}

// ============================================================================
// SCROLL POSITION (per-file, for PDF mobile mode and DOCX)
// ============================================================================

export interface ScrollPosition {
  scrollY: number;
  scrollPercent: number;
  timestamp: number;
}

export async function getScrollPosition(
  fileUri: string,
): Promise<ScrollPosition | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SCROLL + fileUri);
    return raw ? (JSON.parse(raw) as ScrollPosition) : null;
  } catch {
    return null;
  }
}

export async function setScrollPosition(
  fileUri: string,
  position: ScrollPosition,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEYS.SCROLL + fileUri,
      JSON.stringify(position),
    );
  } catch (e) {
    console.warn("[ViewerStorage] setScrollPosition error:", e);
  }
}

// ============================================================================
// HIGHLIGHTS (per-file)
// ============================================================================
export async function getHighlights(fileUri: string): Promise<Highlight[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HIGHLIGHTS + fileUri);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveHighlight(highlight: Highlight): Promise<void> {
  try {
    const existing = await getHighlights(highlight.fileUri);
    existing.push(highlight);
    await AsyncStorage.setItem(
      KEYS.HIGHLIGHTS + highlight.fileUri,
      JSON.stringify(existing),
    );
  } catch (e) {
    console.warn("[ViewerStorage] saveHighlight error:", e);
  }
}

export async function removeHighlight(
  fileUri: string,
  highlightId: string,
): Promise<void> {
  try {
    const existing = await getHighlights(fileUri);
    const filtered = existing.filter((h) => h.id !== highlightId);
    await AsyncStorage.setItem(
      KEYS.HIGHLIGHTS + fileUri,
      JSON.stringify(filtered),
    );
  } catch (e) {
    console.warn("[ViewerStorage] removeHighlight error:", e);
  }
}

export async function clearHighlights(fileUri: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.HIGHLIGHTS + fileUri);
  } catch (e) {
    console.warn("[ViewerStorage] clearHighlights error:", e);
  }
}

// ============================================================================
// SEARCH HISTORY (global)
// ============================================================================
export async function getSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SEARCH_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addToSearchHistory(query: string): Promise<void> {
  try {
    const history = await getSearchHistory();
    // Add to front, remove duplicates, cap at 20
    const updated = [query, ...history.filter((q) => q !== query)].slice(0, 20);
    await AsyncStorage.setItem(KEYS.SEARCH_HISTORY, JSON.stringify(updated));
  } catch (e) {
    console.warn("[ViewerStorage] addToSearchHistory error:", e);
  }
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.SEARCH_HISTORY);
  } catch (e) {
    console.warn("[ViewerStorage] clearSearchHistory error:", e);
  }
}

// ============================================================================
// UNDERLINES (per-file)
// ============================================================================
export async function getUnderlines(fileUri: string): Promise<Underline[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.UNDERLINES + fileUri);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveUnderline(underline: Underline): Promise<void> {
  try {
    const existing = await getUnderlines(underline.fileUri);
    existing.push(underline);
    await AsyncStorage.setItem(
      KEYS.UNDERLINES + underline.fileUri,
      JSON.stringify(existing),
    );
  } catch (e) {
    console.warn("[ViewerStorage] saveUnderline error:", e);
  }
}

export async function removeUnderline(
  fileUri: string,
  underlineId: string,
): Promise<void> {
  try {
    const existing = await getUnderlines(fileUri);
    const filtered = existing.filter((u) => u.id !== underlineId);
    await AsyncStorage.setItem(
      KEYS.UNDERLINES + fileUri,
      JSON.stringify(filtered),
    );
  } catch (e) {
    console.warn("[ViewerStorage] removeUnderline error:", e);
  }
}

export async function clearUnderlines(fileUri: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.UNDERLINES + fileUri);
  } catch (e) {
    console.warn("[ViewerStorage] clearUnderlines error:", e);
  }
}
