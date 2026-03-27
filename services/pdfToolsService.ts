/**
 * PDF Tools Service
 * Handles all PDF processing operations via the backend API
 */

import { API_BASE_URL, API_ENDPOINTS } from "@/config/api";
import { upsertFileRecord } from "@/services/fileIndexService";
import * as FileSystem from "expo-file-system/legacy";

// ============================================================================
// TYPES
// ============================================================================

export interface ToolProcessingOptions {
  /** Tool ID */
  toolId: string;
  /** File URI */
  fileUri: string;
  /** File name */
  fileName: string;
  /** File MIME type */
  fileMimeType: string;
  /** Additional files for merge */
  additionalFiles?: Array<{ uri: string; name: string; mimeType: string }>;
  /** Tool-specific parameters */
  params?: Record<string, any>;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface ProcessingResult {
  success: boolean;
  /** Output file URI (local path) */
  outputUri?: string;
  /** Output file name */
  outputFileName?: string;
  /** Output file type */
  outputType?: string;
  /** Multiple output files (for split, to-images, etc.) */
  outputFiles?: Array<{ uri: string; name: string; type: string }>;
  /** Error message if failed */
  error?: string;
  /** Processing message */
  message?: string;
  /** JSON data for info/search/validate/extract-data/diff/ocr tools */
  jsonData?: any;
}

export interface ToolEndpointConfig {
  endpoint: string;
  outputExtension: string;
  outputMimeType: string;
  multipleOutputs?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REQUEST_TIMEOUT = 300000; // 5 minutes for large files
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

// Output directory for processed files
const OUTPUT_DIR = `${FileSystem.documentDirectory}processed-files/`;

// Tools that modify the original file in-place (no duplicate created)
const IN_PLACE_TOOLS = ["protect", "unlock", "encrypt"];

// Tool to endpoint mapping
const TOOL_ENDPOINTS: Record<string, ToolEndpointConfig> = {
  // Organize tools
  merge: {
    endpoint: API_ENDPOINTS.PDF.MERGE,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  split: {
    endpoint: API_ENDPOINTS.PDF.SPLIT,
    outputExtension: "json",
    outputMimeType: "application/json",
    multipleOutputs: true,
  },
  remove: {
    endpoint: API_ENDPOINTS.PDF.REMOVE_PAGES,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  extract: {
    endpoint: API_ENDPOINTS.PDF.EXTRACT_PAGES,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  organize: {
    endpoint: API_ENDPOINTS.PDF.ORGANIZE,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  reverse: {
    endpoint: API_ENDPOINTS.PDF.REVERSE,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  duplicate: {
    endpoint: API_ENDPOINTS.PDF.DUPLICATE,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  // Optimize tools
  compress: {
    endpoint: API_ENDPOINTS.PDF.COMPRESS,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  repair: {
    endpoint: API_ENDPOINTS.PDF.REPAIR,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "optimize-images": {
    endpoint: API_ENDPOINTS.PDF.OPTIMIZE_IMAGES,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "remove-duplicates": {
    endpoint: API_ENDPOINTS.PDF.REMOVE_DUPLICATES,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  // Convert to PDF
  "jpg-to-pdf": {
    endpoint: API_ENDPOINTS.CONVERT.IMAGES_TO_PDF,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "png-to-pdf": {
    endpoint: API_ENDPOINTS.CONVERT.IMAGES_TO_PDF,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "word-to-pdf": {
    endpoint: API_ENDPOINTS.CONVERT.WORD_TO_PDF,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "ppt-to-pdf": {
    endpoint: API_ENDPOINTS.CONVERT.PPT_TO_PDF,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "excel-to-pdf": {
    endpoint: API_ENDPOINTS.CONVERT.EXCEL_TO_PDF,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "html-to-pdf": {
    endpoint: API_ENDPOINTS.CONVERT.HTML_TO_PDF,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "text-to-pdf": {
    endpoint: API_ENDPOINTS.CONVERT.TEXT_TO_PDF,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  // Convert from PDF
  "pdf-to-jpg": {
    endpoint: API_ENDPOINTS.CONVERT.PDF_TO_JPG,
    outputExtension: "zip",
    outputMimeType: "application/zip",
    multipleOutputs: true,
  },
  "pdf-to-png": {
    endpoint: API_ENDPOINTS.CONVERT.PDF_TO_PNG,
    outputExtension: "zip",
    outputMimeType: "application/zip",
    multipleOutputs: true,
  },
  "pdf-to-word": {
    endpoint: API_ENDPOINTS.CONVERT.PDF_TO_WORD,
    outputExtension: "docx",
    outputMimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  "pdf-to-text": {
    endpoint: API_ENDPOINTS.CONVERT.PDF_TO_TEXT,
    outputExtension: "txt",
    outputMimeType: "text/plain",
  },
  "pdf-to-html": {
    endpoint: API_ENDPOINTS.CONVERT.PDF_TO_HTML,
    outputExtension: "html",
    outputMimeType: "text/html",
  },
  "pdf-to-ppt": {
    endpoint: API_ENDPOINTS.CONVERT.PDF_TO_PPT,
    outputExtension: "pptx",
    outputMimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  "pdf-to-excel": {
    endpoint: API_ENDPOINTS.CONVERT.PDF_TO_EXCEL,
    outputExtension: "xlsx",
    outputMimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },

  // Edit tools
  rotate: {
    endpoint: API_ENDPOINTS.PDF.ROTATE,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  crop: {
    endpoint: API_ENDPOINTS.PDF.CROP,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  watermark: {
    endpoint: API_ENDPOINTS.PDF.WATERMARK,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "page-numbers": {
    endpoint: API_ENDPOINTS.PDF.PAGE_NUMBERS,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  annotate: {
    endpoint: `${API_BASE_URL}/pdf/annotate`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "add-text": {
    endpoint: `${API_BASE_URL}/pdf/add-text`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "add-stamps": {
    endpoint: `${API_BASE_URL}/pdf/stamp`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "header-footer": {
    endpoint: `${API_BASE_URL}/header-footer`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  resize: {
    endpoint: `${API_BASE_URL}/pdf/resize`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  // Security tools
  protect: {
    endpoint: API_ENDPOINTS.PDF.PROTECT,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  unlock: {
    endpoint: API_ENDPOINTS.PDF.UNLOCK,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  redact: {
    endpoint: API_ENDPOINTS.PDF.REDACT,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  flatten: {
    endpoint: API_ENDPOINTS.PDF.FLATTEN,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  encrypt: {
    endpoint: `${API_BASE_URL}/pdf/encrypt`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  decrypt: {
    endpoint: `${API_BASE_URL}/pdf/decrypt`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  // Compare tools
  compare: {
    endpoint: API_ENDPOINTS.PDF.COMPARE,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  diff: {
    endpoint: `${API_BASE_URL}/pdf/diff`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  "merge-review": {
    endpoint: `${API_BASE_URL}/pdf/merge-review`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  // Forms tools
  "fill-form": {
    endpoint: `${API_BASE_URL}/pdf/fill-form`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "extract-data": {
    endpoint: `${API_BASE_URL}/pdf/extract-data`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },

  // Advanced tools
  ocr: {
    endpoint: API_ENDPOINTS.PDF.OCR,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "black-white": {
    endpoint: `${API_BASE_URL}/pdf/black-white`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "fix-orientation": {
    endpoint: `${API_BASE_URL}/pdf/fix-orientation`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "remove-blank": {
    endpoint: `${API_BASE_URL}/pdf/remove-blank`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  bookmarks: {
    endpoint: `${API_BASE_URL}/pdf/bookmarks`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  hyperlinks: {
    endpoint: `${API_BASE_URL}/pdf/hyperlinks`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  attachments: {
    endpoint: `${API_BASE_URL}/pdf/attachments`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },

  // Info & Validation tools (JSON response)
  info: {
    endpoint: `${API_BASE_URL}/pdf/info`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  metadata: {
    endpoint: `${API_BASE_URL}/pdf/metadata`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  search: {
    endpoint: `${API_BASE_URL}/pdf/search`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  validate: {
    endpoint: `${API_BASE_URL}/pdf/validate`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },

  // Read Aloud (client-side TTS, no backend file output)
  "read-aloud": {
    endpoint: `${API_BASE_URL}/document/extract-text`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },

  // New tools (these use dedicated screens but are registered for isToolSupported)
  "extract-images": {
    endpoint: `${API_BASE_URL}/extract-images`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  "batch-compress": {
    endpoint: `${API_BASE_URL}/batch-compress`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  "find-replace": {
    endpoint: `${API_BASE_URL}/find-replace`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  "qr-code": {
    endpoint: `${API_BASE_URL}/qrcode`,
    outputExtension: "pdf",
    outputMimeType: "application/pdf",
  },
  "highlight-export": {
    endpoint: `${API_BASE_URL}/highlight-export`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
  "citation-extractor": {
    endpoint: `${API_BASE_URL}/citations/extract`,
    outputExtension: "json",
    outputMimeType: "application/json",
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Initialize the output directory
 */
async function initializeOutputDir(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(OUTPUT_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(OUTPUT_DIR, { intermediates: true });
      console.log("[PdfTools] Created output directory:", OUTPUT_DIR);
    }
  } catch (error) {
    console.error("[PdfTools] Error creating output directory:", error);
    throw new Error("Failed to initialize storage");
  }
}

/**
 * Generate a unique output filename
 */
function generateOutputFileName(
  originalName: string,
  toolId: string,
  extension: string,
): string {
  const timestamp = Date.now();
  const safeName = originalName || "document";
  const baseName = safeName.replace(/\.[^/.]+$/, ""); // Remove extension
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, "_");

  // Android/Linux max filename is 255 bytes. Keep the suffix short and
  // truncate the base name so the total never exceeds the limit.
  const suffix = `_${toolId}_${timestamp}.${extension}`;
  const maxBaseLen = 255 - suffix.length;
  const trimmedBase =
    sanitizedBaseName.length > maxBaseLen
      ? sanitizedBaseName.substring(0, maxBaseLen)
      : sanitizedBaseName;
  return `${trimmedBase}${suffix}`;
}

/**
 * Check file size
 */
async function checkFileSize(uri: string): Promise<number> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error("File not found");
    }
    return (fileInfo as any).size || 0;
  } catch (error) {
    console.error("[PdfTools] Error checking file size:", error);
    return 0;
  }
}

/**
 * Get the tool configuration
 */
export function getToolConfig(toolId: string): ToolEndpointConfig | null {
  return TOOL_ENDPOINTS[toolId] || null;
}

/**
 * Check if a tool is supported
 */
export function isToolSupported(toolId: string): boolean {
  return toolId in TOOL_ENDPOINTS;
}

/**
 * Get list of supported tools
 */
export function getSupportedTools(): string[] {
  return Object.keys(TOOL_ENDPOINTS);
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process a file with the specified tool
 */
export async function processWithTool(
  options: ToolProcessingOptions,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  const {
    toolId,
    fileUri,
    fileName,
    fileMimeType,
    additionalFiles,
    params,
    signal,
  } = options;

  console.log(`[PdfTools] Processing ${toolId} for file: ${fileName}`);
  console.log(`[PdfTools] Backend URL: ${API_BASE_URL}`);

  // Quick connectivity pre-check (5 s timeout)
  try {
    const hc = new AbortController();
    const hcTimer = setTimeout(() => hc.abort(), 5000);
    const hcResp = await fetch(API_BASE_URL.replace("/api", "/api/health"), {
      signal: hc.signal,
    });
    clearTimeout(hcTimer);
    if (!hcResp.ok)
      console.warn("[PdfTools] Health check returned", hcResp.status);
  } catch {
    console.warn(
      "[PdfTools] Backend unreachable at",
      API_BASE_URL,
      "— continuing anyway",
    );
  }

  // Initialize output directory
  await initializeOutputDir();

  // Get tool configuration
  const toolConfig = getToolConfig(toolId);
  if (!toolConfig) {
    return {
      success: false,
      error: `Tool "${toolId}" is not supported yet. Please check back later.`,
    };
  }

  // Check file size (skip for tools that don't require an input file)
  const noFileTools = ["text-to-pdf"];
  if (!noFileTools.includes(toolId)) {
    onProgress?.(5, "Validating file...");
    const fileSize = await checkFileSize(fileUri);
    if (fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File is too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      };
    }
  }

  try {
    // Build form data
    onProgress?.(10, "Please Wait");
    const formData = new FormData();

    // Special handling for text-to-pdf: send text as form body, no file needed
    if (toolId === "text-to-pdf") {
      // text-to-pdf backend expects 'text' in body, no file
      if (params?.text) {
        formData.append("text", params.text);
      }
    } else if (toolId === "merge") {
      // Merge: send ALL files (main + additional) under "pdfs" key
      formData.append("pdfs", {
        uri: fileUri,
        type: fileMimeType || "application/pdf",
        name: fileName,
      } as any);
      if (additionalFiles && additionalFiles.length > 0) {
        for (let i = 0; i < additionalFiles.length; i++) {
          const addFile = additionalFiles[i];
          formData.append("pdfs", {
            uri: addFile.uri,
            type: addFile.mimeType || "application/pdf",
            name: addFile.name,
          } as any);
        }
      }
    } else if (["compare", "diff", "merge-review"].includes(toolId)) {
      // Two-file tools: send as pdf1 + pdf2
      formData.append("pdf1", {
        uri: fileUri,
        type: fileMimeType || "application/pdf",
        name: fileName,
      } as any);
      if (additionalFiles && additionalFiles.length > 0) {
        formData.append("pdf2", {
          uri: additionalFiles[0].uri,
          type: additionalFiles[0].mimeType || "application/pdf",
          name: additionalFiles[0].name,
        } as any);
      }
    } else if (["jpg-to-pdf", "png-to-pdf"].includes(toolId)) {
      // Image-to-PDF: send under "images" key
      formData.append("images", {
        uri: fileUri,
        type: fileMimeType || "image/jpeg",
        name: fileName,
      } as any);
      if (additionalFiles && additionalFiles.length > 0) {
        for (let i = 0; i < additionalFiles.length; i++) {
          const addFile = additionalFiles[i];
          formData.append("images", {
            uri: addFile.uri,
            type: addFile.mimeType || "image/jpeg",
            name: addFile.name,
          } as any);
        }
      }
    } else if (
      ["word-to-pdf", "ppt-to-pdf", "excel-to-pdf", "html-to-pdf"].includes(
        toolId,
      )
    ) {
      // Office/HTML conversion: send under "document" key
      formData.append("document", {
        uri: fileUri,
        type: fileMimeType || "application/octet-stream",
        name: fileName,
      } as any);
    } else {
      // All other single-PDF tools: send under "file" key (middleware maps to "pdf")
      formData.append("file", {
        uri: fileUri,
        type: fileMimeType || "application/pdf",
        name: fileName,
      } as any);
    }

    // Add tool-specific parameters (skip 'text' for text-to-pdf since already added)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (toolId === "text-to-pdf" && key === "text") return; // already added
          if (key === "attachmentFiles") return; // handled separately below
          formData.append(
            key,
            typeof value === "string" ? value : JSON.stringify(value),
          );
        }
      });
    }

    // For attachments tool: append attachment files under "files" key
    if (toolId === "attachments" && params?.attachmentFiles) {
      try {
        const attachFiles = JSON.parse(params.attachmentFiles);
        for (const af of attachFiles) {
          formData.append("files", {
            uri: af.uri,
            type: af.mimeType || "application/octet-stream",
            name: af.name,
          } as any);
        }
      } catch (e) {
        console.warn("[PdfTools] Failed to parse attachment files:", e);
      }
    }

    // Make API request
    onProgress?.(20, "Please Wait");
    console.log(`[PdfTools] Sending request to: ${toolConfig.endpoint}`);

    // Use caller-provided AbortSignal if available, otherwise create timeout-only controller
    const internalController = new AbortController();
    const timeoutId = setTimeout(
      () => internalController.abort(),
      REQUEST_TIMEOUT,
    );

    // If caller passed a signal, abort internal controller when caller aborts
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return { success: false, error: "Request was cancelled." };
      }
      signal.addEventListener("abort", () => internalController.abort(), {
        once: true,
      });
    }

    // NOTE: Do NOT set Content-Type header manually for FormData
    // Let fetch automatically set it with the correct boundary
    const response = await fetch(toolConfig.endpoint, {
      method: "POST",
      body: formData,
      signal: internalController.signal,
    });

    clearTimeout(timeoutId);

    // Check response status
    if (!response.ok) {
      let errorMessage = `Server error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // Use default error message
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    onProgress?.(60, "Processing complete, downloading result...");

    // Tools that return JSON data instead of files
    const JSON_OUTPUT_TOOLS = [
      "info",
      "search",
      "validate",
      "extract-data",
      "diff",
      "compare",
      "ocr",
      "read-aloud",
    ];

    // Check if response is JSON (contains download URL) or binary (direct file)
    const contentType = response.headers.get("content-type");

    if (
      contentType?.includes("application/json") ||
      JSON_OUTPUT_TOOLS.includes(toolId)
    ) {
      // JSON response - might contain download URL, data, or file info
      const result = await response.json();

      // If this is a JSON-output tool, return the data directly
      if (JSON_OUTPUT_TOOLS.includes(toolId)) {
        onProgress?.(100, "Complete!");
        return {
          success: true,
          message: result.message || "Processing complete",
          outputType: "json",
          jsonData: result,
        } as any;
      }

      // Split tool returns multiple files — download each individually
      if (result.success && result.files && Array.isArray(result.files)) {
        const savedFiles: string[] = [];
        const pdfConfig = { ...toolConfig, outputExtension: "pdf", outputMimeType: "application/pdf" };
        for (let i = 0; i < result.files.length; i++) {
          const f = result.files[i];
          onProgress?.(
            60 + Math.round((i / result.files.length) * 30),
            `Downloading part ${i + 1} of ${result.files.length}...`,
          );
          const partResult = await downloadAndSaveFile(
            f.url,
            f.filename || `${fileName.replace(/\.pdf$/i, "")}_part_${i + 1}.pdf`,
            toolId,
            pdfConfig,
            undefined,
          );
          if (partResult.success && partResult.outputUri) {
            savedFiles.push(partResult.outputUri);
          }
        }
        onProgress?.(100, "Complete!");
        return {
          success: true,
          outputUri: savedFiles[0] || "",
          outputFileName: result.files[0]?.filename || `${fileName.replace(/\.pdf$/i, "")}_part_1.pdf`,
          outputType: "application/pdf",
          message: `Split into ${savedFiles.length} files. All files saved to library.`,
        };
      }

      if (result.downloadUrl) {
        // Download the file from the provided URL
        return await downloadAndSaveFile(
          result.downloadUrl,
          fileName,
          toolId,
          toolConfig,
          onProgress,
        );
      } else if (result.success && result.outputUri) {
        // Output is already a local URI
        return {
          success: true,
          outputUri: result.outputUri,
          outputFileName: result.outputFileName || fileName,
          outputType: toolConfig.outputMimeType,
          message: result.message || "Processing complete",
        };
      } else if (result.error) {
        return {
          success: false,
          error: result.error,
        };
      }

      // Unknown JSON format
      return {
        success: false,
        error: "Unexpected response format from server",
      };
    } else {
      // Binary response - direct file download
      const blob = await response.blob();

      // For in-place tools (protect/unlock), overwrite the original file
      if (IN_PLACE_TOOLS.includes(toolId)) {
        return await saveInPlace(blob, fileUri, fileName, toolId, onProgress);
      }

      return await saveBlobToFile(
        blob,
        fileName,
        toolId,
        toolConfig,
        onProgress,
      );
    }
  } catch (error) {
    console.error("[PdfTools] Processing error:", error);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        // Check if this was user-initiated cancel vs timeout
        if (signal?.aborted) {
          return {
            success: false,
            error: "Request was cancelled.",
          };
        }
        return {
          success: false,
          error:
            "Request timed out. The file might be too large or the server is busy. Please try again.",
        };
      }

      // Network errors
      if (
        error.message.includes("Network request failed") ||
        error.message.includes("fetch") ||
        error.message.includes("network") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("Failed to connect")
      ) {
        return {
          success: false,
          error:
            "Cannot reach the backend server. Please make sure the server is running and your device is on the same network.",
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: "An unexpected error occurred during processing.",
    };
  }
}

// ============================================================================
// IN-PLACE SAVE (for protect / unlock / encrypt)
// ============================================================================

/**
 * Save the processed blob back to the original file URI (in-place modification).
 * Used by protect, unlock, and encrypt tools so no duplicate file is created.
 */
async function saveInPlace(
  blob: Blob,
  originalUri: string,
  fileName: string,
  toolId: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  try {
    onProgress?.(70, "Applying changes...");

    // Convert blob to base64
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Validate the base64 data represents a valid PDF before overwriting
    if (base64Data.length < 20) {
      throw new Error("Server returned empty or invalid response.");
    }
    // Decode first 5 bytes to check for %PDF- header
    const headerCheck = atob(base64Data.substring(0, 8));
    if (!headerCheck.startsWith("%PDF-")) {
      throw new Error(
        "Server response is not a valid PDF. The file was not modified.",
      );
    }

    onProgress?.(85, "Saving changes...");

    // Overwrite the original file
    await FileSystem.writeAsStringAsync(originalUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Verify and get file size
    let fileSize = 0;
    try {
      const fileInfo = await FileSystem.getInfoAsync(originalUri);
      if (fileInfo.exists && "size" in fileInfo) {
        fileSize = fileInfo.size || 0;
      }
      if (__DEV__) {
        console.log(
          `[PdfTools] saveInPlace - path: ${originalUri}, success: ${fileInfo.exists}, size: ${fileSize}`,
        );
      }
    } catch (statError) {
      console.warn("[PdfTools] Could not stat updated file:", statError);
    }

    if (fileSize === 0) {
      console.warn(
        "[PdfTools] Warning: updated file has 0 bytes:",
        originalUri,
      );
    }

    onProgress?.(90, "Updating library...");

    // Update existing file index record (same URI = upsert overwrites)
    await upsertFileRecord({
      uri: originalUri,
      name: fileName,
      mimeType: "application/pdf",
      extension: "pdf",
      size: fileSize,
      source: "created",
      sourceTags: ["created"],
    });

    onProgress?.(100, "Complete!");

    const actionMessages: Record<string, string> = {
      protect: "Password protection applied successfully.",
      unlock: "Password removed successfully.",
      encrypt: "File encrypted successfully.",
      decrypt: "File decrypted successfully.",
    };

    return {
      success: true,
      outputUri: originalUri,
      outputFileName: fileName,
      outputType: "application/pdf",
      message: actionMessages[toolId] || "File updated successfully.",
    };
  } catch (error) {
    console.error("[PdfTools] In-place save error:", error);
    return {
      success: false,
      error: `Failed to update file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Download file from URL and save locally
 */
async function downloadAndSaveFile(
  downloadUrl: string,
  originalFileName: string,
  toolId: string,
  toolConfig: ToolEndpointConfig,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  try {
    onProgress?.(70, "Downloading processed file...");

    // Ensure the URL is absolute
    const fullUrl = downloadUrl.startsWith("http")
      ? downloadUrl
      : `${API_BASE_URL.replace("/api", "")}${downloadUrl}`;

    const outputFileName = generateOutputFileName(
      originalFileName,
      toolId,
      toolConfig.outputExtension,
    );
    const outputUri = `${OUTPUT_DIR}${outputFileName}`;

    // Download file
    const downloadResult = await FileSystem.downloadAsync(fullUrl, outputUri);

    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status: ${downloadResult.status}`);
    }

    // Stat the downloaded file to get real size
    let fileSize = 0;
    try {
      const downloadedFileInfo = await FileSystem.getInfoAsync(outputUri);
      if (downloadedFileInfo.exists && "size" in downloadedFileInfo) {
        fileSize = downloadedFileInfo.size || 0;
      }
      if (__DEV__) {
        console.log(
          `[PdfTools] downloadAndSaveFile - path: ${outputUri}, write success: ${downloadedFileInfo.exists}, size: ${fileSize}`,
        );
      }
    } catch (statError) {
      console.warn("[PdfTools] Could not stat downloaded file:", statError);
    }

    if (fileSize === 0) {
      console.warn(
        "[PdfTools] Warning: downloaded file has 0 bytes:",
        outputUri,
      );
    }

    onProgress?.(90, "Saving to library...");

    // Add to file index with real file size
    await upsertFileRecord({
      uri: outputUri,
      name: outputFileName,
      mimeType: toolConfig.outputMimeType,
      extension: toolConfig.outputExtension,
      size: fileSize,
      source: "created",
      sourceTags: ["created"],
    });

    onProgress?.(100, "Complete!");

    return {
      success: true,
      outputUri,
      outputFileName,
      outputType: toolConfig.outputMimeType,
      message: "File processed successfully and saved to your library.",
    };
  } catch (error) {
    console.error("[PdfTools] Download error:", error);
    return {
      success: false,
      error: `Failed to download processed file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Save blob data to local file
 */
async function saveBlobToFile(
  blob: Blob,
  originalFileName: string,
  toolId: string,
  toolConfig: ToolEndpointConfig,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  try {
    onProgress?.(70, "Processing response...");

    const outputFileName = generateOutputFileName(
      originalFileName,
      toolId,
      toolConfig.outputExtension,
    );
    const outputUri = `${OUTPUT_DIR}${outputFileName}`;

    // Convert blob to base64 and save
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URL prefix if present
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Validate PDF output before saving (for PDF tools)
    if (toolConfig.outputExtension === "pdf" && base64Data.length >= 8) {
      try {
        const headerCheck = atob(base64Data.substring(0, 8));
        if (!headerCheck.startsWith("%PDF-")) {
          throw new Error("Server response is not a valid PDF.");
        }
      } catch {
        // If atob fails, the data may still be valid binary for non-PDF tools
      }
    }

    onProgress?.(85, "Saving file...");

    await FileSystem.writeAsStringAsync(outputUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Stat the written file to get real size
    let fileSize = 0;
    try {
      const writtenFileInfo = await FileSystem.getInfoAsync(outputUri);
      if (writtenFileInfo.exists && "size" in writtenFileInfo) {
        fileSize = writtenFileInfo.size || 0;
      }
      if (__DEV__) {
        console.log(
          `[PdfTools] saveBlobToFile - path: ${outputUri}, write success: ${writtenFileInfo.exists}, size: ${fileSize}`,
        );
      }
    } catch (statError) {
      console.warn("[PdfTools] Could not stat written file:", statError);
    }

    if (fileSize === 0) {
      console.warn("[PdfTools] Warning: written file has 0 bytes:", outputUri);
    }

    onProgress?.(90, "Adding to library...");

    // Add to file index with real file size
    await upsertFileRecord({
      uri: outputUri,
      name: outputFileName,
      mimeType: toolConfig.outputMimeType,
      extension: toolConfig.outputExtension,
      size: fileSize,
      source: "created",
      sourceTags: ["created"],
    });

    onProgress?.(100, "Complete!");

    return {
      success: true,
      outputUri,
      outputFileName,
      outputType: toolConfig.outputMimeType,
      message: "File processed successfully and saved to your library.",
    };
  } catch (error) {
    console.error("[PdfTools] Blob save error:", error);
    return {
      success: false,
      error: `Failed to save processed file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ============================================================================
// WAKE UP HELPER
// ============================================================================

/**
 * Wake up the backend server (for cold start on free tier hosting)
 */
export async function wakeUpBackend(): Promise<boolean> {
  try {
    console.log("[PdfTools] Waking up backend...");
    const response = await fetch(API_BASE_URL.replace("/api", "/health"), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      console.log("[PdfTools] Backend is awake!");
      return true;
    }

    console.warn("[PdfTools] Backend health check failed:", response.status);
    return false;
  } catch (error) {
    console.error("[PdfTools] Failed to wake backend:", error);
    return false;
  }
}

// ============================================================================
// TOOL-SPECIFIC HELPERS
// ============================================================================

/**
 * Process PDF merge
 */
export async function mergePdfs(
  files: Array<{ uri: string; name: string; mimeType: string }>,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  if (files.length < 2) {
    return {
      success: false,
      error: "Please select at least 2 PDF files to merge.",
    };
  }

  return processWithTool(
    {
      toolId: "merge",
      fileUri: files[0].uri,
      fileName: files[0].name,
      fileMimeType: files[0].mimeType,
      additionalFiles: files.slice(1),
    },
    onProgress,
  );
}

/**
 * Process PDF compression
 */
export async function compressPdf(
  fileUri: string,
  fileName: string,
  quality: "low" | "medium" | "high" = "medium",
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "compress",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { quality },
    },
    onProgress,
  );
}

/**
 * Process PDF rotation
 */
export async function rotatePdf(
  fileUri: string,
  fileName: string,
  rotation: 90 | 180 | 270,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "rotate",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { rotation },
    },
    onProgress,
  );
}

/**
 * Process PDF split
 */
export async function splitPdf(
  fileUri: string,
  fileName: string,
  pageRanges: number[][],
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "split",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { pageRanges },
    },
    onProgress,
  );
}

/**
 * Extract pages from PDF
 */
export async function extractPages(
  fileUri: string,
  fileName: string,
  pages: number[],
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "extract",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { pages },
    },
    onProgress,
  );
}

/**
 * Remove pages from PDF
 */
export async function removePages(
  fileUri: string,
  fileName: string,
  pages: number[],
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "remove",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { pages },
    },
    onProgress,
  );
}

/**
 * Add watermark to PDF
 */
export async function addWatermark(
  fileUri: string,
  fileName: string,
  text: string,
  options?: { opacity?: number; position?: string; fontSize?: number },
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "watermark",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { text, ...options },
    },
    onProgress,
  );
}

/**
 * Protect PDF with password
 */
export async function protectPdf(
  fileUri: string,
  fileName: string,
  password: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "protect",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { password },
    },
    onProgress,
  );
}

/**
 * Unlock PDF
 */
export async function unlockPdf(
  fileUri: string,
  fileName: string,
  password: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "unlock",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { password },
    },
    onProgress,
  );
}

/**
 * Convert image(s) to PDF
 */
export async function imagesToPdf(
  files: Array<{ uri: string; name: string; mimeType: string }>,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  if (files.length === 0) {
    return {
      success: false,
      error: "Please select at least one image to convert.",
    };
  }

  return processWithTool(
    {
      toolId: "jpg-to-pdf",
      fileUri: files[0].uri,
      fileName: files[0].name,
      fileMimeType: files[0].mimeType,
      additionalFiles: files.slice(1),
    },
    onProgress,
  );
}

/**
 * Convert PDF to images
 */
export async function pdfToImages(
  fileUri: string,
  fileName: string,
  format: "jpg" | "png" = "jpg",
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: format === "png" ? "pdf-to-png" : "pdf-to-jpg",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
      params: { format },
    },
    onProgress,
  );
}

/**
 * Convert PDF to Word
 */
export async function pdfToWord(
  fileUri: string,
  fileName: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "pdf-to-word",
      fileUri,
      fileName,
      fileMimeType: "application/pdf",
    },
    onProgress,
  );
}

/**
 * Convert Word to PDF
 */
export async function wordToPdf(
  fileUri: string,
  fileName: string,
  fileMimeType: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<ProcessingResult> {
  return processWithTool(
    {
      toolId: "word-to-pdf",
      fileUri,
      fileName,
      fileMimeType,
    },
    onProgress,
  );
}

export default {
  processWithTool,
  getToolConfig,
  isToolSupported,
  getSupportedTools,
  wakeUpBackend,
  // Tool-specific helpers
  mergePdfs,
  compressPdf,
  rotatePdf,
  splitPdf,
  extractPages,
  removePages,
  addWatermark,
  protectPdf,
  unlockPdf,
  imagesToPdf,
  pdfToImages,
  pdfToWord,
  wordToPdf,
};
