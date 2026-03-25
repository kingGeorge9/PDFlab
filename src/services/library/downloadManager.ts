/**
 * Download Manager - Handles file downloads and storage
 * Downloads files to persistent app storage
 * Provides progress tracking, duplicate detection, and file management
 */

import {
    downloadPdfWithPipeline,
    PdfDownloadProgress,
} from "@/services/pdfDownloadPipeline";
import {
    DownloadItem,
    DownloadOption,
    DownloadProgress,
    SearchResult,
} from "@/src/types/library.types";
import * as FileSystem from "expo-file-system/legacy";

class DownloadManager {
  private downloadDir: string;
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void>;
  private activeDownloads: Map<string, FileSystem.DownloadResumable>;

  constructor() {
    this.downloadDir = `${FileSystem.documentDirectory}downloads/`;
    this.progressCallbacks = new Map();
    this.activeDownloads = new Map();
    this.ensureDownloadDirectory();
  }

  /**
   * Ensure the downloads directory exists
   */
  private async ensureDownloadDirectory(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.downloadDir, {
          intermediates: true,
        });
      }
    } catch (error) {
      console.error("Error creating download directory:", error);
    }
  }

  /**
   * Sanitize filename to be filesystem-safe
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-z0-9_\-\.]/gi, "_")
      .replace(/_{2,}/g, "_")
      .substring(0, 200); // max filename length
  }

  /**
   * Generate unique filename with source prefix
   */
  private generateFilename(
    result: SearchResult,
    option: DownloadOption,
  ): string {
    const ext = option.type === "pdf" ? "pdf" : "epub";
    const title = this.sanitizeFilename(result.title);
    const sourceId = this.sanitizeFilename(result.id);
    return `${result.source}_${sourceId}_${title}.${ext}`;
  }

  /**
   * Download a file from a search result.
   * PDF files go through the fault-tolerant pipeline (header check,
   * redirect resolution, retry, post-download validation).
   * EPUB files use the original direct download path.
   */
  async download(
    result: SearchResult,
    option: DownloadOption,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<DownloadItem> {
    await this.ensureDownloadDirectory();

    const filename = this.generateFilename(result, option);
    const localUri = `${this.downloadDir}${filename}`;

    // Check if already downloaded
    const existingFile = await FileSystem.getInfoAsync(localUri);
    if (existingFile.exists) {
      console.log("File already exists, returning existing download");
      return this.createDownloadItem(
        result,
        option,
        localUri,
        existingFile.size || 0,
      );
    }

    // Create unique ID for this download
    const downloadId = `${result.source}_${result.id}`;

    // ── PDF: use fault-tolerant pipeline ──────────────────────
    if (option.type === "pdf") {
      return this.downloadPdfWithPipeline(
        result,
        option,
        localUri,
        downloadId,
        onProgress,
      );
    }

    // ── EPUB (or other): original direct download ────────────
    return this.downloadDirect(
      result,
      option,
      localUri,
      downloadId,
      onProgress,
    );
  }

  /**
   * PDF download via the fault-tolerant pipeline.
   */
  private async downloadPdfWithPipeline(
    result: SearchResult,
    option: DownloadOption,
    localUri: string,
    downloadId: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<DownloadItem> {
    const abortController = new AbortController();

    // Store a way to cancel PDF downloads
    // Since we can't store the actual downloadResumable, we store a cancel function
    this.activeDownloads.set(downloadId, {
      pauseAsync: async () => {
        abortController.abort();
      },
    } as any);

    try {
      const pipelineResult = await downloadPdfWithPipeline({
        url: option.url,
        destinationUri: localUri,
        maxAttempts: 3,
        signal: abortController.signal,
        onProgress: (p: PdfDownloadProgress) => {
          if (onProgress) {
            onProgress({
              id: downloadId,
              progress: p.downloadProgress,
              totalBytes: p.totalBytes,
              downloadedBytes: p.downloadedBytes,
            });
          }
        },
      });

      if (!pipelineResult.success) {
        throw new Error(
          pipelineResult.error ?? "PDF download failed validation.",
        );
      }

      // Clean up
      this.activeDownloads.delete(downloadId);

      return this.createDownloadItem(
        result,
        option,
        pipelineResult.localUri!,
        pipelineResult.fileSize ?? 0,
      );
    } catch (error) {
      // Clean up
      this.activeDownloads.delete(downloadId);

      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {}

      // Check if this was a user cancellation
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (
        errorMsg.includes("cancelled") ||
        errorMsg.includes("canceled") ||
        errorMsg.includes("abort")
      ) {
        throw new Error("Download cancelled by user");
      }

      throw new Error(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Original direct download path (used for EPUB and non-PDF files).
   */
  private async downloadDirect(
    result: SearchResult,
    option: DownloadOption,
    localUri: string,
    downloadId: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<DownloadItem> {
    // Set up progress callback
    if (onProgress) {
      this.progressCallbacks.set(downloadId, onProgress);
    }

    try {
      // Create downloadable callback for progress
      const downloadResumable = FileSystem.createDownloadResumable(
        option.url,
        localUri,
        {},
        (downloadProgress) => {
          const progress: DownloadProgress = {
            id: downloadId,
            progress:
              downloadProgress.totalBytesWritten /
              downloadProgress.totalBytesExpectedToWrite,
            totalBytes: downloadProgress.totalBytesExpectedToWrite,
            downloadedBytes: downloadProgress.totalBytesWritten,
          };

          const callback = this.progressCallbacks.get(downloadId);
          if (callback) {
            callback(progress);
          }
        },
      );

      // Store the resumable download for potential cancellation
      this.activeDownloads.set(downloadId, downloadResumable);

      const downloadResult = await downloadResumable.downloadAsync();

      if (!downloadResult) {
        throw new Error("Download failed - no result returned");
      }

      // Clean up
      this.progressCallbacks.delete(downloadId);
      this.activeDownloads.delete(downloadId);

      // Get file size
      const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
      const fileSize = fileInfo.exists ? fileInfo.size || 0 : 0;

      return this.createDownloadItem(
        result,
        option,
        downloadResult.uri,
        fileSize,
      );
    } catch (error) {
      // Clean up on error
      this.progressCallbacks.delete(downloadId);
      this.activeDownloads.delete(downloadId);

      // Try to delete partial file
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch (deleteError) {
        console.error("Error deleting partial file:", deleteError);
      }

      // Check if this was a user cancellation
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("cancelled") || errorMsg.includes("canceled")) {
        throw new Error("Download cancelled by user");
      }

      throw new Error(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(downloadId: string): Promise<void> {
    const resumable = this.activeDownloads.get(downloadId);
    if (resumable) {
      try {
        await resumable.pauseAsync();
        this.activeDownloads.delete(downloadId);
        this.progressCallbacks.delete(downloadId);

        // The pauseAsync doesn't fully delete, so we need to clean up manually
        // The download path should be handled by the download method's error cleanup
      } catch (error) {
        console.error("Error cancelling download:", error);
      }
    }
  }

  /**
   * Create DownloadItem from search result and downloaded file
   */
  private createDownloadItem(
    result: SearchResult,
    option: DownloadOption,
    localUri: string,
    fileSize: number,
  ): DownloadItem {
    return {
      id: `${result.source}_${result.id}`,
      source: result.source,
      sourceId: result.id,
      title: result.title,
      authors: result.authors,
      fileType: option.type,
      originalUrl: option.url,
      localUri,
      fileSize,
      createdAt: Date.now(),
      coverUrl: result.coverUrl,
    };
  }

  /**
   * Delete a downloaded file
   */
  async deleteDownload(item: DownloadItem): Promise<void> {
    try {
      await FileSystem.deleteAsync(item.localUri, { idempotent: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  }

  /**
   * Get file info (check if exists, get size)
   */
  async getFileInfo(uri: string): Promise<FileSystem.FileInfo> {
    return await FileSystem.getInfoAsync(uri);
  }

  /**
   * Check if a file exists locally
   */
  async fileExists(uri: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Share a downloaded file
   */
  async shareFile(item: DownloadItem): Promise<void> {
    try {
      const Sharing = await import("expo-sharing");
      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        await Sharing.shareAsync(item.localUri, {
          mimeType:
            item.fileType === "pdf"
              ? "application/pdf"
              : "application/epub+zip",
          dialogTitle: `Share ${item.title}`,
        });

        // Add shared tag to the file in unified index
        const { addSourceTag, getFileByUri } =
          await import("@/services/fileIndexService");
        const fileRecord = await getFileByUri(item.localUri);
        if (fileRecord) {
          addSourceTag(fileRecord.id, "shared").catch(console.error);
        }
      } else {
        throw new Error("Sharing is not available on this device");
      }
    } catch (error) {
      console.error("Error sharing file:", error);
      throw error;
    }
  }

  /**
   * Get the downloads directory path
   */
  getDownloadDirectory(): string {
    return this.downloadDir;
  }
}

// Export singleton instance
export const downloadManager = new DownloadManager();
