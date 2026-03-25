/**
 * PDF Download Pipeline
 * ─────────────────────────────────────────────────────────────────────
 * Fault-tolerant download pipeline for PDF files:
 *
 *   Download → Verify headers → Save → Validate bytes → Ready
 *
 * Features:
 *   • HTTP redirect following & final-URL resolution
 *   • Content-Type header validation (rejects HTML masquerading as PDF)
 *   • Automatic retry (up to 3 attempts)
 *   • Post-download %PDF- magic byte validation
 *   • Progress reporting with "Verifying…" step
 *
 * This module is PDF-specific and does NOT affect EPUB, DOCX or other
 * file types.
 * ─────────────────────────────────────────────────────────────────────
 */

import * as FileSystem from "expo-file-system/legacy";

import {
    PdfValidationResult,
    validateContentType,
    validatePdfFile,
} from "@/services/pdfValidationService";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export type PdfDownloadPhase =
  | "idle"
  | "resolving"
  | "downloading"
  | "verifying"
  | "complete"
  | "error";

export interface PdfDownloadProgress {
  phase: PdfDownloadPhase;
  /** 0–1 fraction for the downloading phase. */
  downloadProgress: number;
  /** Total bytes expected (may be 0 if unknown). */
  totalBytes: number;
  /** Bytes downloaded so far. */
  downloadedBytes: number;
  /** Current attempt number (1-based). */
  attempt: number;
  /** Max attempts allowed. */
  maxAttempts: number;
}

export interface PdfDownloadResult {
  success: boolean;
  localUri?: string;
  fileSize?: number;
  /** Non-null when success is false. */
  error?: string;
  /** Validation details (warnings, diagnostics). */
  validationDetails?: string;
  /** The final resolved URL after redirects. */
  resolvedUrl?: string;
}

export interface PdfDownloadOptions {
  /** Source URL of the PDF. */
  url: string;
  /** Destination file URI to save to. */
  destinationUri: string;
  /** Progress callback. */
  onProgress?: (progress: PdfDownloadProgress) => void;
  /** Max number of retry attempts (default 3). */
  maxAttempts?: number;
  /** Whether to skip content-type pre-check (default false). */
  skipContentTypeCheck?: boolean;
  /** AbortSignal to cancel the download. */
  signal?: AbortSignal;
}

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

// ────────────────────────────────────────────────────────────────────
// Main Function
// ────────────────────────────────────────────────────────────────────

/**
 * Download a PDF with full pipeline:
 *   resolve URL → check headers → download → validate bytes.
 *
 * Retries automatically on failure up to `maxAttempts`.
 */
export async function downloadPdfWithPipeline(
  options: PdfDownloadOptions,
): Promise<PdfDownloadResult> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await singleAttempt(options, attempt, maxAttempts);

    if (result.success) {
      return result;
    }

    lastError = result.error ?? "Unknown error";

    // Don't retry if the problem is structural (HTML page, not a PDF)
    if (isNonRetryableError(lastError)) {
      return result;
    }

    // Wait before retrying
    if (attempt < maxAttempts) {
      await delay(RETRY_DELAY_MS * attempt);
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: `Download failed after ${maxAttempts} attempts. ${lastError}`,
  };
}

// ────────────────────────────────────────────────────────────────────
// Single Attempt
// ────────────────────────────────────────────────────────────────────

async function singleAttempt(
  options: PdfDownloadOptions,
  attempt: number,
  maxAttempts: number,
): Promise<PdfDownloadResult> {
  const { url, destinationUri, onProgress, skipContentTypeCheck } = options;

  const report = (
    phase: PdfDownloadPhase,
    extra: Partial<PdfDownloadProgress> = {},
  ) => {
    onProgress?.({
      phase,
      downloadProgress: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      attempt,
      maxAttempts,
      ...extra,
    });
  };

  try {
    // ── Phase 1: Resolve URL / Check headers ───────────────────
    report("resolving");

    let finalUrl = url;
    let resolvedUrl = url;

    if (!skipContentTypeCheck) {
      const headResult = await resolveAndCheckHeaders(url);
      if (!headResult.ok) {
        return {
          success: false,
          error: headResult.error,
          resolvedUrl: headResult.resolvedUrl,
        };
      }
      finalUrl = headResult.resolvedUrl ?? url;
      resolvedUrl = finalUrl;
    }

    // ── Phase 2: Download ──────────────────────────────────────
    report("downloading");

    // Clean up any previous partial file
    await FileSystem.deleteAsync(destinationUri, { idempotent: true });

    const downloadResumable = FileSystem.createDownloadResumable(
      finalUrl,
      destinationUri,
      {
        headers: {
          Accept: "application/pdf, */*",
          "User-Agent": "PDFlab/1.0",
        },
      },
      (dp) => {
        const progress =
          dp.totalBytesExpectedToWrite > 0
            ? dp.totalBytesWritten / dp.totalBytesExpectedToWrite
            : 0;
        report("downloading", {
          downloadProgress: progress,
          totalBytes: dp.totalBytesExpectedToWrite,
          downloadedBytes: dp.totalBytesWritten,
        });
      },
    );

    const downloadResult = await downloadResumable.downloadAsync();
    if (!downloadResult) {
      throw new Error("Download returned no result");
    }

    // ── Phase 3: Verify file ───────────────────────────────────
    report("verifying", {
      downloadProgress: 1,
      totalBytes: (downloadResult as any).totalBytesExpectedToWrite ?? 0,
      downloadedBytes: (downloadResult as any).totalBytesExpectedToWrite ?? 0,
    });

    const validation: PdfValidationResult = await validatePdfFile(
      downloadResult.uri,
    );

    if (!validation.valid) {
      // Delete invalid file
      await FileSystem.deleteAsync(destinationUri, { idempotent: true });
      return {
        success: false,
        error: validation.error ?? "Downloaded file is not a valid PDF.",
        validationDetails: validation.details,
        resolvedUrl,
      };
    }

    // ── Phase 4: Complete ──────────────────────────────────────
    report("complete", { downloadProgress: 1 });

    const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
    const fileSize = (fileInfo as any).size ?? 0;

    return {
      success: true,
      localUri: downloadResult.uri,
      fileSize,
      validationDetails: validation.details,
      resolvedUrl,
    };
  } catch (error) {
    // Clean up partial download
    try {
      await FileSystem.deleteAsync(destinationUri, { idempotent: true });
    } catch {}

    const msg = error instanceof Error ? error.message : String(error);
    report("error");
    return {
      success: false,
      error: msg,
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// URL Resolution & Header Check
// ────────────────────────────────────────────────────────────────────

interface HeaderCheckResult {
  ok: boolean;
  resolvedUrl?: string;
  error?: string;
}

/**
 * Follow redirects via a HEAD request and verify Content-Type.
 */
async function resolveAndCheckHeaders(url: string): Promise<HeaderCheckResult> {
  try {
    // Use fetch with redirect: "follow" to resolve the final URL.
    // A HEAD request is lighter, but some servers require GET for PDFs.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/pdf, */*",
        "User-Agent": "PDFlab/1.0",
      },
    });

    clearTimeout(timeout);

    const resolvedUrl = response.url || url;
    const contentType = response.headers.get("content-type");
    const ctCheck = validateContentType(contentType);

    if (!ctCheck.isPdf) {
      // Extract domain for user-friendly message
      const domain = extractDomain(resolvedUrl);
      return {
        ok: false,
        resolvedUrl,
        error: `Sorry, this link is a webpage and not a downloadable file.\n\nPlease visit: ${domain || resolvedUrl}`,
      };
    }

    return { ok: true, resolvedUrl };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // Check for common network errors
    if (
      errMsg.toLowerCase().includes("network") ||
      errMsg.toLowerCase().includes("fetch")
    ) {
      const domain = extractDomain(url);
      return {
        ok: false,
        resolvedUrl: url,
        error: `Sorry, this file is not available for download.\n\nPlease check your connection or visit: ${domain || url}`,
      };
    }

    // If HEAD fails, allow the download to proceed —
    // the file-level validation will catch bad files.
    console.warn(
      "[PdfDownloadPipeline] HEAD request failed, proceeding with download:",
      error,
    );
    return { ok: true, resolvedUrl: url };
  }
}

/**
 * Extract domain from URL for user-friendly error messages
 */
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function isNonRetryableError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("html page") ||
    lower.includes("web page") ||
    lower.includes("not a pdf") ||
    lower.includes("login") ||
    lower.includes("paywall")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
