/**
 * DocxShareOptions Component
 * A modal/bottom sheet component for sharing DOCX files with two options:
 * 1. Share as file attachment
 * 2. Share as plain text content
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React from "react";
import {
  Alert,
  Modal,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";

// ============================================================================
// TYPES
// ============================================================================
interface DocxShareOptionsProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** URI of the DOCX file to share (use original URI, not cached) */
  fileUri: string | null;
  /** Plain text content to share (extracted from DOCX) */
  textContent: string | null;
  /** Display name of the file */
  fileName: string;
}

// ============================================================================
// COMPONENT
// ============================================================================
const DocxShareOptions: React.FC<DocxShareOptionsProps> = ({
  visible,
  onClose,
  fileUri,
  textContent,
  fileName,
}) => {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";

  // Share as file attachment (with full diagnostics and proper file handling)
  // FIX: On Android, external apps cannot read file:// URIs from Expo's sandbox.
  // We must copy to cache and convert to content:// URI via getContentUriAsync().
  const shareAsFile = async (): Promise<void> => {
    console.log("[DocxShareOptions] shareAsFile called");
    console.log("[DocxShareOptions] Input fileUri:", fileUri);
    console.log("[DocxShareOptions] fileName:", fileName);

    if (!fileUri) {
      Alert.alert("Error", "File not available for sharing");
      return;
    }

    try {
      // Step 1: Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      console.log("[DocxShareOptions] Sharing available:", isAvailable);
      if (!isAvailable) {
        Alert.alert("Error", "Sharing is not available on this device");
        return;
      }

      // Step 2: Verify the source file exists and get its info
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      console.log("[DocxShareOptions] File info:", JSON.stringify(fileInfo));

      if (!fileInfo.exists) {
        console.error(
          "[DocxShareOptions] File does not exist at URI:",
          fileUri,
        );
        Alert.alert("Error", "The document file could not be found.");
        return;
      }

      // Check file size
      const fileSize = (fileInfo as any).size || 0;
      console.log("[DocxShareOptions] File size:", fileSize);

      if (fileSize === 0) {
        console.warn("[DocxShareOptions] File size is 0 bytes");
        Alert.alert(
          "Warning",
          "The document appears to be empty. Share anyway?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Share Anyway", onPress: () => prepareAndShare() },
          ],
        );
        return;
      }

      await prepareAndShare();
    } catch (error) {
      console.error("[DocxShareOptions] Error in shareAsFile:", error);
      Alert.alert(
        "Share Failed",
        `Unable to share the document: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Helper function to prepare file and share
  // This handles the Android-specific content:// URI conversion
  const prepareAndShare = async (): Promise<void> => {
    if (!fileUri) return;

    // Step 1: Always copy to cache with a clean, predictable filename
    // This ensures the file is owned by the app and the path is fresh
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const cacheFileName = safeName.toLowerCase().endsWith(".docx")
      ? safeName
      : `${safeName}.docx`;
    const cachedPath = `${FileSystem.cacheDirectory}${cacheFileName}`;

    console.log("[DocxShareOptions] Copying file to cache:", cachedPath);

    // Copy to cache (even if already there, ensures fresh copy)
    if (fileUri !== cachedPath) {
      await FileSystem.copyAsync({
        from: fileUri,
        to: cachedPath,
      });
    }

    // Verify the cached file exists
    const cachedInfo = await FileSystem.getInfoAsync(cachedPath);
    console.log(
      "[DocxShareOptions] Cached file info:",
      JSON.stringify(cachedInfo),
    );

    if (!cachedInfo.exists) {
      throw new Error("Failed to prepare file for sharing");
    }

    // Step 2: Share the file
    // expo-sharing expects a file:// URI and handles Android FileProvider internally
    // We just need to ensure the file is in our app's cache directory
    console.log("[DocxShareOptions] Sharing file from cache:", cachedPath);

    // Step 3: Perform the share
    await performShare(cachedPath);
  };

  // Helper function to perform the actual share
  const performShare = async (uri: string): Promise<void> => {
    console.log("[DocxShareOptions] Performing share with URI:", uri);

    // Ensure the filename has .docx extension
    const shareFileName = fileName.endsWith(".docx")
      ? fileName
      : `${fileName}.docx`;

    await Sharing.shareAsync(uri, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      dialogTitle: `Share ${shareFileName}`,
      UTI: "org.openxmlformats.wordprocessingml.document",
    });

    console.log("[DocxShareOptions] Share completed successfully");
    onClose();
  };

  // Share as plain text content
  const shareAsText = async (): Promise<void> => {
    try {
      // Check if we have text content to share
      const contentToShare = textContent?.trim();

      if (!contentToShare || contentToShare.length === 0) {
        Alert.alert(
          "No Content Available",
          "Unable to extract text content from this document. Try sharing the file instead.",
          [
            { text: "Share File", onPress: shareAsFile },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }

      // Use React Native's Share API for text-only sharing
      // This ensures apps like WhatsApp, SMS, etc. receive just the text
      await Share.share(
        {
          message: contentToShare,
          title: fileName || "Document Content",
        },
        {
          dialogTitle: "Share as Text",
        },
      );

      onClose();
    } catch (error) {
      console.error("[DocxShareOptions] Error sharing text:", error);
      Alert.alert("Error", "Failed to share text content. Please try again.");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.container,
            isDark ? styles.containerDark : styles.containerLight,
          ]}
        >
          <View style={styles.handleContainer}>
            <View
              style={[
                styles.handle,
                isDark ? styles.handleDark : styles.handleLight,
              ]}
            />
          </View>

          <Text
            style={[
              styles.title,
              isDark ? styles.titleDark : styles.titleLight,
            ]}
          >
            Share DOCX Document
          </Text>

          {/* Share File Option */}
          <TouchableOpacity
            style={[
              styles.option,
              isDark ? styles.optionDark : styles.optionLight,
            ]}
            onPress={shareAsFile}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isDark ? "#374151" : "#E0E7FF" },
              ]}
            >
              <MaterialIcons
                name="attach-file"
                size={24}
                color={isDark ? "#818CF8" : "#4F46E5"}
              />
            </View>
            <View style={styles.optionTextContainer}>
              <Text
                style={[
                  styles.optionTitle,
                  isDark ? styles.optionTitleDark : styles.optionTitleLight,
                ]}
              >
                Share DOCX File
              </Text>
              <Text
                style={[
                  styles.optionDescription,
                  isDark
                    ? styles.optionDescriptionDark
                    : styles.optionDescriptionLight,
                ]}
              >
                Send as file attachment
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={isDark ? "#6B7280" : "#9CA3AF"}
            />
          </TouchableOpacity>

          {/* Share Text Content Option */}
          <TouchableOpacity
            style={[
              styles.option,
              isDark ? styles.optionDark : styles.optionLight,
            ]}
            onPress={shareAsText}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isDark ? "#374151" : "#D1FAE5" },
              ]}
            >
              <MaterialIcons
                name="text-fields"
                size={24}
                color={isDark ? "#34D399" : "#059669"}
              />
            </View>
            <View style={styles.optionTextContainer}>
              <Text
                style={[
                  styles.optionTitle,
                  isDark ? styles.optionTitleDark : styles.optionTitleLight,
                ]}
              >
                Share DOCX Content (Text Only)
              </Text>
              <Text
                style={[
                  styles.optionDescription,
                  isDark
                    ? styles.optionDescriptionDark
                    : styles.optionDescriptionLight,
                ]}
              >
                Send as plain text (WhatsApp, SMS, etc.)
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={isDark ? "#6B7280" : "#9CA3AF"}
            />
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={[
              styles.cancelButton,
              isDark ? styles.cancelButtonDark : styles.cancelButtonLight,
            ]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.cancelText,
                isDark ? styles.cancelTextDark : styles.cancelTextLight,
              ]}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  containerLight: {
    backgroundColor: "#FFFFFF",
  },
  containerDark: {
    backgroundColor: "#1F2937",
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  handleLight: {
    backgroundColor: "#D1D5DB",
  },
  handleDark: {
    backgroundColor: "#4B5563",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  titleLight: {
    color: "#111827",
  },
  titleDark: {
    color: "#F9FAFB",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  optionLight: {
    backgroundColor: "#F9FAFB",
  },
  optionDark: {
    backgroundColor: "#374151",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  optionTitleLight: {
    color: "#111827",
  },
  optionTitleDark: {
    color: "#F9FAFB",
  },
  optionDescription: {
    fontSize: 13,
  },
  optionDescriptionLight: {
    color: "#6B7280",
  },
  optionDescriptionDark: {
    color: "#9CA3AF",
  },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 12,
  },
  cancelButtonLight: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonDark: {
    backgroundColor: "#374151",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  cancelTextLight: {
    color: "#4B5563",
  },
  cancelTextDark: {
    color: "#D1D5DB",
  },
});

export default DocxShareOptions;
