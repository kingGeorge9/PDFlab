import { createBlankDocx } from "@/utils/docx-utils";
import {
    generateFileName,
    MIME_TYPES,
    saveDocxToDevice,
    savePdfToDevice,
    shareFile as shareFileUtil,
    UTI_TYPES,
} from "@/utils/file-save-utils";
import * as ImagePicker from "expo-image-picker";

// Dynamic import helper for expo-print to avoid native module errors
const getPrintModule = async () => {
  const Print = await import("expo-print");
  return Print;
};

export type FileType = "pdf" | "docx";
export type CreationMethod = "blank" | "image" | "camera";

export interface CreateFileResult {
  success: boolean;
  uri?: string;
  fileName?: string;
  error?: string;
}

/**
 * Create a PDF from blank with heading and content
 */
export async function createPdfFromBlank(
  heading: string,
  content: string,
): Promise<CreateFileResult> {
  try {
    if (!heading && !content) {
      return {
        success: false,
        error: "Please enter a heading or content to create your PDF",
      };
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 60px 50px;
              line-height: 1.8;
              color: #1a1a1a;
            }
            h1 {
              font-size: 32px;
              font-weight: 700;
              color: #000;
              margin-bottom: 30px;
              letter-spacing: -0.5px;
            }
            p {
              font-size: 16px;
              line-height: 1.8;
              color: #333;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
          </style>
        </head>
        <body>
          ${heading ? `<h1>${heading}</h1>` : ""}
          ${content ? `<p>${content}</p>` : ""}
        </body>
      </html>
    `;

    const Print = await getPrintModule();
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const fileName = generateFileName(heading, "pdf");
    console.log("PDF created at:", uri);

    return {
      success: true,
      uri,
      fileName,
    };
  } catch (error) {
    console.error("PDF creation error:", error);
    return {
      success: false,
      error: `Failed to create PDF: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a PDF from images
 */
export async function createPdfFromImages(): Promise<CreateFileResult> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      return {
        success: false,
        error: "Photo library access is required to create PDF from images",
      };
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) {
      return {
        success: false,
        error: "Image selection cancelled",
      };
    }

    // Get selected image URIs
    const selectedImages = result.assets.map((asset) => asset.uri);

    if (selectedImages.length === 0) {
      return {
        success: false,
        error: "No images selected",
      };
    }

    // Build HTML with images
    const imagesHtml = selectedImages
      .map(
        (uri) => `
      <div style="page-break-after: always; text-align: center;">
        <img src="${uri}" style="max-width: 100%; max-height: 100vh; object-fit: contain;" />
      </div>
    `,
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            @media print {
              body {
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          ${imagesHtml}
        </body>
      </html>
    `;

    const Print = await getPrintModule();
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const fileName = generateFileName("Images_PDF", "pdf");
    console.log("PDF from images created at:", uri);

    return {
      success: true,
      uri,
      fileName,
    };
  } catch (error) {
    console.error("PDF from images error:", error);
    return {
      success: false,
      error: `Failed to create PDF from images: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a PDF from camera photo
 */
export async function createPdfFromCamera(): Promise<CreateFileResult> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      return {
        success: false,
        error: "Camera access is required to create PDF from photos",
      };
    }

    // Launch camera
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return {
        success: false,
        error: "Photo capture cancelled",
      };
    }

    // Get captured photo URI
    const photoUri = result.assets[0].uri;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
              object-fit: contain;
            }
            @media print {
              body {
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          <img src="${photoUri}" />
        </body>
      </html>
    `;

    const Print = await getPrintModule();
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const fileName = generateFileName("Scanned_Document", "pdf");
    console.log("PDF from camera created at:", uri);

    return {
      success: true,
      uri,
      fileName,
    };
  } catch (error) {
    console.error("PDF from camera error:", error);
    return {
      success: false,
      error: `Failed to create PDF from camera: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a DOCX from blank with heading and content
 */
export async function createDocxFromBlank(
  heading: string,
  content: string,
): Promise<CreateFileResult> {
  try {
    if (!heading && !content) {
      return {
        success: false,
        error: "Please enter a heading or content to create your document",
      };
    }

    // Generate a unique filename based on heading and timestamp
    const baseFileName = heading.trim() || "Untitled";
    const timestamp = Date.now();
    const uniqueFileName = `${baseFileName}_${timestamp}`;

    // Pass the unique filename to createBlankDocx so the file has a unique path
    const uri = await createBlankDocx(heading, content, uniqueFileName);
    const fileName = generateFileName(heading, "docx");
    console.log("DOCX created at:", uri);

    return {
      success: true,
      uri,
      fileName,
    };
  } catch (error) {
    console.error("DOCX creation error:", error);
    return {
      success: false,
      error: `Failed to create DOCX: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a DOCX from images
 * Note: This is a simplified version that creates a text file with image paths
 * For full DOCX with embedded images, consider using the 'docx' library
 */
export async function createDocxFromImages(): Promise<CreateFileResult> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      return {
        success: false,
        error:
          "Photo library access is required to create document from images",
      };
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) {
      return {
        success: false,
        error: "Image selection cancelled",
      };
    }

    const selectedImages = result.assets.map((asset) => asset.uri);

    if (selectedImages.length === 0) {
      return {
        success: false,
        error: "No images selected",
      };
    }

    // Create document with image references
    const heading = "Document with Images";
    const content = `This document contains ${selectedImages.length} image(s):\n\n${selectedImages.map((uri, idx) => `${idx + 1}. ${uri}`).join("\n")}`;

    // Use unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFileName = `Images_Document_${timestamp}`;
    const uri = await createBlankDocx(heading, content, uniqueFileName);
    const fileName = generateFileName("Images_Document", "docx");
    console.log("DOCX from images created at:", uri);

    return {
      success: true,
      uri,
      fileName,
    };
  } catch (error) {
    console.error("DOCX from images error:", error);
    return {
      success: false,
      error: `Failed to create DOCX from images: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a DOCX from camera photo
 */
export async function createDocxFromCamera(): Promise<CreateFileResult> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      return {
        success: false,
        error: "Camera access is required to create document from photos",
      };
    }

    // Launch camera
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return {
        success: false,
        error: "Photo capture cancelled",
      };
    }

    const photoUri = result.assets[0].uri;

    // Create document with photo reference
    const heading = "Document with Camera Photo";
    const content = `This document contains a photo captured from camera:\n\n${photoUri}`;

    // Use unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFileName = `Scanned_Document_${timestamp}`;
    const uri = await createBlankDocx(heading, content, uniqueFileName);
    const fileName = generateFileName("Scanned_Document", "docx");
    console.log("DOCX from camera created at:", uri);

    return {
      success: true,
      uri,
      fileName,
    };
  } catch (error) {
    console.error("DOCX from camera error:", error);
    return {
      success: false,
      error: `Failed to create DOCX from camera: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Save a file (PDF or DOCX) to device storage
 */
export async function saveFile(
  fileType: FileType,
  uri: string,
  fileName?: string,
): Promise<boolean> {
  const finalFileName = generateFileName(
    fileName,
    fileType === "pdf" ? "pdf" : "docx",
  );

  if (fileType === "pdf") {
    return await savePdfToDevice(uri, finalFileName);
  } else {
    return await saveDocxToDevice(uri, finalFileName);
  }
}

/**
 * Share a file (PDF or DOCX) via system share sheet
 */
export async function shareFile(
  fileType: FileType,
  uri: string,
  fileName?: string,
): Promise<boolean> {
  const finalFileName = generateFileName(
    fileName,
    fileType === "pdf" ? "pdf" : "docx",
  );
  const mimeType = fileType === "pdf" ? MIME_TYPES.PDF : MIME_TYPES.DOCX;
  const uti = fileType === "pdf" ? UTI_TYPES.PDF : UTI_TYPES.DOCX;

  return await shareFileUtil({
    sourceUri: uri,
    fileName: finalFileName,
    mimeType,
    uti,
    dialogTitle: `Share ${fileType === "pdf" ? "PDF" : "Document"}`,
  });
}
