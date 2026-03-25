/**
 * FileSourcePicker Component
 * A modal bottom sheet that allows users to choose between
 * picking a file from the app library or from device storage
 */

import { colors, spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import { FolderOpen, Library, X } from "lucide-react-native";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type FileSourceOption = "library" | "device" | null;

export interface FileSourcePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: FileSourceOption) => void;
  title?: string;
  description?: string;
  /** Whether to allow multiple file selection (affects UI text) */
  allowMultiple?: boolean;
  /** Whether to show the "Pick from App" library option (default true) */
  showLibraryOption?: boolean;
}

export function FileSourcePicker({
  visible,
  onClose,
  onSelect,
  title = "Select File Source",
  description = "Choose where to pick your file from",
  allowMultiple = false,
  showLibraryOption = true,
}: FileSourcePickerProps) {
  const handleSelect = (source: FileSourceOption) => {
    onSelect(source);
  };

  const { colors: t, mode } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.container, { backgroundColor: t.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: t.text }]}>{title}</Text>
              <Text style={[styles.description, { color: t.textSecondary }]}>
                {description}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <X size={20} color={t.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {/* Pick from App Library — hidden when no matching files exist */}
            {showLibraryOption && (
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: t.backgroundSecondary,
                    borderColor: t.border,
                  },
                ]}
                onPress={() => handleSelect("library")}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionIcon,
                    {
                      backgroundColor: mode === "dark" ? "#1E3A5F" : "#EFF6FF",
                    },
                  ]}
                >
                  <Library size={24} color={t.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionTitle, { color: t.text }]}>
                    Pick from App
                  </Text>
                  <Text
                    style={[styles.optionDescription, { color: t.textSecondary }]}
                  >
                    Choose from {allowMultiple ? "files" : "a file"} already in
                    your library
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Pick from Device */}
            <TouchableOpacity
              style={[
                styles.optionButton,
                {
                  backgroundColor: t.backgroundSecondary,
                  borderColor: t.border,
                },
              ]}
              onPress={() => handleSelect("device")}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.optionIcon,
                  {
                    backgroundColor: mode === "dark" ? "#064E3B" : "#F0FDF4",
                  },
                ]}
              >
                <FolderOpen size={24} color="#10B981" />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, { color: t.text }]}>
                  Pick from Device
                </Text>
                <Text
                  style={[styles.optionDescription, { color: t.textSecondary }]}
                >
                  Browse files from storage or other apps
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  closeButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  optionsContainer: {
    gap: spacing.md,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.backgroundLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  optionContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});

export default FileSourcePicker;
