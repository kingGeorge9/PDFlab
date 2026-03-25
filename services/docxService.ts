/**
 * DOCX Service - Handles DOCX viewing and editing
 * Converts DOCX files to HTML for rendering in WebView using Mammoth.js (CDN)
 */

import * as FileSystem from "expo-file-system/legacy";

// ============================================================================
// TYPES
// ============================================================================
export interface DocxConversionResult {
  success: boolean;
  html?: string;
  error?: string;
}

export interface DocxFileInfo {
  uri: string;
  name: string;
  size?: number;
}

// ============================================================================
// HTML TEMPLATE GENERATION
// ============================================================================

/**
 * Generate the HTML wrapper with Mammoth.js for DOCX conversion
 * This uses CDN-loaded Mammoth.js to convert DOCX to HTML in WebView
 */
export function generateDocxViewerHtml(base64Content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
        <script src="https://cdn.jsdelivr.net/npm/mammoth@1.11.0/mammoth.browser.min.js"></script>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 16px;
            margin: 0;
            line-height: 1.6;
            font-size: 16px;
            color: #1a1a1a;
            background-color: #ffffff;
            -webkit-font-smoothing: antialiased;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 10px 0;
          }
          table, table.docx-table {
            border-collapse: collapse;
            width: 100%;
            margin: 12px 0;
            font-size: 14px;
          }
          table td, table th,
          table.docx-table td, table.docx-table th {
            border: 1px solid #ccc;
            padding: 6px 10px;
            text-align: left;
            vertical-align: top;
            word-break: break-word;
          }
          table th, table.docx-table th {
            background-color: #f5f5f5;
            font-weight: 600;
          }
          table tr:nth-child(even) {
            background-color: #fafafa;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 12px;
            font-weight: 600;
            line-height: 1.3;
            color: #000;
          }
          h1 { font-size: 28px; }
          h2 { font-size: 24px; }
          h3 { font-size: 20px; }
          h4 { font-size: 18px; }
          h5 { font-size: 16px; }
          h6 { font-size: 14px; }
          p {
            margin: 12px 0;
          }
          ul, ol {
            padding-left: 24px;
            margin: 12px 0;
          }
          li {
            margin: 6px 0;
          }
          blockquote {
            border-left: 4px solid #2196F3;
            margin: 16px 0;
            padding: 12px 16px;
            background-color: #f8f9fa;
            color: #555;
          }
          a {
            color: #2196F3;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          code {
            background-color: #f5f5f5;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
          }
          pre {
            background-color: #f5f5f5;
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
          }
          #content {
            min-height: 100vh;
            padding-bottom: 40px;
          }
          #loading {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            color: #666;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e0e0e0;
            border-top-color: #2196F3;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          #error {
            display: none;
            padding: 20px;
            text-align: center;
            color: #DC2626;
          }
        </style>
      </head>
      <body>
        <div id="loading">
          <div class="spinner"></div>
          <span>Loading document...</span>
        </div>
        <div id="error"></div>
        <div id="content" style="display: none;"></div>
        <script>
          // Convert base64 to ArrayBuffer
          function base64ToArrayBuffer(base64) {
            try {
              const binaryString = window.atob(base64);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              return bytes.buffer;
            } catch (e) {
              throw new Error('Failed to decode document data');
            }
          }

          // Load and convert DOCX
          async function loadDocx() {
            try {
              const base64Data = '${base64Content}';
              
              if (!base64Data || base64Data === 'undefined' || base64Data === 'null') {
                throw new Error('No document data received');
              }
              
              const arrayBuffer = base64ToArrayBuffer(base64Data);
              
              // Custom options for better conversion
              const options = {
                styleMap: [
                  "table[style-name='Table Grid'] => table.docx-table",
                  "table[style-name='TableGrid']  => table.docx-table",
                  "table[style-name='Normal Table'] => table.docx-table",
                  "table => table.docx-table",
                  "tr => tr",
                  "td => td",
                  "th => th",
                ],
                includeDefaultStyleMap: true,
                ignoreEmptyParagraphs: false,
                convertImage: mammoth.images.imgElement(function(image) {
                  return image.read("base64").then(function(imageBuffer) {
                    return {
                      src: "data:" + image.contentType + ";base64," + imageBuffer
                    };
                  });
                })
              };
              
              console.log('[docxService] mammoth version check:', typeof mammoth.images);
              
              let result;
              try {
                result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer}, options);
              } catch (convertErr) {
                console.error('[docxService] mammoth failed:', convertErr);
                result = { value: '<p>Unable to render document.</p>', messages: [] };
              }
              
              document.getElementById('loading').style.display = 'none';
              document.getElementById('content').style.display = 'block';
              document.getElementById('content').innerHTML = result.value;
              
              // Log any conversion messages/warnings
              if (result.messages && result.messages.length > 0) {
                result.messages.forEach(function(m) { console.warn('[docxService] mammoth:', m.message); });
              }
              
              // Notify React Native that loading is complete
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'loaded',
                  success: true,
                  messageCount: result.messages ? result.messages.length : 0
                }));
              }
            } catch (error) {
              console.error('Error loading document:', error);
              
              document.getElementById('loading').style.display = 'none';
              document.getElementById('error').style.display = 'block';
              document.getElementById('error').innerHTML = 
                '<h3>Unable to load document</h3>' +
                '<p>' + (error.message || 'An unexpected error occurred') + '</p>' +
                '<p style="font-size: 14px; color: #666;">Please try opening this file with another app.</p>';
              
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  message: error.message || 'Failed to load document'
                }));
              }
            }
          }

          // Run conversion when page loads
          window.addEventListener('load', loadDocx);
          
          // Fallback: run after a short delay if load event doesn't fire
          setTimeout(function() {
            if (document.getElementById('loading').style.display !== 'none') {
              loadDocx();
            }
          }, 1000);
        </script>
      </body>
    </html>
  `;
}

/**
 * Generate the HTML wrapper for DOCX editing
 * Uses contenteditable for simple editing
 */
export function generateDocxEditorHtml(base64Content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <script src="https://cdn.jsdelivr.net/npm/mammoth@1.11.0/mammoth.browser.min.js"></script>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 0;
            margin: 0;
            background-color: #ffffff;
          }
          #editor {
            min-height: 100vh;
            padding: 16px;
            outline: none;
            line-height: 1.6;
            font-size: 16px;
            color: #1a1a1a;
            -webkit-font-smoothing: antialiased;
          }
          #editor:focus {
            outline: none;
          }
          #editor img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 8px 0;
          }
          #editor table, #editor table.docx-table {
            border-collapse: collapse;
            width: 100%;
            margin: 12px 0;
          }
          #editor table td, #editor table th,
          #editor table.docx-table td, #editor table.docx-table th {
            border: 1px solid #ccc;
            padding: 6px 10px;
            vertical-align: top;
            word-break: break-word;
          }
          #editor h1, #editor h2, #editor h3, #editor h4, #editor h5, #editor h6 {
            margin-top: 24px;
            margin-bottom: 12px;
            font-weight: 600;
          }
          #editor p {
            margin: 12px 0;
          }
          #loading {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            color: #666;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e0e0e0;
            border-top-color: #2196F3;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div id="loading">
          <div class="spinner"></div>
          <span>Loading editor...</span>
        </div>
        <div id="editor" contenteditable="true" style="display: none;"></div>
        <script>
          // Convert base64 to ArrayBuffer
          function base64ToArrayBuffer(base64) {
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
          }

          // Load document for editing
          async function loadDocx() {
            try {
              const base64Data = '${base64Content}';
              const arrayBuffer = base64ToArrayBuffer(base64Data);
              
              const options = {
                styleMap: [
                  "table[style-name='Table Grid'] => table.docx-table",
                  "table[style-name='TableGrid']  => table.docx-table",
                  "table[style-name='Normal Table'] => table.docx-table",
                  "table => table.docx-table",
                  "tr => tr",
                  "td => td",
                  "th => th",
                ],
                includeDefaultStyleMap: true,
                ignoreEmptyParagraphs: false,
                convertImage: mammoth.images.imgElement(function(image) {
                  return image.read("base64").then(function(imageBuffer) {
                    return {
                      src: "data:" + image.contentType + ";base64," + imageBuffer
                    };
                  });
                })
              };
              
              let result;
              try {
                result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer}, options);
              } catch (convertErr) {
                console.error('[docxService] mammoth failed:', convertErr);
                result = { value: '<p>Unable to render document.</p>', messages: [] };
              }
              
              document.getElementById('loading').style.display = 'none';
              document.getElementById('editor').style.display = 'block';
              document.getElementById('editor').innerHTML = result.value;
              
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'editor-loaded',
                  success: true
                }));
              }
            } catch (error) {
              console.error('Error loading document:', error);
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  message: error.message || 'Failed to load document for editing'
                }));
              }
            }
          }

          // Get current editor content
          window.getEditorContent = function() {
            return document.getElementById('editor').innerHTML;
          };

          // Run when page loads
          window.addEventListener('load', loadDocx);
        </script>
      </body>
    </html>
  `;
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Read a DOCX file and return its base64 content
 */
export async function readDocxAsBase64(fileUri: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64;
  } catch (error) {
    console.error("[DocxService] Error reading DOCX file:", error);
    throw new Error(
      `Failed to read DOCX file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Check if a file is a valid DOCX file by its URI or extension
 */
export function isDocxFile(fileUri: string, mimeType?: string): boolean {
  const uri = fileUri.toLowerCase();

  // Check by extension
  if (uri.endsWith(".docx")) {
    return true;
  }

  // Check by mime type
  if (mimeType) {
    const docxMimeTypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    return docxMimeTypes.includes(mimeType.toLowerCase());
  }

  return false;
}

/**
 * Get the display name from a file URI
 */
export function getDocxDisplayName(fileUri: string): string {
  try {
    const decodedUri = decodeURIComponent(fileUri);
    const parts = decodedUri.split("/");
    const fileName = parts[parts.length - 1];
    return fileName || "Document.docx";
  } catch {
    return "Document.docx";
  }
}

/**
 * Normalize a DOCX file URI for viewing
 * Copies SAF URIs to cache if needed
 */
export async function normalizeDocxUri(fileUri: string): Promise<string> {
  try {
    // Handle SAF URIs (content://)
    if (fileUri.startsWith("content://")) {
      const fileName = `docx_${Date.now()}.docx`;
      const cacheUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: fileUri,
        to: cacheUri,
      });

      console.log("[DocxService] Copied SAF URI to cache:", cacheUri);
      return cacheUri;
    }

    // Return as-is for file:// URIs
    return fileUri;
  } catch (error) {
    console.error("[DocxService] Error normalizing DOCX URI:", error);
    throw new Error("Failed to prepare document for viewing");
  }
}

/**
 * Save edited HTML content back as a simple text file
 * Note: For full DOCX export, a library like docx.js would be needed
 */
export async function saveEditedContent(
  htmlContent: string,
  originalFileName: string,
): Promise<string> {
  try {
    // Strip HTML tags for plain text version
    const textContent = htmlContent
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Generate new filename
    const baseName = originalFileName.replace(/\.[^/.]+$/, "");
    const newFileName = `${baseName}_edited.docx`;
    const fileUri = `${FileSystem.documentDirectory}${newFileName}`;

    await FileSystem.writeAsStringAsync(fileUri, textContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    console.log("[DocxService] Saved edited content to:", fileUri);
    return fileUri;
  } catch (error) {
    console.error("[DocxService] Error saving edited content:", error);
    throw new Error("Failed to save edited document");
  }
}

/**
 * Check if a file is a valid DOCX (ZIP file) by checking the magic bytes
 * DOCX files are ZIP archives that start with PK (0x50 0x4B)
 */
export async function isValidDocxFile(fileUri: string): Promise<boolean> {
  try {
    // Read first 4 bytes of the file
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 4,
    });

    // Decode base64 to check magic bytes
    const binaryString = atob(base64);

    // ZIP files start with "PK" (0x50 0x4B)
    if (binaryString.length >= 2) {
      const firstByte = binaryString.charCodeAt(0);
      const secondByte = binaryString.charCodeAt(1);
      return firstByte === 0x50 && secondByte === 0x4b; // "PK"
    }

    return false;
  } catch (error) {
    console.error("[DocxService] Error checking DOCX validity:", error);
    return false;
  }
}

/**
 * Read a file as plain text
 */
export async function readFileAsText(fileUri: string): Promise<string> {
  try {
    const content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return content;
  } catch (error) {
    console.error("[DocxService] Error reading file as text:", error);
    throw new Error("Failed to read file");
  }
}

/**
 * Generate HTML for plain text file viewing
 * Used as fallback for files that aren't valid DOCX
 */
export function generatePlainTextViewerHtml(textContent: string): string {
  // Escape HTML entities
  const escapedContent = textContent
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Convert newlines to paragraphs
  const paragraphs = escapedContent.split(/\n\n+/).filter((p) => p.trim());
  const htmlParagraphs = paragraphs
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 16px;
            margin: 0;
            line-height: 1.6;
            font-size: 16px;
            color: #1a1a1a;
            background-color: #ffffff;
            -webkit-font-smoothing: antialiased;
          }
          .notice {
            background-color: #FEF3C7;
            border: 1px solid #F59E0B;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #92400E;
          }
          h1 {
            font-size: 24px;
            font-weight: 600;
            margin-top: 0;
            margin-bottom: 16px;
            color: #000;
          }
          p {
            margin: 12px 0;
          }
          #content {
            min-height: 100vh;
            padding-bottom: 40px;
          }
        </style>
      </head>
      <body>
        <div class="notice">
          This document was created in the app and is displayed as plain text. 
          For full formatting, export and open in Microsoft Word or Google Docs.
        </div>
        <div id="content">
          ${htmlParagraphs || '<p style="color: #666;">Empty document</p>'}
        </div>
        <script>
          // Notify React Native that loading is complete
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'loaded',
              success: true,
              isPlainText: true
            }));
          }
        </script>
      </body>
    </html>
  `;
}

/**
 * Generate HTML for plain text editing
 */
export function generatePlainTextEditorHtml(textContent: string): string {
  // Escape HTML entities
  const escapedContent = textContent
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 0;
            margin: 0;
            background-color: #ffffff;
          }
          #editor {
            min-height: 100vh;
            padding: 16px;
            outline: none;
            line-height: 1.6;
            font-size: 16px;
            color: #1a1a1a;
            white-space: pre-wrap;
            -webkit-font-smoothing: antialiased;
          }
          #editor:focus {
            outline: none;
          }
        </style>
      </head>
      <body>
        <div id="editor" contenteditable="true">${escapedContent}</div>
        <script>
          // Get current editor content
          window.getEditorContent = function() {
            return document.getElementById('editor').innerText;
          };
          
          // Notify React Native that editor is loaded
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'editor-loaded',
              success: true,
              isPlainText: true
            }));
          }
        </script>
      </body>
    </html>
  `;
}
