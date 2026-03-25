const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const PDFKit = require("pdfkit");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const sharp = require("sharp");
const { fromPath } = require("pdf2pic");

class ConvertService {
  // Convert image to PDF
  async imageToPDF(imageFile) {
    const pdfDoc = new PDFKit();
    const chunks = [];

    return new Promise(async (resolve, reject) => {
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);

      try {
        const imageBuffer = await fs.readFile(imageFile.tempFilePath);
        const image = await sharp(imageBuffer);
        const metadata = await image.metadata();

        // Fit image to page
        const maxWidth = 500;
        const maxHeight = 700;
        let width = metadata.width;
        let height = metadata.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        pdfDoc.image(imageBuffer, {
          fit: [width, height],
          align: "center",
          valign: "center",
        });

        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Convert multiple images to PDF
  async imagesToPDF(imageFiles) {
    const pdfDoc = new PDFKit({ autoFirstPage: false });
    const chunks = [];

    return new Promise(async (resolve, reject) => {
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);

      try {
        for (const imageFile of imageFiles) {
          const imageBuffer = await fs.readFile(imageFile.tempFilePath);
          const image = await sharp(imageBuffer);
          const metadata = await image.metadata();

          pdfDoc.addPage({
            size: [metadata.width, metadata.height],
          });

          pdfDoc.image(imageBuffer, 0, 0, {
            fit: [metadata.width, metadata.height],
          });
        }

        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Convert text to PDF
  async textToPDF(text) {
    const pdfDoc = new PDFKit();
    const chunks = [];

    return new Promise((resolve, reject) => {
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);

      try {
        pdfDoc.fontSize(12);
        pdfDoc.text(text, {
          align: "left",
          width: 500,
        });

        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Convert HTML to PDF with basic formatting
  async htmlToPDF(html) {
    const pdfDoc = new PDFKit({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    const chunks = [];

    return new Promise((resolve, reject) => {
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);

      try {
        // Parse and render HTML with basic formatting
        let content = html;

        // Extract title
        const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
        if (titleMatch) {
          pdfDoc.fontSize(24).font("Helvetica-Bold");
          pdfDoc.text(titleMatch[1], { align: "center" });
          pdfDoc.moveDown(2);
        }

        // Remove script and style tags
        content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

        // Handle headings
        content = content.replace(
          /<h1[^>]*>(.*?)<\/h1>/gi,
          "\n##H1##$1##/H1##\n",
        );
        content = content.replace(
          /<h2[^>]*>(.*?)<\/h2>/gi,
          "\n##H2##$1##/H2##\n",
        );
        content = content.replace(
          /<h3[^>]*>(.*?)<\/h3>/gi,
          "\n##H3##$1##/H3##\n",
        );

        // Handle paragraphs and line breaks
        content = content.replace(/<br\s*\/?>/gi, "\n");
        content = content.replace(/<\/p>/gi, "\n\n");
        content = content.replace(/<p[^>]*>/gi, "");

        // Handle lists
        content = content.replace(/<li[^>]*>/gi, "• ");
        content = content.replace(/<\/li>/gi, "\n");

        // Handle bold and italic
        content = content.replace(
          /<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi,
          "**$2**",
        );
        content = content.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, "_$2_");

        // Strip remaining HTML tags
        content = content.replace(/<[^>]*>/g, "");

        // Decode HTML entities
        content = content.replace(/&nbsp;/g, " ");
        content = content.replace(/&amp;/g, "&");
        content = content.replace(/&lt;/g, "<");
        content = content.replace(/&gt;/g, ">");
        content = content.replace(/&quot;/g, '"');
        content = content.replace(/&#39;/g, "'");

        // Clean up whitespace
        content = content.replace(/\n{3,}/g, "\n\n");
        content = content.trim();

        // Render content with formatting
        const lines = content.split("\n");
        for (const line of lines) {
          if (line.includes("##H1##")) {
            const text = line.replace(/##H1##|##\/H1##/g, "").trim();
            pdfDoc.fontSize(20).font("Helvetica-Bold");
            pdfDoc.text(text);
            pdfDoc.moveDown(0.5);
          } else if (line.includes("##H2##")) {
            const text = line.replace(/##H2##|##\/H2##/g, "").trim();
            pdfDoc.fontSize(16).font("Helvetica-Bold");
            pdfDoc.text(text);
            pdfDoc.moveDown(0.3);
          } else if (line.includes("##H3##")) {
            const text = line.replace(/##H3##|##\/H3##/g, "").trim();
            pdfDoc.fontSize(14).font("Helvetica-Bold");
            pdfDoc.text(text);
            pdfDoc.moveDown(0.2);
          } else if (line.trim()) {
            pdfDoc.fontSize(12).font("Helvetica");
            pdfDoc.text(line.trim(), { width: 500 });
          } else {
            pdfDoc.moveDown(0.5);
          }
        }

        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Convert PDF to images
  async pdfToImages(pdfFile, format = "png") {
    try {
      const options = {
        density: 100,
        saveFilename: `page`,
        savePath: path.dirname(pdfFile.tempFilePath),
        format: format,
        width: 2000,
        height: 2000,
      };

      const convert = fromPath(pdfFile.tempFilePath, options);
      const pdfBuffer = await fs.readFile(pdfFile.tempFilePath);
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();

      const images = [];
      for (let i = 1; i <= pageCount; i++) {
        try {
          const result = await convert(i, { responseType: "buffer" });
          images.push(result.buffer || result);
        } catch (error) {
          console.log(`Error converting page ${i}:`, error.message);
        }
      }

      return images;
    } catch (error) {
      console.error("PDF to images error:", error);
      throw error;
    }
  }

  // Convert PDF to text
  async pdfToText(pdfFile) {
    const { parsePDF } = require("../utils/pdfParser");
    const dataBuffer = await fs.readFile(pdfFile.tempFilePath);
    const data = await parsePDF(dataBuffer);
    return data.text;
  }

  // Convert PDF to HTML with structured output
  async pdfToHTML(pdfFile) {
    const { parsePDF } = require("../utils/pdfParser");
    const dataBuffer = await fs.readFile(pdfFile.tempFilePath);
    const data = await parsePDF(dataBuffer);

    // Process text into paragraphs
    const paragraphs = data.text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const bodyContent = paragraphs
      .map(
        (p) =>
          `    <p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`,
      )
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Converted PDF - ${data.info?.Title || "Document"}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            padding: 40px 20px;
            max-width: 800px;
            margin: 0 auto;
            color: #333;
            background: #fff;
        }
        h1 { font-size: 24px; margin-bottom: 20px; color: #111; }
        p { margin-bottom: 16px; text-align: justify; }
        .meta { color: #666; font-size: 14px; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
    </style>
</head>
<body>
    <div class="meta">
        <strong>Pages:</strong> ${data.numpages} | 
        <strong>Characters:</strong> ${data.text.length.toLocaleString()}
        ${data.info?.Author ? ` | <strong>Author:</strong> ${data.info.Author}` : ""}
    </div>
${bodyContent}
</body>
</html>`;

    return Buffer.from(html, "utf-8");
  }
}

module.exports = new ConvertService();
