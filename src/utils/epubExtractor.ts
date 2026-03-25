/**
 * epubExtractor.ts
 *
 * Extracts clean, ordered, readable text from an EPUB file.
 *
 * Pipeline:
 *   EPUB file (base64 / ArrayBuffer)
 *     → JSZip.loadAsync()
 *     → META-INF/container.xml   → locate content.opf
 *     → content.opf              → spine reading order
 *     → each spine HTML/XHTML    → strip markup → clean text
 *     → array of { chapterTitle, text }
 *
 * Dependencies:
 *   npm install jszip react-native-fs
 *   npm install --save-dev @types/jszip @types/react-native-fs
 */

import JSZip from "jszip";
import RNFS from "react-native-fs";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EpubChapter {
  /** Index in the spine (0-based). */
  index: number;
  /** Best-effort chapter title (from the manifest or first heading found). */
  title: string;
  /** Clean plain text ready to feed into chunkText(). */
  text: string;
}

export interface EpubBook {
  title: string;
  author: string;
  chapters: EpubChapter[];
  /** Total extracted character count (useful for progress estimation). */
  totalChars: number;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Load an EPUB from a local file path and return its readable text.
 *
 * @param filePath  Absolute path on the device (from react-native-document-picker, etc.)
 */
export async function extractEpub(filePath: string): Promise<EpubBook> {
  log("extractEpub: reading file", filePath);

  // Read file as base64 and let JSZip decode directly.
  const base64 = await RNFS.readFile(filePath, "base64");
  return extractEpubFromArchiveBase64(base64);
}

/**
 * Same as extractEpub() but accepts a pre-loaded base64 string.
 * Useful when you already have the file in memory (e.g. from a fetch response).
 */
export async function extractEpubFromBase64(base64: string): Promise<EpubBook> {
  return extractEpubFromArchiveBase64(base64);
}

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

async function extractEpubFromArchiveBase64(base64: string): Promise<EpubBook> {
  const zip = await JSZip.loadAsync(base64, { base64: true });

  // 1 ── Locate the OPF file via META-INF/container.xml
  const opfPath = await resolveOpfPath(zip);
  log("OPF path:", opfPath);

  // 2 ── Parse the OPF to get metadata + spine
  const { metadata, spineItems, manifest } = await parseOpf(zip, opfPath);
  log(`Spine has ${spineItems.length} items`);

  // Base directory of the OPF file (all relative paths are relative to this)
  const opfDir = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // 3 ── Extract text from each spine item
  const chapters: EpubChapter[] = [];

  for (let i = 0; i < spineItems.length; i++) {
    const itemId = spineItems[i];
    const manifestItem = manifest[itemId];

    if (!manifestItem) {
      log(`Spine item ${itemId} not found in manifest — skipping`);
      continue;
    }

    // Only process HTML/XHTML content
    const mt = (manifestItem.mediaType ?? "").toLowerCase();
    if (!mt.includes("html") && !mt.includes("xhtml") && !mt.includes("xml")) {
      log(`Skipping non-HTML spine item: ${manifestItem.href}`);
      continue;
    }

    const entryPath = resolveZipPath(opfDir, manifestItem.href);

    try {
      const rawHtml = await readZipEntry(zip, entryPath);
      if (!rawHtml?.trim()) continue;

      const { title, text } = extractTextFromHtml(rawHtml);
      if (!text.trim()) continue;

      chapters.push({ index: i, title: title || `Chapter ${i + 1}`, text });
      log(
        `Chapter ${i + 1}: \"${title || `Chapter ${i + 1}`}\" — ${text.length} chars`,
      );
    } catch (err) {
      log(`Error extracting chapter ${i + 1} (${entryPath}):`, err);
      // Continue with remaining chapters rather than aborting the whole book
    }
  }

  if (chapters.length === 0) {
    log("Extraction produced 0 readable chapters", {
      spineCount: spineItems.length,
      manifestCount: Object.keys(manifest).length,
      opfPath,
    });
    throw new Error(
      "EPUB extraction produced no readable text. The file may be image-only or DRM-protected.",
    );
  }

  const totalChars = chapters.reduce((sum, c) => sum + c.text.length, 0);
  log(`Extraction complete: ${chapters.length} chapters, ${totalChars} chars`);

  return {
    title: metadata.title || "Unknown Title",
    author: metadata.author || "Unknown Author",
    chapters,
    totalChars,
  };
}

// ---------------------------------------------------------------------------
// Step 1 — Resolve OPF path from container.xml
// ---------------------------------------------------------------------------

async function resolveOpfPath(zip: JSZip): Promise<string> {
  const containerXml = await readZipEntry(zip, "META-INF/container.xml");
  if (!containerXml) {
    throw new Error("Invalid EPUB: META-INF/container.xml not found.");
  }

  // <rootfile full-path="OEBPS/content.opf" .../>
  const match = containerXml.match(/full-path\s*=\s*["']([^"']+\.opf)["']/i);
  if (!match) {
    throw new Error(
      "Invalid EPUB: could not locate OPF file in container.xml.",
    );
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Step 2 — Parse OPF for metadata, manifest, spine
// ---------------------------------------------------------------------------

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

interface OpfData {
  metadata: { title: string; author: string };
  /** Ordered list of manifest item IDs from the <spine>. */
  spineItems: string[];
  manifest: Record<string, ManifestItem>;
}

async function parseOpf(zip: JSZip, opfPath: string): Promise<OpfData> {
  const opfXml = await readZipEntry(zip, opfPath);
  if (!opfXml) throw new Error(`Could not read OPF file: ${opfPath}`);

  // ── Metadata ──
  const title = extractXmlTag(opfXml, "dc:title") || "";
  const author =
    extractXmlTag(opfXml, "dc:creator") ||
    extractXmlTag(opfXml, "dc:author") ||
    "";

  // ── Manifest ──
  const manifest: Record<string, ManifestItem> = {};
  const itemTagRegex = /<item\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemTagRegex.exec(opfXml)) !== null) {
    const attrs = parseXmlAttributes(m[0]);
    const id = attrs.id;
    const href = attrs.href;
    const mediaType = attrs["media-type"];
    if (!id || !href || !mediaType) continue;

    manifest[id] = {
      id,
      href: safeDecodeUriComponent(href),
      mediaType,
    };
  }

  log(`Manifest has ${Object.keys(manifest).length} items`);

  // ── Spine ──
  const spineMatch = opfXml.match(/<spine[\s\S]*?<\/spine>/i);
  const spineItems: string[] = [];
  if (spineMatch) {
    const idrefRegex = /<itemref\s[^>]*idref\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
    while ((m = idrefRegex.exec(spineMatch[0])) !== null) {
      spineItems.push(m[1]);
    }
  }

  if (spineItems.length === 0) {
    // Fallback: use manifest order for HTML items
    Object.values(manifest)
      .filter((item) => item.mediaType.includes("html"))
      .forEach((item) => spineItems.push(item.id));
  }

  log(
    `Parsed OPF metadata: title=\"${title || "Unknown"}\", author=\"${author || "Unknown"}\"`,
  );
  log(`Parsed spine items: ${spineItems.length}`);

  return { metadata: { title, author }, spineItems, manifest };
}

// ---------------------------------------------------------------------------
// Step 3 — Extract clean text from an HTML/XHTML string
// ---------------------------------------------------------------------------

interface HtmlExtractResult {
  title: string;
  text: string;
}

function extractTextFromHtml(html: string): HtmlExtractResult {
  let content = html;

  // 1. Grab the <title> or first heading for chapter name
  const titleMatch =
    content.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    content.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const rawTitle = titleMatch ? stripTags(titleMatch[1]) : "";

  // 2. Remove elements that should never be spoken
  content = removeElements(content, [
    "script",
    "style",
    "nav",
    "aside",
    "figure",
    "figcaption",
    "head",
    "noscript",
    "svg",
    "math",
    "table", // tables are hard to speak naturally; skip for now
  ]);

  // 3. Replace block-level elements with newlines to preserve paragraph breaks
  content = content
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<\/blockquote\s*>/gi, "\n\n");

  // 4. Strip all remaining HTML tags
  content = stripTags(content);

  // 5. Decode HTML entities
  content = decodeHtmlEntities(content);

  // 6. Normalise whitespace
  content = cleanExtractedText(content);

  return { title: rawTitle.trim(), text: content };
}

// ---------------------------------------------------------------------------
// HTML / text helpers
// ---------------------------------------------------------------------------

function removeElements(html: string, tags: string[]): string {
  let result = html;
  for (const tag of tags) {
    // Remove opening-to-closing tag pairs (including content)
    const regex = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi");
    result = result.replace(regex, " ");
    // Remove self-closing variants
    const selfClose = new RegExp(`<${tag}[^>]*\\/>`, "gi");
    result = result.replace(selfClose, " ");
  }
  return result;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(text: string): string {
  return (
    text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      // Curly quotes → straight (TTS engines handle these inconsistently)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // Em/en dashes → comma-space for natural TTS pausing
      .replace(/[\u2013\u2014]/g, ", ")
      // Ellipsis character → three dots
      .replace(/\u2026/g, "...")
  );
}

function cleanExtractedText(text: string): string {
  return (
    text
      // Collapse 3+ consecutive newlines into exactly 2 (paragraph break)
      .replace(/\n{3,}/g, "\n\n")
      // Collapse multiple spaces/tabs into one
      .replace(/[ \t]{2,}/g, " ")
      // Remove leading space on each line
      .replace(/^ +/gm, "")
      // Remove lines that are only punctuation or a single character (page numbers, etc.)
      .replace(/^[^a-zA-Z\d]{0,3}$/gm, "")
      .trim()
  );
}

function extractXmlTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  return match ? stripTags(match[1]).trim() : "";
}

// ---------------------------------------------------------------------------
// ZIP helper
// ---------------------------------------------------------------------------

async function readZipEntry(zip: JSZip, path: string): Promise<string | null> {
  // JSZip keys are case-sensitive and may or may not have leading slash
  const file =
    zip.file(path) || zip.file(path.replace(/^\//, "")) || zip.file("/" + path);

  if (!file) {
    // Try case-insensitive search as last resort
    const lower = path.toLowerCase();
    const found = Object.keys((zip as any).files).find(
      (k) => k.toLowerCase() === lower,
    );
    if (found) return zip.file(found)?.async("string") ?? null;
    return null;
  }

  return file.async("string");
}

// ---------------------------------------------------------------------------
// Path + XML helpers
// ---------------------------------------------------------------------------

function resolveZipPath(baseDir: string, href: string): string {
  const raw = href.replace(/\\/g, "/");
  const joined = raw.startsWith("/") ? raw.slice(1) : `${baseDir}${raw}`;

  const stack: string[] = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function parseXmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([\w:-]+)\s*=\s*["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(tag)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Logger (swap for your preferred logger in production)
// ---------------------------------------------------------------------------

function log(...args: unknown[]): void {
  if (__DEV__) console.log("[EpubExtractor]", ...args);
}
