/**
 * FileImporter Component
 * Production-ready file importer using Expo Document Picker
 * Supports PDF, DOCX, TXT, CSV, JSON files
 */

import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { formatFileSize } from "@/services/fileService";
import { useTheme } from "@/services/ThemeProvider";

// ============================================================================
// TYPES
// ============================================================================
export interface ImportedFile {
  name: string;
  size: number;
  type: string;
  uri: string;
}

export interface FileImporterProps {
  /** Callback when file is successfully imported */
  onFileImported?: (file: ImportedFile, contents?: string) => void;
  /** Callback when import fails */
  onError?: (error: string) => void;
  /** Callback when import is cancelled */
  onCancel?: () => void;
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSize?: number;
  /** Allowed MIME types */
  allowedTypes?: string[];
  /** Whether to read file contents after import */
  readContents?: boolean;
  /** Custom button label */
  buttonLabel?: string;
  /** Whether the importer is disabled */
  disabled?: boolean;
  /** Show file info after selection */
  showFileInfo?: boolean;
  /** Show file contents preview */
  showPreview?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const DEFAULT_ALLOWED_TYPES = [
  "text/plain",
  "application/json",
  "text/csv",
  "application/pdf",
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// ============================================================================
// COMPONENT
// ============================================================================
export function FileImporter({
  onFileImported,
  onError,
  onCancel,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  readContents = true,
  buttonLabel = "Select File",
  disabled = false,
  showFileInfo = true,
  showPreview = false,
}: FileImporterProps) {
  const { colors: t } = useTheme();
  const primaryColor = t.primary;
  const textColor = t.text;

  const [file, setFile] = useState<ImportedFile | null>(null);
  const [fileContents, setFileContents] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  /**
   * Validate file before processing
   */
  const validateFile = (fileInfo: {
    name: string;
    size?: number;
    mimeType?: string;
  }): void => {
    if (!fileInfo) {
      throw new Error("No file selected");
    }

    if (fileInfo.size && fileInfo.size > maxFileSize) {
      throw new Error(
        `File size exceeds maximum allowed size of ${maxFileSize / (1024 * 1024)}MB`,
      );
    }

    if (fileInfo.mimeType && !allowedTypes.includes(fileInfo.mimeType)) {
      throw new Error(`File type "${fileInfo.mimeType}" is not allowed.`);
    }

    if (fileInfo.size === 0) {
      throw new Error("File is empty");
    }
  };

  /**
   * Read file contents based on MIME type
   */
  const readFileContentsAsync = async (fileInfo: {
    uri: string;
    mimeType?: string;
  }): Promise<string> => {
    const { uri, mimeType } = fileInfo;

    try {
      // For text-based files
      if (
        mimeType === "text/plain" ||
        mimeType === "application/json" ||
        mimeType === "text/csv"
      ) {
        const content = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        return content;
      }

      // For PDFs - read as base64
      if (mimeType === "application/pdf") {
        const content = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `data:${mimeType};base64,${content}`;
      }

      // For Word documents - read as base64
      if (
        mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const content = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `data:${mimeType};base64,${content}`;
      }

      // For images - read as base64
      if (mimeType?.startsWith("image/")) {
        const content = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `data:${mimeType};base64,${content}`;
      }

      // Default - try reading as text
      const content = await FileSystem.readAsStringAsync(uri);
      return content;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      throw new Error("Failed to read file contents: " + errorMessage);
    }
  };

  /**
   * Handle document picking
   */
  const handlePickDocument = async () => {
    if (disabled || isLoading) return;

    try {
      setIsLoading(true);
      setError("");
      setFileContents("");

      // Pick document using Expo Document Picker
      const result = await DocumentPicker.getDocumentAsync({
        type: allowedTypes,
        copyToCacheDirectory: true, // Important: copies to accessible location
      });

      // Check if user cancelled
      if (result.canceled) {
        setIsLoading(false);
        onCancel?.();
        return;
      }

      const pickedFile = result.assets[0];

      // Validate the file
      validateFile(pickedFile);

      // Set file info
      const importedFile: ImportedFile = {
        name: pickedFile.name,
        size: pickedFile.size || 0,
        type: pickedFile.mimeType || "application/octet-stream",
        uri: pickedFile.uri,
      };

      setFile(importedFile);

      // Read file contents if requested
      let contents = "";
      if (readContents) {
        contents = await readFileContentsAsync({
          uri: pickedFile.uri,
          mimeType: pickedFile.mimeType,
        });
        setFileContents(contents);
      }

      console.log(
        "[FileImporter] File imported successfully:",
        importedFile.name,
      );

      // Callback with file info and contents
      onFileImported?.(importedFile, contents);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to pick document";
      console.error("[FileImporter] Error:", errorMessage);
      setError(errorMessage);
      onError?.(errorMessage);
      Alert.alert("Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Clear selection
   */
  const handleClear = () => {
    setFile(null);
    setFileContents("");
    setError("");
  };

  return (
    <View style={styles.container}>
      {/* Pick File Button */}
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: disabled || isLoading ? "#ccc" : primaryColor },
        ]}
        onPress={handlePickDocument}
        disabled={disabled || isLoading}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isLoading ? "hourglass" : "document-attach"}
          size={20}
          color="#fff"
        />
        <Text style={styles.buttonText}>
          {isLoading ? "Loading..." : buttonLabel}
        </Text>
      </TouchableOpacity>

      {/* File Info Display */}
      {showFileInfo && file && !error && (
        <View style={[styles.fileInfoContainer, { borderColor: primaryColor }]}>
          <View style={styles.fileInfoHeader}>
            <Ionicons
              name={
                file.type?.includes("pdf")
                  ? "document"
                  : file.type?.startsWith("image/")
                    ? "image"
                    : "document-text"
              }
              size={24}
              color={primaryColor}
            />
            <View style={styles.fileInfoDetails}>
              <Text
                style={[styles.fileName, { color: textColor }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {file.name}
              </Text>
              <Text style={styles.fileMetadata}>
                {file.type || "Unknown"} • {formatFileSize(file.size)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClear}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="close-circle" size={24} color="#999" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color="#cc0000" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Reading file, please wait...</Text>
        </View>
      )}

      {/* File Contents Preview */}
      {showPreview && fileContents && !isLoading && (
        <View style={styles.previewContainer}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            File Contents Preview:
          </Text>
          <ScrollView style={styles.contentScroll} nestedScrollEnabled>
            <Text style={styles.contentText}>
              {fileContents.startsWith("data:")
                ? `[Binary data - ${fileContents.length.toLocaleString()} characters]`
                : fileContents.substring(0, 2000)}
              {!fileContents.startsWith("data:") &&
                fileContents.length > 2000 &&
                "\n\n... (truncated for preview)"}
            </Text>
          </ScrollView>
          <Text style={styles.charCount}>
            Total characters: {fileContents.length.toLocaleString()}
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  fileInfoContainer: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  fileInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fileInfoDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  fileMetadata: {
    fontSize: 12,
    color: "#666",
  },
  clearButton: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    backgroundColor: "#ffe6e6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff4d4d",
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#cc0000",
    fontSize: 14,
  },
  loadingContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffc107",
  },
  loadingText: {
    color: "#856404",
    fontSize: 14,
  },
  previewContainer: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
    borderRadius: 8,
    padding: 15,
    backgroundColor: "transparent",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  contentScroll: {
    maxHeight: 200,
    backgroundColor: "transparent",
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.2)",
  },
  contentText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#333",
  },
  charCount: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
  },
});

export default FileImporter;
