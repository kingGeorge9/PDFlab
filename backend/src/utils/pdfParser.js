/**
 * PDF text parsing utility.
 *
 * Primary: pdf-parse (fast, lightweight).
 * Fallback: pdfjs-dist text extraction (handles cases where pdf-parse fails
 *           or is not installed / exports incorrectly).
 */

let _pdfParseFn = null;

// Resolve the callable function from pdf-parse, handling v1.x default export
// and potential v2.x object exports gracefully.
try {
  const mod = require("pdf-parse");
  if (typeof mod === "function") {
    _pdfParseFn = mod;
  } else if (typeof mod?.default === "function") {
    _pdfParseFn = mod.default;
  } else if (typeof mod?.parse === "function") {
    _pdfParseFn = mod.parse;
  }
} catch {
  // pdf-parse not available — fallback will be used
}

/**
 * Fallback parser using pdfjs-dist (already used elsewhere in the codebase).
 */
async function parsePDFWithPdfjs(dataBuffer) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  }

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(dataBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;

  const textParts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str || "").join(" ");
    textParts.push(pageText);
  }

  const numpages = doc.numPages;
  await doc.destroy();
  return { text: textParts.join("\n"), numpages };
}

/**
 * Parse a PDF buffer and return { text, numpages }.
 *
 * Uses pdf-parse if available and callable, otherwise falls back to pdfjs-dist.
 */
async function parsePDF(dataBuffer) {
  if (_pdfParseFn) {
    try {
      const result = await _pdfParseFn(dataBuffer);
      return { text: result.text, numpages: result.numpages };
    } catch (err) {
      // pdf-parse failed on this document — fall through to pdfjs-dist
      console.warn("[pdfParser] pdf-parse failed, using pdfjs-dist fallback:", err.message);
    }
  }

  return parsePDFWithPdfjs(dataBuffer);
}

module.exports = { parsePDF };
