/**
 * PDF Viewer Screen
 * In-app PDF viewer with zoom, scroll, loading, and error states.
 * Includes pre-render validation and recovery flow for broken PDFs.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ExplainModal } from "@/components/DocumentViewer/ExplainModal";
import {
  HighlightColorPicker,
  HighlightPanel,
} from "@/components/DocumentViewer/HighlightPanel";
import {
  MobileRenderer,
  type MobileRendererHandle,
} from "@/components/DocumentViewer/MobileRenderer";
import { ReaderControls } from "@/components/DocumentViewer/ReaderControls";
import { SearchBar } from "@/components/DocumentViewer/SearchBar";
import { SelectionToolbar } from "@/components/DocumentViewer/SelectionToolbar";
import { ViewModeToggle } from "@/components/DocumentViewer/ViewModeToggle";
import { PageJumpModal } from "@/components/pdf/PageJumpModal";
import { ThumbnailGrid } from "@/components/pdf/ThumbnailGrid";
import {
  PdfRecoveryAction,
  PdfRecoveryScreen,
} from "@/components/PdfRecoveryScreen";
import { ReadAloudController } from "@/components/ReadAloudController";
import {
  DarkTheme,
  LightTheme,
  Palette,
  PdfViewer,
  Spacing,
  Typography,
  normalizePdfUri,
  openWithSystemApp,
  showOpenFailedAlert,
} from "@/services/document-manager";
import { reflowPDF } from "@/services/documentReflowService";
import { markFileOpened } from "@/services/fileIndexService";
import { loadSettings } from "@/services/settingsService";
import { repairPdfViaBackend } from "@/services/pdfRepairClient";
import { validatePdfFile } from "@/services/pdfValidationService";
import * as ViewerStorage from "@/services/viewerStorageService";
import { readAloudPersistence } from "@/services/readAloudPersistence";
import {
  DEFAULT_READER_SETTINGS,
  HIGHLIGHT_COLORS,
  INITIAL_SEARCH_STATE,
  type Highlight,
  type ReaderSettings,
  type SearchState,
  type SelectionAction,
  type SelectionPayload,
  type Underline,
  type ViewMode,
  type WebViewMessage,
} from "@/src/types/document-viewer.types";

// ============================================================================
// TYPES
// ============================================================================
/** Reading mode controls scroll direction, paging, and fit behaviour. */
type ReadingMode = "continuous" | "single" | "facing";

interface ViewerState {
  normalizedUri: string | null;
  loading: boolean;
  error: string | null;
  /** Extra diagnostic details from validation. */
  errorDetails?: string;
  pageInfo: {
    current: number;
    total: number;
  };
  passwordRequired: boolean;
  /** True when the recovery/repair screen should be shown. */
  showRecovery: boolean;
  /** True while a server-side repair is in progress. */
  repairing: boolean;
  /** True while a retry is in progress. */
  retrying: boolean;
  /** Fullscreen mode — hides header */
  fullscreen: boolean;
  /** Fit mode: 0 = width, 2 = page */
  fitPolicy: 0 | 1 | 2;
  /** Go-to-page modal visible */
  showGoToPage: boolean;
  /** Overflow menu visible */
  showOverflow: boolean;
  /** Current reading mode */
  readingMode: ReadingMode;
  /** Thumbnail grid visible */
  showThumbnails: boolean;
  /** Reading mode picker visible */
  showReadingModePicker: boolean;
  // ── Mobile View / Advanced Features ──
  viewMode: ViewMode;
  mobileHtml: string | null;
  mobileLoading: boolean;
  mobileError: string | null;
  showSearch: boolean;
  showReaderControls: boolean;
  showHighlightPanel: boolean;
  /** Pending text selection for highlight color picker */
  pendingSelection: {
    text: string;
    startOffset: number;
    endOffset: number;
  } | null;
}

// ============================================================================
// READING MODE CONFIGURATION
// ============================================================================
/**
 * Maps each reading mode to the props passed to <PdfViewer>.
 */
function getReadingModeConfig(mode: ReadingMode) {
  switch (mode) {
    case "continuous":
      return {
        enablePaging: false,
        horizontal: false,
        spacing: 0,
      };
    case "single":
      return {
        enablePaging: true,
        horizontal: true,
        spacing: 0,
      };
    case "facing":
      return {
        enablePaging: true,
        horizontal: true,
        spacing: 10,
      };
  }
}

const READING_MODE_META: Record<
  ReadingMode,
  { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }
> = {
  continuous: { label: "Continuous", icon: "view-day" },
  single: { label: "Single Page", icon: "crop-landscape" },
  facing: { label: "Facing", icon: "view-carousel" },
};

// ============================================================================
// COMPONENT
// ============================================================================
export default function PdfViewerScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = colorScheme === "dark" ? DarkTheme : LightTheme;

  const { uri, name } = useLocalSearchParams<{
    uri: string;
    name: string;
  }>();

  const [state, setState] = useState<ViewerState>({
    normalizedUri: null,
    loading: true,
    error: null,
    errorDetails: undefined,
    pageInfo: { current: 1, total: 0 },
    passwordRequired: false,
    showRecovery: false,
    repairing: false,
    retrying: false,
    fullscreen: false,
    fitPolicy: 0,
    showGoToPage: false,
    showOverflow: false,
    readingMode: "continuous",
    showThumbnails: false,
    showReadingModePicker: false,
    // Mobile View defaults
    viewMode: "original",
    mobileHtml: null,
    mobileLoading: false,
    mobileError: null,
    showSearch: false,
    showReaderControls: false,
    showHighlightPanel: false,
    pendingSelection: null,
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [pdfPassword, setPdfPassword] = useState<string | null>(null);
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);
  const [showFullscreenIndicator, setShowFullscreenIndicator] = useState(false);
  const isMountedRef = React.useRef(true);

  // Mobile View refs and state
  const mobileRef = useRef<MobileRendererHandle>(null);
  const webViewReadyRef = useRef(false);
  const [readerSettings, setReaderSettingsState] = useState<ReaderSettings>(
    DEFAULT_READER_SETTINGS,
  );
  const [searchState, setSearchState] =
    useState<SearchState>(INITIAL_SEARCH_STATE);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [underlines, setUnderlines] = useState<Underline[]>([]);

  // Selection menu state
  const [selectionPayload, setSelectionPayload] =
    useState<SelectionPayload | null>(null);
  const [showExplainModal, setShowExplainModal] = useState(false);
  const [explainText, setExplainText] = useState("");
  const [readAloudText, setReadAloudText] = useState("");
  const [showReadAloud, setShowReadAloud] = useState(false);
  const [readAloudEnabled, setReadAloudEnabled] = useState(true);

  // Auto-restore Read Aloud bar if the user had paused playback in a previous session
  React.useEffect(() => {
    if (!state.normalizedUri) return;
    readAloudPersistence.getState(state.normalizedUri).then((saved) => {
      if (saved?.status === "paused" && isMountedRef.current) {
        setShowReadAloud(true);
      }
    });
  }, [state.normalizedUri]);

  // Track component lifecycle to prevent operations after unmount
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Normalize the URI on mount
  React.useEffect(() => {
    if (!uri) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "No PDF file specified",
      }));
      return;
    }

    normalizeUri();
  }, [uri]);

  // Load persisted viewer preferences
  React.useEffect(() => {
    if (!uri) return;
    (async () => {
      const [
        savedMode,
        savedSettings,
        savedHighlights,
        savedUnderlines,
        savedPage,
        appSettings,
      ] = await Promise.all([
        ViewerStorage.getViewMode(uri),
        ViewerStorage.getReaderSettings(),
        ViewerStorage.getHighlights(uri),
        ViewerStorage.getUnderlines(uri),
        ViewerStorage.getPagePosition(uri),
        loadSettings(),
      ]);
      if (!isMountedRef.current) return;
      setState((prev) => ({ ...prev, viewMode: savedMode }));
      setReaderSettingsState(savedSettings);
      setHighlights(savedHighlights);
      setUnderlines(savedUnderlines);
      // Restore last page only if rememberLastPage is enabled
      if (appSettings.rememberLastPage && savedPage && savedPage > 1) {
        setTargetPage(savedPage);
      }
      setReadAloudEnabled(appSettings.readAloud);
    })();
  }, [uri]);

  const normalizeUri = async () => {
    try {
      if (!isMountedRef.current) return;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        errorDetails: undefined,
        showRecovery: false,
      }));
      const normalized = await normalizePdfUri(uri);

      if (!isMountedRef.current) return;

      // ── Pre-render PDF validation ──────────────────────────────
      const validation = await validatePdfFile(normalized);

      if (!isMountedRef.current) return;

      if (!validation.valid) {
        setState((prev) => ({
          ...prev,
          normalizedUri: normalized,
          loading: false,
          error:
            validation.error ??
            "This file isn't a valid PDF. It may be a web page or an incomplete download.",
          errorDetails: validation.details,
          showRecovery: true,
        }));
        return;
      }

      // Encrypted PDF — show password prompt before attempting to render
      if (validation.encrypted) {
        setState((prev) => ({
          ...prev,
          normalizedUri: normalized,
          loading: false,
          passwordRequired: true,
          error: null,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        normalizedUri: normalized,
        loading: false,
      }));

      // Mark file as opened for recent files tracking
      if (uri && name) {
        markFileOpened(uri).catch((e) =>
          console.error("[PdfViewer] Failed to mark file as opened:", e),
        );
      }

      // ── Background text extraction for Read Aloud ──────────────
      // When in original (native) mode, we have no WebView to extract
      // text from. Start a background reflow so MobileRenderer can
      // provide text for Read Aloud regardless of view mode.
      reflowPDF(normalized, readerSettings)
        .then((result) => {
          if (isMountedRef.current && result.success && result.html) {
            setState((prev) => {
              if (prev.mobileHtml) return prev; // already set
              return { ...prev, mobileHtml: result.html! };
            });
          }
        })
        .catch((err) =>
          console.warn("[PdfViewer] Background text extraction failed:", err),
        );
    } catch (error) {
      if (!isMountedRef.current) return;

      const errorMessage =
        error instanceof Error ? error.message : "Failed to load PDF";
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
    }
  };

  const handleClose = useCallback(() => {
    loadSettings().then((s) => {
      if (s.confirmBeforeClosing) {
        Alert.alert(
          "Close File",
          "Are you sure you want to close this file?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Close", style: "destructive", onPress: () => router.back() },
          ],
        );
      } else {
        router.back();
      }
    }).catch(() => router.back());
  }, []);

  const handleOpenWithSystem = useCallback(async () => {
    if (!uri) return;

    const result = await openWithSystemApp({
      uri: uri,
      displayName: name || "document.pdf",
      mimeType: "application/pdf",
    });

    if (!result.success) {
      showOpenFailedAlert(name || "PDF", result.error);
    }
  }, [uri, name]);

  const handlePdfLoadComplete = useCallback((numberOfPages: number) => {
    if (!isMountedRef.current) return;
    const total = Math.max(1, numberOfPages);
    setState((prev) => ({
      ...prev,
      pageInfo: { ...prev.pageInfo, total },
    }));
  }, []);

  const handlePageChanged = useCallback(
    (page: number, numberOfPages: number) => {
      if (!isMountedRef.current) return;
      // Clamp page to valid range to prevent out-of-bounds
      const total = Math.max(1, numberOfPages);
      const current = Math.max(1, Math.min(page, total));
      setState((prev) => ({
        ...prev,
        pageInfo: { current, total },
      }));
      // Save page position if autoSave is enabled
      if (uri) {
        loadSettings().then((s) => {
          if (s.autoSave) {
            ViewerStorage.setPagePosition(uri, current);
          }
        }).catch(() => {});
      }
    },
    [uri],
  );

  const handlePdfError = useCallback(
    (error: string) => {
      if (!isMountedRef.current) return;
      // Check if the error is related to password protection / encryption.
      // We cast a wide net because different PDF renderers (muPDF, PdfBox,
      // iOS PDFKit, pdfjs) all use different messages for the same condition.
      const errorLower = (error || "").toLowerCase();
      const isPasswordError =
        errorLower.includes("password") ||
        errorLower.includes("encrypted") ||
        errorLower.includes("decrypt") ||
        errorLower.includes("protected") ||
        errorLower.includes("security") ||
        errorLower.includes("credentials") ||
        errorLower.includes("permission") ||
        errorLower.includes("authenticate") ||
        errorLower.includes("badpassword") ||
        errorLower.includes("invalidpassword") ||
        errorLower.includes("pdfpassword") ||
        errorLower.includes("need user") ||
        errorLower.includes("read password") ||
        errorLower.includes("owner password") ||
        errorLower.includes("user password");

      if (isPasswordError) {
        // The error is definitively about the password.
        // If we already submitted a password, it was wrong.
        if (pdfPassword) {
          Alert.alert(
            "Incorrect Password",
            "The password you entered is incorrect. Please try again.",
          );
          setPdfPassword(null);
          setPasswordInput("");
        }
        setState((prev) => ({ ...prev, passwordRequired: true, error: null }));
      } else if (pdfPassword) {
        // A password was submitted but the error is NOT a password error.
        // This means the file is probably damaged or uses an unsupported
        // encryption format.  Show the recovery screen rather than falsely
        // reporting an incorrect password.
        setState((prev) => ({
          ...prev,
          error:
            "Failed to open the PDF after entering the password. " +
            "The file may be damaged or use an unsupported encryption format.",
          showRecovery: true,
        }));
      } else {
        // Rendering failed — show recovery screen
        setState((prev) => ({
          ...prev,
          error: error || "The PDF viewer could not render this file.",
          showRecovery: true,
        }));
      }
    },
    [pdfPassword],
  );

  const handlePasswordSubmit = useCallback(() => {
    if (!passwordInput.trim()) {
      Alert.alert("Error", "Please enter a password.");
      return;
    }
    // Set password and dismiss the prompt — PdfViewer will re-render with the
    // password prop. If the password is wrong, handlePdfError will fire again.
    setPdfPassword(passwordInput);
    setState((prev) => ({ ...prev, passwordRequired: false }));
  }, [passwordInput]);

  const handleRetry = useCallback(() => {
    normalizeUri();
  }, [uri]);

  // ── Toolbar actions ──────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    setState((prev) => {
      const newFullscreen = !prev.fullscreen;
      if (newFullscreen) {
        setShowFullscreenIndicator(true);
      }
      return { ...prev, fullscreen: newFullscreen };
    });
  }, []);

  const toggleFitMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      fitPolicy: prev.fitPolicy === 0 ? 2 : 0, // toggle width ↔ page
    }));
  }, []);

  const handleGoToPage = useCallback(
    (page: number) => {
      // Clamp to valid range and guard against loading/error state
      if (state.loading || state.error || state.pageInfo.total <= 0) return;
      const clamped = Math.max(1, Math.min(page, state.pageInfo.total));
      setTargetPage(clamped);
      setState((prev) => ({
        ...prev,
        showGoToPage: false,
        showThumbnails: false,
      }));
    },
    [state.loading, state.error, state.pageInfo.total],
  );

  const handleSetReadingMode = useCallback((mode: ReadingMode) => {
    setState((prev) => ({
      ...prev,
      readingMode: mode,
      showReadingModePicker: false,
    }));
  }, []);

  const handleToggleThumbnails = useCallback(() => {
    setState((prev) => ({ ...prev, showThumbnails: !prev.showThumbnails }));
  }, []);

  const handleShowFullscreenIndicator = useCallback(() => {
    if (state.fullscreen) {
      setShowFullscreenIndicator(true);
    }
  }, [state.fullscreen]);

  // Auto-hide fullscreen indicator after 3 seconds
  React.useEffect(() => {
    if (showFullscreenIndicator && state.fullscreen) {
      const timer = setTimeout(() => {
        setShowFullscreenIndicator(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showFullscreenIndicator, state.fullscreen]);

  const handleShare = useCallback(async () => {
    if (!uri) return;
    try {
      const safeName = (name || "document")
        .replace(/[\/\\:*?"<>|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const fileName = safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`;
      const dest = `${FileSystem.cacheDirectory}${fileName}`;
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: "application/pdf",
        dialogTitle: name || "Share PDF",
      });
    } catch (err) {
      Alert.alert("Share Error", "Unable to share this file.");
    }
    setState((prev) => ({ ...prev, showOverflow: false }));
  }, [uri, name]);

  const handleChatWithDocument = useCallback(() => {
    if (!uri) return;
    router.push({
      pathname: "/chat-with-document",
      params: {
        uri,
        name: name || "document.pdf",
        mimeType: "application/pdf",
      },
    });
  }, [uri, name]);

  const handleSignDocument = useCallback(() => {
    if (!uri) return;
    router.push({
      pathname: "/sign-document",
      params: {
        file: name || "document.pdf",
        fileUri: uri,
        fileMimeType: "application/pdf",
      },
    });
  }, [uri, name]);

  // ── Mobile View handlers ───────────────────────────────────────
  const handleViewModeChange = useCallback(
    async (mode: ViewMode) => {
      if (!uri) return;

      // Stop Read Aloud when switching to mobile view
      if (mode === "mobile") {
        setShowReadAloud(false);
      }

      setState((prev) => ({
        ...prev,
        viewMode: mode,
        showReadingModePicker: false,
      }));
      ViewerStorage.setViewMode(uri, mode);

      if (mode === "mobile" && !state.mobileHtml && state.normalizedUri) {
        // Trigger reflow
        setState((prev) => ({
          ...prev,
          mobileLoading: true,
          mobileError: null,
        }));
        const result = await reflowPDF(state.normalizedUri, readerSettings);
        if (!isMountedRef.current) return;
        if (result.success && result.html) {
          setState((prev) => ({
            ...prev,
            mobileHtml: result.html!,
            mobileLoading: false,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            mobileLoading: false,
            mobileError:
              result.message || result.error || "Failed to load Mobile View",
          }));
        }
      }
    },
    [uri, state.normalizedUri, state.mobileHtml, readerSettings],
  );

  const handleReaderSettingsApply = useCallback(
    async (settings: ReaderSettings) => {
      setReaderSettingsState(settings);
      ViewerStorage.setReaderSettings(settings);

      if (state.viewMode === "mobile") {
        // In mobile mode, update styles in-place (fast) rather than re-fetching
        mobileRef.current?.updateStyles(settings);
      } else if (settings.theme !== "light") {
        // Non-light theme selected while in original mode — auto-switch to
        // mobile mode since the native PDF renderer has no theming support.
        handleViewModeChange("mobile");
        // Once switched, apply styles after a brief delay for WebView init
        setTimeout(() => {
          mobileRef.current?.updateStyles(settings);
        }, 600);
      }
    },
    [state.viewMode, handleViewModeChange],
  );

  // ── Search handlers ──────────────────────────────────────────
  const handleToggleSearch = useCallback(() => {
    setState((prev) => {
      const opening = !prev.showSearch;
      if (!opening) {
        // Closing search — clear highlights in WebView
        mobileRef.current?.clearSearch();
        setSearchState(INITIAL_SEARCH_STATE);
      }
      // If opening search in original mode, auto-switch to mobile mode where search works
      if (opening && prev.viewMode === "original") {
        return { ...prev, showSearch: true, viewMode: "mobile" as ViewMode };
      }
      return { ...prev, showSearch: opening };
    });
  }, []);

  const handleSearchQuery = useCallback((query: string) => {
    setSearchState((prev) => ({ ...prev, query, isSearching: true }));
    // Search in mobile view's WebView
    if (mobileRef.current) {
      mobileRef.current.search(query);
    } else {
      // WebView not ready yet (just switched to mobile mode), retry after brief delay
      setTimeout(() => {
        mobileRef.current?.search(query);
      }, 500);
    }
  }, []);

  const handleSearchNext = useCallback(() => {
    mobileRef.current?.searchNext();
  }, []);

  const handleSearchPrev = useCallback(() => {
    mobileRef.current?.searchPrev();
  }, []);

  // ── Highlight handlers ───────────────────────────────────────
  const handleHighlightColor = useCallback(
    async (color: string) => {
      if (!state.pendingSelection || !uri) return;
      const newHighlight: Highlight = {
        id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileUri: uri,
        startOffset: state.pendingSelection.startOffset,
        endOffset: state.pendingSelection.endOffset,
        text: state.pendingSelection.text,
        color,
        createdAt: Date.now(),
      };
      const updated = [...highlights, newHighlight];
      setHighlights(updated);
      await ViewerStorage.saveHighlight(newHighlight);
      setState((prev) => ({ ...prev, pendingSelection: null }));
      // Re-apply highlights in WebView
      mobileRef.current?.applyHighlights(updated);
    },
    [state.pendingSelection, uri, highlights],
  );

  const handleDeleteHighlight = useCallback(
    async (id: string) => {
      if (!uri) return;
      const updated = highlights.filter((h) => h.id !== id);
      setHighlights(updated);
      await ViewerStorage.removeHighlight(uri, id);
    },
    [uri, highlights],
  );

  const handleTapHighlight = useCallback(
    (h: Highlight) => {
      setState((prev) => ({ ...prev, showHighlightPanel: false }));
      if (h.pageNumber != null && state.viewMode === "original") {
        setTargetPage(h.pageNumber);
      } else if (h.startOffset != null && state.viewMode === "mobile") {
        // Scroll to approximately where that offset lives
        mobileRef.current?.scrollToPosition(0); // best-effort
      }
    },
    [state.viewMode],
  );

  // ── Mobile View WebView message handler ──────────────────────
  const handleMobileMessage = useCallback(
    (msg: WebViewMessage) => {
      switch (msg.type) {
        case "read-aloud-text": {
          if (msg.text && typeof msg.text === "string") {
            if (__DEV__) {
              console.log(
                `[PdfViewer][ReadAloud] Received text — ${msg.text.length} chars`,
                msg.text.substring(0, 200),
              );
            }
            setReadAloudText(msg.text);
          } else if (__DEV__) {
            console.warn(
              "[PdfViewer][ReadAloud] Received empty/invalid text from WebView",
            );
          }
          break;
        }
        case "scroll":
          if (uri) {
            ViewerStorage.setScrollPosition(uri, {
              scrollY: msg.scrollY,
              scrollPercent: msg.scrollPercent,
              timestamp: Date.now(),
            });
          }
          // Dismiss selection menu on scroll
          setSelectionPayload(null);
          break;
        case "search-result":
          setSearchState((prev) => ({
            ...prev,
            matchCount: (msg as any).count,
            currentIndex: (msg as any).current,
            isSearching: false,
          }));
          break;
        case "text-selected": {
          const sel = msg as any;
          if (sel.text && sel.text.trim()) {
            setState((prev) => ({
              ...prev,
              pendingSelection: {
                text: sel.text,
                startOffset: sel.startOffset,
                endOffset: sel.endOffset,
              },
            }));
          }
          break;
        }
        // ── Selection Bridge messages ──────────────────────
        case "selection": {
          const s = msg as any;
          if (s.text && s.text.trim()) {
            setSelectionPayload({
              text: s.text,
              startOffset: s.startOffset,
              endOffset: s.endOffset,
              rect: s.rect,
              scrollX: s.scrollX,
              scrollY: s.scrollY,
            });
          }
          break;
        }
        case "selection_clear":
          setSelectionPayload(null);
          break;
        case "annotation_applied":
          // Could show toast or log
          break;
      }
    },
    [uri],
  );

  // ── Selection action handler ─────────────────────────────────
  const handleSelectionAction = useCallback(
    async (action: SelectionAction) => {
      if (!selectionPayload || !uri) return;
      const { text, startOffset, endOffset } = selectionPayload;

      switch (action) {
        case "copy": {
          mobileRef.current?.bridgeCopySelection();
          Alert.alert("Copied", "Text copied to clipboard.");
          setSelectionPayload(null);
          mobileRef.current?.bridgeClearSelection();
          break;
        }
        case "highlight": {
          const color = HIGHLIGHT_COLORS[0].value; // default yellow
          const id = `hl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const newHighlight: Highlight = {
            id,
            fileUri: uri,
            startOffset,
            endOffset,
            text,
            color,
            createdAt: Date.now(),
          };
          mobileRef.current?.bridgeHighlight(id, startOffset, endOffset, color);
          const updated = [...highlights, newHighlight];
          setHighlights(updated);
          await ViewerStorage.saveHighlight(newHighlight);
          setSelectionPayload(null);
          mobileRef.current?.bridgeClearSelection();
          break;
        }
        case "underline": {
          const id = `ul_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const newUnderline: Underline = {
            id,
            fileUri: uri,
            startOffset,
            endOffset,
            text,
            createdAt: Date.now(),
          };
          mobileRef.current?.bridgeUnderline(id, startOffset, endOffset);
          const updatedUl = [...underlines, newUnderline];
          setUnderlines(updatedUl);
          await ViewerStorage.saveUnderline(newUnderline);
          setSelectionPayload(null);
          mobileRef.current?.bridgeClearSelection();
          break;
        }
        case "share": {
          try {
            await Share.share({ message: text });
          } catch {
            /* user cancelled */
          }
          setSelectionPayload(null);
          mobileRef.current?.bridgeClearSelection();
          break;
        }
        case "search": {
          // Open search bar with the selected text pre-filled
          setSearchState((prev) => ({ ...prev, query: text }));
          setState((prev) => ({ ...prev, showSearch: true }));
          mobileRef.current?.search(text);
          setSelectionPayload(null);
          mobileRef.current?.bridgeClearSelection();
          break;
        }
        case "explain": {
          setExplainText(text);
          setShowExplainModal(true);
          setSelectionPayload(null);
          mobileRef.current?.bridgeClearSelection();
          break;
        }
      }
    },
    [selectionPayload, uri, highlights, underlines],
  );

  const handleDismissSelection = useCallback(() => {
    setSelectionPayload(null);
    mobileRef.current?.bridgeClearSelection();
  }, []);

  const handleMobileReady = useCallback(() => {
    webViewReadyRef.current = true;
    // Re-apply highlights + underlines once WebView is ready
    if (highlights.length > 0 || underlines.length > 0) {
      mobileRef.current?.bridgeReapplyAnnotations(highlights, underlines);
    }
    // Restore scroll position
    if (uri) {
      ViewerStorage.getScrollPosition(uri).then((pos) => {
        if (pos && isMountedRef.current) {
          mobileRef.current?.scrollToPosition(pos.scrollY);
        }
      });
    }
    // Extract text for Read Aloud
    mobileRef.current?.extractTextForReadAloud();
  }, [highlights, underlines, uri]);

  // Re-apply annotations whenever highlights or underlines change after WebView is ready
  React.useEffect(() => {
    if (
      webViewReadyRef.current &&
      (highlights.length > 0 || underlines.length > 0)
    ) {
      mobileRef.current?.bridgeReapplyAnnotations(highlights, underlines);
    }
  }, [highlights, underlines]);

  // ── Recovery actions ─────────────────────────────────────────────
  const handleRecoveryAction = useCallback(
    async (action: PdfRecoveryAction) => {
      switch (action.type) {
        case "retry":
          setState((prev) => ({ ...prev, retrying: true }));
          await normalizeUri();
          setState((prev) => ({ ...prev, retrying: false }));
          break;

        case "repair": {
          if (!state.normalizedUri) return;
          setState((prev) => ({ ...prev, repairing: true }));
          try {
            const result = await repairPdfViaBackend(state.normalizedUri);
            if (result.success && result.repairedUri) {
              // Re-validate and render the repaired file
              const validation = await validatePdfFile(result.repairedUri);
              if (validation.valid) {
                setState((prev) => ({
                  ...prev,
                  normalizedUri: result.repairedUri!,
                  error: null,
                  errorDetails: undefined,
                  showRecovery: false,
                  repairing: false,
                }));
              } else {
                setState((prev) => ({
                  ...prev,
                  repairing: false,
                  error:
                    "Repair completed but the file is still invalid. Try opening externally.",
                  errorDetails: validation.details,
                }));
              }
            } else {
              setState((prev) => ({
                ...prev,
                repairing: false,
                error: result.error ?? "Repair failed.",
              }));
            }
          } catch (err) {
            setState((prev) => ({
              ...prev,
              repairing: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Repair service unavailable.",
            }));
          }
          break;
        }

        case "external":
          // Already handled inside PdfRecoveryScreen
          break;

        case "report":
          // Already handled inside PdfRecoveryScreen
          break;
      }
    },
    [state.normalizedUri, uri],
  );

  // Loading state (normalizing URI)
  if (state.loading && !state.normalizedUri) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <Header
          name={name || "PDF"}
          theme={theme}
          onClose={handleClose}
          onOpenWithSystem={handleOpenWithSystem}
          fitPolicy={state.fitPolicy}
          readingMode={state.readingMode}
          showReadingModePicker={false}
          onToggleFit={toggleFitMode}
          onToggleFullscreen={toggleFullscreen}
          onGoToPage={() => {}}
          onShare={handleShare}
          onToggleThumbnails={() => {}}
          onSetReadingMode={handleSetReadingMode}
          onToggleReadingModePicker={() => {}}
          viewMode="original"
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Palette.primary[500]} />
          <Text style={[styles.loadingText, { color: theme.text.secondary }]}>
            Please wait…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Password required state
  if (state.passwordRequired) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <Header
          name={name || "PDF"}
          theme={theme}
          onClose={handleClose}
          fitPolicy={state.fitPolicy}
          readingMode={state.readingMode}
          showReadingModePicker={false}
          onToggleFit={toggleFitMode}
          onToggleFullscreen={toggleFullscreen}
          onGoToPage={() => {}}
          onShare={handleShare}
          onToggleThumbnails={() => {}}
          onSetReadingMode={handleSetReadingMode}
          onToggleReadingModePicker={() => {}}
          viewMode="original"
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <RNScrollView
            contentContainerStyle={styles.centerContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <MaterialIcons name="lock" size={64} color={Palette.primary[500]} />
            <Text style={[styles.errorTitle, { color: theme.text.primary }]}>
              Password Required
            </Text>
            <Text
              style={[styles.errorMessage, { color: theme.text.secondary }]}
            >
              This PDF is password protected. Enter the password to view it.
            </Text>
            <TextInput
              value={passwordInput}
              onChangeText={setPasswordInput}
              placeholder="Enter password..."
              placeholderTextColor={theme.text.secondary}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={[
                styles.passwordInput,
                {
                  backgroundColor: theme.surface.primary,
                  color: theme.text.primary,
                  borderColor: theme.border.default,
                },
              ]}
              onSubmitEditing={handlePasswordSubmit}
            />
            <View style={styles.errorActions}>
              <Pressable
                style={[
                  styles.retryButton,
                  { backgroundColor: Palette.primary[500] },
                ]}
                onPress={handlePasswordSubmit}
              >
                <MaterialIcons
                  name="lock-open"
                  size={20}
                  color={Palette.white}
                  style={{ marginRight: Spacing.sm }}
                />
                <Text style={styles.retryButtonText}>Unlock</Text>
              </Pressable>
            </View>
          </RNScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Error / Recovery state
  if (state.error) {
    // If recovery screen is appropriate, show the full recovery UI
    if (state.showRecovery) {
      return (
        <SafeAreaView
          style={[
            styles.container,
            { backgroundColor: theme.background.primary },
          ]}
        >
          <Header
            name={name || "PDF"}
            theme={theme}
            onClose={handleClose}
            onOpenWithSystem={handleOpenWithSystem}
            fitPolicy={state.fitPolicy}
            readingMode={state.readingMode}
            showReadingModePicker={false}
            onToggleFit={toggleFitMode}
            onToggleFullscreen={toggleFullscreen}
            onGoToPage={() => {}}
            onShare={handleShare}
            onToggleThumbnails={() => {}}
            onSetReadingMode={handleSetReadingMode}
            onToggleReadingModePicker={() => {}}
            viewMode="original"
          />
          <PdfRecoveryScreen
            error={state.error}
            details={state.errorDetails}
            fileUri={state.normalizedUri ?? uri}
            fileName={name}
            theme={theme}
            onAction={handleRecoveryAction}
            repairing={state.repairing}
            retrying={state.retrying}
          />
        </SafeAreaView>
      );
    }

    // Generic error (no recovery needed — e.g. missing URI)
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <Header
          name={name || "PDF"}
          theme={theme}
          onClose={handleClose}
          onOpenWithSystem={handleOpenWithSystem}
          fitPolicy={state.fitPolicy}
          readingMode={state.readingMode}
          showReadingModePicker={false}
          onToggleFit={toggleFitMode}
          onToggleFullscreen={toggleFullscreen}
          onGoToPage={() => {}}
          onShare={handleShare}
          onToggleThumbnails={() => {}}
          onSetReadingMode={handleSetReadingMode}
          onToggleReadingModePicker={() => {}}
          viewMode="original"
        />
        <View style={styles.centerContent}>
          <MaterialIcons
            name="error-outline"
            size={64}
            color={Palette.error.main}
          />
          <Text style={[styles.errorTitle, { color: theme.text.primary }]}>
            Failed to load PDF
          </Text>
          <Text style={[styles.errorMessage, { color: theme.text.secondary }]}>
            {state.error}
          </Text>

          <View style={styles.errorActions}>
            <Pressable
              style={[
                styles.retryButton,
                { backgroundColor: Palette.primary[500] },
              ]}
              onPress={handleRetry}
            >
              <MaterialIcons
                name="refresh"
                size={20}
                color={Palette.white}
                style={{ marginRight: Spacing.sm }}
              />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>

            <Pressable
              style={[
                styles.externalButton,
                { borderColor: theme.border.default },
              ]}
              onPress={handleOpenWithSystem}
            >
              <MaterialIcons
                name="open-in-new"
                size={20}
                color={theme.text.primary}
                style={{ marginRight: Spacing.sm }}
              />
              <Text
                style={[
                  styles.externalButtonText,
                  { color: theme.text.primary },
                ]}
              >
                Open Externally
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // PDF Viewer
  const readingConfig = getReadingModeConfig(state.readingMode);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background.primary }]}
      edges={state.fullscreen ? [] : ["top"]}
    >
      {/* Header — hidden in fullscreen */}
      {!state.fullscreen && (
        <Header
          name={name || "PDF"}
          theme={theme}
          onClose={handleClose}
          onOpenWithSystem={handleOpenWithSystem}
          pageInfo={
            state.viewMode === "original" && state.pageInfo.total > 0
              ? state.pageInfo
              : undefined
          }
          fitPolicy={state.fitPolicy}
          readingMode={state.readingMode}
          showReadingModePicker={state.showReadingModePicker}
          onToggleFit={toggleFitMode}
          onToggleFullscreen={toggleFullscreen}
          onGoToPage={() =>
            setState((prev) => ({ ...prev, showGoToPage: true }))
          }
          onShare={handleShare}
          onToggleThumbnails={handleToggleThumbnails}
          onSetReadingMode={handleSetReadingMode}
          onToggleReadingModePicker={() =>
            setState((prev) => ({
              ...prev,
              showReadingModePicker: !prev.showReadingModePicker,
            }))
          }
          viewMode={state.viewMode}
          onToggleSearch={handleToggleSearch}
          onToggleReaderControls={() =>
            setState((prev) => ({ ...prev, showReaderControls: true }))
          }
          onToggleHighlightPanel={() =>
            setState((prev) => ({ ...prev, showHighlightPanel: true }))
          }
          onViewModeChange={handleViewModeChange}
          mobileLoading={state.mobileLoading}
          onReadAloud={
            state.viewMode === "original" && readAloudEnabled
              ? () => setShowReadAloud(true)
              : undefined
          }
          onChatWithDocument={handleChatWithDocument}
          onSignDocument={handleSignDocument}
        />
      )}

      {/* ── Search Bar ─────────────────────────────────────────── */}
      {state.showSearch && (
        <SearchBar
          state={searchState}
          onQueryChange={handleSearchQuery}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          onClose={handleToggleSearch}
          textColor={theme.text.primary}
          bgColor={theme.surface.primary}
          borderColor={theme.border.light}
        />
      )}

      {/* ── ORIGINAL MODE: Native PDF Renderer ─────────────────── */}
      {state.viewMode === "original" && state.normalizedUri && (
        <View style={{ flex: 1 }}>
          <PdfViewer
            uri={state.normalizedUri}
            password={pdfPassword || undefined}
            colorScheme={colorScheme}
            fitPolicy={
              state.fullscreen
                ? 0
                : state.readingMode === "facing"
                  ? 2
                  : state.fitPolicy
            }
            minScale={1.0}
            page={targetPage}
            enablePaging={readingConfig.enablePaging}
            horizontal={readingConfig.horizontal}
            spacing={readingConfig.spacing}
            onLoadComplete={handlePdfLoadComplete}
            onPageChanged={handlePageChanged}
            onError={handlePdfError}
          />
          {/* Tap-to-show indicator overlay (only in fullscreen) */}
          {state.fullscreen && (
            <Pressable
              style={styles.fullscreenTapArea}
              onPress={handleShowFullscreenIndicator}
            />
          )}
        </View>
      )}

      {/* ── MOBILE MODE: WebView Reflow Renderer ───────────────── */}
      {/* Always mounted (hidden in original mode) so text can be
          extracted for Read Aloud regardless of view mode. */}
      {state.mobileHtml && (
        <View
          style={
            state.viewMode === "mobile"
              ? { flex: 1 }
              : styles.hiddenMobileRenderer
          }
          pointerEvents={state.viewMode === "mobile" ? "auto" : "none"}
        >
          <MobileRenderer
            ref={mobileRef}
            html={state.mobileHtml}
            loading={state.mobileLoading}
            error={state.mobileError}
            onMessage={handleMobileMessage}
            onReady={handleMobileReady}
          />
        </View>
      )}

      {/* ── Highlight color picker (bottom bar) ────────────────── */}
      <HighlightColorPicker
        visible={!!state.pendingSelection}
        selectedText={state.pendingSelection?.text || ""}
        onSelect={handleHighlightColor}
        onDismiss={() =>
          setState((prev) => ({ ...prev, pendingSelection: null }))
        }
      />

      {/* Tap-to-exit fullscreen overlay */}
      {state.fullscreen && showFullscreenIndicator && (
        <Pressable style={styles.fullscreenExitHint} onPress={toggleFullscreen}>
          <View style={styles.fullscreenExitPill}>
            <MaterialIcons name="fullscreen-exit" size={18} color="#fff" />
            <Text style={styles.fullscreenExitText}>
              Page {state.pageInfo.current}/{state.pageInfo.total}
            </Text>
          </View>
        </Pressable>
      )}

      {/* ── Enhanced Go-to-page modal ────────────────────────────── */}
      <PageJumpModal
        visible={state.showGoToPage}
        currentPage={state.pageInfo.current}
        totalPages={state.pageInfo.total || 1}
        theme={theme}
        onClose={() => setState((prev) => ({ ...prev, showGoToPage: false }))}
        onJumpToPage={handleGoToPage}
      />

      {/* ── Thumbnail grid ───────────────────────────────────────── */}
      {state.normalizedUri && (
        <ThumbnailGrid
          visible={state.showThumbnails}
          source={{ uri: state.normalizedUri, cache: true }}
          totalPages={state.pageInfo.total || 1}
          currentPage={state.pageInfo.current}
          theme={theme}
          onClose={() =>
            setState((prev) => ({ ...prev, showThumbnails: false }))
          }
          onSelectPage={handleGoToPage}
        />
      )}

      {/* ── Reader Controls (Mobile View settings) ─────────────── */}
      <ReaderControls
        visible={state.showReaderControls}
        settings={readerSettings}
        onApply={handleReaderSettingsApply}
        onClose={() =>
          setState((prev) => ({ ...prev, showReaderControls: false }))
        }
      />

      {/* ── Highlight Panel ────────────────────────────────────── */}
      <HighlightPanel
        visible={state.showHighlightPanel}
        highlights={highlights}
        onClose={() =>
          setState((prev) => ({ ...prev, showHighlightPanel: false }))
        }
        onTapHighlight={handleTapHighlight}
        onDeleteHighlight={handleDeleteHighlight}
      />

      {/* ── WPS-Style Selection Toolbar (Mobile View only) ─────── */}
      {state.viewMode === "mobile" && (
        <SelectionToolbar
          visible={!!selectionPayload}
          selectedText={selectionPayload?.text ?? ""}
          rect={selectionPayload?.rect}
          scrollY={selectionPayload?.scrollY ?? 0}
          onAction={handleSelectionAction}
          onDismiss={handleDismissSelection}
        />
      )}

      {/* ── Explain Modal ──────────────────────────────────────── */}
      <ExplainModal
        visible={showExplainModal}
        selectedText={explainText}
        fileName={name}
        onClose={() => setShowExplainModal(false)}
      />

      {/* ── Read Aloud ─────────────────────────────────────────── */}
      <ReadAloudController
        text={readAloudText}
        colorScheme={colorScheme}
        active={
          showReadAloud && !state.fullscreen && !state.loading && !state.error
        }
        onRequestClose={() => setShowReadAloud(false)}
        documentId={state.normalizedUri || undefined}
        documentName={name}
        onPageChange={(pageIndex) => {
          // Scroll to the page when Read Aloud advances to a new page (original mode)
          if (showReadAloud && !state.loading && !state.error) {
            const pageNumber = pageIndex + 1; // pageIndex is 0-based, page numbers are 1-based
            setTargetPage(pageNumber);
          }
        }}
        onChunkChange={(chunk, totalChunks) => {
          // In mobile (reflow) mode, scroll to the spoken text near the top of the viewport
          if (state.viewMode === "mobile" && mobileRef.current && totalChunks > 0) {
            const fallbackPercent = totalChunks > 1
              ? Math.max(0, Math.min(100, (chunk.chunkIndex / (totalChunks - 1)) * 100))
              : 0;
            mobileRef.current.scrollToText(chunk.text, fallbackPercent);
          }
        }}
      />
    </SafeAreaView>
  );
}

// ============================================================================
// HEADER COMPONENT
// ============================================================================
interface HeaderProps {
  name: string;
  theme: typeof LightTheme;
  onClose: () => void;
  /** Pass undefined to hide "Open Externally" from the overflow menu. */
  onOpenWithSystem?: () => void;
  pageInfo?: { current: number; total: number };
  fitPolicy: 0 | 1 | 2;
  readingMode: ReadingMode;
  showReadingModePicker: boolean;
  onToggleFit: () => void;
  onToggleFullscreen: () => void;
  onGoToPage: () => void;
  onShare: () => void;
  onToggleThumbnails: () => void;
  onSetReadingMode: (mode: ReadingMode) => void;
  onToggleReadingModePicker: () => void;
  // New props for viewer upgrade
  viewMode: ViewMode;
  onToggleSearch?: () => void;
  onToggleReaderControls?: () => void;
  onToggleHighlightPanel?: () => void;
  // View mode toggle
  onViewModeChange?: (mode: ViewMode) => void;
  mobileLoading?: boolean;
  /** Open Read Aloud panel. Only passed in original (non-mobile) view mode. */
  onReadAloud?: () => void;
  /** Open Chat with Document screen */
  onChatWithDocument?: () => void;
  /** Open Sign Document flow */
  onSignDocument?: () => void;
}

function Header({
  name,
  theme,
  onClose,
  onOpenWithSystem,
  pageInfo,
  fitPolicy,
  readingMode,
  showReadingModePicker,
  onToggleFit,
  onToggleFullscreen,
  onGoToPage,
  onShare,
  onToggleThumbnails,
  onSetReadingMode,
  onToggleReadingModePicker,
  viewMode,
  onToggleSearch,
  onToggleReaderControls,
  onToggleHighlightPanel,
  onViewModeChange,
  mobileLoading,
  onReadAloud,
  onChatWithDocument,
  onSignDocument,
}: HeaderProps) {
  const [showOverflow, setShowOverflow] = React.useState(false);

  return (
    <View>
      {/* ── Main header row ──────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface.primary,
            borderBottomColor: theme.border.light,
          },
        ]}
      >
        {/* Left: Close */}
        <Pressable onPress={onClose} style={styles.headerButton}>
          <MaterialIcons name="close" size={28} color={theme.text.primary} />
        </Pressable>

        {/* Center: Title + page info */}
        <Pressable
          style={styles.headerCenter}
          onPress={pageInfo ? onGoToPage : undefined}
        >
          <Text
            style={[styles.headerTitle, { color: theme.text.primary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {name}
          </Text>
          {pageInfo && (
            <Text
              style={[styles.headerSubtitle, { color: theme.text.secondary }]}
            >
              Page {pageInfo.current} of {pageInfo.total} ▾
            </Text>
          )}
        </Pressable>

        {/* Right: Compact toolbar — toggle, search, 3-dots */}
        <View style={styles.headerActions}>
          {/* Mobile View toggle */}
          {onViewModeChange && (
            <ViewModeToggle
              mode={viewMode}
              onModeChange={onViewModeChange}
              disabled={mobileLoading}
            />
          )}

          {/* Search */}
          {onToggleSearch && (
            <Pressable onPress={onToggleSearch} style={styles.headerButton}>
              <MaterialIcons
                name="search"
                size={22}
                color={theme.text.primary}
              />
            </Pressable>
          )}

          {/* 3-dots overflow */}
          <Pressable
            onPress={() => setShowOverflow((v) => !v)}
            style={styles.headerButton}
          >
            <MaterialIcons
              name="more-vert"
              size={22}
              color={theme.text.primary}
            />
          </Pressable>
        </View>
      </View>

      {/* ── Overflow dropdown ────────────────────────────────────── */}
      {showOverflow && (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View
            style={[
              styles.overflowMenu,
              {
                backgroundColor: theme.surface.elevated,
                borderColor: theme.border.light,
              },
            ]}
          >
            {/* Highlights panel */}
            {onToggleHighlightPanel && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onToggleHighlightPanel();
                }}
              >
                <MaterialIcons
                  name="highlight"
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Highlights
                </Text>
              </Pressable>
            )}

            {/* Read Aloud (Original/standard mode only) */}
            {onReadAloud && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onReadAloud();
                }}
              >
                <MaterialIcons
                  name="volume-up"
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Read Aloud
                </Text>
              </Pressable>
            )}

            {/* Reader settings (available in both view modes) */}
            {onToggleReaderControls && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onToggleReaderControls();
                }}
              >
                <MaterialIcons
                  name="tune"
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Reader Settings
                </Text>
              </Pressable>
            )}

            {/* Fit mode toggle (Original only) */}
            {viewMode === "original" && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onToggleFit();
                }}
              >
                <MaterialIcons
                  name={fitPolicy === 0 ? "zoom-out-map" : "crop-landscape"}
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  {fitPolicy === 0 ? "Fit Page" : "Fit Width"}
                </Text>
              </Pressable>
            )}

            {/* Thumbnails (Original only) */}
            {viewMode === "original" && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onToggleThumbnails();
                }}
              >
                <MaterialIcons
                  name="grid-view"
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Page Thumbnails
                </Text>
              </Pressable>
            )}

            {/* Fullscreen */}
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                onToggleFullscreen();
              }}
            >
              <MaterialIcons
                name="fullscreen"
                size={20}
                color={theme.text.primary}
              />
              <Text
                style={[styles.overflowLabel, { color: theme.text.primary }]}
              >
                Fullscreen
              </Text>
            </Pressable>

            {/* Reading mode (Original only) */}
            {viewMode === "original" && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onToggleReadingModePicker();
                }}
              >
                <MaterialIcons
                  name={READING_MODE_META[readingMode].icon}
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  {READING_MODE_META[readingMode].label}
                </Text>
              </Pressable>
            )}

            {/* Chat with File */}
            {onChatWithDocument && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onChatWithDocument();
                }}
              >
                <MaterialIcons
                  name="chat"
                  size={20}
                  color={Palette.primary[500]}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Chat with File
                </Text>
              </Pressable>
            )}

            {/* Sign Document */}
            {onSignDocument && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onSignDocument();
                }}
              >
                <MaterialIcons
                  name="draw"
                  size={20}
                  color={Palette.primary[500]}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Sign Document
                </Text>
              </Pressable>
            )}

            {/* Share */}
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                onShare();
              }}
            >
              <MaterialIcons
                name="share"
                size={20}
                color={theme.text.primary}
              />
              <Text
                style={[styles.overflowLabel, { color: theme.text.primary }]}
              >
                Share
              </Text>
            </Pressable>

            {/* Open externally */}
            {onOpenWithSystem && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onOpenWithSystem();
                }}
              >
                <MaterialIcons
                  name="open-in-new"
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Open Externally
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      )}

      {/* ── Reading mode picker dropdown ─────────────────────────── */}
      {showReadingModePicker && (
        <View
          style={[
            styles.readingModePicker,
            {
              backgroundColor: theme.surface.elevated,
              borderColor: theme.border.light,
            },
          ]}
        >
          {(["continuous", "single", "facing"] as ReadingMode[]).map((mode) => {
            const isActive = mode === readingMode;
            return (
              <Pressable
                key={mode}
                style={[
                  styles.readingModeOption,
                  isActive && {
                    backgroundColor: Palette.primary[50],
                  },
                ]}
                onPress={() => onSetReadingMode(mode)}
              >
                <MaterialIcons
                  name={READING_MODE_META[mode].icon}
                  size={20}
                  color={isActive ? Palette.primary[600] : theme.text.secondary}
                />
                <Text
                  style={[
                    styles.readingModeLabel,
                    {
                      color: isActive
                        ? Palette.primary[600]
                        : theme.text.primary,
                      fontWeight: isActive
                        ? Typography.weight.bold
                        : Typography.weight.regular,
                    },
                  ]}
                >
                  {READING_MODE_META[mode].label}
                </Text>
                {isActive && (
                  <MaterialIcons
                    name="check"
                    size={18}
                    color={Palette.primary[600]}
                    style={{ marginLeft: "auto" }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /** Off-screen WebView used purely for text extraction (Read Aloud). */
  hiddenMobileRenderer: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
  },
  headerSubtitle: {
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  loadingText: {
    fontSize: Typography.size.base,
    marginTop: Spacing.md,
  },
  errorTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.semibold,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    fontSize: Typography.size.base,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  passwordInput: {
    width: "80%",
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.md,
    fontSize: Typography.size.base,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  errorActions: {
    gap: Spacing.md,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
  },
  retryButtonText: {
    color: Palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  externalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
    borderWidth: 1,
  },
  externalButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  // ── New enhanced UI styles ──
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  overflowBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  overflowMenu: {
    position: "absolute",
    top: 56,
    right: 8,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    zIndex: 51,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  overflowLabel: {
    fontSize: 15,
    fontWeight: "500" as const,
  },
  fullscreenExitHint: {
    position: "absolute",
    top: 48,
    alignSelf: "center",
    zIndex: 10,
  },
  fullscreenExitPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 8,
  },
  fullscreenExitText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500" as const,
    letterSpacing: 0.3,
  },
  fullscreenTapArea: {
    position: "absolute",
    top: "30%",
    bottom: "30%",
    left: "20%",
    right: "20%",
  },
  // ── Reading mode picker dropdown ──
  readingModePicker: {
    borderWidth: 1,
    borderTopWidth: 0,
  },
  readingModeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  readingModeLabel: {
    fontSize: Typography.size.base,
  },
});
