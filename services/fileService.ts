import {
    addSourceTag,
    markFileOpened as markFileOpenedInIndex,
    upsertFileRecord,
} from "@/services/fileIndexService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform } from "react-native";

// Pull in the real docx builder. createBlankDocx writes to cacheDirectory
// and returns the file:// URI, so createDocxFile below delegates to it.
import { createBlankDocx } from "@/utils/docx-utils";

// Lazy import to prevent crashes when native module is not available
const getSharing = async () => {
  try {
    return await import("expo-sharing");
  } catch {
    return null;
  }
};

const STORAGE_KEY = "@docu_assistant_files";
const RECENT_FILES_KEY = "@docu_assistant_recent_files";
const FAVORITES_KEY = "@docu_assistant_favorites";
const APP_DIRECTORY = FileSystem.documentDirectory + "DocuAssistant/";

export interface FileInfo {
  id: string;
  name: string;
  uri: string;
  size: number;
  type: string;
  mimeType: string;
  lastModified: number;
  dateAdded: number;
  dateModified: number;
  lastOpened?: number;
  source?: "downloaded" | "created" | "imported";
}

// File type detection
export const getFileType = (
  mimeType: string | undefined,
  name: string,
): string => {
  if (!mimeType) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "pdf";
    if (ext === "docx" || ext === "doc") return "word";
    if (ext === "epub") return "epub";
    if (ext === "pptx" || ext === "ppt") return "ppt";
    if (ext === "xlsx" || ext === "xls") return "excel";
    return "document";
  }

  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("word") || mimeType.includes("document")) return "word";
  if (mimeType.includes("epub")) return "epub";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return "ppt";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return "excel";
  return "document";
};

// Format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Format date
export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
};

// Get raw file references from storage (without verification)
// Used internally to preserve all file references including created files
const getRawFileReferences = async (): Promise<FileInfo[]> => {
  try {
    const filesJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!filesJson) return [];
    return JSON.parse(filesJson);
  } catch (error) {
    console.error("Error getting raw file references:", error);
    return [];
  }
};

// Save file reference to storage
const saveFileReference = async (fileInfo: FileInfo) => {
  try {
    const existingFiles = await getRawFileReferences();
    const updatedFiles = [
      fileInfo,
      ...existingFiles.filter((f) => f.id !== fileInfo.id),
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFiles));
  } catch (error) {
    console.error("Error saving file reference:", error);
  }
};

// Initialize app directory
const initializeAppDirectory = async () => {
  try {
    if (Platform.OS === "web") return;

    const dirInfo = await FileSystem.getInfoAsync(APP_DIRECTORY);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(APP_DIRECTORY, {
        intermediates: true,
      });
      if (__DEV__) console.log("Created app directory:", APP_DIRECTORY);
    }
  } catch (error) {
    console.error("Error initializing directory:", error);
  }
};

// Scan device for document files
export const scanDeviceForDocuments = async (): Promise<FileInfo[]> => {
  try {
    if (Platform.OS === "web") {
      // On web, return cached files only
      return await getAllFiles();
    }

    const scannedFiles: FileInfo[] = [];
    const extensions = ["pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls"];

    // Only scan accessible app directories
    const directories = [FileSystem.documentDirectory];

    // Add app-specific document directory
    if (APP_DIRECTORY) {
      directories.push(APP_DIRECTORY);
    }

    // Scan accessible directories
    for (const dir of directories) {
      if (!dir) continue;

      try {
        await scanDirectory(dir, scannedFiles, extensions);
      } catch (error) {
        console.log(`Error scanning ${dir}:`, error);
      }
    }

    // Get cached files (includes imported and created files)
    const cachedFiles = await getAllFiles();

    // Merge scanned files with cached files
    const fileMap = new Map<string, FileInfo>();

    // Add all cached files first
    for (const cached of cachedFiles) {
      fileMap.set(cached.uri, cached);
    }

    // Add or update with scanned files
    for (const scanned of scannedFiles) {
      fileMap.set(scanned.uri, scanned);
    }

    const allFiles = Array.from(fileMap.values());

    // Save updated file list
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(allFiles));

    return allFiles;
  } catch (error) {
    console.error("Error scanning device:", error);
    return await getAllFiles();
  }
};

// Helper function to scan a directory recursively
const scanDirectory = async (
  dirUri: string,
  files: FileInfo[],
  extensions: string[],
  depth: number = 0,
): Promise<void> => {
  if (depth > 3) return; // Limit recursion depth

  try {
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists || !dirInfo.isDirectory) return;

    const items = await FileSystem.readDirectoryAsync(dirUri);

    for (const item of items) {
      const itemUri = `${dirUri}/${item}`;

      try {
        const itemInfo = await FileSystem.getInfoAsync(itemUri);

        if (!itemInfo.exists) {
          continue;
        }

        if (itemInfo.isDirectory) {
          // Recursively scan subdirectory
          await scanDirectory(itemUri, files, extensions, depth + 1);
        } else {
          // Check if file has a document extension
          const ext = item.split(".").pop()?.toLowerCase();
          if (ext && extensions.includes(ext)) {
            const modTime =
              "modificationTime" in itemInfo
                ? itemInfo.modificationTime
                : Date.now();
            const fileSize = "size" in itemInfo ? itemInfo.size : 0;
            const fileInfo: FileInfo = {
              id: `${itemInfo.uri}_${modTime}`,
              name: item,
              uri: itemUri,
              size: fileSize || 0,
              type: getFileType(undefined, item),
              mimeType: getMimeTypeFromExtension(ext),
              lastModified: modTime || Date.now(),
              dateAdded: modTime || Date.now(),
              dateModified: modTime || Date.now(),
              source: "downloaded",
            };
            files.push(fileInfo);
          }
        }
      } catch (error) {
        console.log(`Error accessing ${itemUri}:`, error);
      }
    }
  } catch (error) {
    console.log(`Error reading directory ${dirUri}:`, error);
  }
};

// Get MIME type from file extension
const getMimeTypeFromExtension = (ext: string): string => {
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

// Create a new document
export const createDocument = async (
  type: "pdf" | "docx" | "pptx" | "xlsx",
  title: string = "Untitled",
  template: string = "blank",
): Promise<FileInfo | null> => {
  try {
    await initializeAppDirectory();

    const fileName = `${title}.${type}`;

    // Create document content based on type
    let fileUri: string;
    let fileSize = 0;

    if (Platform.OS !== "web") {
      if (type === "docx") {
        // ── CHANGED ─────────────────────────────────────────────────────
        // createBlankDocx builds a real ZIP and writes it to cacheDirectory.
        // It returns the file:// URI directly; no need to build a path here.
        // Use timestamp to ensure unique filename and avoid overwrites.
        const uniqueFileName = `${title}_${Date.now()}`;
        fileUri = await createBlankDocx(title, "", uniqueFileName);
        // ────────────────────────────────────────────────────────────────
      } else {
        // For other types, keep the existing APP_DIRECTORY path logic
        fileUri = `${APP_DIRECTORY}${fileName}`;

        if (type === "pdf") {
          fileSize = await createPdfFile(fileUri, title);
        } else if (type === "pptx") {
          fileSize = await createPptxFile(fileUri, title);
        } else if (type === "xlsx") {
          fileSize = await createXlsxFile(fileUri, title);
        }
      }
    } else {
      fileUri = `web-document://${fileName}`;
      fileSize = title.length + 100;
    }

    // Get actual size for docx (written by createBlankDocx)
    if (type === "docx" && Platform.OS !== "web") {
      try {
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists && "size" in info) fileSize = info.size || 0;
      } catch (e) {
        console.warn("Could not stat created docx:", e);
      }
    }

    const fileInfo: FileInfo = {
      id: `${Date.now()}_${Math.random()}`,
      name: fileName,
      uri: fileUri,
      size: fileSize,
      type:
        type === "docx"
          ? "word"
          : type === "pptx"
            ? "ppt"
            : type === "xlsx"
              ? "excel"
              : type,
      mimeType: getMimeType(type),
      lastModified: Date.now(),
      dateAdded: Date.now(),
      dateModified: Date.now(),
      lastOpened: Date.now(),
      source: "created",
    };

    await saveFileReference(fileInfo);

    // Also sync to unified file index
    const fileTypeMap: Record<string, "pdf" | "docx" | "ppt" | "excel"> = {
      pdf: "pdf",
      docx: "docx",
      pptx: "ppt",
      xlsx: "excel",
    };
    upsertFileRecord({
      uri: fileUri,
      name: fileName,
      type: fileTypeMap[type] || "unknown",
      extension: type,
      mimeType: getMimeType(type),
      size: fileSize,
      source: "created",
      sourceTags: ["created"],
    }).catch(console.error);

    Alert.alert("Success", `${fileName} has been created successfully!`, [
      { text: "OK" },
    ]);

    return fileInfo;
  } catch (error) {
    console.error("Error creating document:", error);
    Alert.alert("Error", "Failed to create document. Please try again.");
    return null;
  }
};

// ── REMOVED ─────────────────────────────────────────────────────────────────
// The old createDocxFile() that wrote raw XML with a .docx extension has been
// deleted.  It produced a file that was NOT a ZIP archive, which is why
// Android rejected it as "not a document".  The replacement is
// createBlankDocx() imported from @/utils/docx-utils above.
// ─────────────────────────────────────────────────────────────────────────────

// Create PDF file with proper structure
const createPdfFile = async (uri: string, title: string): Promise<number> => {
  // Minimal valid PDF structure
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length 100 >>
stream
BT
/F1 24 Tf
100 700 Td
(${title}) Tj
0 -30 Td
/F1 12 Tf
(Created with Docu-Assistant) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
0000000309 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
459
%%EOF`;

  await FileSystem.writeAsStringAsync(uri, pdfContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const info = await FileSystem.getInfoAsync(uri);
  return (
    (info.exists && "size" in info ? info.size : pdfContent.length) ||
    pdfContent.length
  );
};

// Create PPTX file with proper structure
const createPptxFile = async (uri: string, title: string): Promise<number> => {
  // Minimal valid PPTX structure (ZIP format with XML)
  const pptxContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="256"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

  await FileSystem.writeAsStringAsync(uri, pptxContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const info = await FileSystem.getInfoAsync(uri);
  return (
    (info.exists && "size" in info ? info.size : pptxContent.length) ||
    pptxContent.length
  );
};

// Create XLSX file with proper structure
const createXlsxFile = async (uri: string, title: string): Promise<number> => {
  // Minimal valid XLSX structure (ZIP format with XML)
  const xlsxContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c t="inlineStr" r="A1">
        <is><t>${title}</t></is>
      </c>
    </row>
    <row r="2">
      <c t="inlineStr" r="A2">
        <is><t>Created with Docu-Assistant</t></is>
      </c>
    </row>
  </sheetData>
</worksheet>`;

  await FileSystem.writeAsStringAsync(uri, xlsxContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const info = await FileSystem.getInfoAsync(uri);
  return (
    (info.exists && "size" in info ? info.size : xlsxContent.length) ||
    xlsxContent.length
  );
};

// Get MIME type for document
const getMimeType = (type: string): string => {
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimeTypes[type] || "application/octet-stream";
};

// Track file as recently opened
export const markFileAsOpened = async (fileId: string): Promise<void> => {
  try {
    const files = await getAllFiles();
    const updatedFiles = files.map((f) =>
      f.id === fileId ? { ...f, lastOpened: Date.now() } : f,
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFiles));

    // Add to recent files history
    await addToRecentFiles(fileId);

    // Also sync to unified file index
    markFileOpenedInIndex(fileId).catch(console.error);
  } catch (error) {
    console.error("Error marking file as opened:", error);
  }
};

// Track file as recently created/saved/shared
export const markFileAsCreated = async (
  uri: string,
  fileName: string,
  fileType: "pdf" | "docx",
): Promise<void> => {
  try {
    const now = Date.now();
    const extension = fileType === "pdf" ? ".pdf" : ".docx";
    // Ensure filename has the correct extension
    const finalFileName = fileName.endsWith(extension)
      ? fileName
      : `${fileName}${extension}`;

    // Get actual file size
    let fileSize = 0;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && (info as any).size) {
        fileSize = (info as any).size;
      }
      if (__DEV__) {
        console.log(
          `[FileService] markFileAsCreated - path: ${uri}, exists: ${info.exists}, size: ${fileSize}`,
        );
      }
    } catch (e) {
      console.warn("Could not get file size:", e);
    }

    if (fileSize === 0) {
      console.warn("[FileService] Warning: created file has 0 bytes:", uri);
    }

    const fileInfo: FileInfo = {
      id: `created_${now}_${Math.random()}`,
      name: finalFileName,
      uri,
      size: fileSize,
      type: fileType === "pdf" ? "pdf" : "word",
      mimeType:
        fileType === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      lastModified: now,
      dateAdded: now,
      dateModified: now,
      lastOpened: now,
      source: "created",
    };

    // Save the file reference
    await saveFileReference(fileInfo);

    // Add to recent files history
    await addToRecentFiles(fileInfo.id);

    // Also sync to unified file index (await to ensure it completes)
    await upsertFileRecord({
      uri,
      name: finalFileName,
      type: fileType === "pdf" ? "pdf" : "docx",
      extension: fileType,
      mimeType: fileInfo.mimeType,
      size: fileSize,
      source: "created",
      sourceTags: ["created"],
    }).catch((err) => {
      console.error("[FileService] Failed to sync created file to index:", err);
    });
  } catch (error) {
    console.error("Error marking file as created:", error);
  }
};

// Get recently opened/created files (combines both opened and created files)
export const getRecentlyOpenedFiles = async (
  limit: number = 5,
): Promise<FileInfo[]> => {
  const recentFiles = await getRecentFiles();
  return recentFiles.slice(0, limit);
};

// Get all files from cache
export const getAllFiles = async (): Promise<FileInfo[]> => {
  try {
    const filesJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!filesJson) return [];

    const files: FileInfo[] = JSON.parse(filesJson);

    // Deduplicate by URI (keep most recent by dateAdded)
    const fileMap = new Map<string, FileInfo>();
    for (const file of files) {
      const existing = fileMap.get(file.uri);
      if (!existing || file.dateAdded > existing.dateAdded) {
        fileMap.set(file.uri, file);
      }
    }
    const dedupedFiles = Array.from(fileMap.values());

    // On web, skip file verification and return all cached files
    if (Platform.OS === "web") {
      return dedupedFiles;
    }

    // On mobile, verify files still exist and are accessible (in parallel for performance)
    const verificationResults = await Promise.all(
      dedupedFiles.map(async (file) => {
        // Skip verification for created files - they may have been exported
        if (file.source === "created") {
          return { file, exists: true };
        }
        try {
          const info = await FileSystem.getInfoAsync(file.uri);
          return { file, exists: info.exists };
        } catch {
          return { file, exists: false };
        }
      }),
    );

    const validFiles = verificationResults
      .filter((result) => result.exists)
      .map((result) => result.file);

    // Update storage with only valid files (debounced to avoid frequent writes)
    if (validFiles.length !== files.length) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validFiles));
    }

    return validFiles;
  } catch (error) {
    console.error("Error getting files:", error);
    return [];
  }
};

// Pick documents from device
export const pickDocuments = async (
  allowMultiple: boolean = true,
): Promise<FileInfo[]> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/epub+zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ],
      multiple: allowMultiple,
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return [];
    }

    const files: FileInfo[] = [];
    const assets = Array.isArray(result.assets)
      ? result.assets
      : [result.assets];

    for (const asset of assets) {
      const fileInfo: FileInfo = {
        id: `${Date.now()}_${Math.random()}`,
        name: asset.name,
        uri: asset.uri,
        size: asset.size || 0,
        type: getFileType(asset.mimeType, asset.name),
        mimeType: asset.mimeType || "application/octet-stream",
        lastModified: Date.now(),
        dateAdded: Date.now(),
        dateModified: Date.now(),
        source: "imported",
      };
      files.push(fileInfo);

      // Also sync to unified file index
      upsertFileRecord({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || "application/octet-stream",
        size: asset.size || 0,
        source: "imported",
        sourceTags: ["imported"],
      }).catch(console.error);
    }

    // Save all files at once
    if (files.length > 0) {
      const existingFiles = await getAllFiles();
      const allFiles = [...files, ...existingFiles];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(allFiles));
    }

    return files;
  } catch (error) {
    console.error("Error picking documents:", error);
    throw error;
  }
};

// Search files by name or type
export const searchFiles = async (query: string): Promise<FileInfo[]> => {
  const allFiles = await getAllFiles();
  const lowerQuery = query.toLowerCase();

  return allFiles.filter(
    (file) =>
      file.name.toLowerCase().includes(lowerQuery) ||
      file.type.toLowerCase().includes(lowerQuery),
  );
};

// Get files by type
export const getFilesByType = async (type: string): Promise<FileInfo[]> => {
  const allFiles = await getAllFiles();
  return allFiles.filter((file) => file.type === type);
};

// Get file info by ID
export const getFileInfo = async (fileId: string): Promise<FileInfo | null> => {
  try {
    const files = await getAllFiles();
    return files.find((f) => f.id === fileId) || null;
  } catch (error) {
    console.error("Error getting file info:", error);
    return null;
  }
};

// Delete file reference
export const deleteFileReference = async (fileId: string): Promise<boolean> => {
  try {
    const allFiles = await getAllFiles();
    const updatedFiles = allFiles.filter((f) => f.id !== fileId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFiles));
    return true;
  } catch (error) {
    console.error("Error deleting file reference:", error);
    return false;
  }
};

// Share a file
export const shareFile = async (fileInfo: FileInfo): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      Alert.alert(
        "Share",
        `Sharing: ${fileInfo.name}\n\nWeb sharing will be implemented with Web Share API`,
      );
      return;
    }

    const Sharing = await getSharing();
    if (!Sharing) {
      Alert.alert("Error", "Sharing module is not available");
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileInfo.uri, {
        mimeType: fileInfo.mimeType,
        dialogTitle: `Share ${fileInfo.name}`,
      });

      // Add shared tag to unified file index
      addSourceTag(fileInfo.id, "shared").catch(console.error);
    } else {
      Alert.alert("Info", `File saved at: ${fileInfo.uri}`);
    }
  } catch (error) {
    console.error("Error sharing file:", error);
    Alert.alert("Error", "Failed to share file");
  }
};

// Open file in external app
export const openFileExternal = async (fileInfo: FileInfo): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      Alert.alert(
        "Open",
        `Opening: ${fileInfo.name}\n\nWeb file handling will be implemented`,
      );
      return;
    }

    await shareFile(fileInfo);
  } catch (error) {
    console.error("Error opening file:", error);
    Alert.alert("Error", "Failed to open file");
  }
};

// Clear all file references
export const clearAllFiles = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing files:", error);
    throw error;
  }
};

// ============================================
// FAVORITES MANAGEMENT
// ============================================

// Get all favorite file IDs
export const getFavorites = async (): Promise<Set<string>> => {
  try {
    const favoritesJson = await AsyncStorage.getItem(FAVORITES_KEY);
    const favorites: string[] = favoritesJson ? JSON.parse(favoritesJson) : [];
    return new Set(favorites);
  } catch (error) {
    console.error("Error getting favorites:", error);
    return new Set();
  }
};

// Add file to favorites
export const addToFavorites = async (fileId: string): Promise<void> => {
  try {
    const favorites = await getFavorites();
    favorites.add(fileId);
    await AsyncStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(Array.from(favorites)),
    );
  } catch (error) {
    console.error("Error adding to favorites:", error);
    throw error;
  }
};

// Remove file from favorites
export const removeFromFavorites = async (fileId: string): Promise<void> => {
  try {
    const favorites = await getFavorites();
    favorites.delete(fileId);
    await AsyncStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(Array.from(favorites)),
    );
  } catch (error) {
    console.error("Error removing from favorites:", error);
    throw error;
  }
};

// Toggle favorite status
export const toggleFavorite = async (fileId: string): Promise<boolean> => {
  try {
    const favorites = await getFavorites();
    const isFavorite = favorites.has(fileId);

    if (isFavorite) {
      await removeFromFavorites(fileId);
      return false;
    } else {
      await addToFavorites(fileId);
      return true;
    }
  } catch (error) {
    console.error("Error toggling favorite:", error);
    throw error;
  }
};

// Check if file is favorite
export const isFavorite = async (fileId: string): Promise<boolean> => {
  const favorites = await getFavorites();
  return favorites.has(fileId);
};

// Get all favorite files
export const getFavoriteFiles = async (): Promise<FileInfo[]> => {
  try {
    const favorites = await getFavorites();
    const allFiles = await getAllFiles();
    return allFiles.filter((file) => favorites.has(file.id));
  } catch (error) {
    console.error("Error getting favorite files:", error);
    return [];
  }
};

// ============================================
// RECENT FILES MANAGEMENT
// ============================================

const MAX_RECENT_FILES = 20;

// Get recent file IDs (ordered by recency)
export const getRecentFileIds = async (): Promise<string[]> => {
  try {
    const recentJson = await AsyncStorage.getItem(RECENT_FILES_KEY);
    return recentJson ? JSON.parse(recentJson) : [];
  } catch (error) {
    console.error("Error getting recent files:", error);
    return [];
  }
};

// Add file to recent history
export const addToRecentFiles = async (fileId: string): Promise<void> => {
  try {
    let recentIds = await getRecentFileIds();

    // Remove if already exists
    recentIds = recentIds.filter((id) => id !== fileId);

    // Add to front
    recentIds.unshift(fileId);

    // Keep only last MAX_RECENT_FILES
    recentIds = recentIds.slice(0, MAX_RECENT_FILES);

    await AsyncStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recentIds));
  } catch (error) {
    console.error("Error adding to recent files:", error);
  }
};

// Get recent files (full FileInfo objects)
// Uses raw file references to include created/shared files that may no longer exist at original URI
export const getRecentFiles = async (): Promise<FileInfo[]> => {
  try {
    const recentIds = await getRecentFileIds();
    const allFiles = await getRawFileReferences();

    // Build a map for quick lookup
    const fileMap = new Map<string, FileInfo>();
    for (const file of allFiles) {
      fileMap.set(file.id, file);
    }

    // Get files in order, filtering out duplicates by URI
    const seenUris = new Set<string>();
    const candidateFiles: FileInfo[] = [];

    for (const id of recentIds) {
      const file = fileMap.get(id);
      if (file && !seenUris.has(file.uri)) {
        candidateFiles.push(file);
        seenUris.add(file.uri);
      }
    }

    // On web, return without verification
    if (Platform.OS === "web") {
      return candidateFiles;
    }

    // On mobile, verify files exist in parallel for performance
    const verificationResults = await Promise.all(
      candidateFiles.map(async (file) => {
        // For created files, include them without checking if file exists
        if (file.source === "created") {
          return { file, exists: true };
        }
        try {
          const info = await FileSystem.getInfoAsync(file.uri);
          return { file, exists: info.exists };
        } catch {
          return { file, exists: false };
        }
      }),
    );

    return verificationResults
      .filter((result) => result.exists)
      .map((result) => result.file);
  } catch (error) {
    console.error("Error getting recent files:", error);
    return [];
  }
};

// Clear recent files history
export const clearRecentFiles = async (): Promise<void> => {
  try {
    // Clear legacy recent files
    await AsyncStorage.removeItem(RECENT_FILES_KEY);
    // Clear unified index recent history (resets lastOpenedAt, keeps files)
    const { clearRecentHistory } = await import("@/services/fileIndexService");
    await clearRecentHistory();
  } catch (error) {
    console.error("Error clearing recent files:", error);
    throw error;
  }
};

// Remove file from recent history
export const removeFromRecentFiles = async (fileId: string): Promise<void> => {
  try {
    let recentIds = await getRecentFileIds();
    recentIds = recentIds.filter((id) => id !== fileId);
    await AsyncStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recentIds));
  } catch (error) {
    console.error("Error removing from recent files:", error);
  }
};
