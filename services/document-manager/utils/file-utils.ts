/**
 * File Utilities
 * Helper functions for file operations, formatting, and MIME types
 */

// ============================================================================
// SIZE FORMATTING
// ============================================================================
export const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null) return "";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  // Show decimal for KB and above, but not for bytes
  if (i === 0) return `${bytes} B`;
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[i]}`;
};

// ============================================================================
// DATE/TIME FORMATTING
// ============================================================================
export const formatRelativeTime = (timestamp?: number): string => {
  if (!timestamp) return "";

  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(diff / 604800000);
  const months = Math.floor(diff / 2592000000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;

  // Fall back to formatted date
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatDateTime = (timestamp?: number): string => {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// ============================================================================
// MIME TYPE UTILITIES
// ============================================================================
const MIME_MAP: Record<string, string> = {
  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",

  // E-books
  epub: "application/epub+zip",

  // Spreadsheets
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ods: "application/vnd.oasis.opendocument.spreadsheet",

  // Presentations
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",

  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  heic: "image/heic",
  heif: "image/heif",

  // Video
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  webm: "video/webm",

  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  m4a: "audio/mp4",

  // Archives
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",

  // Code
  js: "text/javascript",
  ts: "text/typescript",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  xml: "application/xml",
};

const REVERSE_MIME_MAP: Record<string, string> = Object.entries(
  MIME_MAP,
).reduce(
  (acc, [ext, mime]) => {
    if (!acc[mime]) acc[mime] = ext;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Get MIME type from filename
 */
export const getMimeType = (filename: string): string => {
  const ext = getFileExtension(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
};

/**
 * Get extension from MIME type
 */
export const getExtensionFromMime = (mimeType: string): string => {
  return REVERSE_MIME_MAP[mimeType] || "";
};

// ============================================================================
// FILE NAME UTILITIES
// ============================================================================

/**
 * Get file extension (without dot)
 */
export const getFileExtension = (filename: string): string => {
  const parts = filename.split(".");
  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() || "";
  }
  return "";
};

/**
 * Get filename without extension
 */
export const getFileName = (filename: string): string => {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
};

/**
 * Get parent path from full path
 */
export const getParentPath = (path: string): string => {
  const parts = path.split(/[/\\]/).filter(Boolean);
  parts.pop();
  return parts.join("/");
};

/**
 * Truncate long paths for display
 */
export const truncatePath = (path: string, maxLength: number = 40): string => {
  if (path.length <= maxLength) return path;

  const parts = path.split(/[/\\]/);
  if (parts.length <= 2) return path.slice(-maxLength);

  const first = parts[0];
  const last = parts[parts.length - 1];
  const middle = "...";

  const combined = `${first}/${middle}/${last}`;
  if (combined.length <= maxLength) return combined;

  return `...${path.slice(-(maxLength - 3))}`;
};

// ============================================================================
// FILE VALIDATION
// ============================================================================

/**
 * Check if a URI is valid
 */
export const isValidFileUri = (uri: string): boolean => {
  if (!uri || typeof uri !== "string") return false;
  return (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("/") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  );
};

/**
 * Check if URI is a SAF (Storage Access Framework) URI
 */
export const isSafUri = (uri: string): boolean => {
  return uri.startsWith("content://");
};

// ============================================================================
// FILE CATEGORIZATION
// ============================================================================

export type FileCategory =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "other";

/**
 * Get file category from extension or MIME type
 */
export const getFileCategory = (filename: string): FileCategory => {
  const ext = getFileExtension(filename).toLowerCase();

  // Documents
  if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(ext))
    return "document";

  // Spreadsheets
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "spreadsheet";

  // Presentations
  if (["ppt", "pptx", "odp"].includes(ext)) return "presentation";

  // Images
  if (
    [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "bmp",
      "svg",
      "webp",
      "heic",
      "heif",
      "ico",
    ].includes(ext)
  )
    return "image";

  // Video
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";

  // Audio
  if (["mp3", "wav", "aac", "m4a"].includes(ext)) return "audio";

  // Archives
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";

  // Code
  if (
    [
      "js",
      "ts",
      "json",
      "html",
      "css",
      "xml",
      "py",
      "java",
      "c",
      "cpp",
      "swift",
    ].includes(ext)
  )
    return "code";

  return "other";
};

// ============================================================================
// SEARCH UTILITIES
// ============================================================================

/**
 * Check if file matches search query
 */
export const fileMatchesSearch = (filename: string, query: string): boolean => {
  if (!query.trim()) return true;

  const normalizedQuery = query.toLowerCase().trim();
  const normalizedFilename = filename.toLowerCase();

  // Split query into words
  const queryWords = normalizedQuery.split(/\s+/);

  // Check if all words are contained in filename
  return queryWords.every((word) => normalizedFilename.includes(word));
};
