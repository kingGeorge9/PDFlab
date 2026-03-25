/**
 * PDF Repair Service (Client)
 * ─────────────────────────────────────────────────────────────────────
 * Sends a local PDF file to the backend /pdf/repair-enhanced endpoint,
 * receives the repaired PDF, saves it locally, and re-validates.
 *
 * This module is PDF-specific and does NOT affect EPUB, DOCX or other
 * file types.
 * ─────────────────────────────────────────────────────────────────────
 */

import * as FileSystem from "expo-file-system/legacy";

import { API_BASE_URL } from "@/config/api";
import { validatePdfFile } from "@/services/pdfValidationService";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface PdfRepairResult {
  success: boolean;
  /** URI of the repaired file (if successful). */
  repairedUri?: string;
  /** The strategy that succeeded (qpdf / Ghostscript / pdf-lib). */
  strategy?: string;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const REPAIR_ENDPOINT = `${API_BASE_URL}/pdf/repair-enhanced`;
const UPLOAD_TIMEOUT_MS = 60_000;

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

/**
 * Attempt to repair a PDF via the backend.
 *
 * @param localUri      URI of the broken PDF on disk.
 * @param outputUri     (optional) Where to save the repaired file.
 *                      Defaults to `<original>_repaired.pdf`.
 */
export async function repairPdfViaBackend(
  localUri: string,
  outputUri?: string,
): Promise<PdfRepairResult> {
  const destination = outputUri ?? localUri.replace(/\.pdf$/i, "_repaired.pdf");

  try {
    // ── 1. Upload to backend ─────────────────────────────────────
    const uploadResult = await FileSystem.uploadAsync(
      REPAIR_ENDPOINT,
      localUri,
      {
        fieldName: "pdf",
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers: {
          Accept: "application/pdf",
        },
      },
    );

    if (uploadResult.status !== 200) {
      // Attempt to parse JSON error body
      let errorMsg = `Server returned status ${uploadResult.status}`;
      try {
        const body = JSON.parse(uploadResult.body);
        if (body.error) errorMsg = body.error;
        if (body.details) errorMsg += `: ${body.details}`;
      } catch {}
      return { success: false, error: errorMsg };
    }

    // ── 2. Save repaired file ────────────────────────────────────
    // uploadAsync with binary response — the body is base64 when
    // we request it, but we need the raw bytes as a file.
    // The response is already downloaded; we need to re-download
    // from the same endpoint or use the response blob.

    // Since expo's uploadAsync doesn't natively handle binary
    // downloads, we use a two-step approach: upload via uploadAsync
    // and if successful, download the repaired file via a separate
    // request with the same file.

    // Actually, FileSystem.uploadAsync returns the response body.
    // For binary PDFs, this comes back via the body string.
    // We write the base64-encoded body back to a file.

    // Check repair strategy from headers
    const strategy =
      uploadResult.headers?.["X-Repair-Strategy"] ??
      uploadResult.headers?.["x-repair-strategy"] ??
      "unknown";

    // The uploadAsync response body for binary content is base64-encoded
    // when the response is not text. We need to write it back.
    await FileSystem.writeAsStringAsync(destination, uploadResult.body, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // ── 3. Validate repaired file ────────────────────────────────
    const validation = await validatePdfFile(destination);
    if (!validation.valid) {
      await FileSystem.deleteAsync(destination, { idempotent: true });
      return {
        success: false,
        error: `Repair produced an invalid file: ${validation.error}`,
      };
    }

    return {
      success: true,
      repairedUri: destination,
      strategy: String(strategy),
    };
  } catch (error) {
    // Clean up
    try {
      await FileSystem.deleteAsync(destination, { idempotent: true });
    } catch {}

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to connect to repair service.",
    };
  }
}
