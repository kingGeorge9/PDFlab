/**
 * docx-utils.ts
 *
 * Builds a structurally valid .docx file (an OOXML ZIP archive) entirely in
 * JavaScript using JSZip.  No native modules, no dev-build rebuild required.
 *
 * Install once:   npm install jszip
 *
 * Why jszip and not the `docx` npm package?
 *   The `docx` package's Packer.toBuffer() returns a Node.js Buffer, which
 *   does not exist in the React Native JS engine.  It either throws or
 *   silently produces garbage bytes.  JSZip is a pure-JS zip library that
 *   works in React Native with Metro bundler.
 */

import { addSourceTag, getFileByUri } from "@/services/fileIndexService";

import * as FileSystem from "expo-file-system/legacy";
import JSZip from "jszip";
import { Alert, Platform } from "react-native";

// ---------------------------------------------------------------------------
// OOXML boilerplate — the four files that every .docx must contain
// ---------------------------------------------------------------------------

/** Tells Word which content types live inside the archive. */
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels"  ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"   ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

/** Top-level relationship: points to the main document part. */
const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
                Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
                Target="word/document.xml"/>
</Relationships>`;

/** word/_rels/document.xml.rels — currently empty but required by Word. */
const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape characters that are special in XML. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the word/document.xml string from a heading and body text.
 *
 * Each line in `content` becomes its own <w:p> so that line breaks entered
 * by the user are preserved.  The heading (if provided) is rendered in
 * bold at 28 half-points (14 pt).
 */
function buildDocumentXml(heading: string, content: string): string {
  let paragraphs = "";

  // --- heading paragraph -------------------------------------------------
  if (heading) {
    paragraphs += `
      <w:p>
        <w:pPr>
          <w:spacing w:after="240"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:b/>
            <w:sz w:val="28"/>
            <w:szCs w:val="28"/>
          </w:rPr>
          <w:t>${escapeXml(heading)}</w:t>
        </w:r>
      </w:p>`;
  }

  // --- body paragraphs ---------------------------------------------------
  if (content) {
    const lines = content.split("\n");
    for (const line of lines) {
      // Empty line → empty paragraph (acts as a blank line)
      paragraphs += `
      <w:p>
        <w:r>
          <w:rPr>
            <w:sz w:val="24"/>
            <w:szCs w:val="24"/>
          </w:rPr>
          <w:t xml:space="preserve">${escapeXml(line)}</w:t>
        </w:r>
      </w:p>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz  w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

/**
 * Assemble all parts into a ZIP, return the raw bytes as a base64 string.
 */
async function assembleDocxZip(
  heading: string,
  content: string,
): Promise<string> {
  const zip = new JSZip();

  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", RELS_XML);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS_XML);
  zip.file("word/document.xml", buildDocumentXml(heading, content));

  // Generate base64 directly - works in React Native
  const base64 = await zip.generateAsync({
    type: "base64",
    compression: "DEFLATE",
  });
  return base64;
}

/**
 * Create a valid .docx file on disk and return its file:// URI.
 *
 * The file is written to **cacheDirectory** because that is the only
 * location Android's share-intent / ACTION_SEND can reliably read.
 * documentDirectory works for internal use but fails when handed to
 * other apps via expo-sharing on some Android versions.
 *
 * @param heading  – rendered as a bold heading at the top (may be empty)
 * @param content  – body text; newlines become separate paragraphs
 * @param fileName – optional override; defaults to "document.docx"
 * @returns        – the file:// URI of the written .docx
 */
export async function createBlankDocx(
  heading: string,
  content: string,
  fileName?: string,
): Promise<string> {
  const base64 = await assembleDocxZip(heading, content);

  const safeName = (fileName || "document").replace(/[^a-zA-Z0-9_-]/g, "_");
  const uri = FileSystem.cacheDirectory + safeName + ".docx";

  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return uri;
}

// Lazy import to prevent crashes when native module is not available
const getSharing = async () => {
  try {
    return await import("expo-sharing");
  } catch {
    return null;
  }
};

interface SaveDocxOptions {
  docxUri: string;
  fileName?: string;
  dialogTitle?: string;
}

interface ShareDocxOptions {
  docxUri: string;
  fileName?: string;
  dialogTitle?: string;
}

/**
 * Save DOCX to device storage
 */
export async function saveDocx({
  docxUri,
  fileName = "document.docx",
  dialogTitle = "Save Document",
}: SaveDocxOptions): Promise<boolean> {
  try {
    if (!docxUri) {
      Alert.alert("Error", "No document file to save");
      return false;
    }

    // Ensure filename has .docx extension
    const sanitizedFileName = fileName.endsWith(".docx")
      ? fileName
      : `${fileName}.docx`;

    if (Platform.OS === "android") {
      const Sharing = await getSharing();
      if (!Sharing) {
        Alert.alert("Error", "Sharing module is not available.");
        return false;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Error",
          "Sharing is not available on this device. Document was created but cannot be saved.",
        );
        return false;
      }

      await Sharing.shareAsync(docxUri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        dialogTitle: dialogTitle,
      });

      return true;
    } else if (Platform.OS === "ios") {
      const Sharing = await getSharing();
      if (!Sharing) {
        Alert.alert("Error", "Sharing module is not available.");
        return false;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Error",
          "Sharing is not available on this device. Document was created but cannot be saved.",
        );
        return false;
      }

      await Sharing.shareAsync(docxUri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        dialogTitle: dialogTitle,
      });

      return true;
    } else {
      Alert.alert(
        "Not Supported",
        "Saving documents is not supported on this platform",
      );
      return false;
    }
  } catch (error) {
    console.error("Save DOCX error:", error);
    Alert.alert(
      "Save Failed",
      `Failed to save document: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Share DOCX via system share sheet
 */
export async function shareDocx({
  docxUri,
  fileName = "document.docx",
  dialogTitle = "Share Document",
}: ShareDocxOptions): Promise<boolean> {
  try {
    if (!docxUri) {
      Alert.alert("Error", "No document file to share");
      return false;
    }

    const Sharing = await getSharing();
    if (!Sharing) {
      Alert.alert("Error", "Sharing module is not available.");
      return false;
    }
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert(
        "Error",
        "Sharing is not available on this device. Document was created but cannot be shared.",
      );
      return false;
    }

    await Sharing.shareAsync(docxUri, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      dialogTitle: dialogTitle,
    });

    // Add shared tag to the file in unified index
    const fileRecord = await getFileByUri(docxUri);
    if (fileRecord) {
      addSourceTag(fileRecord.id, "shared").catch(console.error);
    }

    return true;
  } catch (error) {
    console.error("Share DOCX error:", error);
    Alert.alert(
      "Share Failed",
      `Failed to share document: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Generate a filename for DOCX based on title
 */
export function generateDocxFileName(baseName?: string): string {
  const sanitizedBaseName = baseName
    ? baseName
        .trim()
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .replace(/\s+/g, "_")
    : "Untitled";
  return `${sanitizedBaseName}.docx`;
}
