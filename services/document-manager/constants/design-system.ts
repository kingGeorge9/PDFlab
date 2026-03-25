/**
 * Design System Constants
 * Professional-grade design tokens for the Document Manager module
 */

import { Platform } from "react-native";

// ============================================================================
// COLOR PALETTE
// ============================================================================
export const Palette = {
  // Primary brand colors
  primary: {
    50: "#E3F2FD",
    100: "#BBDEFB",
    200: "#90CAF9",
    300: "#64B5F6",
    400: "#42A5F5",
    500: "#2196F3",
    600: "#1E88E5",
    700: "#1976D2",
    800: "#1565C0",
    900: "#0D47A1",
  },

  // Accent colors
  accent: {
    purple: "#7C3AED",
    teal: "#14B8A6",
    orange: "#F59E0B",
    pink: "#EC4899",
  },

  // Semantic colors
  success: {
    light: "#D1FAE5",
    main: "#10B981",
    dark: "#059669",
  },
  warning: {
    light: "#FEF3C7",
    main: "#F59E0B",
    dark: "#D97706",
  },
  error: {
    light: "#FEE2E2",
    main: "#EF4444",
    dark: "#DC2626",
  },
  info: {
    light: "#DBEAFE",
    main: "#3B82F6",
    dark: "#2563EB",
  },

  // Neutral grays
  gray: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
  },

  // Pure colors
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",
};

// ============================================================================
// FILE TYPE COLORS & ICONS
// ============================================================================
export const FileTypeConfig: Record<
  string,
  { color: string; icon: string; label: string }
> = {
  // Documents
  pdf: { color: "#DC2626", icon: "picture-as-pdf", label: "PDF" },
  doc: { color: "#2563EB", icon: "description", label: "DOC" },
  docx: { color: "#2563EB", icon: "description", label: "DOCX" },
  txt: { color: "#6B7280", icon: "text-snippet", label: "TXT" },
  rtf: { color: "#6B7280", icon: "description", label: "RTF" },

  // E-books
  epub: { color: "#7C3AED", icon: "menu-book", label: "EPUB" },

  // Spreadsheets
  xls: { color: "#059669", icon: "table-chart", label: "XLS" },
  xlsx: { color: "#059669", icon: "table-chart", label: "XLSX" },
  csv: { color: "#059669", icon: "table-chart", label: "CSV" },

  // Presentations
  ppt: { color: "#EA580C", icon: "slideshow", label: "PPT" },
  pptx: { color: "#EA580C", icon: "slideshow", label: "PPTX" },

  // Images
  jpg: { color: "#7C3AED", icon: "image", label: "JPG" },
  jpeg: { color: "#7C3AED", icon: "image", label: "JPEG" },
  png: { color: "#7C3AED", icon: "image", label: "PNG" },
  gif: { color: "#7C3AED", icon: "image", label: "GIF" },
  svg: { color: "#7C3AED", icon: "image", label: "SVG" },
  webp: { color: "#7C3AED", icon: "image", label: "WEBP" },
  heic: { color: "#7C3AED", icon: "image", label: "HEIC" },

  // Video
  mp4: { color: "#DC2626", icon: "movie", label: "MP4" },
  mov: { color: "#DC2626", icon: "movie", label: "MOV" },
  avi: { color: "#DC2626", icon: "movie", label: "AVI" },
  mkv: { color: "#DC2626", icon: "movie", label: "MKV" },

  // Audio
  mp3: { color: "#EC4899", icon: "music-note", label: "MP3" },
  wav: { color: "#EC4899", icon: "music-note", label: "WAV" },
  aac: { color: "#EC4899", icon: "music-note", label: "AAC" },

  // Archives
  zip: { color: "#F59E0B", icon: "folder-zip", label: "ZIP" },
  rar: { color: "#F59E0B", icon: "folder-zip", label: "RAR" },
  "7z": { color: "#F59E0B", icon: "folder-zip", label: "7Z" },
  tar: { color: "#F59E0B", icon: "folder-zip", label: "TAR" },

  // Code
  js: { color: "#F59E0B", icon: "code", label: "JS" },
  ts: { color: "#3B82F6", icon: "code", label: "TS" },
  json: { color: "#6B7280", icon: "data-object", label: "JSON" },
  html: { color: "#EA580C", icon: "code", label: "HTML" },
  css: { color: "#3B82F6", icon: "code", label: "CSS" },

  // Default
  default: { color: "#6B7280", icon: "insert-drive-file", label: "FILE" },
  folder: { color: "#F59E0B", icon: "folder", label: "Folder" },
};

export const getFileTypeConfig = (filename: string, isDirectory?: boolean) => {
  if (isDirectory) return FileTypeConfig.folder;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return FileTypeConfig[ext] || FileTypeConfig.default;
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================
export const Typography = {
  // Font families
  fontFamily: Platform.select({
    ios: {
      regular: "System",
      medium: "System",
      semibold: "System",
      bold: "System",
    },
    android: {
      regular: "Roboto",
      medium: "Roboto-Medium",
      semibold: "Roboto-Medium",
      bold: "Roboto-Bold",
    },
    default: {
      regular: "System",
      medium: "System",
      semibold: "System",
      bold: "System",
    },
  }),

  // Font sizes
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 28,
    "4xl": 32,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Font weights
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
};

// ============================================================================
// SPACING
// ============================================================================
export const Spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
  "5xl": 64,
};

// ============================================================================
// BORDER RADIUS
// ============================================================================
export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  base: 10,
  lg: 12,
  xl: 16,
  "2xl": 20,
  full: 9999,
};

// ============================================================================
// SHADOWS
// ============================================================================
export const Shadows = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};

// ============================================================================
// LIGHT THEME
// ============================================================================
export const LightTheme = {
  background: {
    primary: Palette.white,
    secondary: Palette.gray[50],
    tertiary: Palette.gray[100],
  },
  surface: {
    primary: Palette.white,
    secondary: Palette.gray[50],
    elevated: Palette.white,
  },
  text: {
    primary: Palette.gray[900],
    secondary: Palette.gray[600],
    tertiary: Palette.gray[400],
    inverse: Palette.white,
  },
  border: {
    default: Palette.gray[300],
    light: Palette.gray[200],
    focus: Palette.primary[500],
  },
  action: {
    primary: Palette.primary[600],
    secondary: Palette.gray[100],
    danger: Palette.error.main,
  },
};

// ============================================================================
// DARK THEME
// ============================================================================
export const DarkTheme = {
  background: {
    primary: Palette.gray[900],
    secondary: Palette.gray[800],
    tertiary: Palette.gray[700],
  },
  surface: {
    primary: Palette.gray[800],
    secondary: Palette.gray[700],
    elevated: Palette.gray[700],
  },
  text: {
    primary: Palette.gray[50],
    secondary: Palette.gray[400],
    tertiary: Palette.gray[500],
    inverse: Palette.gray[900],
  },
  border: {
    default: Palette.gray[600],
    light: Palette.gray[700],
    focus: Palette.primary[400],
  },
  action: {
    primary: Palette.primary[500],
    secondary: Palette.gray[700],
    danger: Palette.error.main,
  },
};

// ============================================================================
// ANIMATION DURATIONS
// ============================================================================
export const AnimationDurations = {
  instant: 0,
  fast: 150,
  normal: 300,
  slow: 500,
};
