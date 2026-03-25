/**
 * DOCX Viewer Screen
 * In-app DOCX viewer with WebView-based rendering using Mammoth.js
 * Follows the same UX pattern as the PDF viewer
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { ExplainModal } from "@/components/DocumentViewer/ExplainModal";
import {
  HighlightColorPicker,
  HighlightPanel,
} from "@/components/DocumentViewer/HighlightPanel";
import {
  MobileRenderer,
  MobileRendererHandle,
} from "@/components/DocumentViewer/MobileRenderer";
import { ReaderControls } from "@/components/DocumentViewer/ReaderControls";
import { SearchBar } from "@/components/DocumentViewer/SearchBar";
import { SelectionToolbar } from "@/components/DocumentViewer/SelectionToolbar";
import { ViewModeToggle } from "@/components/DocumentViewer/ViewModeToggle";
import DocxShareOptions from "@/components/DocxShareOptions";
import { reflowDOCX } from "@/services/documentReflowService";
import { markFileOpened } from "@/services/fileIndexService";
import * as ViewerStorage from "@/services/viewerStorageService";
import { readAloudPersistence } from "@/services/readAloudPersistence";
import {
  DEFAULT_READER_SETTINGS,
  HIGHLIGHT_COLORS,
  Highlight,
  INITIAL_SEARCH_STATE,
  ReaderSettings,
  SearchState,
  SelectionAction,
  SelectionPayload,
  Underline,
  ViewMode,
  WebViewMessage,
} from "@/src/types/document-viewer.types";

import {
  DarkTheme,
  LightTheme,
  Palette,
  Spacing,
  Typography,
  openWithSystemApp,
  showOpenFailedAlert,
} from "@/services/document-manager";

import { ReadAloudController } from "@/components/ReadAloudController";
import { loadSettings } from "@/services/settingsService";

import {
  generateDocxEditorHtml,
  generateDocxViewerHtml,
  generatePlainTextEditorHtml,
  generatePlainTextViewerHtml,
  getDocxDisplayName,
  isValidDocxFile,
  normalizeDocxUri,
  readDocxAsBase64,
  readFileAsText,
  saveEditedContent,
} from "@/services/docxService";

// ============================================================================
// TYPES
// ============================================================================
interface ViewerState {
  originalUri: string | null;
  normalizedUri: string | null;
  base64Content: string | null;
  textContent: string | null;
  htmlContent: string | null;
  loading: boolean;
  error: string | null;
  mode: "view" | "edit";
  saving: boolean;
  isValidDocx: boolean;
  showShareModal: boolean;
  extractedText: string | null;
  /** Fullscreen mode — hides header */
  fullscreen: boolean;
  /** Search bar visible (original mode) */
  showSearch: boolean;
  /** Current search query (original mode) */
  searchQuery: string;
  /** Number of search matches (original mode) */
  searchMatchCount: number;
  // ── Mobile View / Reflow state ──
  viewMode: ViewMode;
  mobileHtml: string | null;
  mobileLoading: boolean;
  mobileError: string | null;
  showReaderControls: boolean;
  showHighlightPanel: boolean;
  pendingSelection: {
    text: string;
    startOffset: number;
    endOffset: number;
  } | null;
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function DocxViewerScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = colorScheme === "dark" ? DarkTheme : LightTheme;
  const webViewRef = useRef<WebView>(null);
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { uri, name } = useLocalSearchParams<{
    uri: string;
    name: string;
  }>();

  const displayName = name || getDocxDisplayName(uri || "");

  const [state, setState] = useState<ViewerState>({
    originalUri: null,
    normalizedUri: null,
    base64Content: null,
    textContent: null,
    htmlContent: null,
    loading: true,
    error: null,
    mode: "view",
    saving: false,
    isValidDocx: false,
    showShareModal: false,
    extractedText: null,
    fullscreen: false,
    showSearch: false,
    searchQuery: "",
    searchMatchCount: 0,
    viewMode: "original",
    mobileHtml: null,
    mobileLoading: false,
    mobileError: null,
    showReaderControls: false,
    showHighlightPanel: false,
    pendingSelection: null,
  });

  // Mobile view refs & state
  const mobileRef = useRef<MobileRendererHandle>(null);
  const webViewReadyRef = useRef(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    DEFAULT_READER_SETTINGS,
  );
  const [searchState, setSearchState] =
    useState<SearchState>(INITIAL_SEARCH_STATE);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [underlines, setUnderlines] = useState<Underline[]>([]);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

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

  // Load the DOCX file on mount
  React.useEffect(() => {
    if (!uri) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "No DOCX file specified",
      }));
      return;
    }

    loadDocument();
  }, [uri]);

  // Load persisted viewer preferences
  useEffect(() => {
    if (!uri) return;
    (async () => {
      try {
        const [savedMode, savedSettings, savedHighlights, savedUnderlines] =
          await Promise.all([
            ViewerStorage.getViewMode(uri),
            ViewerStorage.getReaderSettings(),
            ViewerStorage.getHighlights(uri),
            ViewerStorage.getUnderlines(uri),
          ]);
        if (savedMode) setState((prev) => ({ ...prev, viewMode: savedMode }));
        if (savedSettings) setReaderSettings(savedSettings);
        if (savedHighlights?.length) setHighlights(savedHighlights);
        if (savedUnderlines?.length) setUnderlines(savedUnderlines);
      } catch (e) {
        console.log("[DocxViewer] Failed to load persisted preferences:", e);
      }
    })();
  }, [uri]);

  const loadDocument = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Normalize the URI (handle SAF URIs)
      const normalized = await normalizeDocxUri(uri!);

      // Check if this is a valid DOCX file (ZIP format)
      const isValid = await isValidDocxFile(normalized);

      let html: string;
      let base64: string | null = null;
      let textContent: string | null = null;

      if (isValid) {
        // Valid DOCX - use Mammoth.js conversion
        base64 = await readDocxAsBase64(normalized);
        html = generateDocxViewerHtml(base64);
      } else {
        // Not a valid DOCX - treat as plain text (created in-app)
        console.log(
          "[DocxViewer] File is not a valid DOCX, showing as plain text",
        );
        textContent = await readFileAsText(normalized);
        html = generatePlainTextViewerHtml(textContent);
      }

      setState((prev) => ({
        ...prev,
        originalUri: uri!,
        normalizedUri: normalized,
        base64Content: base64,
        textContent: textContent,
        htmlContent: html,
        loading: false,
        isValidDocx: isValid,
      }));

      // Mark file as opened for recent files tracking
      if (uri && name) {
        markFileOpened(uri).catch((e) =>
          console.error("[DocxViewer] Failed to mark file as opened:", e),
        );
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load DOCX";
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
      displayName: displayName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    if (!result.success) {
      showOpenFailedAlert(displayName, result.error);
    }
  }, [uri, displayName]);

  const handleShare = useCallback(() => {
    console.log("[DocxViewer] handleShare called");
    console.log("[DocxViewer] Current state:", {
      originalUri: state.originalUri,
      normalizedUri: state.normalizedUri,
      showShareModal: state.showShareModal,
    });

    // Show the share options modal
    // Text extraction will happen when the modal needs it
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            // Get text content from the rendered document
            const contentEl = document.getElementById('content') || document.getElementById('editor') || document.body;
            const textContent = contentEl ? contentEl.innerText || contentEl.textContent : '';
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'extract-text',
              content: textContent
            }));
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'extract-text',
              content: ''
            }));
          }
        })();
        true;
      `);
    }

    // Always show the share options modal
    console.log("[DocxViewer] Setting showShareModal to true");
    setState((prev) => ({ ...prev, showShareModal: true }));
  }, [state.originalUri, state.normalizedUri, state.showShareModal]);

  const handleCloseShareModal = useCallback(() => {
    setState((prev) => ({ ...prev, showShareModal: false }));
  }, []);

  const handleChatWithDocument = useCallback(() => {
    const docUri = state.originalUri || uri;
    if (!docUri) return;
    router.push({
      pathname: "/chat-with-document",
      params: {
        uri: docUri,
        name: name || "document.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  }, [state.originalUri, uri, name]);

  // ── Fullscreen / Search handlers ─────────────────────────────────
  /**
   * Fullscreen fit-to-screen (WPS Office style) for DOCX WebView:
   * - On enter: constrain body to 100vw, hide horizontal overflow, and
   *   center content so no left/right panning is needed at the default zoom.
   *   A slight font-size bump (108%) improves readability on the bigger canvas
   *   WITHOUT causing horizontal overflow because max-width caps it.
   * - On exit: remove all overrides, restoring previous layout.
   * - If the user pinch-zooms the WebView beyond the viewport width, the
   *   native WebView scroll handling allows panning automatically.
   */
  const toggleFullscreen = useCallback(() => {
    setState((prev) => {
      const entering = !prev.fullscreen;
      if (webViewRef.current) {
        if (entering) {
          webViewRef.current.injectJavaScript(`
            (function(){
              document.body.style.maxWidth = '100vw';
              document.body.style.overflowX = 'hidden';
              document.body.style.margin = '0 auto';
              document.body.style.padding = '0 12px';
              document.body.style.boxSizing = 'border-box';
              document.body.style.fontSize = '108%';
              document.body.style.lineHeight = '1.65';
              document.body.style.wordBreak = 'break-word';
            })(); true;
          `);
        } else {
          webViewRef.current.injectJavaScript(`
            (function(){
              document.body.style.maxWidth = '';
              document.body.style.overflowX = '';
              document.body.style.margin = '';
              document.body.style.padding = '';
              document.body.style.boxSizing = '';
              document.body.style.fontSize = '';
              document.body.style.lineHeight = '';
              document.body.style.wordBreak = '';
            })(); true;
          `);
        }
      }
      return { ...prev, fullscreen: entering };
    });
  }, []);

  const toggleSearch = useCallback(() => {
    setState((prev) => {
      const opening = !prev.showSearch;
      if (!opening && webViewRef.current) {
        // Clear highlights when closing search
        webViewRef.current.injectJavaScript(`
          (function(){
            window.getSelection().removeAllRanges();
            if(window.__pdflabHighlights){
              window.__pdflabHighlights.forEach(function(el){
                var parent=el.parentNode;
                parent.replaceChild(document.createTextNode(el.textContent),el);
                parent.normalize();
              });
              window.__pdflabHighlights=[];
            }
          })(); true;
        `);
      }
      return {
        ...prev,
        showSearch: opening,
        searchQuery: "",
        searchMatchCount: 0,
      };
    });
  }, []);

  const handleSearchInDocument = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }));
    if (!webViewRef.current || !query.trim()) {
      setState((prev) => ({ ...prev, searchMatchCount: 0 }));
      // Clear previous highlights
      webViewRef.current?.injectJavaScript(`
        (function(){
          if(window.__pdflabHighlights){
            window.__pdflabHighlights.forEach(function(el){
              var p=el.parentNode;if(p){p.replaceChild(document.createTextNode(el.textContent),el);p.normalize();}
            });
          }
          window.__pdflabHighlights=[];
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'search-count',count:0}));
        })(); true;
      `);
      return;
    }
    // Inject JS to highlight matches inside the WebView (case-insensitive)
    webViewRef.current.injectJavaScript(`
      (function(){
        // Clear previous highlights
        if(window.__pdflabHighlights){
          window.__pdflabHighlights.forEach(function(el){
            var p=el.parentNode;if(p){p.replaceChild(document.createTextNode(el.textContent),el);p.normalize();}
          });
        }
        window.__pdflabHighlights=[];
        var q=${JSON.stringify(query)}.toLowerCase().trim();
        if(!q){window.ReactNativeWebView.postMessage(JSON.stringify({type:'search-count',count:0}));return;}
        var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,false);
        var nodes=[];
        while(walker.nextNode()) nodes.push(walker.currentNode);
        var count=0;
        nodes.forEach(function(node){
          var text=node.nodeValue;
          if(!text) return;
          var lower=text.toLowerCase();
          var idx=lower.indexOf(q);
          if(idx===-1) return;
          var frag=document.createDocumentFragment();
          var last=0;
          while(idx!==-1){
            frag.appendChild(document.createTextNode(text.substring(last,idx)));
            var span=document.createElement('span');
            span.style.backgroundColor='#FFEB3B';
            span.style.color='#000';
            span.style.borderRadius='2px';
            span.textContent=text.substring(idx,idx+q.length);
            frag.appendChild(span);
            window.__pdflabHighlights.push(span);
            count++;
            last=idx+q.length;
            idx=lower.indexOf(q,last);
          }
          frag.appendChild(document.createTextNode(text.substring(last)));
          node.parentNode.replaceChild(frag,node);
        });
        if(window.__pdflabHighlights.length>0){
          window.__pdflabHighlights[0].scrollIntoView({behavior:'smooth',block:'center'});
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'search-count',count:count}));
      })(); true;
    `);
  }, []);

  // ── Mobile View / Reflow handlers ─────────────────────────────────

  const handleViewModeChange = useCallback(
    async (mode: ViewMode) => {
      if (!uri) return;

      // Stop Read Aloud when switching to mobile view
      if (mode === "mobile") {
        setShowReadAloud(false);
      }

      // Persist the choice
      await ViewerStorage.setViewMode(uri, mode);
      setState((prev) => ({ ...prev, viewMode: mode }));

      if (mode === "mobile" && !state.mobileHtml) {
        // Generate reflow HTML locally
        const fileUri = state.normalizedUri ?? uri;
        setState((prev) => ({
          ...prev,
          mobileLoading: true,
          mobileError: null,
        }));
        try {
          const response = await reflowDOCX(fileUri, readerSettings);
          if (response.success && response.html) {
            setState((prev) => ({
              ...prev,
              mobileHtml: response.html!,
              mobileLoading: false,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              mobileLoading: false,
              mobileError:
                response.message ||
                response.error ||
                "Failed to load Mobile View",
            }));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Reflow failed";
          setState((prev) => ({
            ...prev,
            mobileLoading: false,
            mobileError: msg,
          }));
        }
      }
    },
    [uri, state.normalizedUri, state.mobileHtml, readerSettings],
  );

  const handleReaderSettingsApply = useCallback(
    async (settings: ReaderSettings) => {
      setReaderSettings(settings);
      await ViewerStorage.setReaderSettings(settings);

      if (state.viewMode === "mobile") {
        // In mobile mode, update styles in-place (fast)
        mobileRef.current?.updateStyles(settings);
      } else if (settings.theme !== "light") {
        // Non-light theme selected while in original mode — auto-switch to
        // mobile mode since the native renderer does not support theming.
        handleViewModeChange("mobile");
        setTimeout(() => {
          mobileRef.current?.updateStyles(settings);
        }, 600);
      }
      setState((prev) => ({ ...prev, showReaderControls: false }));
    },
    [state.viewMode, handleViewModeChange],
  );

  // ── Mobile-mode search handlers ───────────────────────────────────

  const handleToggleMobileSearch = useCallback(() => {
    setShowMobileSearch((prev) => {
      if (prev) {
        mobileRef.current?.clearSearch();
        setSearchState(INITIAL_SEARCH_STATE);
      }
      return !prev;
    });
  }, []);

  const handleSearchQuery = useCallback((query: string) => {
    setSearchState((prev) => ({ ...prev, query }));
    if (query.trim()) {
      mobileRef.current?.search(query);
    } else {
      mobileRef.current?.clearSearch();
      setSearchState((prev) => ({ ...prev, matchCount: 0, currentIndex: 0 }));
    }
  }, []);

  const handleSearchNext = useCallback(() => {
    mobileRef.current?.searchNext();
  }, []);

  const handleSearchPrev = useCallback(() => {
    mobileRef.current?.searchPrev();
  }, []);

  // ── Highlight handlers ────────────────────────────────────────────

  const handleHighlightColor = useCallback(
    async (color: string) => {
      if (!state.pendingSelection || !uri) return;
      const newHighlight: Highlight = {
        id: Date.now().toString(),
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
      mobileRef.current?.applyHighlights(updated);
      setState((prev) => ({ ...prev, pendingSelection: null }));
    },
    [uri, state.pendingSelection, highlights],
  );

  const handleDeleteHighlight = useCallback(
    async (id: string) => {
      if (!uri) return;
      const updated = highlights.filter((h) => h.id !== id);
      setHighlights(updated);
      await ViewerStorage.removeHighlight(uri, id);
      mobileRef.current?.applyHighlights(updated);
    },
    [uri, highlights],
  );

  const handleTapHighlight = useCallback((highlight: Highlight) => {
    if (highlight.startOffset !== undefined) {
      mobileRef.current?.scrollToPosition(highlight.startOffset);
    }
    setState((prev) => ({ ...prev, showHighlightPanel: false }));
  }, []);

  // ── MobileRenderer message handling ───────────────────────────────

  const handleMobileMessage = useCallback(
    (msg: WebViewMessage) => {
      switch (msg.type) {
        case "read-aloud-text": {
          const text = (msg as any).text;
          if (text && typeof text === "string") {
            setReadAloudText(text);
          }
          break;
        }
        case "search-result": {
          const m = msg as any;
          setSearchState((prev) => ({
            ...prev,
            matchCount: m.count ?? m.matchCount ?? 0,
            currentIndex: m.current ?? m.currentIndex ?? 0,
          }));
          break;
        }
        case "text-selected":
          setState((prev) => ({
            ...prev,
            pendingSelection: {
              text: msg.text,
              startOffset: msg.startOffset,
              endOffset: msg.endOffset,
            },
          }));
          break;
        case "scroll": {
          const s = msg as any;
          if (uri) {
            loadSettings().then((settings) => {
              if (settings.autoSave) {
                ViewerStorage.setScrollPosition(uri, {
                  scrollY: s.scrollY ?? 0,
                  scrollPercent: s.scrollPercent ?? 0,
                  timestamp: Date.now(),
                });
              }
            }).catch(() => {});
          }
          // Dismiss selection menu on scroll
          setSelectionPayload(null);
          break;
        }
        // ── Selection Bridge messages ───────────────────
        case "selection": {
          const sel = msg as any;
          if (sel.text && sel.text.trim()) {
            setSelectionPayload({
              text: sel.text,
              startOffset: sel.startOffset,
              endOffset: sel.endOffset,
              rect: sel.rect,
              scrollX: sel.scrollX,
              scrollY: sel.scrollY,
            });
          }
          break;
        }
        case "selection_clear":
          setSelectionPayload(null);
          break;
        case "annotation_applied":
          break;
        default:
          break;
      }
    },
    [uri],
  );

  // ── Selection action handler ──────────────────────────────────
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
          const color = HIGHLIGHT_COLORS[0].value;
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
          setSearchState((prev) => ({ ...prev, query: text }));
          setShowMobileSearch(true);
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

  const handleMobileReady = useCallback(async () => {
    if (!uri) return;
    webViewReadyRef.current = true;
    // Re-apply annotations
    if (highlights.length > 0 || underlines.length > 0) {
      mobileRef.current?.bridgeReapplyAnnotations(highlights, underlines);
    }
    const [savedPos, appSettings] = await Promise.all([
      ViewerStorage.getScrollPosition(uri),
      loadSettings(),
    ]);
    setReadAloudEnabled(appSettings.readAloud);
    if (savedPos && appSettings.rememberLastPage) {
      mobileRef.current?.scrollToPosition(
        typeof savedPos === "number"
          ? savedPos
          : ((savedPos as any).scrollY ?? 0),
      );
    }
    // Extract text for Read Aloud
    mobileRef.current?.extractTextForReadAloud();
  }, [uri, highlights, underlines]);

  // Re-apply annotations whenever highlights or underlines change after WebView is ready
  React.useEffect(() => {
    if (
      webViewReadyRef.current &&
      (highlights.length > 0 || underlines.length > 0)
    ) {
      mobileRef.current?.bridgeReapplyAnnotations(highlights, underlines);
    }
  }, [highlights, underlines]);

  const handleToggleEdit = useCallback(() => {
    if (state.mode === "view") {
      // Switch to edit mode
      if (state.isValidDocx && state.base64Content) {
        // Valid DOCX - use DOCX editor
        const editorHtml = generateDocxEditorHtml(state.base64Content);
        setState((prev) => ({
          ...prev,
          htmlContent: editorHtml,
          mode: "edit",
        }));
      } else if (state.textContent !== null) {
        // Plain text file - use plain text editor
        const editorHtml = generatePlainTextEditorHtml(state.textContent);
        setState((prev) => ({
          ...prev,
          htmlContent: editorHtml,
          mode: "edit",
        }));
      }
    } else {
      // Prompt to save before exiting edit mode
      Alert.alert("Exit Edit Mode", "Do you want to save your changes?", [
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            // Reload the original document
            if (state.isValidDocx && state.base64Content) {
              const viewerHtml = generateDocxViewerHtml(state.base64Content);
              setState((prev) => ({
                ...prev,
                htmlContent: viewerHtml,
                mode: "view",
              }));
            } else if (state.textContent !== null) {
              const viewerHtml = generatePlainTextViewerHtml(state.textContent);
              setState((prev) => ({
                ...prev,
                htmlContent: viewerHtml,
                mode: "view",
              }));
            }
          },
        },
        {
          text: "Save",
          onPress: handleSave,
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]);
    }
  }, [state.mode, state.base64Content]);

  const handleSave = useCallback(async () => {
    if (!webViewRef.current) return;

    setState((prev) => ({ ...prev, saving: true }));

    // Inject JavaScript to get editor content
    webViewRef.current.injectJavaScript(`
      (function() {
        const content = window.getEditorContent ? window.getEditorContent() : document.getElementById('editor').innerHTML;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'save-content',
          content: content
        }));
      })();
      true;
    `);
  }, []);

  const handleWebViewMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case "read-aloud-text":
            if (data.text && typeof data.text === "string") {
              if (__DEV__) {
                console.log(
                  `[DocxViewer][ReadAloud] Received text — ${data.text.length} chars`,
                  data.text.substring(0, 200),
                );
              }
              setReadAloudText(data.text);
            } else if (__DEV__) {
              console.warn(
                "[DocxViewer][ReadAloud] Received empty/invalid text from WebView",
              );
            }
            break;

          case "loaded":
            console.log("[DocxViewer] Document loaded successfully");
            // Extract text for Read Aloud from original WebView
            webViewRef.current?.injectJavaScript(`
              (function(){
                var el = document.getElementById('content') || document.body;
                var text = el.innerText || el.textContent || '';
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'read-aloud-text', text: text }));
              })(); true;
            `);
            break;

          case "editor-loaded":
            console.log("[DocxViewer] Editor loaded successfully");
            break;

          case "error":
            console.error("[DocxViewer] WebView error:", data.message);
            setState((prev) => ({
              ...prev,
              error: data.message || "Failed to process document",
            }));
            break;

          case "save-content":
            try {
              const newUri = await saveEditedContent(data.content, displayName);

              setState((prev) => ({ ...prev, saving: false }));

              Alert.alert(
                "Document Saved",
                "Your changes have been saved successfully.",
                [
                  {
                    text: "Share",
                    onPress: async () => {
                      try {
                        const safeName = displayName
                          .replace(/[\/\\:*?"<>|]/g, "")
                          .replace(/\s+/g, " ")
                          .trim();
                        const shareFileName = safeName.endsWith(".docx") ? safeName : `${safeName}.docx`;
                        const dest = `${FileSystem.cacheDirectory}${shareFileName}`;
                        const info = await FileSystem.getInfoAsync(dest);
                        if (info.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
                        await FileSystem.copyAsync({ from: newUri, to: dest });
                        await Sharing.shareAsync(dest, {
                          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        });
                      } catch {
                        Alert.alert("Error", "Failed to share document");
                      }
                    },
                  },
                  {
                    text: "OK",
                    onPress: () => {
                      // Reload original document in view mode
                      if (state.isValidDocx && state.base64Content) {
                        const viewerHtml = generateDocxViewerHtml(
                          state.base64Content,
                        );
                        setState((prev) => ({
                          ...prev,
                          htmlContent: viewerHtml,
                          mode: "view",
                        }));
                      } else if (state.textContent !== null) {
                        const viewerHtml = generatePlainTextViewerHtml(
                          state.textContent,
                        );
                        setState((prev) => ({
                          ...prev,
                          htmlContent: viewerHtml,
                          mode: "view",
                        }));
                      }
                    },
                  },
                ],
              );
            } catch (error) {
              setState((prev) => ({ ...prev, saving: false }));
              Alert.alert("Error", "Failed to save document");
            }
            break;

          case "extract-text":
            // Handle text extraction for sharing
            const extractedContent = data.content?.trim() || "";
            setState((prev) => ({
              ...prev,
              extractedText: extractedContent,
            }));
            console.log("[DocxViewer] Text extracted for sharing");
            break;

          case "search-count":
            setState((prev) => ({
              ...prev,
              searchMatchCount: data.count || 0,
            }));
            break;
        }
      } catch (e) {
        console.log("[DocxViewer] WebView message parse error:", e);
      }
    },
    [displayName, state.base64Content],
  );

  const handleRetry = useCallback(() => {
    loadDocument();
  }, [uri]);

  // Loading state
  if (state.loading) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <Header
          name={displayName}
          theme={theme}
          mode="view"
          onClose={handleClose}
          onShare={handleShare}
          onOpenWithSystem={handleOpenWithSystem}
          onToggleEdit={handleToggleEdit}
          viewMode="original"
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Palette.primary[500]} />
          <Text style={[styles.loadingText, { color: theme.text.secondary }]}>
            Please wait…
          </Text>
        </View>
        {/* DOCX Share Options Modal */}
        <DocxShareOptions
          visible={state.showShareModal}
          onClose={handleCloseShareModal}
          fileUri={state.normalizedUri || state.originalUri}
          textContent={state.extractedText || state.textContent}
          fileName={displayName}
        />
      </SafeAreaView>
    );
  }

  // Error state
  if (state.error) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <Header
          name={displayName}
          theme={theme}
          mode="view"
          onClose={handleClose}
          onShare={handleShare}
          onOpenWithSystem={handleOpenWithSystem}
          onToggleEdit={handleToggleEdit}
          viewMode="original"
        />
        <View style={styles.centerContent}>
          <MaterialIcons
            name="error-outline"
            size={64}
            color={Palette.error.main}
          />
          <Text style={[styles.errorTitle, { color: theme.text.primary }]}>
            Failed to load document
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
        {/* DOCX Share Options Modal */}
        <DocxShareOptions
          visible={state.showShareModal}
          onClose={handleCloseShareModal}
          fileUri={state.normalizedUri || state.originalUri}
          textContent={state.extractedText || state.textContent}
          fileName={displayName}
        />
      </SafeAreaView>
    );
  }

  // Document Viewer/Editor
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background.primary }]}
      edges={state.fullscreen ? [] : ["top"]}
    >
      {/* Header — hidden in fullscreen */}
      {!state.fullscreen && (
        <Header
          name={displayName}
          theme={theme}
          mode={state.mode}
          saving={state.saving}
          onClose={handleClose}
          onShare={handleShare}
          onOpenWithSystem={handleOpenWithSystem}
          onToggleEdit={handleToggleEdit}
          onSave={state.mode === "edit" ? handleSave : undefined}
          onToggleFullscreen={toggleFullscreen}
          onToggleSearch={
            state.viewMode === "original"
              ? toggleSearch
              : handleToggleMobileSearch
          }
          viewMode={state.viewMode}
          onToggleReaderControls={() =>
            setState((prev) => ({ ...prev, showReaderControls: true }))
          }
          onToggleHighlightPanel={() =>
            setState((prev) => ({ ...prev, showHighlightPanel: true }))
          }
          onViewModeChange={
            state.mode === "view" ? handleViewModeChange : undefined
          }
          mobileLoading={state.mobileLoading}
          onReadAloud={
            state.viewMode === "original" && readAloudEnabled
              ? () => setShowReadAloud(true)
              : undefined
          }
          onChatWithDocument={handleChatWithDocument}
        />
      )}

      {/* Search bar — mobile mode uses SearchBar component */}
      {showMobileSearch && state.viewMode === "mobile" && (
        <SearchBar
          state={searchState}
          onQueryChange={handleSearchQuery}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          onClose={handleToggleMobileSearch}
          textColor={theme.text.primary}
          bgColor={theme.surface.primary}
          borderColor={theme.border.light}
        />
      )}

      {/* Original-mode search bar */}
      {state.showSearch && state.viewMode === "original" && (
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.surface.primary,
              borderBottomColor: theme.border.light,
            },
          ]}
        >
          <MaterialIcons name="search" size={20} color={theme.text.secondary} />
          <TextInput
            value={state.searchQuery}
            onChangeText={handleSearchInDocument}
            placeholder="Search in document..."
            placeholderTextColor={theme.text.secondary}
            autoFocus
            style={[styles.searchInput, { color: theme.text.primary }]}
            returnKeyType="search"
          />
          {state.searchQuery.length > 0 && (
            <Text style={[styles.searchCount, { color: theme.text.secondary }]}>
              {state.searchMatchCount} found
            </Text>
          )}
          <Pressable onPress={toggleSearch} style={styles.searchClose}>
            <MaterialIcons
              name="close"
              size={20}
              color={theme.text.secondary}
            />
          </Pressable>
        </View>
      )}

      {/* ── Original mode: WebView with Mammoth rendering ── */}
      {state.viewMode === "original" && state.htmlContent && (
        <WebView
          ref={webViewRef}
          source={{ html: state.htmlContent }}
          style={styles.webview}
          originWhitelist={["*"]}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onMessage={handleWebViewMessage}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error("[DocxViewer] WebView error:", nativeEvent);
            setState((prev) => ({
              ...prev,
              error: "Failed to render document",
            }));
          }}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color={Palette.primary[500]} />
            </View>
          )}
        />
      )}

      {/* ── Mobile mode: MobileRenderer ── */}
      {state.viewMode === "mobile" && (
        <MobileRenderer
          ref={mobileRef}
          html={state.mobileHtml}
          loading={state.mobileLoading}
          error={state.mobileError}
          onMessage={handleMobileMessage}
          onReady={handleMobileReady}
        />
      )}

      {/* Highlight color picker — appears when text selected in mobile mode */}
      {state.pendingSelection && state.viewMode === "mobile" && (
        <HighlightColorPicker
          visible={true}
          selectedText={state.pendingSelection.text}
          onSelect={handleHighlightColor}
          onDismiss={() =>
            setState((prev) => ({ ...prev, pendingSelection: null }))
          }
        />
      )}

      {/* Reader Controls modal */}
      <ReaderControls
        visible={state.showReaderControls}
        settings={readerSettings}
        onApply={handleReaderSettingsApply}
        onClose={() =>
          setState((prev) => ({ ...prev, showReaderControls: false }))
        }
      />

      {/* Highlight Panel modal */}
      <HighlightPanel
        visible={state.showHighlightPanel}
        highlights={highlights}
        onTapHighlight={handleTapHighlight}
        onDeleteHighlight={handleDeleteHighlight}
        onClose={() =>
          setState((prev) => ({ ...prev, showHighlightPanel: false }))
        }
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
        fileName={displayName}
        onClose={() => setShowExplainModal(false)}
      />

      {/* ── Read Aloud ─────────────────────────────────────────── */}
      <ReadAloudController
        text={readAloudText || state.textContent || ""}
        colorScheme={colorScheme}
        active={
          showReadAloud && !state.fullscreen && !state.loading && !state.error
        }
        onRequestClose={() => setShowReadAloud(false)}
        documentId={state.normalizedUri || undefined}
        documentName={name}
        onChunkChange={(chunk, totalChunks) => {
          if (totalChunks <= 0) return;
          const fallbackPercent = totalChunks > 1
            ? Math.max(0, Math.min(100, (chunk.chunkIndex / (totalChunks - 1)) * 100))
            : 0;
          if (state.viewMode === "mobile" && mobileRef.current) {
            mobileRef.current.scrollToText(chunk.text, fallbackPercent);
          } else if (state.viewMode === "original" && webViewRef.current) {
            const searchText = JSON.stringify(chunk.text.trim().substring(0, 60));
            webViewRef.current.injectJavaScript(
              `(function(){` +
              `var s=${searchText};` +
              `var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);` +
              `while(w.nextNode()){` +
              `var t=w.currentNode.textContent;` +
              `if(t&&t.indexOf(s)!==-1){` +
              `var r=document.createRange();r.selectNodeContents(w.currentNode);` +
              `var rect=r.getBoundingClientRect();` +
              `window.scrollTo({top:Math.max(0,window.scrollY+rect.top-80),behavior:'smooth'});` +
              `return;}}` +
              `window.scrollTo({top:document.documentElement.scrollHeight*${fallbackPercent}/100,behavior:'smooth'});` +
              `})(); true;`
            );
          }
        }}
      />

      {/* Fullscreen exit hint */}
      {state.fullscreen && (
        <Pressable style={styles.fullscreenExitHint} onPress={toggleFullscreen}>
          <View style={styles.fullscreenExitPill}>
            <MaterialIcons name="fullscreen-exit" size={18} color="#fff" />
            <Text style={styles.fullscreenExitText}>
              Tap to exit fullscreen
            </Text>
          </View>
        </Pressable>
      )}

      {/* DOCX Share Options Modal */}
      <DocxShareOptions
        visible={state.showShareModal}
        onClose={handleCloseShareModal}
        fileUri={state.normalizedUri || state.originalUri}
        textContent={state.extractedText || state.textContent}
        fileName={displayName}
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
  mode: "view" | "edit";
  saving?: boolean;
  onClose: () => void;
  onShare: () => void;
  onOpenWithSystem: () => void;
  onToggleEdit: () => void;
  onSave?: () => void;
  onToggleFullscreen?: () => void;
  onToggleSearch?: () => void;
  viewMode?: ViewMode;
  onToggleReaderControls?: () => void;
  onToggleHighlightPanel?: () => void;
  // View mode toggle
  onViewModeChange?: (mode: ViewMode) => void;
  mobileLoading?: boolean;
  /** Open Read Aloud panel. Only passed in original (non-mobile) view mode. */
  onReadAloud?: () => void;
  /** Open Chat with Document screen */
  onChatWithDocument?: () => void;
}

function Header({
  name,
  theme,
  mode,
  saving,
  onClose,
  onShare,
  onOpenWithSystem,
  onToggleEdit,
  onSave,
  onToggleFullscreen,
  onToggleSearch,
  viewMode = "original",
  onToggleReaderControls,
  onToggleHighlightPanel,
  onViewModeChange,
  mobileLoading,
  onReadAloud,
  onChatWithDocument,
}: HeaderProps) {
  const [showOverflow, setShowOverflow] = React.useState(false);

  return (
    <View style={{ position: "relative" }}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface.primary,
            borderBottomColor: theme.border.light,
          },
        ]}
      >
        <Pressable onPress={onClose} style={styles.headerButton}>
          <MaterialIcons name="close" size={28} color={theme.text.primary} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, { color: theme.text.primary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {name}
          </Text>
          {mode === "edit" && (
            <Text
              style={[styles.headerSubtitle, { color: Palette.primary[500] }]}
            >
              Editing
            </Text>
          )}
        </View>

        <View style={styles.headerActions}>
          {/* Edit mode: Save + close */}
          {mode === "edit" && onSave && (
            <Pressable
              onPress={onSave}
              style={[
                styles.saveButton,
                { backgroundColor: Palette.primary[500] },
              ]}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Palette.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          )}
          {mode === "edit" && (
            <Pressable onPress={onToggleEdit} style={styles.headerButton}>
              <MaterialIcons
                name="close"
                size={24}
                color={theme.text.primary}
              />
            </Pressable>
          )}

          {/* View mode: toggle, search, 3-dots */}
          {mode === "view" && (
            <>
              {/* Mobile View toggle */}
              {onViewModeChange && (
                <ViewModeToggle
                  mode={viewMode as ViewMode}
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
            </>
          )}
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

            {/* Edit (Original only) */}
            {viewMode === "original" && mode === "view" && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onToggleEdit();
                }}
              >
                <MaterialIcons
                  name="edit"
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Edit
                </Text>
              </Pressable>
            )}

            {/* Fullscreen (Original only) */}
            {onToggleFullscreen && viewMode === "original" && (
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
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Chat with File
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
          </View>
        </Pressable>
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
    fontWeight: Typography.weight.medium,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 60,
    alignItems: "center",
  },
  saveButtonText: {
    color: Palette.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
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
  webview: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webviewLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  // ── Search bar styles ──
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  searchCount: {
    fontSize: 12,
    marginRight: 4,
  },
  searchClose: {
    padding: 4,
  },
  // ── Fullscreen hint ──
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
    fontWeight: "700" as const,
    letterSpacing: 0.3,
  },
  // ── Overflow menu ──
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
});
