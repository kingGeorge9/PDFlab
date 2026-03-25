/**
 * DocumentContext.tsx
 *
 * Global state provider for the WPS-style document editor.
 * Manages formatting state, modals, comments, bookmarks, undo/redo,
 * and exposes helpers to send commands to the WebView editor.
 */

import type {
  DocumentAction,
  DocumentEditorState,
} from "@/src/types/editor.types";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type WebView from "react-native-webview";

// ── Initial state ──────────────────────────────────────────────────────────

const initialState: DocumentEditorState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  fontSize: 11,
  fontFamily: "Inter",
  highlightColor: null,
  textAlign: "left",
  lineSpacing: 1.15,
  title: "",
  wordCount: 0,
  charCount: 0,
  pageCount: 1,
  activeTab: "home",
  activeModal: null,
  comments: [],
  bookmarks: [],
  canUndo: false,
  canRedo: false,
};

// ── Reducer ────────────────────────────────────────────────────────────────

function documentReducer(
  state: DocumentEditorState,
  action: DocumentAction,
): DocumentEditorState {
  switch (action.type) {
    case "SET_FORMAT":
      return { ...state, [action.key]: action.value } as DocumentEditorState;
    case "SET_FORMATTING_STATE":
      return { ...state, ...action.payload };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_MODAL":
      return { ...state, activeModal: action.modal };
    case "UPDATE_COUNTS":
      return {
        ...state,
        wordCount: action.wordCount,
        charCount: action.charCount,
      };
    case "ADD_COMMENT":
      return { ...state, comments: [...state.comments, action.comment] };
    case "ADD_BOOKMARK":
      return { ...state, bookmarks: [...state.bookmarks, action.bookmark] };
    case "SET_UNDO_REDO":
      return {
        ...state,
        canUndo: action.canUndo,
        canRedo: action.canRedo,
      };
    case "SET_TITLE":
      return { ...state, title: action.title };
    default:
      return state;
  }
}

// ── Context shape ──────────────────────────────────────────────────────────

interface DocumentContextValue {
  state: DocumentEditorState;
  dispatch: React.Dispatch<DocumentAction>;
  webViewRef: React.RefObject<WebView | null>;
  /**
   * Send a formatting execCommand to the WebView editor.
   * Uses the bridge functions exposed in the editor HTML.
   */
  sendCommand: (command: string, value?: string | null) => void;
  /**
   * Inject arbitrary JavaScript into the WebView editor.
   * The code is wrapped in an IIFE for safety.
   */
  sendScript: (script: string) => void;
  /**
   * A mutable ref that stores the last HTML snapshot from the editor.
   * Used by the save flow.
   */
  lastHtmlRef: React.RefObject<string>;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

interface DocumentProviderProps {
  children: React.ReactNode;
  /** Optionally set an initial title (e.g. from route params). */
  initialTitle?: string;
}

export function DocumentProvider({
  children,
  initialTitle,
}: DocumentProviderProps) {
  const init: DocumentEditorState = initialTitle
    ? { ...initialState, title: initialTitle }
    : initialState;

  const [state, dispatch] = useReducer(documentReducer, init);
  const webViewRef = useRef<WebView | null>(null);
  const lastHtmlRef = useRef<string>("");

  const sendCommand = useCallback(
    (command: string, value: string | null = null) => {
      const script = value
        ? `editor.execCommand('${command}', false, '${value}'); true;`
        : `editor.execCommand('${command}', false, null); true;`;
      webViewRef.current?.injectJavaScript(script);
    },
    [],
  );

  const sendScript = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`(function(){ ${script} })(); true;`);
  }, []);

  const value = useMemo<DocumentContextValue>(
    () => ({
      state,
      dispatch,
      webViewRef,
      sendCommand,
      sendScript,
      lastHtmlRef,
    }),
    [state, dispatch, sendCommand, sendScript],
  );

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useDocument(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error("useDocument must be used within a DocumentProvider");
  }
  return ctx;
}
