const { PDFParse } = require("pdf-parse");

/**
 * Parse a PDF buffer and return { text, numpages }.
 * Wraps the pdf-parse v2 class-based API to match the old function-call style.
 */
async function parsePDF(dataBuffer) {
  const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
  const doc = await parser.load();
  const result = await parser.getText({ pageJoiner: "" });
  return { text: result.text, numpages: doc.numPages };
}

module.exports = { parsePDF };
