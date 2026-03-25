/**
 * editor.types.ts
 *
 * Type definitions for the WPS-style document editor.
 */

// ── Formatting marks ───────────────────────────────────────────────────────

export type TextAlign = "left" | "center" | "right" | "justify";

export interface FormattingState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  fontSize: number;
  fontFamily: string;
  highlightColor: string | null;
  textAlign: TextAlign;
  lineSpacing: number;
}

// ── Toolbar ────────────────────────────────────────────────────────────────

export type EditorTab = "home" | "insert";

export type ModalType =
  | "picture"
  | "signature"
  | "comment"
  | "datetime"
  | "hyperlink"
  | "bookmark"
  | "attachment"
  | "table"
  | null;

// ── Insert items ───────────────────────────────────────────────────────────

export type ShapeType = "rectangle" | "circle" | "line" | "arrow";

export interface InsertItem {
  key: string;
  icon: string;
  label: string;
  sub: string | null;
}

// ── Comments & Bookmarks ───────────────────────────────────────────────────

export interface EditorComment {
  id: string;
  text: string;
  date: string;
}

export interface EditorBookmark {
  id: string;
  name: string;
}

// ── Document state (context) ───────────────────────────────────────────────

export interface DocumentEditorState extends FormattingState {
  title: string;
  wordCount: number;
  charCount: number;
  pageCount: number;
  activeTab: EditorTab;
  activeModal: ModalType;
  comments: EditorComment[];
  bookmarks: EditorBookmark[];
  canUndo: boolean;
  canRedo: boolean;
}

// ── Reducer actions ────────────────────────────────────────────────────────

export type DocumentAction =
  | {
      type: "SET_FORMAT";
      key: keyof FormattingState;
      value: string | number | boolean | null;
    }
  | { type: "SET_FORMATTING_STATE"; payload: Partial<FormattingState> }
  | { type: "SET_ACTIVE_TAB"; tab: EditorTab }
  | { type: "SET_MODAL"; modal: ModalType }
  | { type: "UPDATE_COUNTS"; wordCount: number; charCount: number }
  | { type: "ADD_COMMENT"; comment: EditorComment }
  | { type: "ADD_BOOKMARK"; bookmark: EditorBookmark }
  | { type: "SET_UNDO_REDO"; canUndo: boolean; canRedo: boolean }
  | { type: "SET_TITLE"; title: string };

// ── WebView messages (from editor → RN) ────────────────────────────────────

export type EditorWebViewMessage =
  | { type: "CONTENT_CHANGE"; wordCount: number; charCount: number }
  | {
      type: "SELECTION_STATE";
      bold: boolean;
      italic: boolean;
      underline: boolean;
      strikethrough: boolean;
      align: TextAlign;
    }
  | { type: "UNDO_REDO"; canUndo: boolean; canRedo: boolean }
  | { type: "CONTENT"; html: string; text: string }
  | { type: "SAVE_CONTENT"; html: string }
  | { type: "EDITOR_FOCUS" };

// ── Fonts & sizes ──────────────────────────────────────────────────────────

export const EDITOR_FONTS = [
  { label: "Inter", value: "Inter", nativeName: "Inter_400Regular" },
  { label: "Roboto", value: "Roboto", nativeName: "Roboto_400Regular" },
  { label: "Open Sans", value: "Open Sans", nativeName: "OpenSans_400Regular" },
  { label: "Lato", value: "Lato", nativeName: "Lato_400Regular" },
  {
    label: "Montserrat",
    value: "Montserrat",
    nativeName: "Montserrat_400Regular",
  },
  {
    label: "Merriweather",
    value: "Merriweather",
    nativeName: "Merriweather_400Regular",
  },
  { label: "Poppins", value: "Poppins", nativeName: "Poppins_400Regular" },
] as const;

export const EDITOR_FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72,
] as const;

export const EDITOR_HIGHLIGHT_COLORS = [
  { color: "#FFFF00", label: "Yellow" },
  { color: "#00FF00", label: "Green" },
  { color: "#00FFFF", label: "Cyan" },
  { color: "#FF69B4", label: "Pink" },
  { color: "#FFA500", label: "Orange" },
  { color: "#FF0000", label: "Red" },
] as const;

export const LINE_SPACINGS = [
  { label: "Single", value: 1 },
  { label: "1.15 (Default)", value: 1.15 },
  { label: "1.5", value: 1.5 },
  { label: "Double", value: 2 },
  { label: "2.5", value: 2.5 },
  { label: "Triple", value: 3 },
] as const;

export const INSERT_ITEMS: InsertItem[] = [
  { key: "picture", icon: "🖼️", label: "Picture", sub: "Gallery" },
  { key: "table", icon: "▦", label: "Table", sub: null },
  { key: "textbox", icon: "🔤", label: "Text Box", sub: null },
  { key: "signature", icon: "✍️", label: "Signature", sub: null },
  { key: "comment", icon: "💬", label: "Comment", sub: null },
  { key: "datetime", icon: "🕐", label: "Date & Time", sub: null },
  { key: "hyperlink", icon: "🔗", label: "Hyperlink", sub: null },
  { key: "bookmark", icon: "🔖", label: "Bookmark", sub: null },
  { key: "attachment", icon: "📎", label: "Attachment", sub: null },
  { key: "blankpage", icon: "📄", label: "Blank Page", sub: "Portrait" },
];
