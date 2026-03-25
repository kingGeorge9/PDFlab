/**
 * PDF Viewer Utility
 * Cross-platform PDF URI normalization and file management
 */

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// ============================================================================
// CONSTANTS
// ============================================================================
const PDF_CACHE_DIR_NAME = 'pdf-viewer-cache';

// ============================================================================
// URI NORMALIZATION
// ============================================================================

/**
 * Normalize PDF URI for the current platform
 * - Android: Converts content:// URIs to file:// by copying to app storage
 * - Web: Returns the URI as-is (will be handled by pdf.js)
 */
export async function normalizePdfUri(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    // Web: return as-is, pdf.js will handle it
    return uri;
  }

  // Android: handle content:// URIs
  if (uri.startsWith('content://')) {
    return await copyToLocalStorage(uri);
  }

  // Already a file:// URI or local path
  return uri;
}

/**
 * Copy a file from content:// URI to app-controlled storage
 * Returns the new file:// URI
 */
async function copyToLocalStorage(contentUri: string): Promise<string> {
  const cacheDir = getPdfCacheDir();
  ensurePdfCacheDir();

  // Extract filename from URI or generate one
  const fileName = extractFileName(contentUri) || `pdf_${Date.now()}.pdf`;
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFileName = `${Date.now()}_${safeFileName}`;

  const sourceFile = new File(contentUri);
  const cachedFile = new File(cacheDir, uniqueFileName);

  try {
    await sourceFile.copy(cachedFile);
    return cachedFile.uri;
  } catch (error) {
    console.error('[PdfViewer] Failed to copy PDF to cache:', error);
    throw new Error('Failed to prepare PDF for viewing');
  }
}

/**
 * Get the PDF cache directory
 */
function getPdfCacheDir(): Directory {
  return new Directory(Paths.document, PDF_CACHE_DIR_NAME);
}

/**
 * Ensure the PDF cache directory exists
 */
function ensurePdfCacheDir(): void {
  const cacheDir = getPdfCacheDir();
  if (!cacheDir.exists) {
    // Check if a file with the same name exists and delete it
    const conflictingFile = new File(Paths.document, PDF_CACHE_DIR_NAME);
    if (conflictingFile.exists) {
      conflictingFile.delete();
    }
    cacheDir.create();
  }
}

/**
 * Extract filename from a URI
 */
function extractFileName(uri: string): string | null {
  try {
    const decoded = decodeURIComponent(uri);
    // Try to get filename from the URI path
    const parts = decoded.split(/[/\\]/);
    const lastPart = parts.pop();
    if (lastPart && lastPart.includes('.')) {
      return lastPart;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a URI points to a PDF file
 */
export function isPdfUri(uri: string): boolean {
  const lowerUri = uri.toLowerCase();
  return (
    lowerUri.endsWith('.pdf') ||
    lowerUri.includes('.pdf?') ||
    lowerUri.includes('application/pdf')
  );
}

/**
 * Clean up cached PDF files (call periodically or on app start)
 */
export async function clearPdfCache(): Promise<void> {
  try {
    const cacheDir = getPdfCacheDir();
    if (cacheDir.exists) {
      await cacheDir.delete();
    }
  } catch (error) {
    console.error('[PdfViewer] Failed to clear PDF cache:', error);
  }
}

/**
 * Get cached PDF URI if it exists and is still valid
 */
export function getCachedPdfUri(originalUri: string): string | null {
  try {
    const cacheDir = getPdfCacheDir();
    if (!cacheDir.exists) return null;

    // For now, we don't maintain a mapping, so return null
    // The caller should use normalizePdfUri which will create a new cache
    return null;
  } catch {
    return null;
  }
}
