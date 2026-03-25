/**
 * Unified File Opener
 * ─────────────────────────────────────────────────────────────────────
 * Single entry-point for opening any file from any screen.
 *
 * Routes by type:
 *   PDF  → /pdf-viewer
 *   DOCX → /docx-viewer
 *   EPUB → /epub-viewer  (internal — never "share to open externally")
 *   Image → /image-viewer
 *   Other → system app or file-details
 *
 * Usage:
 *   import { openFile } from "@/utils/openFile";
 *   openFile(router, { uri, name, type, mimeType, extension });
 * ─────────────────────────────────────────────────────────────────────
 */

import { Router } from "expo-router";

import {
    openWithSystemApp,
    showOpenFailedAlert,
} from "@/services/document-manager";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface OpenFileParams {
  uri: string;
  name: string;
  /** Unified type label: "pdf" | "word" | "epub" | "image" | etc. */
  type?: string;
  mimeType?: string;
  /** File extension without dot, e.g. "pdf", "epub". */
  extension?: string;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function getExtension(params: OpenFileParams): string {
  if (params.extension) return params.extension.toLowerCase();
  const match = params.uri?.match(/\.([a-zA-Z0-9]+)$/);
  if (match) return match[1].toLowerCase();
  if (params.name) {
    const nameMatch = params.name.match(/\.([a-zA-Z0-9]+)$/);
    if (nameMatch) return nameMatch[1].toLowerCase();
  }
  return "";
}

function isPdf(ext: string, type?: string, mime?: string): boolean {
  return ext === "pdf" || type === "pdf" || mime === "application/pdf";
}

function isDocx(ext: string, type?: string): boolean {
  return ext === "docx" || ext === "doc" || type === "word" || type === "docx";
}

function isEpub(ext: string, type?: string, mime?: string): boolean {
  return ext === "epub" || type === "epub" || mime === "application/epub+zip";
}

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "bmp",
  "tiff",
]);

function isImage(ext: string, type?: string, mime?: string): boolean {
  return (
    IMAGE_EXTENSIONS.has(ext) ||
    type === "image" ||
    (mime?.startsWith("image/") ?? false)
  );
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

/**
 * Open a file in the appropriate in-app viewer.
 *
 * @returns `true` if routed to an in-app viewer, `false` if fell
 *          through to system app or was un-openable.
 */
export function openFile(router: Router, params: OpenFileParams): boolean {
  const ext = getExtension(params);

  if (isPdf(ext, params.type, params.mimeType)) {
    router.push({
      pathname: "/pdf-viewer",
      params: { uri: params.uri, name: params.name },
    });
    return true;
  }

  if (isDocx(ext, params.type)) {
    (router as any).push({
      pathname: "/docx-viewer",
      params: { uri: params.uri, name: params.name },
    });
    return true;
  }

  if (isEpub(ext, params.type, params.mimeType)) {
    router.push({
      pathname: "/epub-viewer",
      params: { uri: params.uri, name: params.name },
    });
    return true;
  }

  if (isImage(ext, params.type, params.mimeType)) {
    router.push({
      pathname: "/image-viewer",
      params: {
        uri: params.uri,
        name: params.name,
        type: params.mimeType || "image/jpeg",
      },
    });
    return true;
  }

  // Fallback → system app
  openWithSystemApp({
    uri: params.uri,
    displayName: params.name,
    mimeType: params.mimeType,
  }).then((result) => {
    if (!result.success) {
      showOpenFailedAlert(params.name, result.error);
    }
  });
  return false;
}
