import { colors, spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import { FileInfo } from "@/services/fileService";
import { Ionicons } from "@expo/vector-icons";
import { ExternalLink, Eye, FileType, X } from "lucide-react-native";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface FileTypeOptionsDialogProps {
  visible: boolean;
  file: FileInfo | null;
  onClose: () => void;
  onQuickPreview: (file: FileInfo) => void;
  onOpenInOtherApp: (file: FileInfo) => void;
  onConvertToPdf: (file: FileInfo) => void;
}

export const getFileTypeInfo = (type: string) => {
  switch (type) {
    case "word":
      return {
        title: "Word Document",
        icon: "document-text",
        color: "#2563EB",
        description: "Microsoft Word Document (.docx)",
      };
    case "excel":
      return {
        title: "Excel Spreadsheet",
        icon: "grid",
        color: "#059669",
        description: "Microsoft Excel Spreadsheet (.xlsx)",
      };
    case "ppt":
      return {
        title: "PowerPoint Presentation",
        icon: "easel",
        color: "#EA580C",
        description: "Microsoft PowerPoint Presentation (.pptx)",
      };
    default:
      return {
        title: "Document",
        icon: "document",
        color: colors.primary,
        description: "Document file",
      };
  }
};

export default function FileTypeOptionsDialog({
  visible,
  file,
  onClose,
  onQuickPreview,
  onOpenInOtherApp,
  onConvertToPdf,
}: FileTypeOptionsDialogProps) {
  const { colors: t } = useTheme();
  const backgroundColor = t.card;
  const textColor = t.text;
  const primaryColor = t.primary;

  if (!file) return null;

  const fileTypeInfo = getFileTypeInfo(file.type);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor }]}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X color={t.textSecondary} size={24} strokeWidth={2} />
          </TouchableOpacity>

          {/* File Icon */}
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: `${fileTypeInfo.color}15` },
            ]}
          >
            <Ionicons
              name={fileTypeInfo.icon as any}
              size={48}
              color={fileTypeInfo.color}
            />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: textColor }]}>
            This is a {fileTypeInfo.title}
          </Text>

          {/* File Name */}
          <Text
            style={[styles.fileName, { color: t.textSecondary }]}
            numberOfLines={2}
          >
            {file.name}
          </Text>

          {/* Message */}
          <Text style={[styles.message, { color: t.textSecondary }]}>
            This app specializes in PDFs. Choose how to open this file:
          </Text>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {/* Quick Preview */}
            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: primaryColor }]}
              onPress={() => onQuickPreview(file)}
            >
              <Eye color="white" size={22} strokeWidth={2} />
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionButtonText}>Quick Preview</Text>
                <Text style={styles.optionButtonSubtext}>View Only Mode</Text>
              </View>
            </TouchableOpacity>

            {/* Open in Another App */}
            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: "#10B981" }]}
              onPress={() => onOpenInOtherApp(file)}
            >
              <ExternalLink color="white" size={22} strokeWidth={2} />
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionButtonText}>Open in Another App</Text>
                <Text style={styles.optionButtonSubtext}>
                  Use system default
                </Text>
              </View>
            </TouchableOpacity>

            {/* Convert to PDF */}
            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: "#F59E0B" }]}
              onPress={() => onConvertToPdf(file)}
            >
              <FileType color="white" size={22} strokeWidth={2} />
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionButtonText}>Convert to PDF</Text>
                <Text style={styles.optionButtonSubtext}>
                  Create PDF version
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Cancel Button */}
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: t.border }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelButtonText, { color: textColor }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  closeButton: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  fileName: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  optionsContainer: {
    width: "100%",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 14,
    gap: spacing.md,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  optionButtonSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 2,
  },
  cancelButton: {
    width: "100%",
    paddingVertical: spacing.md,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
