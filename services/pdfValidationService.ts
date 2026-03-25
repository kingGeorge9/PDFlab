/**
 * PDF Validation Service
 * ─────────────────────────────────────────────────────────────────────
 * Validates downloaded PDF files before rendering.
 *
 * Checks performed:
 *   1. Magic bytes (%PDF- header)
 *   2. Minimum file size (5 KB)
 *   3. %%EOF trailer (best-effort)
 *   4. Not an HTML page saved as .pdf
 *
 * This module is PDF-specific and does NOT affect EPUB, DOCX or other
 * file types.
 * ─────────────────────────────────────────────────────────────────────
 */

import * as FileSystem from "expo-file-system/legacy";

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

/** Minimum acceptable PDF size in bytes (5 KB). */
const MIN_PDF_SIZE_BYTES = 5 * 1024;

/** PDF magic header. */
const PDF_MAGIC = "%PDF-";

/** HTML indicators that signal a web page was saved as .pdf. */
const HTML_INDICATORS = [
  "<!doctype html",
  "<html",
  "<head",
  "<body",
  "<!DOCTYPE",
] as const;

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface PdfValidationResult {
  valid: boolean;
  error?: string;
  /** Human-readable details for logging / diagnostics. */
  details?: string;
  /**
   * True when the file is a valid but password-encrypted PDF.
   * The caller should show a password prompt instead of trying to render.
   */
  encrypted?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Core Validation
// ────────────────────────────────────────────────────────────────────

/**
 * Validate a local PDF file.
 *
 * @param fileUri  Absolute local file URI (file:// or bare path).
 * @returns        Validation result.
 */
export async function validatePdfFile(
  fileUri: string,
): Promise<PdfValidationResult> {
  try {
    // ── 1. File existence & size ──────────────────────────────────
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      return {
        valid: false,
        error: "File does not exist.",
        details: `Path: ${fileUri}`,
      };
    }

    const size = (info as any).size ?? 0;
    if (size < MIN_PDF_SIZE_BYTES) {
      return {
        valid: false,
        error: `File is too small (${formatBytes(size)}). It may be an incomplete download.`,
        details: `Size: ${size} bytes, minimum: ${MIN_PDF_SIZE_BYTES} bytes`,
      };
    }

    // ── 2. Read head (first 1024 bytes) ──────────────────────────
    const head = await readFileChunk(fileUri, 0, 1024);
    if (!head) {
      return {
        valid: false,
        error: "Unable to read file contents.",
        details: "readFileChunk returned null for head",
      };
    }

    // ── 3. PDF magic bytes ───────────────────────────────────────
    if (!head.startsWith(PDF_MAGIC)) {
      // Check if it is actually HTML
      const headLower = head.toLowerCase().trim();
      const isHtml = HTML_INDICATORS.some((tag) =>
        headLower.startsWith(tag.toLowerCase()),
      );

      if (isHtml) {
        return {
          valid: false,
          error:
            "This file is a web page, not a PDF. The source returned an HTML page instead of a PDF document.",
          details: "HTML content detected in file header",
        };
      }

      return {
        valid: false,
        error:
          "This file isn't a valid PDF. It may be corrupted or an incomplete download.",
        details: `Header starts with: ${head.substring(0, 20)}`,
      };
    }

    // ── 4. Encrypted PDF detection ───────────────────────────────
    // Encrypted PDFs are structurally valid but require a password.
    // Look for the /Encrypt entry which the PDF spec mandates in the
    // trailer dictionary of every encrypted document.  It typically
    // lives in the last few KB of the file.
    const encryptTail = await readFileTail(fileUri, size, 4096);
    if (encryptTail && encryptTail.includes("/Encrypt")) {
      return { valid: true, encrypted: true };
    }

    // ── 5. %%EOF check (best-effort) ─────────────────────────────
    const tail = await readFileTail(fileUri, size, 1024);
    if (tail) {
      const hasEof = tail.includes("%%EOF");
      if (!hasEof) {
        // Warn but don't fail — some valid PDFs omit trailing %%EOF
        return {
          valid: true,
          details:
            "Warning: %%EOF marker not found at end of file. File may be truncated.",
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: "Failed to validate PDF file.",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// Content-Type Validation (for download headers)
// ────────────────────────────────────────────────────────────────────

/**
 * Check whether a Content-Type header indicates a real PDF response.
 *
 * @param contentType  The Content-Type value from the HTTP response.
 * @returns            Object with `isPdf` flag and optional `reason`.
 */
export function validateContentType(contentType: string | null | undefined): {
  isPdf: boolean;
  reason?: string;
} {
  if (!contentType) {
    // No Content-Type — allow but treat as uncertain
    return { isPdf: true, reason: "No Content-Type header present" };
  }

  const ct = contentType.toLowerCase().trim();

  if (ct.startsWith("application/pdf") || ct.startsWith("application/x-pdf")) {
    return { isPdf: true };
  }

  if (ct.startsWith("text/html") || ct.startsWith("application/xhtml")) {
    return {
      isPdf: false,
      reason:
        "The server returned an HTML page instead of a PDF. This usually means the file requires login or is behind a paywall.",
    };
  }

  if (ct.startsWith("application/octet-stream")) {
    // Generic binary — allow, we'll validate the actual bytes later
    return { isPdf: true, reason: "Generic binary stream; will verify bytes" };
  }

  // Unknown content type — allow with warning
  return {
    isPdf: true,
    reason: `Unexpected Content-Type: ${contentType}. Will verify file bytes.`,
  };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Read the first `length` bytes of a file as a UTF-8 string.
 */
async function readFileChunk(
  uri: string,
  _offset: number,
  length: number,
): Promise<string | null> {
  try {
    // expo-file-system only supports reading entire files as string.
    // For header checking we read as base64 and decode.
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length,
      position: 0,
    });
    return base64ToUtf8(base64);
  } catch {
    // Fallback: read entire file as string (only for small files)
    try {
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return content.substring(0, length);
    } catch {
      return null;
    }
  }
}

/**
 * Read the last `length` bytes of a file.
 */
async function readFileTail(
  uri: string,
  fileSize: number,
  length: number,
): Promise<string | null> {
  try {
    const position = Math.max(0, fileSize - length);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length,
      position,
    });
    return base64ToUtf8(base64);
  } catch {
    return null;
  }
}

/**
 * Decode a base64 string to UTF-8.
 * Works in React Native without atob (uses manual decoding).
 */
function base64ToUtf8(base64: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");

  while (i < clean.length) {
    const b0 = chars.indexOf(clean[i++]);
    const b1 = chars.indexOf(clean[i++]);
    const b2 = chars.indexOf(clean[i++]);
    const b3 = chars.indexOf(clean[i++]);

    const byte1 = (b0 << 2) | (b1 >> 4);
    const byte2 = ((b1 & 15) << 4) | (b2 >> 2);
    const byte3 = ((b2 & 3) << 6) | b3;

    result += String.fromCharCode(byte1);
    if (b2 !== -1) result += String.fromCharCode(byte2);
    if (b3 !== -1) result += String.fromCharCode(byte3);
  }

  return result;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
