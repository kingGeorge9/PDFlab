import Constants from "expo-constants";

// Get API URL from app.json extra config or use default.
//
// For local development with a real device on the same LAN:
//   1. Find your PC's local IP (e.g. 192.168.1.42)
//   2. Set "apiUrl" in app.json → expo.extra:
//        "extra": { "apiUrl": "http://192.168.1.42:5000/api" }
//   3. Restart the Expo dev server
//
// Default uses localhost backend (runs on port 5000)
export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl || "http://localhost:5000/api";

export const API_ENDPOINTS = {
  // PDF Operations
  PDF: {
    MERGE: `${API_BASE_URL}/pdf/merge`,
    SPLIT: `${API_BASE_URL}/pdf/split`,
    COMPRESS: `${API_BASE_URL}/pdf/compress`,
    ROTATE: `${API_BASE_URL}/pdf/rotate`,
    WATERMARK: `${API_BASE_URL}/pdf/watermark`,
    PAGE_NUMBERS: `${API_BASE_URL}/pdf/page-numbers`,
    REMOVE_PAGES: `${API_BASE_URL}/pdf/remove-pages`,
    EXTRACT_PAGES: `${API_BASE_URL}/pdf/extract-pages`,
    TO_IMAGES: `${API_BASE_URL}/convert/pdf-to-jpg`,
    TO_WORD: `${API_BASE_URL}/convert/pdf-to-word`,
    CROP: `${API_BASE_URL}/pdf/crop`,
    // Additional PDF operations
    ORGANIZE: `${API_BASE_URL}/pdf/organize`,
    REVERSE: `${API_BASE_URL}/pdf/reverse`,
    DUPLICATE: `${API_BASE_URL}/pdf/duplicate`,
    REPAIR: `${API_BASE_URL}/pdf/repair`,
    REPAIR_ENHANCED: `${API_BASE_URL}/pdf/repair-enhanced`,
    OPTIMIZE_IMAGES: `${API_BASE_URL}/pdf/optimize-images`,
    REMOVE_DUPLICATES: `${API_BASE_URL}/pdf/remove-duplicates`,
    FLATTEN: `${API_BASE_URL}/pdf/flatten`,
    PROTECT: `${API_BASE_URL}/pdf/protect`,
    UNLOCK: `${API_BASE_URL}/pdf/unlock`,
    ENCRYPT: `${API_BASE_URL}/pdf/encrypt`,
    DECRYPT: `${API_BASE_URL}/pdf/decrypt`,
    CHECK_ENCRYPTED: `${API_BASE_URL}/pdf/check-encrypted`,
    REDACT: `${API_BASE_URL}/pdf/redact`,
    COMPARE: `${API_BASE_URL}/pdf/compare`,
    OCR: `${API_BASE_URL}/pdf/ocr`,
    GRAYSCALE: `${API_BASE_URL}/pdf/black-white`,
    INFO: `${API_BASE_URL}/pdf/info`,
    METADATA: `${API_BASE_URL}/pdf/metadata`,
  },

  // Conversion Operations
  CONVERT: {
    IMAGES_TO_PDF: `${API_BASE_URL}/convert/images-to-pdf`,
    WORD_TO_PDF: `${API_BASE_URL}/convert/word-to-pdf`,
    PPT_TO_PDF: `${API_BASE_URL}/convert/ppt-to-pdf`,
    EXCEL_TO_PDF: `${API_BASE_URL}/convert/excel-to-pdf`,
    HTML_TO_PDF: `${API_BASE_URL}/convert/html-to-pdf`,
    TEXT_TO_PDF: `${API_BASE_URL}/convert/text-to-pdf`,
    PDF_TO_JPG: `${API_BASE_URL}/convert/pdf-to-jpg`,
    PDF_TO_PNG: `${API_BASE_URL}/convert/pdf-to-png`,
    PDF_TO_WORD: `${API_BASE_URL}/convert/pdf-to-word`,
    PDF_TO_PPT: `${API_BASE_URL}/convert/pdf-to-ppt`,
    PDF_TO_EXCEL: `${API_BASE_URL}/convert/pdf-to-excel`,
    PDF_TO_TEXT: `${API_BASE_URL}/convert/pdf-to-text`,
    PDF_TO_HTML: `${API_BASE_URL}/convert/pdf-to-html`,
  },

  // AI Operations
  AI: {
    SUMMARIZE: `${API_BASE_URL}/ai/summarize`,
    TRANSLATE: `${API_BASE_URL}/ai/translate`,
    EXTRACT_DATA: `${API_BASE_URL}/ai/extract-data`,
    GENERATE_CONTENT: `${API_BASE_URL}/ai/generate-content`,
    CHAT: `${API_BASE_URL}/ai/chat`,
    ANALYZE: `${API_BASE_URL}/ai/analyze`,
    EXTRACT_TASKS: `${API_BASE_URL}/ai/extract-tasks`,
    FILL_FORM: `${API_BASE_URL}/ai/fill-form`,
    EXTRACT_PDF: `${API_BASE_URL}/ai/extract-pdf`,
    ASK_PDF: `${API_BASE_URL}/ai/ask-pdf`,
    EXTRACT_DOCUMENT: `${API_BASE_URL}/ai/extract-document`,
    CHAT_DOCUMENT: `${API_BASE_URL}/ai/chat-document`,
  },

  // Document Operations
  DOCUMENT: {
    CREATE: `${API_BASE_URL}/document/create`,
    LIST: `${API_BASE_URL}/document/list`,
    GET: `${API_BASE_URL}/document/get`,
    FILE: `${API_BASE_URL}/document/file`,
    DELETE: `${API_BASE_URL}/document/delete`,
    UPDATE: `${API_BASE_URL}/document/update`,
    PDF_REFLOW: `${API_BASE_URL}/document/pdf-reflow`,
    DOCX_REFLOW: `${API_BASE_URL}/document/docx-reflow`,
    EXTRACT_TEXT: `${API_BASE_URL}/document/extract-text`,
  },

  // Signing Operations
  SIGNING: {
    VISUAL: `${API_BASE_URL}/signing/visual`,
    DIGITAL: `${API_BASE_URL}/signing/digital`,
    VERIFY: `${API_BASE_URL}/signing/verify`,
    CERT_INFO: `${API_BASE_URL}/signing/cert-info`,
  },

  // New Tools
  TOOLS: {
    EXTRACT_IMAGES: `${API_BASE_URL}/extract-images`,
    BATCH_COMPRESS: `${API_BASE_URL}/batch-compress`,
    FIND_REPLACE: `${API_BASE_URL}/find-replace`,
    FIND_REPLACE_PREVIEW: `${API_BASE_URL}/find-replace/preview`,
    QRCODE: `${API_BASE_URL}/qrcode`,
    QRCODE_PREVIEW: `${API_BASE_URL}/qrcode/preview`,
    HEADER_FOOTER: `${API_BASE_URL}/header-footer`,
    HIGHLIGHT_EXPORT: `${API_BASE_URL}/highlight-export`,
    CITATIONS_EXTRACT: `${API_BASE_URL}/citations/extract`,
    CITATIONS_FORMAT: `${API_BASE_URL}/citations/format`,
  },

  // Health check
  HEALTH: `${API_BASE_URL.replace("/api", "")}/health`,
};

// Helper function to wake up backend (for free tier hosting)
export async function wakeUpBackend(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(API_BASE_URL.replace("/api", ""), {
      method: "GET",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Helper function for API calls with error handling and timeout
export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 30000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request to ${endpoint} timed out after ${timeoutMs}ms`);
    }
    console.error(`API call failed to ${endpoint}:`, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Helper for file uploads (with 120s timeout for large files)
export async function uploadFile(
  endpoint: string,
  file: any,
  fieldName: string = "file",
  additionalData?: Record<string, any>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  const formData = new FormData();

  formData.append(fieldName, {
    uri: file.uri,
    type: file.type || file.mimeType,
    name: file.name || "document",
  } as any);

  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      // Do NOT set Content-Type manually — fetch auto-generates it with the correct boundary
    });

    if (!response.ok) {
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`,
      );
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Upload to ${endpoint} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
