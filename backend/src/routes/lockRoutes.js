const express = require("express");
const router = express.Router();
const { PDFDocument, PDFName } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const {
  outputPath,
  toDownloadUrl,
  LOCK_DATA_DIR,
} = require("../utils/fileOutputUtils");
const { validateOutputChanged } = require("../utils/processingValidator");

// ── Simple JSON store ────────────────────────────────────────────────────────
const LOCK_DB_PATH = path.join(LOCK_DATA_DIR, "locks.json");

async function readDB() {
  try {
    const data = await fs.readFile(LOCK_DB_PATH, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeDB(data) {
  await fs.writeFile(LOCK_DB_PATH, JSON.stringify(data, null, 2));
}

function hashPassphrase(passphrase) {
  return crypto.createHash("sha256").update(passphrase).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// SET EXPIRY — Store file with expiry date, on expiry → corrupt or delete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/lock/set
 * Body: multipart { pdf, passphrase?, expiresInHours?, expiryDate?, maxOpens?,
 *                    expiryAction? ("corrupt" | "delete") }
 *
 * Sets an expiry on a document. When expired:
 *  - "corrupt": scrambles the PDF text content (default)
 *  - "delete": removes the file entirely
 */
router.post("/set", async (req, res, next) => {
  if (!req.files?.pdf) {
    return res.status(400).json({ error: "No PDF uploaded" });
  }

  const {
    passphrase,
    expiresInHours,
    expiryDate,
    maxOpens,
    fileLabel,
    expiryAction,
  } = req.body;

  // Default expiry action is "corrupt"
  const action = expiryAction === "delete" ? "delete" : "corrupt";

  // Compute expiry
  let expiryMs;
  let expiryIso;
  if (expiresInHours) {
    const hours = parseFloat(expiresInHours);
    if (isNaN(hours) || hours <= 0) {
      return res.status(400).json({ error: "Invalid expiresInHours value" });
    }
    expiryMs = Date.now() + hours * 3600000;
    expiryIso = new Date(expiryMs).toISOString();
  } else if (expiryDate) {
    expiryMs = new Date(expiryDate).getTime();
    if (isNaN(expiryMs)) {
      return res.status(400).json({ error: "Invalid expiryDate format" });
    }
    expiryIso = new Date(expiryMs).toISOString();
  } else {
    // Default: 24 hours
    expiryMs = Date.now() + 24 * 3600000;
    expiryIso = new Date(expiryMs).toISOString();
  }

  try {
    const lockId = crypto.randomUUID();
    const outPath = outputPath(".pdf");
    const inputPath = req.files.pdf.tempFilePath;

    await fs.copyFile(inputPath, outPath);

    const db = await readDB();
    db[lockId] = {
      lockId,
      fileLabel: fileLabel || req.files.pdf.name,
      filePath: outPath,
      expiryDate: expiryIso,
      expiryMs,
      passphraseHash: passphrase ? hashPassphrase(passphrase) : null,
      maxOpens: maxOpens ? parseInt(maxOpens) : null,
      openCount: 0,
      revoked: false,
      expiryAction: action,
      createdAt: new Date().toISOString(),
    };
    await writeDB(db);

    return res.json({
      lockId,
      expiryDate: expiryIso,
      fileLabel: db[lockId].fileLabel,
      maxOpens: db[lockId].maxOpens,
      expiryAction: action,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/lock/check
 * Body: JSON { lockId }
 *
 * Checks document status. If expired, triggers corruption or deletion.
 */
router.post("/check", express.json(), async (req, res, next) => {
  const { lockId } = req.body;
  if (!lockId) {
    return res.status(400).json({ error: "lockId is required" });
  }

  try {
    const db = await readDB();
    const record = db[lockId];

    if (!record)
      return res.json({ granted: false, reason: "Lock not found" });
    if (record.revoked)
      return res.json({
        granted: false,
        reason: "Access has been revoked",
      });

    // ── EXPIRY ENFORCEMENT ─────────────────────────────────────────────────
    if (Date.now() > record.expiryMs) {
      // Execute expiry action
      await executeExpiryAction(record, db);
      await writeDB(db);

      return res.json({
        granted: false,
        reason: "Document has expired",
        expiryDate: record.expiryDate,
        actionTaken: record.expiryAction,
      });
    }

    if (
      record.maxOpens !== null &&
      record.openCount >= record.maxOpens
    ) {
      return res.json({
        granted: false,
        reason: `Maximum opens reached (${record.maxOpens})`,
        openCount: record.openCount,
        maxOpens: record.maxOpens,
      });
    }

    const timeRemaining = record.expiryMs - Date.now();
    const opensRemaining =
      record.maxOpens !== null
        ? record.maxOpens - record.openCount
        : null;

    return res.json({
      granted: true,
      fileLabel: record.fileLabel,
      expiryDate: record.expiryDate,
      openCount: record.openCount,
      maxOpens: record.maxOpens,
      opensRemaining,
      timeRemainingMs: timeRemaining,
      expiresIn: formatTimeRemaining(timeRemaining),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/lock/open
 * Body: JSON { lockId, passphrase }
 *
 * Validates access and returns file URL. Enforces expiry on access.
 */
router.post("/open", express.json(), async (req, res, next) => {
  const { lockId, passphrase } = req.body;
  if (!lockId) {
    return res.status(400).json({ error: "lockId is required" });
  }

  try {
    const db = await readDB();
    const record = db[lockId];

    if (!record)
      return res.json({ granted: false, reason: "Lock not found" });
    if (record.revoked)
      return res.json({
        granted: false,
        reason: "Access has been revoked",
      });

    // Validate passphrase if one was set
    if (record.passphraseHash) {
      if (!passphrase) {
        return res.json({
          granted: false,
          reason: "Passphrase is required",
        });
      }
      if (hashPassphrase(passphrase) !== record.passphraseHash) {
        return res.json({
          granted: false,
          reason: "Invalid passphrase",
        });
      }
    }

    // ── EXPIRY ENFORCEMENT ON OPEN ─────────────────────────────────────────
    if (Date.now() > record.expiryMs) {
      await executeExpiryAction(record, db);
      await writeDB(db);

      return res.json({
        granted: false,
        reason: "Document has expired and has been destroyed",
        actionTaken: record.expiryAction,
      });
    }

    if (
      record.maxOpens !== null &&
      record.openCount >= record.maxOpens
    )
      return res.json({
        granted: false,
        reason: `Maximum opens reached (${record.maxOpens})`,
      });

    // Access granted — increment count
    record.openCount += 1;
    record.lastOpenedAt = new Date().toISOString();
    await writeDB(db);

    const fileUrl = toDownloadUrl(req, record.filePath);
    const opensRemaining =
      record.maxOpens !== null
        ? record.maxOpens - record.openCount
        : null;

    return res.json({
      granted: true,
      fileUrl,
      fileLabel: record.fileLabel,
      expiryDate: record.expiryDate,
      expiresIn: formatTimeRemaining(record.expiryMs - Date.now()),
      openCount: record.openCount,
      maxOpens: record.maxOpens,
      opensRemaining,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/lock/revoke
 * Body: JSON { lockId }
 */
router.post("/revoke", express.json(), async (req, res, next) => {
  const { lockId } = req.body;
  if (!lockId) {
    return res.status(400).json({ error: "lockId is required" });
  }

  try {
    const db = await readDB();
    if (!db[lockId])
      return res.status(404).json({ error: "Lock not found" });
    db[lockId].revoked = true;
    db[lockId].revokedAt = new Date().toISOString();

    // Also corrupt/delete the file on revoke
    await executeExpiryAction(db[lockId], db);
    await writeDB(db);

    return res.json({
      success: true,
      lockId,
      revokedAt: db[lockId].revokedAt,
      actionTaken: db[lockId].expiryAction,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/lock/status/:lockId
 */
router.get("/status/:lockId", async (req, res, next) => {
  try {
    const db = await readDB();
    const record = db[req.params.lockId];
    if (!record)
      return res.status(404).json({ error: "Lock not found" });

    const { filePath, passphraseHash, ...safeRecord } = record;
    safeRecord.isExpired = Date.now() > record.expiryMs;
    safeRecord.isActive = !safeRecord.isExpired && !record.revoked;
    return res.json(safeRecord);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMBED EXPIRY METADATA (weak mode — metadata-based)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/lock/embed
 * Body: multipart { pdf, expiryDate?, expiry?, title?, message? }
 */
router.post("/embed", async (req, res, next) => {
  if (!req.files?.pdf) {
    return res.status(400).json({ error: "No PDF uploaded" });
  }

  const rawExpiry = req.body.expiryDate || req.body.expiry;
  const message = req.body.message || req.body.title || "";

  if (!rawExpiry) {
    return res.status(400).json({ error: "An expiry date is required" });
  }

  const expiryMs = new Date(rawExpiry).getTime();
  if (isNaN(expiryMs)) {
    return res.status(400).json({ error: "Invalid expiry date format" });
  }

  const expiryIso = new Date(expiryMs).toISOString();

  try {
    const pdfBytes = await fs.readFile(req.files.pdf.tempFilePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });

    if (req.body.title) {
      pdfDoc.setTitle(req.body.title);
    }

    // Embed expiry in metadata
    pdfDoc.setSubject(`EXPIRY:${expiryIso}`);
    pdfDoc.setKeywords([
      `pdflab_expiry:${expiryIso}`,
      `pdflab_message:${message || "This document has expired."}`,
    ]);
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());

    // XMP metadata
    const xmpData = buildXMPMetadata(expiryIso, message);
    const xmpStream = pdfDoc.context.flateStream(
      Buffer.from(xmpData, "utf8"),
    );
    xmpStream.dict.set(PDFName.of("Type"), PDFName.of("Metadata"));
    xmpStream.dict.set(PDFName.of("Subtype"), PDFName.of("XML"));
    const xmpRef = pdfDoc.context.register(xmpStream);
    pdfDoc.catalog.set(PDFName.of("Metadata"), xmpRef);

    const outBytes = await pdfDoc.save();
    const outBuffer = Buffer.from(outBytes);

    // Validate output changed
    validateOutputChanged(pdfBytes, outBuffer, "Lock Embed");

    // Save to output file and return download URL
    const outFilePath = outputPath(".pdf");
    await fs.writeFile(outFilePath, outBuffer);

    return res.json({
      success: true,
      downloadUrl: toDownloadUrl(req, outFilePath),
      filename: "locked.pdf",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/lock/read-metadata
 * Body: multipart { pdf }
 */
router.post("/read-metadata", async (req, res, next) => {
  if (!req.files?.pdf) {
    return res.status(400).json({ error: "No PDF uploaded" });
  }

  try {
    const pdfBytes = await fs.readFile(req.files.pdf.tempFilePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });

    const keywords = pdfDoc.getKeywords() || "";
    const subject = pdfDoc.getSubject() || "";

    let expiryDate = null;
    let message = null;

    const kwList = keywords.split(",").map((k) => k.trim());
    for (const kw of kwList) {
      if (kw.startsWith("pdflab_expiry:"))
        expiryDate = kw.replace("pdflab_expiry:", "");
      if (kw.startsWith("pdflab_message:"))
        message = kw.replace("pdflab_message:", "");
    }

    if (!expiryDate && subject.startsWith("EXPIRY:")) {
      expiryDate = subject.replace("EXPIRY:", "");
    }

    if (!expiryDate) {
      return res.json({ hasExpiry: false });
    }

    const expiryMs = new Date(expiryDate).getTime();
    const isExpired = Date.now() > expiryMs;

    return res.json({
      hasExpiry: true,
      expiryDate,
      isExpired,
      message: message || "This document has expired.",
      expiresIn:
        !isExpired ? formatTimeRemaining(expiryMs - Date.now()) : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/lock/corrupt
 * Body: multipart { pdf }
 *
 * Immediately corrupts a PDF by scrambling its text content.
 * Returns the corrupted PDF.
 */
router.post("/corrupt", async (req, res, next) => {
  if (!req.files?.pdf) {
    return res.status(400).json({ error: "No PDF uploaded" });
  }

  try {
    const pdfBytes = await fs.readFile(req.files.pdf.tempFilePath);
    const corruptedBytes = corruptPdfContent(pdfBytes);

    const outBuffer = Buffer.from(corruptedBytes);
    validateOutputChanged(pdfBytes, outBuffer, "PDF Corruption");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=expired.pdf",
    );
    res.send(outBuffer);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPIRY ACTION EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute the expiry action on a locked document.
 * - "corrupt": Scrambles the PDF text content in-place
 * - "delete": Removes the file from disk
 */
async function executeExpiryAction(record, db) {
  if (record.expiryActionExecuted) return; // Already executed

  try {
    if (record.expiryAction === "delete") {
      // Delete the file
      try {
        await fs.unlink(record.filePath);
      } catch {
        // File may already be deleted
      }
    } else {
      // Corrupt: scramble the PDF text content
      try {
        const pdfBytes = await fs.readFile(record.filePath);
        const corruptedBytes = corruptPdfContent(pdfBytes);
        await fs.writeFile(record.filePath, corruptedBytes);
      } catch {
        // If corruption fails, try to delete instead
        try {
          await fs.unlink(record.filePath);
        } catch {
          // ignore
        }
      }
    }

    record.expiryActionExecuted = true;
    record.expiryActionExecutedAt = new Date().toISOString();
  } catch {
    // ignore execution errors
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF CORRUPTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Corrupts a PDF by scrambling text content in its content streams.
 *
 * Method:
 * 1. Find all text string literals in the raw PDF bytes
 * 2. Reverse and shuffle the characters within each string
 * 3. This makes the document unreadable while keeping the PDF structure valid
 *
 * Example: "he is a boy" → "yob a si eh"
 *
 * @param {Buffer} pdfBytes - Original PDF bytes
 * @returns {Buffer} - Corrupted PDF bytes
 */
function corruptPdfContent(pdfBytes) {
  const content = Buffer.from(pdfBytes);

  // Find and scramble text strings in PDF literal format: (some text)
  // We work on the raw bytes to handle all text regardless of encoding
  let i = 0;
  let modified = false;

  while (i < content.length) {
    // Find opening parenthesis for PDF string literal
    if (content[i] === 0x28) {
      // '('
      const start = i + 1;
      let depth = 1;
      let j = start;

      // Find matching closing parenthesis (handle nested parens)
      while (j < content.length && depth > 0) {
        if (content[j] === 0x5c) {
          // '\' escape — skip next byte
          j += 2;
          continue;
        }
        if (content[j] === 0x28) depth++;
        if (content[j] === 0x29) depth--;
        if (depth > 0) j++;
        else break;
      }

      const end = j;
      const strLen = end - start;

      // Only scramble strings that look like readable text (> 3 chars)
      if (strLen > 3) {
        // Extract the text bytes
        const textBytes = [];
        for (let k = start; k < end; k++) {
          if (content[k] === 0x5c && k + 1 < end) {
            // Skip escape sequences — preserve them
            textBytes.push({ byte: content[k], escape: true });
            k++;
            textBytes.push({ byte: content[k], escape: true });
          } else {
            textBytes.push({ byte: content[k], escape: false });
          }
        }

        // Collect non-escape text bytes and reverse them
        const plainBytes = textBytes
          .filter((b) => !b.escape)
          .map((b) => b.byte);

        if (plainBytes.length > 3) {
          // Reverse the readable bytes
          const reversed = [...plainBytes].reverse();

          // Write back reversed bytes
          let rIdx = 0;
          let writePos = start;
          for (const tb of textBytes) {
            if (tb.escape) {
              content[writePos] = tb.byte;
            } else {
              content[writePos] = reversed[rIdx++];
            }
            writePos++;
          }
          modified = true;
        }
      }

      i = end + 1;
    } else {
      i++;
    }
  }

  // If no string literals found, corrupt by overwriting the first content stream
  if (!modified) {
    // Find "stream" keyword and scramble bytes after it
    const streamMarker = Buffer.from("stream\r\n");
    const streamIdx = content.indexOf(streamMarker);
    if (streamIdx > 0) {
      const dataStart = streamIdx + streamMarker.length;
      // Scramble first 1KB of stream data
      const scrambleEnd = Math.min(dataStart + 1024, content.length);
      for (let k = dataStart; k < scrambleEnd; k++) {
        content[k] = content[k] ^ 0xff; // XOR flip
      }
    }
  }

  return content;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeRemaining(ms) {
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function buildXMPMetadata(expiryDate, message) {
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdflab="http://pdflab.app/ns/1.0/">
      <pdflab:ExpiryDate>${new Date(expiryDate).toISOString()}</pdflab:ExpiryDate>
      <pdflab:ExpiryMessage>${message || "This document has expired."}</pdflab:ExpiryMessage>
      <pdflab:LockedBy>PDFiQ</pdflab:LockedBy>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

module.exports = router;
