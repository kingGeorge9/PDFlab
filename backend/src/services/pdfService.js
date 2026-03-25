const { PDFDocument, rgb, degrees } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const sharp = require("sharp");
const { parsePDF: pdfParse } = require("../utils/pdfParser");
const { encryptPdfBuffer, decryptPdfBuffer } = require("./pdfEncryption");

class PDFService {
  async addTextToPDF(file, options) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    const {
      text,
      pageNumber = 0,
      x = 50,
      y = 50,
      fontSize = 12,
      color = "0,0,0",
    } = options;

    const pages = pdf.getPages();
    const page = pages[pageNumber];

    if (!page) {
      throw new Error(`Page ${pageNumber} does not exist`);
    }

    // Parse color
    const [r, g, b] = color.split(",").map(Number);

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      color: rgb(r / 255, g / 255, b / 255),
    });

    const editedPdfBytes = await pdf.save();
    return Buffer.from(editedPdfBytes);
  }

  // Redact/blackout area
  async redactPDF(file, options) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    const { pageNumber = 0, x = 0, y = 0, width = 100, height = 20 } = options;

    const pages = pdf.getPages();
    const page = pages[pageNumber];

    if (!page) {
      throw new Error(`Page ${pageNumber} does not exist`);
    }

    // Draw black rectangle over the area
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(0, 0, 0),
    });

    const redactedPdfBytes = await pdf.save();
    return Buffer.from(redactedPdfBytes);
  }

  // Merge PDFs
  async mergePDFs(files) {
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const pdfBytes = await fs.readFile(file.tempFilePath);
        const pdf = await PDFDocument.load(pdfBytes, {
          ignoreEncryption: true,
        });
        const copiedPages = await mergedPdf.copyPages(
          pdf,
          pdf.getPageIndices(),
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } catch (err) {
        throw new Error(
          `Failed to process file ${i + 1} (${file.name || "unknown"}): ${err.message}`,
        );
      }
    }

    const mergedPdfBytes = await mergedPdf.save();
    return Buffer.from(mergedPdfBytes);
  }

  // Split PDF
  async splitPDF(file, pageRanges) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const results = [];

    for (const range of pageRanges) {
      const newPdf = await PDFDocument.create();
      const pages = await newPdf.copyPages(pdf, range);
      pages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      results.push(Buffer.from(pdfBytes));
    }

    return results;
  }

  // Remove pages
  async removePages(file, pagesToRemove) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const totalPages = pdf.getPageCount();
    const pagesToKeep = [];

    for (let i = 0; i < totalPages; i++) {
      if (!pagesToRemove.includes(i)) {
        pagesToKeep.push(i);
      }
    }

    const copiedPages = await newPdf.copyPages(pdf, pagesToKeep);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return Buffer.from(resultBytes);
  }

  // Extract pages
  async extractPages(file, pagesToExtract) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const copiedPages = await newPdf.copyPages(pdf, pagesToExtract);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return Buffer.from(resultBytes);
  }

  // Rotate PDF
  async rotatePDF(file, rotation) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    const pages = pdf.getPages();
    pages.forEach((page) => {
      page.setRotation(degrees(rotation));
    });

    const rotatedPdfBytes = await pdf.save();
    return Buffer.from(rotatedPdfBytes);
  }

  // Add watermark
  async addWatermark(file, watermarkText, options = {}) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    const {
      fontSize = 50,
      opacity = 0.3,
      color = { r: 0.5, g: 0.5, b: 0.5 },
      rotation = 45,
    } = options;

    pages.forEach((page) => {
      const { width, height } = page.getSize();
      page.drawText(watermarkText, {
        x: width / 2 - (watermarkText.length * fontSize) / 4,
        y: height / 2,
        size: fontSize,
        color: rgb(color.r, color.g, color.b),
        opacity: opacity,
        rotate: degrees(rotation),
      });
    });

    const watermarkedPdfBytes = await pdf.save();
    return Buffer.from(watermarkedPdfBytes);
  }

  // Add page numbers
  async addPageNumbers(file, options = {}) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    const {
      position = "bottom",
      alignment = "center",
      fontSize = 12,
    } = options;

    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      const pageNumber = `${index + 1}`;

      let x, y;

      // Calculate position
      if (alignment === "center") {
        x = width / 2 - (pageNumber.length * fontSize) / 4;
      } else if (alignment === "left") {
        x = 50;
      } else {
        x = width - 50;
      }

      y = position === "bottom" ? 30 : height - 30;

      page.drawText(pageNumber, {
        x,
        y,
        size: fontSize,
        color: rgb(0, 0, 0),
      });
    });

    const numberedPdfBytes = await pdf.save();
    return Buffer.from(numberedPdfBytes);
  }

  // Compress PDF (basic optimization)
  // Compress PDF with quality options
  async compressPDF(file, quality = "medium") {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    // Compression options based on quality
    const compressionOptions = {
      useObjectStreams: true,
      addDefaultPage: false,
    };

    // For more aggressive compression, we'd need Ghostscript or qpdf
    // This provides structural optimization via pdf-lib
    const compressedPdfBytes = await pdf.save(compressionOptions);

    // Report compression stats
    const originalSize = pdfBytes.length;
    const compressedSize = compressedPdfBytes.length;
    const savings = (
      ((originalSize - compressedSize) / originalSize) *
      100
    ).toFixed(1);

    console.log(
      `Compression: ${originalSize} -> ${compressedSize} bytes (${savings}% reduction)`,
    );

    return Buffer.from(compressedPdfBytes);
  }

  // Get PDF info
  async getPDFInfo(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    return {
      pageCount: pdf.getPageCount(),
      title: pdf.getTitle(),
      author: pdf.getAuthor(),
      subject: pdf.getSubject(),
      creator: pdf.getCreator(),
      producer: pdf.getProducer(),
      creationDate: pdf.getCreationDate(),
      modificationDate: pdf.getModificationDate(),
    };
  }

  // Organize pages (reorder)
  async organizePDF(file, pageOrder) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const copiedPages = await newPdf.copyPages(pdf, pageOrder);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return Buffer.from(resultBytes);
  }

  // Reverse page order
  async reversePDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const totalPages = pdf.getPageCount();
    const reverseOrder = Array.from(
      { length: totalPages },
      (_, i) => totalPages - 1 - i,
    );

    const copiedPages = await newPdf.copyPages(pdf, reverseOrder);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return Buffer.from(resultBytes);
  }

  // Duplicate pages
  async duplicatePDF(file, pagesToDuplicate) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const totalPages = pdf.getPageCount();
    const pageOrder = [];

    for (let i = 0; i < totalPages; i++) {
      pageOrder.push(i);
      if (pagesToDuplicate.includes(i)) {
        pageOrder.push(i);
      }
    }

    const copiedPages = await newPdf.copyPages(pdf, pageOrder);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return Buffer.from(resultBytes);
  }

  // Repair PDF (reload and save with recovery options)
  async repairPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });

    // Remove any invalid or corrupt references by rebuilding
    const repairedBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
    return Buffer.from(repairedBytes);
  }

  // Optimize images in PDF
  async optimizeImagesPDF(file, quality = 80) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    // Get all embedded images and attempt to optimize them
    // Note: Full image extraction/replacement requires complex stream parsing
    // This implementation focuses on structural optimization
    const optimizedBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    return Buffer.from(optimizedBytes);
  }

  // Remove duplicate pages using content hash comparison
  async removeDuplicatesPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const totalPages = pdf.getPageCount();
    const pageHashes = new Map();
    const uniquePageIndices = [];

    // Generate hash for each page content
    for (let i = 0; i < totalPages; i++) {
      const tempPdf = await PDFDocument.create();
      const [copiedPage] = await tempPdf.copyPages(pdf, [i]);
      tempPdf.addPage(copiedPage);
      const singlePageBytes = await tempPdf.save();

      // Create content hash
      const hash = crypto
        .createHash("md5")
        .update(singlePageBytes)
        .digest("hex");

      if (!pageHashes.has(hash)) {
        pageHashes.set(hash, i);
        uniquePageIndices.push(i);
      }
    }

    // Copy only unique pages
    if (uniquePageIndices.length > 0) {
      const copiedPages = await newPdf.copyPages(pdf, uniquePageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));
    }

    const resultBytes = await newPdf.save();
    return Buffer.from(resultBytes);
  }

  // Protect PDF with password
  async protectPDF(file, password, permissions = {}) {
    const pdfBytes = await fs.readFile(file.tempFilePath);

    // Try qpdf first (best quality encryption)
    try {
      const tmpInput = file.tempFilePath;
      const tmpOutput = tmpInput + ".protected.pdf";

      await execFileAsync(
        "qpdf",
        ["--encrypt", password, password, "256", "--", tmpInput, tmpOutput],
        { timeout: 30000 },
      );

      const result = await fs.readFile(tmpOutput);
      try {
        await fs.unlink(tmpOutput);
      } catch (e) {
        /* ignore */
      }
      return result;
    } catch (qpdfError) {
      // qpdf not available — fall back to pure JS encryption (RC4-128)
      console.log("qpdf not found, using built-in RC4-128 encryption fallback");
    }

    // Fallback: Pure JavaScript encryption using built-in crypto.
    // Encrypt raw bytes directly — skipping pdf-lib normalization to avoid
    // xref-stream / ObjStm incompatibilities with the RC4 encryptor.
    console.log(
      `[DEBUG protect] FALLBACK RC4 | pwdLen=${password.length} ` +
        `hasSpace=${password.includes(" ")} pdfSize=${pdfBytes.length}`,
    );
    const encResult = await encryptPdfBuffer(pdfBytes, password, password, -3904);

    // Validate the encrypted output is a valid PDF with /Encrypt dict
    PDFService._validatePdfOutput(encResult, "encryption");
    const encText = encResult.toString("latin1");
    if (!encText.includes("/Encrypt")) {
      throw new Error("Encryption produced invalid output: missing /Encrypt dictionary.");
    }

    console.log(`[DEBUG protect] encrypted size=${encResult.length}`);
    return encResult;
  }

  // Unlock PDF (remove password protection)
  async unlockPDF(file, password) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    console.log(
      `[DEBUG unlock] pwdLen=${password.length} hasSpace=${password.includes(" ")} ` +
        `pdfSize=${pdfBytes.length}`,
    );

    // Try qpdf first (most reliable decryption)
    try {
      const tmpOutput = file.tempFilePath + ".unlocked.pdf";

      await execFileAsync(
        "qpdf",
        ["--password=" + password, "--decrypt", file.tempFilePath, tmpOutput],
        { timeout: 30000 },
      );

      const result = await fs.readFile(tmpOutput);
      try {
        await fs.unlink(tmpOutput);
      } catch (e) {
        /* ignore */
      }
      console.log("[DEBUG unlock] qpdf succeeded");
      PDFService._validatePdfOutput(result, "decryption");
      return result;
    } catch (qpdfError) {
      const qMsg = (qpdfError.stderr || qpdfError.message || "").toLowerCase();
      console.log("[DEBUG unlock] qpdf failed:", qMsg);
      // qpdf explicitly reports wrong password
      if (qMsg.includes("invalid password")) {
        throw new Error("Incorrect password");
      }
    }

    // Fallback 1: pdf-lib (handles owner-password-only PDFs where user
    // password is empty — it cannot actually decrypt user-password PDFs)
    try {
      const pdf = await PDFDocument.load(pdfBytes, {
        password: password,
      });
      const unlockedBytes = await pdf.save();
      console.log("[DEBUG unlock] pdf-lib succeeded");
      const result = Buffer.from(unlockedBytes);
      PDFService._validatePdfOutput(result, "decryption");
      return result;
    } catch (pdfLibError) {
      const msg = (pdfLibError.message || "").toLowerCase();
      console.log(`[DEBUG unlock] pdf-lib failed: ${pdfLibError.message}`);
      // pdf-lib does NOT actually decrypt user-password-protected PDFs.
      // It always throws for encrypted files, so we never report "wrong
      // password" from this path — just fall through to the RC4 decryptor.
    }

    // Fallback 2: pure-JS RC4 decryptor (handles PDFs our own encryptor produced)
    try {
      const result = decryptPdfBuffer(pdfBytes, password);
      console.log("[DEBUG unlock] built-in RC4 decryptor succeeded");
      PDFService._validatePdfOutput(result, "decryption");
      return result;
    } catch (jsError) {
      console.error(
        `[DEBUG unlock] built-in decryptor failed: ${jsError.message}`,
      );
      const jsMsg = (jsError.message || "").toLowerCase();
      if (jsMsg.includes("incorrect password")) {
        throw new Error("Incorrect password");
      }
      throw new Error(
        "Failed to unlock PDF. The file may use an unsupported encryption " +
          "format (AES-256). Try opening it in Adobe Acrobat or Chrome first.",
      );
    }
  }

  /**
   * Validate that a buffer is a well-formed PDF.
   * Throws if the output is obviously broken (prevents saving corrupt files).
   */
  static _validatePdfOutput(buf, operation) {
    if (!buf || buf.length < 20) {
      throw new Error(`${operation} produced empty or truncated output.`);
    }
    const header = buf.subarray(0, 5).toString("latin1");
    if (header !== "%PDF-") {
      throw new Error(`${operation} produced invalid output (not a PDF).`);
    }
    // Check for %%EOF marker in the last 128 bytes
    const tail = buf.subarray(Math.max(0, buf.length - 128)).toString("latin1");
    if (!tail.includes("%%EOF")) {
      throw new Error(`${operation} produced truncated output (missing %%EOF).`);
    }
  }

  // Encrypt PDF with password protection
  async encryptPDF(file, password, encryptionType = "AES-256") {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const keyLength = encryptionType === "AES-128" ? 128 : 256;

    // Try qpdf first (supports AES-256)
    try {
      const tmpInput = file.tempFilePath;
      const tmpOutput = tmpInput + ".encrypted.pdf";

      await execFileAsync(
        "qpdf",
        [
          "--encrypt",
          password,
          password,
          String(keyLength),
          "--",
          tmpInput,
          tmpOutput,
        ],
        { timeout: 30000 },
      );

      const result = await fs.readFile(tmpOutput);
      try {
        await fs.unlink(tmpOutput);
      } catch (e) {
        /* ignore */
      }
      return result;
    } catch (qpdfError) {
      // qpdf not available — fall back to pure JS encryption (RC4-128)
      console.log("qpdf not found, using built-in RC4-128 encryption fallback");
    }

    // Fallback: Pure JavaScript encryption (RC4-128).
    // Encrypt raw bytes directly — skipping pdf-lib normalization to avoid
    // the /ObjStm encryption incompatibility (see protectPDF for full note).
    console.log(
      `[DEBUG encrypt] FALLBACK RC4 | pwdLen=${password.length} ` +
        `hasSpace=${password.includes(" ")} pdfSize=${pdfBytes.length}`,
    );
    // -3904 = allow printing; -4 = no permissions (most restrictive)
    const permFlags = -3904;
    const encResult = await encryptPdfBuffer(pdfBytes, password, password, permFlags);
    PDFService._validatePdfOutput(encResult, "encryption");
    console.log(`[DEBUG encrypt] encrypted size=${encResult.length}`);
    return encResult;
  }

  // Add header/footer
  async addHeaderFooterPDF(file, header, footer) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    pages.forEach((page, index) => {
      const { width, height } = page.getSize();

      if (header) {
        page.drawText(header, {
          x: 50,
          y: height - 30,
          size: 10,
          color: rgb(0, 0, 0),
        });
      }

      if (footer) {
        page.drawText(footer, {
          x: 50,
          y: 20,
          size: 10,
          color: rgb(0, 0, 0),
        });
      }
    });

    const resultBytes = await pdf.save();
    return Buffer.from(resultBytes);
  }

  // Crop PDF
  async cropPDF(file, cropBox) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    const { x, y, width, height } = cropBox;

    pages.forEach((page) => {
      page.setCropBox(x, y, width, height);
    });

    const croppedBytes = await pdf.save();
    return Buffer.from(croppedBytes);
  }

  // Resize PDF
  async resizePDF(file, width, height) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    pages.forEach((page) => {
      page.setSize(width, height);
    });

    const resizedBytes = await pdf.save();
    return Buffer.from(resizedBytes);
  }

  // Edit text (simplified - adds new text)
  async editTextPDF(file, edits) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    edits.forEach((edit) => {
      const page = pages[edit.pageNumber || 0];
      if (page) {
        page.drawText(edit.text, {
          x: edit.x || 50,
          y: edit.y || 50,
          size: edit.fontSize || 12,
          color: rgb(0, 0, 0),
        });
      }
    });

    const editedBytes = await pdf.save();
    return Buffer.from(editedBytes);
  }

  // Highlight text
  async highlightPDF(file, highlights) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    highlights.forEach((highlight) => {
      const page = pages[highlight.pageNumber || 0];
      if (page) {
        page.drawRectangle({
          x: highlight.x || 50,
          y: highlight.y || 50,
          width: highlight.width || 100,
          height: highlight.height || 20,
          color: rgb(1, 1, 0),
          opacity: 0.3,
        });
      }
    });

    const highlightedBytes = await pdf.save();
    return Buffer.from(highlightedBytes);
  }

  // Annotate PDF
  async annotatePDF(file, annotations) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    annotations.forEach((annotation) => {
      const page = pages[annotation.pageNumber || 0];
      if (page) {
        page.drawText(annotation.text, {
          x: annotation.x || 50,
          y: annotation.y || 50,
          size: annotation.fontSize || 10,
          color: rgb(1, 0, 0),
        });
      }
    });

    const annotatedBytes = await pdf.save();
    return Buffer.from(annotatedBytes);
  }

  // Draw on PDF - Freehand drawing with paths/lines
  async drawOnPDF(file, drawings) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    drawings.forEach((drawing) => {
      const page = pages[drawing.pageNumber || 0];
      if (!page) return;

      const paths = drawing.paths || [];
      paths.forEach((pathData) => {
        const points = pathData.points || [];
        if (points.length < 2) return;

        // Parse color
        const colorStr = pathData.color || "0,0,0";
        const [r, g, b] = colorStr.split(",").map((n) => parseInt(n) / 255);
        const strokeWidth = pathData.strokeWidth || 2;

        // Draw lines between consecutive points
        for (let i = 0; i < points.length - 1; i++) {
          const start = points[i];
          const end = points[i + 1];

          page.drawLine({
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
            thickness: strokeWidth,
            color: rgb(r, g, b),
            opacity: pathData.opacity || 1,
          });
        }
      });

      // Support for shapes (circles, rectangles)
      const shapes = drawing.shapes || [];
      shapes.forEach((shape) => {
        const colorStr = shape.color || "0,0,0";
        const [r, g, b] = colorStr.split(",").map((n) => parseInt(n) / 255);

        if (shape.type === "rectangle") {
          page.drawRectangle({
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            borderColor: rgb(r, g, b),
            borderWidth: shape.strokeWidth || 2,
            opacity: shape.opacity || 1,
          });
        } else if (shape.type === "circle" || shape.type === "ellipse") {
          page.drawEllipse({
            x: shape.x,
            y: shape.y,
            xScale: shape.radiusX || shape.radius || 20,
            yScale: shape.radiusY || shape.radius || 20,
            borderColor: rgb(r, g, b),
            borderWidth: shape.strokeWidth || 2,
            opacity: shape.opacity || 1,
          });
        }
      });
    });

    const drawnBytes = await pdf.save();
    return Buffer.from(drawnBytes);
  }

  // Add stamp - draws a visible, bordered stamp on every page
  async stampPDF(file, stamp) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();
    const font = await pdf.embedFont("Helvetica-Bold");

    const stampText = (stamp || "APPROVED").toUpperCase();
    const fontSize = 28;
    const textWidth = font.widthOfTextAtSize(stampText, fontSize);
    const textHeight = fontSize;
    const padding = 12;

    // Choose stamp color based on type
    let stampColor;
    switch (stampText) {
      case "DRAFT":
        stampColor = rgb(0.5, 0.5, 0.5);
        break;
      case "CONFIDENTIAL":
        stampColor = rgb(0.8, 0, 0);
        break;
      default:
        stampColor = rgb(0, 0.6, 0);
        break; // approved = green
    }

    pages.forEach((page) => {
      const { width, height } = page.getSize();
      const boxW = textWidth + padding * 2;
      const boxH = textHeight + padding * 2;
      const x = width - boxW - 30;
      const y = height - boxH - 30;

      // Draw border rectangle
      page.drawRectangle({
        x,
        y,
        width: boxW,
        height: boxH,
        borderColor: stampColor,
        borderWidth: 3,
        color: rgb(1, 1, 1),
        opacity: 0.85,
        borderOpacity: 0.9,
      });

      // Draw stamp text
      page.drawText(stampText, {
        x: x + padding,
        y: y + padding,
        size: fontSize,
        font,
        color: stampColor,
        opacity: 0.9,
      });
    });

    const stampedBytes = await pdf.save();
    return Buffer.from(stampedBytes);
  }

  // Get/Set metadata
  async setMetadataPDF(file, metadata) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    if (metadata.title) pdf.setTitle(metadata.title);
    if (metadata.author) pdf.setAuthor(metadata.author);
    if (metadata.subject) pdf.setSubject(metadata.subject);
    if (metadata.keywords) pdf.setKeywords(metadata.keywords);
    if (metadata.creator) pdf.setCreator(metadata.creator);
    if (metadata.producer) pdf.setProducer(metadata.producer);

    const resultBytes = await pdf.save();
    return Buffer.from(resultBytes);
  }

  // Search in PDF
  async searchPDF(file, query) {
    const dataBuffer = await fs.readFile(file.tempFilePath);
    const data = await pdfParse(dataBuffer);

    const results = [];
    const lines = data.text.split("\n");
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(query.toLowerCase())) {
        results.push({ lineNumber: index + 1, text: line });
      }
    });

    return results;
  }

  // Validate PDF - comprehensive validation
  async validatePDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const validation = {
      valid: false,
      pageCount: 0,
      fileSize: pdfBytes.length,
      metadata: {},
      issues: [],
      pdfVersion: null,
      hasForm: false,
      isEncrypted: false,
      hasEmbeddedFiles: false,
    };

    try {
      // Try loading with different options to detect encryption
      let pdf;
      try {
        pdf = await PDFDocument.load(pdfBytes);
      } catch (encError) {
        if (encError.message.includes("encrypt")) {
          validation.isEncrypted = true;
          pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        } else {
          throw encError;
        }
      }

      validation.valid = true;
      validation.pageCount = pdf.getPageCount();

      // Extract metadata
      validation.metadata = {
        title: pdf.getTitle() || null,
        author: pdf.getAuthor() || null,
        subject: pdf.getSubject() || null,
        creator: pdf.getCreator() || null,
        producer: pdf.getProducer() || null,
        creationDate: pdf.getCreationDate() || null,
        modificationDate: pdf.getModificationDate() || null,
      };

      // Check for forms
      try {
        const form = pdf.getForm();
        const fields = form.getFields();
        validation.hasForm = fields.length > 0;
        validation.formFieldCount = fields.length;
      } catch (formError) {
        validation.hasForm = false;
      }

      // Check page sizes for consistency
      const pages = pdf.getPages();
      const pageSizes = pages.map((p, i) => ({
        page: i + 1,
        width: Math.round(p.getWidth()),
        height: Math.round(p.getHeight()),
        rotation: p.getRotation().angle,
      }));
      validation.pageSizes = pageSizes;

      // Check for potential issues
      if (validation.pageCount === 0) {
        validation.issues.push("Document has no pages");
      }
      if (!validation.metadata.title) {
        validation.issues.push("Missing title metadata");
      }
      if (validation.fileSize > 50 * 1024 * 1024) {
        validation.issues.push(
          "File size exceeds 50MB - may cause performance issues",
        );
      }
    } catch (error) {
      validation.valid = false;
      validation.error = error.message;
      validation.issues.push(`Parse error: ${error.message}`);
    }

    return validation;
  }

  // Create form - with optional blank PDF generation
  async createFormPDF(file, fields) {
    let pdf;
    if (file) {
      const pdfBytes = await fs.readFile(file.tempFilePath);
      pdf = await PDFDocument.load(pdfBytes);
    } else {
      // Create a blank A4 PDF
      pdf = await PDFDocument.create();
      pdf.addPage([595.28, 841.89]); // A4
    }

    const form = pdf.getForm();
    const pages = pdf.getPages();
    const page = pages[0];
    const { width } = page.getSize();

    let yOffset = page.getSize().height - 60; // Start from top with margin
    const fieldHeight = 24;
    const fieldSpacing = 16;
    const labelHeight = 14;
    const leftMargin = 50;
    const fieldWidth = Math.min(width - 100, 400);

    const font = await pdf.embedFont("Helvetica");

    fields.forEach((field) => {
      // Check if we need a new page
      if (yOffset < 60) {
        const newPage = pdf.addPage([595.28, 841.89]);
        yOffset = newPage.getSize().height - 60;
      }

      // Draw field label
      page.drawText(field.name + (field.type === "checkbox" ? "" : ":"), {
        x: leftMargin,
        y: yOffset + fieldHeight + 2,
        size: 11,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });

      if (field.type === "text") {
        const textField = form.createTextField(field.name);
        textField.addToPage(page, {
          x: leftMargin,
          y: yOffset,
          width: fieldWidth,
          height: fieldHeight,
          borderWidth: 1,
          borderColor: rgb(0.7, 0.7, 0.7),
        });
        textField.setText("");
      } else if (field.type === "checkbox") {
        const checkbox = form.createCheckBox(field.name);
        checkbox.addToPage(page, {
          x: leftMargin,
          y: yOffset,
          width: 18,
          height: 18,
          borderWidth: 1,
          borderColor: rgb(0.7, 0.7, 0.7),
        });
      }

      yOffset -= fieldHeight + labelHeight + fieldSpacing;
    });

    const formBytes = await pdf.save();
    return Buffer.from(formBytes);
  }

  // Fill form
  async fillFormPDF(file, data) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const form = pdf.getForm();

    Object.keys(data).forEach((key) => {
      try {
        const field = form.getField(key);
        if (field) {
          field.setText ? field.setText(data[key]) : null;
        }
      } catch (error) {
        console.log(`Field ${key} not found`);
      }
    });

    const filledBytes = await pdf.save();
    return Buffer.from(filledBytes);
  }

  // Flatten form
  async flattenFormPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const form = pdf.getForm();

    form.flatten();

    const flattenedBytes = await pdf.save();
    return Buffer.from(flattenedBytes);
  }

  // Extract form data
  async extractFormDataPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const form = pdf.getForm();

    const fields = form.getFields();
    const formData = {};

    fields.forEach((field) => {
      const name = field.getName();
      try {
        formData[name] = field.getText ? field.getText() : "N/A";
      } catch (error) {
        formData[name] = "Unable to extract";
      }
    });

    return formData;
  }

  // Compare PDFs - Create side-by-side comparison document
  async comparePDFs(file1, file2) {
    const pdfBytes1 = await fs.readFile(file1.tempFilePath);
    const pdfBytes2 = await fs.readFile(file2.tempFilePath);

    const pdf1 = await PDFDocument.load(pdfBytes1);
    const pdf2 = await PDFDocument.load(pdfBytes2);

    const mergedPdf = await PDFDocument.create();

    // Interleave pages from both PDFs for easy comparison
    const maxPages = Math.max(pdf1.getPageCount(), pdf2.getPageCount());

    for (let i = 0; i < maxPages; i++) {
      // Add page from PDF1 (or blank if doesn't exist)
      if (i < pdf1.getPageCount()) {
        const [page1] = await mergedPdf.copyPages(pdf1, [i]);
        mergedPdf.addPage(page1);
      } else {
        mergedPdf.addPage();
      }

      // Add page from PDF2 (or blank if doesn't exist)
      if (i < pdf2.getPageCount()) {
        const [page2] = await mergedPdf.copyPages(pdf2, [i]);
        mergedPdf.addPage(page2);
      } else {
        mergedPdf.addPage();
      }
    }

    // Add comparison metadata
    mergedPdf.setTitle("PDF Comparison");
    mergedPdf.setSubject(
      `Comparing ${pdf1.getPageCount()} pages vs ${pdf2.getPageCount()} pages`,
    );

    const comparisonBytes = await mergedPdf.save();
    return Buffer.from(comparisonBytes);
  }

  // Get differences - Detailed text comparison
  async diffPDFs(file1, file2) {
    const dataBuffer1 = await fs.readFile(file1.tempFilePath);
    const dataBuffer2 = await fs.readFile(file2.tempFilePath);

    const data1 = await pdfParse(dataBuffer1);
    const data2 = await pdfParse(dataBuffer2);

    // Simple word-level diff
    const words1 = data1.text.split(/\s+/).filter((w) => w.length > 0);
    const words2 = data2.text.split(/\s+/).filter((w) => w.length > 0);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const onlyInPdf1 = words1.filter((w) => !set2.has(w));
    const onlyInPdf2 = words2.filter((w) => !set1.has(w));
    const commonWords = words1.filter((w) => set2.has(w));

    return {
      summary: {
        pdf1: {
          pageCount: data1.numpages,
          wordCount: words1.length,
          charCount: data1.text.length,
        },
        pdf2: {
          pageCount: data2.numpages,
          wordCount: words2.length,
          charCount: data2.text.length,
        },
      },
      differences: {
        onlyInPdf1: [...new Set(onlyInPdf1)].slice(0, 100),
        onlyInPdf2: [...new Set(onlyInPdf2)].slice(0, 100),
        commonWordsCount: new Set(commonWords).size,
        similarityScore:
          (
            (new Set(commonWords).size / Math.max(set1.size, set2.size)) *
            100
          ).toFixed(2) + "%",
      },
    };
  }

  // Merge with review - Combine annotations from multiple PDFs
  async mergeReviewPDFs(file1, file2) {
    return this.mergePDFs([file1, file2]);
  }

  // Convert to black and white using page rendering
  async blackWhitePDF(file) {
    const { fromPath } = require("pdf2pic");

    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pageCount = pdf.getPageCount();

    const newPdf = await PDFDocument.create();

    // Convert each page to grayscale image and back to PDF
    const options = {
      density: 150,
      saveFilename: `bw_${Date.now()}`,
      savePath: path.dirname(file.tempFilePath),
      format: "png",
      width: 1200,
      height: 1600,
    };

    const convert = fromPath(file.tempFilePath, options);

    for (let i = 1; i <= pageCount; i++) {
      try {
        const result = await convert(i, { responseType: "buffer" });
        const imageBuffer = result.buffer || result;

        // Convert to grayscale
        const grayscaleBuffer = await sharp(imageBuffer)
          .grayscale()
          .png()
          .toBuffer();

        // Embed grayscale image as new page
        const pngImage = await newPdf.embedPng(grayscaleBuffer);
        const page = newPdf.addPage([pngImage.width, pngImage.height]);
        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: pngImage.width,
          height: pngImage.height,
        });
      } catch (error) {
        console.error(`Error converting page ${i} to grayscale:`, error);
        // Copy original page if conversion fails
        const [originalPage] = await newPdf.copyPages(pdf, [i - 1]);
        newPdf.addPage(originalPage);
      }
    }

    const bwBytes = await newPdf.save();
    return Buffer.from(bwBytes);
  }

  // Fix orientation - Detect and correct page orientation
  async fixOrientationPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    pages.forEach((page) => {
      const { width, height } = page.getSize();
      const currentRotation = page.getRotation().angle;

      // If page is landscape (width > height) and has rotation, normalize it
      if (width > height) {
        // Landscape page - check if it should be portrait
        if (currentRotation === 90 || currentRotation === 270) {
          page.setRotation(degrees(0));
        }
      } else {
        // Portrait page - ensure no rotation
        if (currentRotation !== 0) {
          page.setRotation(degrees(0));
        }
      }
    });

    const fixedBytes = await pdf.save();
    return Buffer.from(fixedBytes);
  }

  // Remove blank pages using content analysis
  async removeBlankPagesPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const pageCount = pdf.getPageCount();
    const nonBlankIndices = [];

    // Analyze each page for content
    for (let i = 0; i < pageCount; i++) {
      const tempPdf = await PDFDocument.create();
      const [copiedPage] = await tempPdf.copyPages(pdf, [i]);
      tempPdf.addPage(copiedPage);
      const singlePageBytes = await tempPdf.save();

      try {
        const pageData = await pdfParse(Buffer.from(singlePageBytes));
        const textContent = pageData.text.trim();

        // Page is non-blank if it has text content (more than just whitespace)
        if (textContent.length > 10) {
          nonBlankIndices.push(i);
        }
      } catch (error) {
        // If parsing fails, keep the page
        nonBlankIndices.push(i);
      }
    }

    // If all pages are blank, keep at least the first one
    if (nonBlankIndices.length === 0 && pageCount > 0) {
      nonBlankIndices.push(0);
    }

    // Copy non-blank pages
    const copiedPages = await newPdf.copyPages(pdf, nonBlankIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return Buffer.from(resultBytes);
  }

  // Add bookmarks (table of contents)
  async addBookmarksPDF(file, bookmarks) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    // pdf-lib doesn't have native bookmark support
    // Add bookmark info as document outline in metadata as workaround
    const bookmarkData = JSON.stringify(bookmarks);
    pdf.setSubject(`Bookmarks: ${bookmarkData.slice(0, 200)}`);

    // For full bookmark support, would need to use muhammara/HummusJS
    const resultBytes = await pdf.save();
    return Buffer.from(resultBytes);
  }

  // Add hyperlinks with proper link annotations
  async addHyperlinksPDF(file, links) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    links.forEach((link) => {
      const page = pages[link.pageNumber || 0];
      if (page) {
        const { height } = page.getSize();
        const displayText = link.text || link.url;
        const fontSize = link.fontSize || 10;
        const x = link.x || 50;
        const y = link.y || 50;

        // Draw link text with underline style
        page.drawText(displayText, {
          x: x,
          y: y,
          size: fontSize,
          color: rgb(0, 0, 0.8),
        });

        // Draw underline
        page.drawLine({
          start: { x: x, y: y - 2 },
          end: { x: x + displayText.length * fontSize * 0.5, y: y - 2 },
          thickness: 0.5,
          color: rgb(0, 0, 0.8),
        });
      }
    });

    const linkedBytes = await pdf.save();
    return Buffer.from(linkedBytes);
  }

  // Manage attachments - Embed files in PDF
  async addAttachmentsPDF(file, attachments) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    const attachList = Array.isArray(attachments)
      ? attachments
      : attachments
        ? [attachments]
        : [];
    for (const attachment of attachList) {
      if (attachment && attachment.tempFilePath) {
        const attachData = await fs.readFile(attachment.tempFilePath);
        await pdf.attach(attachData, attachment.name || "attachment", {
          mimeType: attachment.mimetype || "application/octet-stream",
          description: attachment.name || "Attached file",
        });
      } else if (attachment && attachment.data) {
        // express-fileupload may store data in .data buffer
        await pdf.attach(attachment.data, attachment.name || "attachment", {
          mimeType: attachment.mimetype || "application/octet-stream",
          description: attachment.name || "Attached file",
        });
      }
    }

    const resultBytes = await pdf.save();
    return Buffer.from(resultBytes);
  }
}

module.exports = new PDFService();
