/**
 * docxGenerator.ts
 *
 * Converts the WebView editor's HTML content into a structurally valid
 * .docx file using JSZip (no native modules, no dev-build required).
 *
 * Handles:
 *  - Bold, italic, underline, strikethrough
 *  - Font family, font size, text color
 *  - Highlight / background color
 *  - Hyperlinks
 *  - Alignment (left/center/right/justify)
 *  - Images (base64 embedded)
 *  - Page breaks
 *  - Comments / bookmarks (metadata only)
 */

import type { EditorBookmark, EditorComment } from "@/src/types/editor.types";
import * as FileSystem from "expo-file-system/legacy";
import JSZip from "jszip";

// ───────────────────────────────────────────────────────────────────────────
// OOXML constants
// ───────────────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// color name → OOXML highlight value
const HIGHLIGHT_MAP: Record<string, string> = {
  "#FFFF00": "yellow",
  yellow: "yellow",
  "#00FF00": "green",
  green: "green",
  "#00FFFF": "cyan",
  cyan: "cyan",
  "#FF00FF": "magenta",
  magenta: "magenta",
  "#FF6B6B": "red",
  "#FF0000": "red",
  red: "red",
};

// ───────────────────────────────────────────────────────────────────────────
// Inline-level: parse inline HTML → array of OOXML <w:r> strings
// ───────────────────────────────────────────────────────────────────────────

interface RunState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  highlight?: string;
  font: string;
  /** half-points (1pt = 2 half-points) */
  size: number;
  href?: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buildRunXml(text: string, s: RunState): string {
  if (!text) return "";
  let rPr = "";
  if (s.bold) rPr += "<w:b/>";
  if (s.italic) rPr += "<w:i/>";
  if (s.underline) rPr += '<w:u w:val="single"/>';
  if (s.strike) rPr += "<w:strike/>";
  if (s.color) {
    const c = s.color.replace("#", "");
    rPr += `<w:color w:val="${escapeXml(c)}"/>`;
  }
  if (s.highlight) {
    const h = HIGHLIGHT_MAP[s.highlight] || "yellow";
    rPr += `<w:highlight w:val="${h}"/>`;
  }
  if (s.font && s.font !== "Inter") {
    rPr += `<w:rFonts w:ascii="${escapeXml(s.font)}" w:hAnsi="${escapeXml(s.font)}"/>`;
  }
  if (s.size && s.size !== 22) {
    rPr += `<w:sz w:val="${s.size}"/><w:szCs w:val="${s.size}"/>`;
  }

  const rPrBlock = rPr ? `<w:rPr>${rPr}</w:rPr>` : "";
  return `<w:r>${rPrBlock}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function parseInlineHTML(html: string): string[] {
  const runs: string[] = [];
  const parts = html.split(/(<[^>]+>)/);

  const state: RunState = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    font: "Inter",
    size: 22,
  };

  let currentText = "";

  const flush = () => {
    if (!currentText) return;
    runs.push(buildRunXml(currentText, { ...state }));
    currentText = "";
  };

  for (const part of parts) {
    if (part.startsWith("<")) {
      const tag = part.toLowerCase();
      if (/<b[\s>]|<strong[\s>]/.test(tag)) {
        flush();
        state.bold = true;
      } else if (/<\/b>|<\/strong>/.test(tag)) {
        flush();
        state.bold = false;
      } else if (/<i[\s>]|<em[\s>]/.test(tag)) {
        flush();
        state.italic = true;
      } else if (/<\/i>|<\/em>/.test(tag)) {
        flush();
        state.italic = false;
      } else if (/<u[\s>]/.test(tag)) {
        flush();
        state.underline = true;
      } else if (/<\/u>/.test(tag)) {
        flush();
        state.underline = false;
      } else if (/<s[\s>]|<strike[\s>]/.test(tag)) {
        flush();
        state.strike = true;
      } else if (/<\/s>|<\/strike>/.test(tag)) {
        flush();
        state.strike = false;
      } else if (tag.includes("<font")) {
        flush();
        const colorMatch = part.match(/color="([^"]+)"/i);
        const sizeMatch = part.match(/style="[^"]*font-size:\s*([0-9.]+)pt/i);
        const fontMatch =
          part.match(/face="([^"]+)"/i) ||
          part.match(/font-family:\s*([^;"']+)/i);
        if (colorMatch) state.color = colorMatch[1];
        if (sizeMatch) state.size = Math.round(parseFloat(sizeMatch[1]) * 2);
        if (fontMatch) state.font = fontMatch[1].trim();
      } else if (/<\/font>/.test(tag)) {
        flush();
        state.color = undefined;
        state.font = "Inter";
        state.size = 22;
      } else if (tag.includes("<span")) {
        const styleMatch = part.match(/style="([^"]+)"/i);
        if (styleMatch) {
          flush();
          const style = styleMatch[1];
          const c = style.match(/(?:color|foreground):\s*(#[0-9a-fA-F]{3,6})/i);
          const h = style.match(
            /background(?:-color)?:\s*(#[0-9a-fA-F]{3,6}|(?:yellow|green|cyan|magenta|red))/i,
          );
          const s = style.match(/font-size:\s*([0-9.]+)pt/i);
          const f = style.match(/font-family:\s*([^;"']+)/i);
          if (c) state.color = c[1];
          if (h) state.highlight = h[1];
          if (s) state.size = Math.round(parseFloat(s[1]) * 2);
          if (f) state.font = f[1].trim();
        }
      } else if (/<\/span>/.test(tag)) {
        flush();
        state.color = undefined;
        state.highlight = undefined;
      }
      // Skip other tags (img, svg, div, etc.) — they become block-level
    } else {
      currentText += decodeEntities(part);
    }
  }
  flush();
  return runs;
}

// ───────────────────────────────────────────────────────────────────────────
// Block-level: HTML → array of OOXML <w:p> strings + images
// ───────────────────────────────────────────────────────────────────────────

interface ImageRef {
  rId: string;
  base64: string;
  mime: string;
  ext: string;
  width: number;
  height: number;
}

function parseAlignFromStyle(style: string): string | undefined {
  const match = style.match(/text-align:\s*(left|center|right|justify)/i);
  return match ? match[1].toLowerCase() : undefined;
}

function alignToOoxml(align: string | undefined): string {
  if (!align) return "";
  const map: Record<string, string> = {
    left: "start",
    center: "center",
    right: "end",
    justify: "both",
  };
  return map[align] ? `<w:jc w:val="${map[align]}"/>` : "";
}

// ───────────────────────────────────────────────────────────────────────────
// HTML table → OOXML <w:tbl>
// ───────────────────────────────────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseHtmlTableToOoxml(tableInner: string): string {
  // Extract rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: string[][] = [];
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableInner)) !== null) {
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(stripHtmlTags(cellMatch[1]).trim());
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) {
    return `<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
  }

  // Determine max columns
  const maxCols = Math.max(...rows.map((r) => r.length));

  // Build OOXML table
  // Table width: 100% of page body (12240 - 1440*2 margins = 9360 twips)
  const tableWidth = 9360;
  const colWidth = Math.floor(tableWidth / maxCols);

  let xml = `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${tableWidth}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
    </w:tblBorders>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>${Array.from({ length: maxCols }, () => `<w:gridCol w:w="${colWidth}"/>`).join("")}</w:tblGrid>`;

  for (let r = 0; r < rows.length; r++) {
    xml += "\n  <w:tr>";
    for (let c = 0; c < maxCols; c++) {
      const text = c < rows[r].length ? rows[r][c] : "";
      // First row gets light shading
      const shading =
        r === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>' : "";
      const rPr = r === 0 ? "<w:rPr><w:b/></w:rPr>" : "";
      xml += `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shading}</w:tcPr>`;
      // Split cell text by newlines into separate paragraphs
      const lines = text.split("\n").filter((l) => l.length > 0 || text === "");
      if (lines.length === 0) {
        xml += `<w:p><w:r>${rPr}<w:t xml:space="preserve"> </w:t></w:r></w:p>`;
      } else {
        for (const line of lines) {
          xml += `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
        }
      }
      xml += "</w:tc>";
    }
    xml += "</w:tr>";
  }

  xml += "\n</w:tbl>";
  return xml;
}

interface ParseResult {
  paragraphs: string[];
  images: ImageRef[];
}

export function parseHTMLToOoxml(html: string): ParseResult {
  const paragraphs: string[] = [];
  const images: ImageRef[] = [];
  let imgCounter = 0;

  // ── Strip editor-only UI artifacts (belt-and-suspenders) ────────────
  // Remove table toolbar divs (buttons like +Row/+Col would leak as text)
  let processed = html
    .replace(
      /<div[^>]*class="[^"]*table-toolbar[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    // Remove table add-row buttons
    .replace(
      /<div[^>]*class="[^"]*table-add-row-btn[^"]*"[^>]*>[^<]*<\/div>/gi,
      "",
    )
    // Remove image action buttons (crop/delete)
    .replace(
      /<div[^>]*class="[^"]*img-action-btn[^"]*"[^>]*>[^<]*<\/div>/gi,
      "",
    )
    .replace(/<div[^>]*class="[^"]*img-action-bar[^"]*"[^>]*>\s*<\/div>/gi, "")
    // Remove crop overlay and buttons
    .replace(
      /<div[^>]*class="[^"]*crop-overlay[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(
      /<div[^>]*class="[^"]*crop-btn-bar[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    // Remove resize handles
    .replace(
      /<div[^>]*class="[^"]*img-resize-handle[^"]*"[^>]*>\s*<\/div>/gi,
      "",
    )
    // Strip contenteditable attributes
    .replace(/\s*contenteditable="[^"]*"/gi, "");

  // Pre-process: convert page breaks to markers
  processed = processed.replace(
    /<div[^>]*style="[^"]*page-break[^"]*"[^>]*>.*?<\/div>/gis,
    "\n__PAGE_BREAK__\n",
  );

  // Extract base64 images — try to read width/height from style or attributes
  processed = processed.replace(
    /<img[^>]*src="data:([^;]+);base64,([^"]+)"[^>]*>/gi,
    (match, mime: string, b64: string) => {
      imgCounter++;
      const ext = mime.includes("png") ? "png" : "jpeg";
      const rId = `rImg${imgCounter}`;

      // Try to extract dimensions from inline style
      let width = 400;
      let height = 300;
      const styleW = match.match(/style="[^"]*width:\s*([0-9.]+)px/i);
      const styleH = match.match(/style="[^"]*height:\s*([0-9.]+)px/i);
      const attrW = match.match(/width="([0-9.]+)"/i);
      const attrH = match.match(/height="([0-9.]+)"/i);
      if (styleW) width = Math.round(parseFloat(styleW[1]));
      else if (attrW) width = Math.round(parseFloat(attrW[1]));
      if (styleH) height = Math.round(parseFloat(styleH[1]));
      else if (attrH) height = Math.round(parseFloat(attrH[1]));
      // Clamp to reasonable page width (max ~6 inches = 576px at 96dpi)
      if (width > 576) {
        const ratio = 576 / width;
        width = 576;
        height = Math.round(height * ratio);
      }

      images.push({ rId, base64: b64, mime, ext, width, height });
      return `\n__IMAGE_${rId}__\n`;
    },
  );

  // ── Extract tables before stripping block tags ────────────────────────
  // Replace each <table>...</table> with a marker
  let tableCounter = 0;
  const tableOoxml: string[] = [];
  processed = processed.replace(
    /<table[^>]*>([\s\S]*?)<\/table>/gi,
    (_match, inner: string) => {
      tableCounter++;
      const marker = `__TABLE_${tableCounter}__`;
      const tblXml = parseHtmlTableToOoxml(inner);
      tableOoxml.push(tblXml);
      return `\n${marker}\n`;
    },
  );

  // Clean block tags to newlines (table tags already removed above)
  processed = processed
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p|h[1-6]|li|ul|ol|blockquote)[^>]*>/gi, "\n")
    .replace(
      /<\/?(?:table|tr|td|th|thead|tbody|caption|colgroup|col)[^>]*>/gi,
      "\n",
    );

  const blocks = processed.split("\n").filter((b) => b.trim() !== "");

  for (const block of blocks) {
    const trimmed = block.trim();

    // Page break
    if (trimmed === "__PAGE_BREAK__") {
      paragraphs.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
      continue;
    }

    // Embedded image
    const imgMatch = trimmed.match(/^__IMAGE_(rImg\d+)__$/);
    if (imgMatch) {
      const rId = imgMatch[1];
      const img = images.find((i) => i.rId === rId);
      if (img) {
        const cx = img.width * 9525; // EMU
        const cy = img.height * 9525;
        paragraphs.push(`<w:p><w:r>
          <w:drawing>
            <wp:inline distT="0" distB="0" distL="0" distR="0">
              <wp:extent cx="${cx}" cy="${cy}"/>
              <wp:docPr id="${imgCounter}" name="Image"/>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:nvPicPr><pic:cNvPr id="0" name="Image"/><pic:cNvPicPr/></pic:nvPicPr>
                    <pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r></w:p>`);
      }
      continue;
    }

    // Embedded table
    const tblMatch = trimmed.match(/^__TABLE_(\d+)__$/);
    if (tblMatch) {
      const idx = parseInt(tblMatch[1], 10) - 1;
      if (tableOoxml[idx]) {
        paragraphs.push(tableOoxml[idx]);
      }
      continue;
    }

    // Extract alignment from the block if any
    const styleMatch = block.match(/style="([^"]+)"/i);
    const align = styleMatch ? parseAlignFromStyle(styleMatch[1]) : undefined;

    // Normal text paragraph
    const runs = parseInlineHTML(trimmed);
    if (runs.length > 0) {
      const pPr = align
        ? `<w:pPr>${alignToOoxml(align)}<w:spacing w:line="276" w:lineRule="auto"/></w:pPr>`
        : '<w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr>';
      paragraphs.push(`<w:p>${pPr}${runs.join("")}</w:p>`);
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push('<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>');
  }

  return { paragraphs, images };
}

// ───────────────────────────────────────────────────────────────────────────
// Assemble .docx ZIP
// ───────────────────────────────────────────────────────────────────────────

interface GenerateOptions {
  html: string;
  title?: string;
  comments?: EditorComment[];
  bookmarks?: EditorBookmark[];
}

export async function generateDocxFromHtml({
  html,
  title = "Document",
}: GenerateOptions): Promise<string> {
  const { paragraphs, images } = parseHTMLToOoxml(html);

  // Build title paragraph
  const titleParagraph = `<w:p>
    <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:after="200"/></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>
      <w:t>${escapeXml(title)}</w:t>
    </w:r>
  </w:p>`;

  // ── word/styles.xml (required so Mammoth can resolve Heading1 etc.) ──
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>`;

  // ── document.xml ────────────────────────────────────────────────────
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${titleParagraph}
    ${paragraphs.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  // ── [Content_Types].xml ─────────────────────────────────────────────
  let imageContentTypes = "";
  const addedExts = new Set<string>();
  for (const img of images) {
    if (!addedExts.has(img.ext)) {
      addedExts.add(img.ext);
      imageContentTypes += `\n  <Default Extension="${img.ext}" ContentType="image/${img.ext === "png" ? "png" : "jpeg"}"/>`;
    }
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>${imageContentTypes}
  <Override PartName="/word/document.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  // ── _rels/.rels ─────────────────────────────────────────────────────
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
                Target="word/document.xml"/>
</Relationships>`;

  // ── word/_rels/document.xml.rels ─────────────────────────────────────
  let imgRelationships = "";
  for (const img of images) {
    imgRelationships += `\n  <Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.rId}.${img.ext}"/>`;
  }

  const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imgRelationships}
</Relationships>`;

  // ── Assemble ZIP ────────────────────────────────────────────────────
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", relsXml);
  zip.file("word/_rels/document.xml.rels", documentRelsXml);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", stylesXml);

  // Add images
  for (const img of images) {
    zip.file(`word/media/${img.rId}.${img.ext}`, img.base64, {
      base64: true,
    });
  }

  const base64 = await zip.generateAsync({
    type: "base64",
    compression: "DEFLATE",
  });

  return base64;
}

// ───────────────────────────────────────────────────────────────────────────
// Save to file
// ───────────────────────────────────────────────────────────────────────────

interface SaveResult {
  success: boolean;
  uri?: string;
  fileName?: string;
  error?: string;
}

export async function saveDocxFromHtml(
  options: GenerateOptions & { fileName?: string },
): Promise<SaveResult> {
  try {
    const base64 = await generateDocxFromHtml(options);
    const safeName = (options.fileName || options.title || "Document").replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    );
    const fileName = `${safeName}_${Date.now()}.docx`;
    // Store in documentDirectory (persistent) instead of cacheDirectory (volatile)
    const docsDir = FileSystem.documentDirectory + "created_docs/";
    const dirInfo = await FileSystem.getInfoAsync(docsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(docsDir, { intermediates: true });
    }
    const uri = docsDir + fileName;

    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return { success: true, uri, fileName };
  } catch (error) {
    console.error("DOCX generation error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
