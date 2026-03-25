const express = require("express");
const router = express.Router();
const { PDFDocument, PDFName, PDFDict, PDFArray } = require("pdf-lib");
const fs = require("fs").promises;
const fsSync = require("fs");
const sharp = require("sharp");
const archiver = require("archiver");
const zlib = require("zlib");
const {
  outputPath,
  toDownloadUrl,
  cleanupFiles,
} = require("../utils/fileOutputUtils");

/**
 * POST /api/extract-images
 * Body: multipart/form-data { pdf: File }
 *
 * Extracts all embedded images from a PDF using pdf-lib's low-level API.
 * Handles JPEG (DCTDecode), raw pixel (FlateDecode), and JP2 (JPXDecode) images.
 * Uses sharp as a fallback for image conversion/validation.
 *
 * Returns: { images: [{ name, url, width, height, format }], zipUrl, count }
 */
router.post("/", async (req, res, next) => {
  if (!req.files?.pdf) {
    return res.status(400).json({ error: "No PDF uploaded" });
  }

  const inputPath = req.files.pdf.tempFilePath;
  const extractedPaths = [];

  try {
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });

    const images = [];
    let imgIndex = 0;

    for (
      let pageIdx = 0;
      pageIdx < pdfDoc.getPageCount();
      pageIdx++
    ) {
      const page = pdfDoc.getPages()[pageIdx];
      const resources = page.node.Resources();
      if (!resources) continue;

      let xObjects;
      try {
        xObjects = resources.lookup(PDFName.of("XObject"), PDFDict);
      } catch {
        continue;
      }
      if (!xObjects) continue;

      for (const [key] of xObjects.entries()) {
        let xObj;
        try {
          xObj = xObjects.lookup(key);
        } catch {
          continue;
        }
        if (!xObj) continue;

        const subtype = xObj.lookup?.(PDFName.of("Subtype"));
        if (!subtype || subtype.toString() !== "/Image") continue;

        const filter = xObj.lookup?.(PDFName.of("Filter"));
        const widthObj = xObj.lookup?.(PDFName.of("Width"));
        const heightObj = xObj.lookup?.(PDFName.of("Height"));
        const bitsPerComponent = xObj.lookup?.(
          PDFName.of("BitsPerComponent"),
        );
        const colorSpace = xObj.lookup?.(PDFName.of("ColorSpace"));

        const imgWidth = widthObj?.asNumber?.() || widthObj?.value || 0;
        const imgHeight = heightObj?.asNumber?.() || heightObj?.value || 0;

        if (imgWidth === 0 || imgHeight === 0) continue;

        // Determine filter chain
        const filterName = resolveFilterName(filter);

        let ext = ".png";
        let format = "png";

        if (filterName.includes("DCTDecode")) {
          ext = ".jpg";
          format = "jpeg";
        } else if (filterName.includes("JPXDecode")) {
          ext = ".jp2";
          format = "jp2";
        }

        // Get raw/decoded image bytes
        let imgBytes;
        try {
          if (typeof xObj.getContents === "function") {
            imgBytes = xObj.getContents();
          } else if (typeof xObj.decode === "function") {
            imgBytes = xObj.decode();
          }
        } catch {
          // Try getting raw encoded bytes for JPEG/JP2
          try {
            if (typeof xObj.getContentsString === "function") {
              const str = xObj.getContentsString();
              imgBytes = Buffer.from(str, "latin1");
            }
          } catch {
            continue;
          }
        }

        if (!imgBytes || imgBytes.length === 0) continue;

        const imgName = `image_${String(imgIndex + 1).padStart(3, "0")}${ext}`;
        const imgOutPath = outputPath(ext);

        try {
          if (format === "jpeg") {
            // JPEG: write raw bytes directly (already complete JPEG)
            await fs.writeFile(imgOutPath, imgBytes);
          } else if (format === "jp2") {
            // JP2: write raw bytes directly
            await fs.writeFile(imgOutPath, imgBytes);
          } else {
            // FlateDecode / raw pixel data: reconstruct as PNG via sharp
            const bpc =
              bitsPerComponent?.asNumber?.() ||
              bitsPerComponent?.value ||
              8;
            const csName = resolveColorSpaceName(colorSpace);
            const channels = csName === "DeviceGray" ? 1 : csName === "DeviceCMYK" ? 4 : 3;

            const expectedSize = imgWidth * imgHeight * channels * (bpc / 8);

            let rawPixels = Buffer.from(imgBytes);

            // If the data is smaller than expected, it might still be compressed
            if (rawPixels.length < expectedSize * 0.5) {
              try {
                rawPixels = zlib.inflateSync(rawPixels);
              } catch {
                // Already decompressed or different encoding
              }
            }

            // Try to create PNG with sharp
            try {
              const pngBuffer = await sharp(rawPixels, {
                raw: {
                  width: imgWidth,
                  height: imgHeight,
                  channels: Math.min(channels, 4),
                },
              })
                .png()
                .toBuffer();

              await fs.writeFile(imgOutPath, pngBuffer);
            } catch {
              // Fallback: write raw bytes, might not be viewable
              await fs.writeFile(imgOutPath, rawPixels);
            }
          }

          // Verify the output file exists and has content
          const stat = await fs.stat(imgOutPath);
          if (stat.size === 0) {
            await cleanupFiles(imgOutPath);
            continue;
          }

          extractedPaths.push(imgOutPath);
          images.push({
            name: imgName,
            url: toDownloadUrl(req, imgOutPath),
            width: imgWidth,
            height: imgHeight,
            format,
            page: pageIdx + 1,
          });
          imgIndex++;
        } catch {
          // Skip this image if extraction fails
          await cleanupFiles(imgOutPath);
          continue;
        }
      }
    }

    if (images.length === 0) {
      return res.status(404).json({
        error: "No extractable images found in this PDF",
        count: 0,
        images: [],
      });
    }

    // Create ZIP if multiple images
    let zipUrl = null;
    if (images.length > 1) {
      const zipOutPath = outputPath(".zip");
      await new Promise((resolve, reject) => {
        const output = fsSync.createWriteStream(zipOutPath);
        const archive = archiver("zip", { zlib: { level: 6 } });
        output.on("close", resolve);
        archive.on("error", reject);
        archive.pipe(output);
        extractedPaths.forEach((fp, i) =>
          archive.file(fp, { name: images[i].name }),
        );
        archive.finalize();
      });
      zipUrl = toDownloadUrl(req, zipOutPath);
    }

    return res.json({ count: images.length, images, zipUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * Resolve the filter name from a PDF filter object (handles arrays).
 */
function resolveFilterName(filter) {
  if (!filter) return "";
  const str = filter.toString();
  if (str.startsWith("[")) {
    // Array of filters - return joined
    if (filter instanceof PDFArray) {
      const names = [];
      for (let i = 0; i < filter.size(); i++) {
        names.push(filter.get(i).toString());
      }
      return names.join(",");
    }
  }
  return str;
}

/**
 * Resolve color space name from a PDF color space object.
 */
function resolveColorSpaceName(colorSpace) {
  if (!colorSpace) return "DeviceRGB";
  const str = colorSpace.toString();
  if (str.includes("Gray")) return "DeviceGray";
  if (str.includes("CMYK")) return "DeviceCMYK";
  if (str.includes("RGB")) return "DeviceRGB";
  return "DeviceRGB";
}

module.exports = router;
