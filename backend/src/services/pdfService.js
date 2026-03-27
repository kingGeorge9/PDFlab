const { PDFDocument, rgb, degrees, PDFName, PDFArray, PDFString, PDFStream } = require("pdf-lib");
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

  // Compress PDF with real image recompression + structural optimization
  async compressPDF(file, quality = "medium") {
    const LEVELS = {
      low:    { jpegQuality: 85, scale: 1.0 },
      medium: { jpegQuality: 65, scale: 0.85 },
      high:   { jpegQuality: 45, scale: 0.7 },
    };
    const level = LEVELS[quality] || LEVELS.medium;

    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // 1. Strip metadata
    pdf.setTitle("");
    pdf.setAuthor("");
    pdf.setSubject("");
    pdf.setKeywords([]);
    pdf.setCreator("PDFiQ");
    pdf.setProducer("PDFiQ");

    // 2. Re-compress embedded JPEG images
    const context = pdf.context;
    let imagesProcessed = 0;
    for (const [, obj] of context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFStream)) continue;

      const dict = obj.dict;
      const subtype = dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
      const filter = dict.lookupMaybe(PDFName.of("Filter"), PDFName);

      if (subtype?.toString() !== "/Image") continue;
      if (!filter || filter.toString() !== "/DCTDecode") continue;

      const width = dict.lookupMaybe(PDFName.of("Width"))?.asNumber() || 0;
      const height = dict.lookupMaybe(PDFName.of("Height"))?.asNumber() || 0;
      if (!width || !height) continue;

      try {
        const imgData = obj.getContents();
        const newW = Math.max(1, Math.round(width * level.scale));
        const newH = Math.max(1, Math.round(height * level.scale));

        const recompressed = await sharp(imgData)
          .resize(newW, newH)
          .jpeg({ quality: level.jpegQuality, mozjpeg: true })
          .toBuffer();

        if (recompressed.length < imgData.length) {
          obj.setContents(recompressed);
          dict.set(PDFName.of("Width"), context.obj(newW));
          dict.set(PDFName.of("Height"), context.obj(newH));
          imagesProcessed++;
        }
      } catch {
        // Skip images that can't be re-encoded
      }
    }

    // 3. Save with structural compression
    const compressedPdfBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    const originalSize = pdfBytes.length;
    const compressedSize = compressedPdfBytes.length;
    const savings = (
      ((originalSize - compressedSize) / originalSize) *
      100
    ).toFixed(1);

    console.log(
      `Compression: ${originalSize} -> ${compressedSize} bytes (${savings}% reduction, ${imagesProcessed} images recompressed)`,
    );

    return Buffer.from(compressedPdfBytes);
  }

  // Get PDF info
  async getPDFInfo(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });

    const pages = pdf.getPages();
    const firstPage = pages[0];
    const { width: pageWidth, height: pageHeight } = firstPage
      ? firstPage.getSize()
      : { width: 0, height: 0 };
    const rotation = firstPage ? firstPage.getRotation().angle : 0;

    // PDF version from the header bytes
    let pdfVersion = "unknown";
    try {
      const header = pdfBytes.slice(0, 10).toString("utf8");
      const m = header.match(/%PDF-(\d+\.\d+)/);
      if (m) pdfVersion = m[1];
    } catch {}

    // Encryption check: scan last 1 KB of the PDF for /Encrypt in trailer
    let isEncrypted = false;
    try {
      isEncrypted = pdfBytes.slice(-1024).toString("latin1").includes("/Encrypt");
    } catch {}

    // Form fields
    let hasForm = false;
    let formFieldCount = 0;
    try {
      const form = pdf.getForm();
      const fields = form.getFields();
      formFieldCount = fields.length;
      hasForm = formFieldCount > 0;
    } catch {}

    // Count images, fonts, and check for embedded files via object enumeration
    let imageCount = 0;
    let hasEmbeddedFiles = false;
    const fontNames = new Set();
    try {
      for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
        if (!obj || typeof obj !== "object" || !obj.dict) continue;

        const typeVal = obj.dict.lookup?.(PDFName.of("Type"));
        const typeStr = typeVal?.toString() || "";

        if (obj.contents instanceof Uint8Array) {
          const sub = obj.dict.lookup?.(PDFName.of("Subtype"));
          if (sub?.toString() === "/Image") imageCount++;
        }

        if (typeStr === "/Font") {
          const baseName = obj.dict.lookup?.(PDFName.of("BaseFont"));
          if (baseName) fontNames.add(baseName.toString().replace(/^\//, ""));
        }

        if (typeStr === "/Filespec" || typeStr === "/EmbeddedFile") {
          hasEmbeddedFiles = true;
        }
      }
    } catch {}

    // Count annotations across all pages
    let annotationCount = 0;
    try {
      for (const page of pages) {
        const annots = page.node.lookup(PDFName.of("Annots"));
        if (annots instanceof PDFArray) {
          annotationCount += annots.size();
        }
      }
    } catch {}

    const fontCount = fontNames.size;

    return {
      pageCount: pdf.getPageCount(),
      fileSize: file.size || pdfBytes.length,
      pdfVersion,
      pageWidth: Math.round(pageWidth),
      pageHeight: Math.round(pageHeight),
      pageRotation: rotation !== 0 ? rotation : undefined,
      title: pdf.getTitle() || null,
      author: pdf.getAuthor() || null,
      subject: pdf.getSubject() || null,
      keywords: pdf.getKeywords() || null,
      creator: pdf.getCreator() || null,
      producer: pdf.getProducer() || null,
      creationDate: pdf.getCreationDate()
        ? pdf.getCreationDate().toISOString()
        : null,
      modificationDate: pdf.getModificationDate()
        ? pdf.getModificationDate().toISOString()
        : null,
      isEncrypted,
      hasForm,
      formFieldCount: hasForm ? formFieldCount : undefined,
      hasEmbeddedFiles,
      imageCount: imageCount > 0 ? imageCount : undefined,
      fontCount: fontCount > 0 ? fontCount : undefined,
      fontNames: fontCount > 0 ? Array.from(fontNames).slice(0, 10) : undefined,
      annotationCount: annotationCount > 0 ? annotationCount : undefined,
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

  // Optimize images in PDF — real image recompression via sharp
  async optimizeImagesPDF(file, quality = 80) {
    // Map quality number (0-100) to a descriptive level for scaling
    // quality 80+ = high quality (no downscale), 50-79 = medium, <50 = aggressive
    const scale = quality >= 80 ? 1.0 : quality >= 50 ? 0.85 : 0.7;
    const jpegQuality = Math.max(20, Math.min(95, quality));

    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    const context = pdf.context;
    let imagesOptimized = 0;
    let totalSaved = 0;

    for (const [, obj] of context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFStream)) continue;

      const dict = obj.dict;
      const subtype = dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
      if (subtype?.toString() !== "/Image") continue;

      const filter = dict.lookupMaybe(PDFName.of("Filter"), PDFName);
      const filterStr = filter?.toString() || "";
      const width = dict.lookupMaybe(PDFName.of("Width"))?.asNumber() || 0;
      const height = dict.lookupMaybe(PDFName.of("Height"))?.asNumber() || 0;
      if (!width || !height) continue;

      try {
        const imgData = obj.getContents();
        const newW = Math.max(1, Math.round(width * scale));
        const newH = Math.max(1, Math.round(height * scale));

        let recompressed;
        if (filterStr === "/DCTDecode") {
          // JPEG image — recompress as JPEG
          recompressed = await sharp(imgData)
            .resize(newW, newH)
            .jpeg({ quality: jpegQuality, mozjpeg: true })
            .toBuffer();
        } else if (filterStr === "/FlateDecode") {
          // PNG-like image (raw pixels compressed with Flate)
          // Read the color space and bits per component to reconstruct raw image
          const bpc = dict.lookupMaybe(PDFName.of("BitsPerComponent"))?.asNumber() || 8;
          const cs = dict.lookupMaybe(PDFName.of("ColorSpace"), PDFName)?.toString() || "";
          let channels = 3; // default RGB
          if (cs === "/DeviceGray") channels = 1;
          else if (cs === "/DeviceCMYK") channels = 4;

          const expectedSize = width * height * channels * (bpc / 8);
          if (imgData.length < expectedSize * 0.5) continue; // Not raw pixel data

          // Try to interpret as raw pixels and recompress as JPEG
          recompressed = await sharp(imgData, {
            raw: { width, height, channels },
          })
            .resize(newW, newH)
            .jpeg({ quality: jpegQuality, mozjpeg: true })
            .toBuffer();

          // Switch filter to DCTDecode since we're now JPEG
          if (recompressed.length < imgData.length) {
            dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
            dict.set(PDFName.of("ColorSpace"), PDFName.of(channels === 1 ? "DeviceGray" : "DeviceRGB"));
            dict.set(PDFName.of("BitsPerComponent"), context.obj(8));
          }
        } else {
          continue; // Skip unsupported filters
        }

        if (recompressed && recompressed.length < imgData.length) {
          const saved = imgData.length - recompressed.length;
          totalSaved += saved;
          obj.setContents(recompressed);
          dict.set(PDFName.of("Width"), context.obj(newW));
          dict.set(PDFName.of("Height"), context.obj(newH));
          imagesOptimized++;
        }
      } catch {
        // Skip images that can't be processed
      }
    }

    const optimizedBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    console.log(
      `[OptimizeImages] ${imagesOptimized} images optimized, ~${(totalSaved / 1024).toFixed(0)}KB saved from images, output: ${optimizedBytes.length} bytes`,
    );

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
      const { width: origW, height: origH } = page.getSize();
      const scaleX = width / origW;
      const scaleY = height / origH;
      // Scale content to fit new page dimensions
      page.scale(scaleX, scaleY);
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

  // Fill form — handles text, checkbox, radio, dropdown, and listbox fields
  async fillFormPDF(file, data) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const form = pdf.getForm();

    for (const [key, value] of Object.entries(data)) {
      try {
        const field = form.getField(key);
        if (!field) continue;

        const constructor = field.constructor?.name || "";

        if (constructor.includes("CheckBox") || constructor.includes("Checkbox")) {
          if (value === "true" || value === "yes" || value === "1") {
            field.check();
          } else {
            field.uncheck();
          }
        } else if (constructor.includes("RadioGroup") || constructor.includes("Radio")) {
          if (typeof field.select === "function") field.select(value);
        } else if (constructor.includes("Dropdown") || constructor.includes("ComboBox")) {
          if (typeof field.select === "function") field.select(value);
        } else if (constructor.includes("OptionList") || constructor.includes("ListBox")) {
          if (typeof field.select === "function") field.select([value]);
        } else {
          // Text field
          if (typeof field.setText === "function") field.setText(value);
        }
      } catch (err) {
        console.warn(`[fillForm] Could not set field "${key}":`, err.message);
      }
    }

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

  // Extract form data with field types
  async extractFormDataPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const form = pdf.getForm();

    const fields = form.getFields();
    const formFields = [];

    fields.forEach((field) => {
      const name = field.getName();
      const constructor = field.constructor?.name || "";
      let type = "text";
      let value = "";
      let options = undefined;

      try {
        if (constructor.includes("CheckBox") || constructor.includes("Checkbox")) {
          type = "checkbox";
          value = field.isChecked?.() ? "true" : "false";
        } else if (constructor.includes("RadioGroup") || constructor.includes("Radio")) {
          type = "radio";
          value = field.getSelected?.() || "";
          try { options = field.getOptions?.(); } catch {}
        } else if (constructor.includes("Dropdown") || constructor.includes("ComboBox")) {
          type = "dropdown";
          value = field.getSelected?.()?.join(", ") || "";
          try { options = field.getOptions?.(); } catch {}
        } else if (constructor.includes("OptionList") || constructor.includes("ListBox")) {
          type = "listbox";
          value = field.getSelected?.()?.join(", ") || "";
          try { options = field.getOptions?.(); } catch {}
        } else {
          type = "text";
          value = field.getText?.() || "";
        }
      } catch {
        type = "text";
        value = "";
      }

      formFields.push({ name, type, value: value === "N/A" ? "" : value, options });
    });

    return { fields: formFields, count: formFields.length };
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

  // Get differences - Per-page text comparison with line-level diff
  async diffPDFs(file1, file2) {
    const { extractTextWithPositions } = require("../utils/pdfTextExtractor");

    const buf1 = await fs.readFile(file1.tempFilePath);
    const buf2 = await fs.readFile(file2.tempFilePath);

    // Extract text per page using pdfjs-dist (reliable, no module format issues)
    const [result1, result2] = await Promise.all([
      extractTextWithPositions(buf1),
      extractTextWithPositions(buf2),
    ]);

    const pages1 = result1.pages;
    const pages2 = result2.pages;

    // Build per-page text arrays
    const text1PerPage = pages1.map((p) =>
      p.items.map((it) => it.text).join(" ").trim()
    );
    const text2PerPage = pages2.map((p) =>
      p.items.map((it) => it.text).join(" ").trim()
    );

    const fullText1 = text1PerPage.join("\n");
    const fullText2 = text2PerPage.join("\n");

    const words1 = fullText1.split(/\s+/).filter((w) => w.length > 0);
    const words2 = fullText2.split(/\s+/).filter((w) => w.length > 0);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const commonSet = new Set([...set1].filter((w) => set2.has(w)));

    // Per-page diff: compare corresponding pages
    const maxPages = Math.max(pages1.length, pages2.length);
    const pageDiffs = [];
    for (let i = 0; i < maxPages; i++) {
      const t1 = text1PerPage[i] || "";
      const t2 = text2PerPage[i] || "";

      if (t1 === t2) {
        pageDiffs.push({ page: i + 1, status: "identical" });
      } else {
        // Find lines unique to each version
        const lines1 = t1.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);
        const lines2 = t2.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);
        const lineSet1 = new Set(lines1);
        const lineSet2 = new Set(lines2);
        const removed = lines1.filter((l) => !lineSet2.has(l)).slice(0, 20);
        const added = lines2.filter((l) => !lineSet1.has(l)).slice(0, 20);

        pageDiffs.push({
          page: i + 1,
          status: "changed",
          removed,
          added,
        });
      }
    }

    return {
      summary: {
        pdf1: {
          pageCount: pages1.length,
          wordCount: words1.length,
          charCount: fullText1.length,
        },
        pdf2: {
          pageCount: pages2.length,
          wordCount: words2.length,
          charCount: fullText2.length,
        },
      },
      differences: {
        onlyInPdf1: [...new Set(words1.filter((w) => !set2.has(w)))].slice(0, 100),
        onlyInPdf2: [...new Set(words2.filter((w) => !set1.has(w)))].slice(0, 100),
        commonWordsCount: commonSet.size,
        similarityScore:
          set1.size === 0 && set2.size === 0
            ? "100.00%"
            : ((commonSet.size / Math.max(set1.size, set2.size)) * 100).toFixed(2) + "%",
        pageDiffs,
      },
    };
  }

  // Merge with review - Copy annotations from file2 onto matching pages of file1
  async mergeReviewPDFs(file1, file2) {
    const pdfBytes1 = await fs.readFile(file1.tempFilePath);
    const pdfBytes2 = await fs.readFile(file2.tempFilePath);

    const basePdf = await PDFDocument.load(pdfBytes1, { ignoreEncryption: true });
    const reviewPdf = await PDFDocument.load(pdfBytes2, { ignoreEncryption: true });

    const basePages = basePdf.getPages();
    const reviewPages = reviewPdf.getPages();
    const context = basePdf.context;

    // For each page in the review PDF, extract annotations and copy to base
    const maxPages = Math.min(basePages.length, reviewPages.length);
    let annotsCopied = 0;

    for (let i = 0; i < maxPages; i++) {
      const reviewPageNode = reviewPages[i].node;
      const basePageNode = basePages[i].node;

      // Get annotations from review page
      let reviewAnnots;
      try {
        reviewAnnots = reviewPageNode.lookup?.(PDFName.of("Annots"))
          || reviewPageNode.get?.(PDFName.of("Annots"));
      } catch { continue; }

      if (!reviewAnnots) continue;

      // Get or create annotations array on base page
      let baseAnnots;
      try {
        baseAnnots = basePageNode.lookup?.(PDFName.of("Annots"))
          || basePageNode.get?.(PDFName.of("Annots"));
      } catch { /* no existing annots */ }

      if (!(baseAnnots instanceof PDFArray)) {
        baseAnnots = context.obj([]);
        basePageNode.set(PDFName.of("Annots"), baseAnnots);
      }

      // Copy each annotation from review to base
      const annotsArray = reviewAnnots instanceof PDFArray ? reviewAnnots : null;
      if (!annotsArray) continue;

      for (let j = 0; j < annotsArray.size(); j++) {
        try {
          const annotRef = annotsArray.get(j);
          const annotObj = reviewPdf.context.lookup(annotRef);
          if (!annotObj) continue;

          // Serialize and re-register in base context
          // Use copyPages trick: copy a temporary page to bring objects over
          const annotDict = annotObj.dict || annotObj;

          // Check if it's a meaningful annotation (not just Link)
          let subtypeVal;
          try {
            subtypeVal = annotDict.lookup?.(PDFName.of("Subtype"))
              || annotDict.get?.(PDFName.of("Subtype"));
          } catch { /* skip */ }

          const subtypeStr = subtypeVal?.toString?.() || "";
          // Copy all annotation types: Text, Highlight, StrikeOut, Underline,
          // FreeText, Stamp, Ink, Square, Circle, Polygon, Caret, etc.

          // Re-create annotation in base context
          const newAnnotDict = context.obj({});
          const entries = annotDict.entries?.() || [];
          for (const [key, val] of entries) {
            try {
              // Skip the P (page) reference since it points to review PDF
              if (key.toString() === "/P") continue;
              newAnnotDict.set(key, val);
            } catch { /* skip non-copyable entries */ }
          }

          const newAnnotRef = context.register(newAnnotDict);
          baseAnnots.push(newAnnotRef);
          annotsCopied++;
        } catch { /* skip problematic annotation */ }
      }
    }

    // If review PDF has extra pages beyond base, append them
    if (reviewPages.length > basePages.length) {
      const extraIndices = [];
      for (let i = basePages.length; i < reviewPages.length; i++) {
        extraIndices.push(i);
      }
      const extraPages = await basePdf.copyPages(reviewPdf, extraIndices);
      extraPages.forEach((page) => basePdf.addPage(page));
    }

    const resultBytes = await basePdf.save();
    return Buffer.from(resultBytes);
  }

  // Convert to black and white using page rendering.
  // Strategy 1: pdf2pic (requires GraphicsMagick/ImageMagick) — best quality.
  // Strategy 2: pdfjs-dist + node-canvas — pure JS fallback.
  // Strategy 3: pdf-lib image-only grayscale — converts embedded images only.
  async blackWhitePDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const srcPdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pageCount = srcPdf.getPageCount();

    // ── Strategy 1: pdf2pic full-page rasterization ──────────────────
    try {
      const { fromBuffer } = require("pdf2pic");
      const newPdf = await PDFDocument.create();
      let allPagesRendered = true;

      for (let i = 0; i < pageCount; i++) {
        const { width: origW, height: origH } = srcPdf.getPage(i).getSize();
        const dpi = 200;
        const converter = fromBuffer(Buffer.from(pdfBytes), {
          density: dpi,
          format: "png",
          width: Math.round(origW * dpi / 72),
          height: Math.round(origH * dpi / 72),
          preserveAspectRatio: true,
        });

        const result = await converter(i + 1, { responseType: "buffer" });
        if (!result?.buffer) {
          allPagesRendered = false;
          break;
        }

        const grayBuf = await sharp(result.buffer)
          .grayscale()
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();

        const grayImage = await newPdf.embedJpg(grayBuf);
        const newPage = newPdf.addPage([origW, origH]);
        newPage.drawImage(grayImage, { x: 0, y: 0, width: origW, height: origH });
      }

      if (allPagesRendered) {
        const bwBytes = await newPdf.save();
        return Buffer.from(bwBytes);
      }
      // If some pages failed, fall through to strategy 2
    } catch (pdf2picErr) {
      console.warn("[blackWhitePDF] pdf2pic unavailable, trying pdfjs-dist fallback:", pdf2picErr.message);
    }

    // ── Strategy 2: pdfjs-dist rendering via node-canvas ─────────────
    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";
      }

      // Try to load node-canvas for pdfjs rendering
      const { createCanvas } = require("canvas");

      const doc = await pdfjsLib.getDocument({
        data: new Uint8Array(pdfBytes),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        verbosity: 0,
      }).promise;

      const newPdf = await PDFDocument.create();

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 200 / 72 }); // 200 DPI
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d");

        // White background
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();

        // Get pixel data and convert to grayscale with sharp
        const pngBuf = canvas.toBuffer("image/png");
        const grayBuf = await sharp(pngBuf)
          .grayscale()
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();

        const srcPage = srcPdf.getPage(i - 1);
        const { width: origW, height: origH } = srcPage.getSize();
        const grayImage = await newPdf.embedJpg(grayBuf);
        const newPage = newPdf.addPage([origW, origH]);
        newPage.drawImage(grayImage, { x: 0, y: 0, width: origW, height: origH });
      }

      await doc.destroy();
      const bwBytes = await newPdf.save();
      return Buffer.from(bwBytes);
    } catch (pdfjsErr) {
      console.warn("[blackWhitePDF] pdfjs-dist+canvas fallback failed:", pdfjsErr.message);
    }

    // ── Strategy 3: pdf-lib image-only grayscale ─────────────────────
    // Converts all embedded images to grayscale using sharp.
    // Text color is not changed (it stays as-is), but this ensures
    // all visual image content is grayscale without external dependencies.
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(srcPdf, srcPdf.getPageIndices());

    for (const page of copiedPages) {
      newPdf.addPage(page);
    }

    // Enumerate all indirect objects to find image XObjects
    for (const [ref, obj] of newPdf.context.enumerateIndirectObjects()) {
      if (!obj || typeof obj !== "object" || !obj.dict) continue;

      let subtype;
      try {
        subtype = obj.dict.lookup?.(PDFName.of("Subtype")) || obj.dict.get?.(PDFName.of("Subtype"));
      } catch { continue; }
      if (!subtype || subtype.toString() !== "/Image") continue;

      // Get image bytes
      let imgBytes = null;
      if (obj.contents instanceof Uint8Array && obj.contents.length > 0) {
        imgBytes = obj.contents;
      } else if (typeof obj.getContents === "function") {
        try { imgBytes = obj.getContents(); } catch { continue; }
      }
      if (!imgBytes || imgBytes.length < 100) continue;

      // Check if it's a JPEG (DCTDecode)
      let filter;
      try {
        filter = obj.dict.lookup?.(PDFName.of("Filter")) || obj.dict.get?.(PDFName.of("Filter"));
      } catch { continue; }
      const filterStr = filter?.toString?.() || "";

      if (filterStr.includes("DCTDecode")) {
        // Convert JPEG to grayscale
        try {
          const grayJpeg = await sharp(Buffer.from(imgBytes))
            .grayscale()
            .jpeg({ quality: 90 })
            .toBuffer();

          // Replace the stream contents
          obj.contents = new Uint8Array(grayJpeg);
          // Update colorspace to DeviceGray
          obj.dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceGray"));
        } catch { /* skip this image */ }
      }
    }

    const bwBytes = await newPdf.save();
    return Buffer.from(bwBytes);
  }

  // Fix orientation — rotate specific pages or all pages
  async fixOrientationPDF(file, rotation = 90, pageIndices = null) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();

    const targetIndices = (pageIndices && pageIndices.length > 0)
      ? pageIndices.filter((i) => i >= 0 && i < pages.length)
      : pages.map((_, i) => i);

    for (const idx of targetIndices) {
      const page = pages[idx];
      if (rotation === 0) {
        // Reset to no rotation
        page.setRotation(degrees(0));
      } else {
        // Add rotation relative to current
        const current = page.getRotation().angle || 0;
        page.setRotation(degrees((current + rotation) % 360));
      }
    }

    const resultBytes = await pdf.save();
    return Buffer.from(resultBytes);
  }

  // Remove blank pages using multi-signal detection:
  // 1. Text content (pdf-parse)
  // 2. XObject references (images/forms in the page)
  // 3. Visual pixel analysis via pdfjs-dist + sharp (catches scanned blanks)
  async removeBlankPagesPDF(file) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const pageCount = pdf.getPageCount();
    const nonBlankIndices = [];

    // ── Signal 1 & 2: text + XObject checks via pdf-lib ──────────────
    const textBlankFlags = []; // true if page appears blank from text+xobject
    for (let i = 0; i < pageCount; i++) {
      let hasText = false;
      let hasXObjects = false;

      // Check XObjects on the page (images, forms, etc.)
      try {
        const pageNode = pdf.getPage(i).node;
        const resources = pageNode.lookup?.(PDFName.of("Resources")) || pageNode.get?.(PDFName.of("Resources"));
        if (resources) {
          const xobjects = resources.lookup?.(PDFName.of("XObject")) || resources.get?.(PDFName.of("XObject"));
          if (xobjects) {
            // If the page references any XObjects, it likely has visual content
            const entries = xobjects.entries?.() || [];
            for (const [, val] of entries) {
              if (val) { hasXObjects = true; break; }
            }
          }
        }
      } catch {
        // Ignore XObject check failures
      }

      // Check text content
      try {
        const tempPdf = await PDFDocument.create();
        const [copiedPage] = await tempPdf.copyPages(pdf, [i]);
        tempPdf.addPage(copiedPage);
        const singlePageBytes = await tempPdf.save();
        const pageData = await pdfParse(Buffer.from(singlePageBytes));
        const textContent = pageData.text.trim();
        // Even a single meaningful character counts as text
        if (textContent.length > 0) hasText = true;
      } catch {
        // If parsing fails, assume non-blank (safe default)
        hasText = true;
      }

      if (hasText || hasXObjects) {
        nonBlankIndices.push(i);
        textBlankFlags.push(false);
      } else {
        textBlankFlags.push(true);
      }
    }

    // ── Signal 3: Visual analysis for pages flagged as blank ─────────
    // Some scanned PDFs have pages with XObjects (image) that are pure white.
    // Re-check text-blank pages via pixel analysis.
    // Also, for pages that had XObjects but no text, verify they aren't
    // just white scanned blanks.
    const blankByTextIndices = [];
    for (let i = 0; i < pageCount; i++) {
      if (textBlankFlags[i]) blankByTextIndices.push(i);
    }

    // If no pages were flagged blank by text/xobject, we're done
    if (blankByTextIndices.length === 0 && nonBlankIndices.length > 0) {
      // All pages have content — nothing to remove
      const copiedPages = await newPdf.copyPages(pdf, nonBlankIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));
      const resultBytes = await newPdf.save();
      return Buffer.from(resultBytes);
    }

    // Use pdf2pic + sharp to render blank-candidate pages and check pixel variance
    try {
      const { fromBuffer } = require("pdf2pic");
      const pdfBuffer = Buffer.from(pdfBytes);

      for (const idx of blankByTextIndices) {
        try {
          const converter = fromBuffer(pdfBuffer, {
            density: 72, // Low DPI is fine for blank detection
            format: "png",
            width: 200,  // Small thumbnail is enough
            height: 280,
          });
          const result = await converter(idx + 1, { responseType: "buffer" });
          if (!result?.buffer) {
            // Can't render — keep the page (safe default)
            if (!nonBlankIndices.includes(idx)) nonBlankIndices.push(idx);
            continue;
          }

          // Analyze pixel statistics: a blank page has very low std deviation
          const { channels: sharpChannels } = await sharp(result.buffer).stats();
          const allChannelStdDev = sharpChannels.reduce((sum, ch) => sum + ch.stdev, 0);

          // Threshold: if combined std deviation across channels is > 5,
          // the page has meaningful visual content
          if (allChannelStdDev > 5) {
            if (!nonBlankIndices.includes(idx)) nonBlankIndices.push(idx);
          }
        } catch {
          // If rendering fails, keep the page (safe default)
          if (!nonBlankIndices.includes(idx)) nonBlankIndices.push(idx);
        }
      }
    } catch (renderErr) {
      console.warn("[removeBlankPages] Visual analysis unavailable:", renderErr.message);
      // If pdf2pic is not available, keep pages that have XObjects
      // (they might have images even if no text)
    }

    // Sort indices to maintain page order
    nonBlankIndices.sort((a, b) => a - b);

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

  // Add hyperlinks with proper clickable link annotations
  async addHyperlinksPDF(file, links) {
    const pdfBytes = await fs.readFile(file.tempFilePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();
    const context = pdf.context;

    for (const link of links) {
      // Determine which pages to apply to
      let targetPageIndices = [];
      if (link.pages && Array.isArray(link.pages) && link.pages.length > 0) {
        // Apply to specified pages (1-based from frontend → 0-based)
        targetPageIndices = link.pages.map((p) => p - 1).filter((i) => i >= 0 && i < pages.length);
      } else {
        targetPageIndices = [link.pageNumber || 0];
      }

      const displayText = link.text || link.url;
      const fontSize = link.fontSize || 10;
      const x = link.x || 50;
      const y = link.y || 50;
      const linkWidth = displayText.length * fontSize * 0.52;
      const linkHeight = fontSize + 4;

      for (const pageIdx of targetPageIndices) {
        const page = pages[pageIdx];
        if (!page) continue;

        // Draw link text in blue with underline
        page.drawText(displayText, {
          x,
          y,
          size: fontSize,
          color: rgb(0, 0, 0.8),
        });

        page.drawLine({
          start: { x, y: y - 2 },
          end: { x: x + linkWidth, y: y - 2 },
          thickness: 0.5,
          color: rgb(0, 0, 0.8),
        });

        // Create a real PDF link annotation with URI action
        const aDict = context.obj({ S: "URI" });
        aDict.set(PDFName.of("URI"), PDFString.of(link.url));

        const annotDict = context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [x, y - 2, x + linkWidth, y + linkHeight],
          Border: [0, 0, 0],
        });
        annotDict.set(PDFName.of("A"), aDict);

        const annotRef = context.register(annotDict);

        // Append to page's Annots array
        const pageDict = page.node;
        let annots = pageDict.lookup(PDFName.of("Annots"));
        if (annots instanceof PDFArray) {
          annots.push(annotRef);
        } else {
          pageDict.set(PDFName.of("Annots"), context.obj([annotRef]));
        }
      }
    }

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
