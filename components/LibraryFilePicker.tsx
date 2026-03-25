/**
 * LibraryFilePicker Component
 * A full-screen modal that shows files from the app's library
 * and allows users to select one or more files
 */

import { colors, spacing } from "@/constants/theme";
import { useFileIndex } from "@/hooks/useFileIndex";
import {
  formatFileSize,
  formatRelativeTime,
} from "@/services/document-manager";
import { useTheme } from "@/services/ThemeProvider";
import { Check, ChevronLeft, FolderOpen, Search, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ============================================================================
// TYPES
// ============================================================================

export interface SelectedFile {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  extension: string;
}

export interface LibraryFilePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (files: SelectedFile[]) => void;
  /** File types to filter (e.g., ["pdf"] or ["pdf", "docx"]) */
  allowedTypes?: string[];
  /** Allow multiple file selection */
  multiple?: boolean;
  title?: string;
}

// ============================================================================
// FILE ITEM COMPONENT
// ============================================================================

interface FileItemProps {
  file: {
    id: string;
    name: string;
    uri: string;
    extension: string;
    mimeType?: string;
    size?: number;
    lastOpenedAt: number;
    type: string;
  };
  isSelected: boolean;
  onPress: () => void;
  showCheckbox: boolean;
}

function FileItem({ file, isSelected, onPress, showCheckbox }: FileItemProps) {
  const getFileIcon = () => {
    const ext = file.extension?.toLowerCase();
    switch (ext) {
      case "pdf":
        return "📄";
      case "docx":
      case "doc":
        return "📝";
      case "pptx":
      case "ppt":
        return "📊";
      case "xlsx":
      case "xls":
        return "📈";
      case "epub":
        return "📚";
      case "jpg":
      case "jpeg":
      case "png":
        return "🖼️";
      default:
        return "📄";
    }
  };

  return (
    <TouchableOpacity
      style={[styles.fileItem, isSelected && styles.fileItemSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.fileIconContainer}>
        <Text style={styles.fileIcon}>{getFileIcon()}</Text>
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.fileMeta}>
          {file.size ? formatFileSize(file.size) : "Unknown size"} •{" "}
          {formatRelativeTime(file.lastOpenedAt)}
        </Text>
      </View>
      {showCheckbox && (
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Check size={14} color="white" strokeWidth={3} />}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LibraryFilePicker({
  visible,
  onClose,
  onSelect,
  allowedTypes,
  multiple = false,
  title = "Select from Library",
}: LibraryFilePickerProps) {
  const { files, isLoading, refresh } = useFileIndex();
  const { colors: t } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection when modal opens/closes
  React.useEffect(() => {
    if (visible) {
      setSelectedIds(new Set());
      setSearchQuery("");
      refresh();
    }
  }, [visible, refresh]);

  // Filter files based on allowed types and search query
  const filteredFiles = useMemo(() => {
    let result = files;

    // Filter by allowed types
    if (allowedTypes && allowedTypes.length > 0) {
      result = result.filter((f) => {
        const ext = f.extension?.toLowerCase();
        const type = f.type?.toLowerCase();
        return (
          allowedTypes.some((t) => t.toLowerCase() === ext) ||
          allowedTypes.some((t) => t.toLowerCase() === type)
        );
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(query));
    }

    return result;
  }, [files, allowedTypes, searchQuery]);

  const handleFilePress = useCallback(
    (file: (typeof files)[0]) => {
      if (multiple) {
        // Toggle selection
        setSelectedIds((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(file.id)) {
            newSet.delete(file.id);
          } else {
            newSet.add(file.id);
          }
          return newSet;
        });
      } else {
        // Single selection - immediately return the file
        const selectedFile: SelectedFile = {
          id: file.id,
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType || getMimeType(file.extension),
          size: file.size,
          extension: file.extension,
        };
        onSelect([selectedFile]);
      }
    },
    [multiple, onSelect],
  );

  const handleConfirmSelection = useCallback(() => {
    const selectedFiles = files
      .filter((f) => selectedIds.has(f.id))
      .map(
        (f): SelectedFile => ({
          id: f.id,
          uri: f.uri,
          name: f.name,
          mimeType: f.mimeType || getMimeType(f.extension),
          size: f.size,
          extension: f.extension,
        }),
      );
    onSelect(selectedFiles);
  }, [files, selectedIds, onSelect]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <FolderOpen size={64} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>
        {searchQuery ? "No files found" : "No files in library"}
      </Text>
      <Text style={styles.emptyDescription}>
        {searchQuery
          ? "Try a different search term"
          : allowedTypes
            ? `No ${allowedTypes.join("/")} files found. Import some files first.`
            : "Import some files to get started."}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: t.background }]}
        edges={["top", "bottom"]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: t.card, borderBottomColor: t.border },
          ]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <ChevronLeft size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: t.text }]}>{title}</Text>
          <View style={styles.headerRight}>
            {multiple && selectedIds.size > 0 && (
              <Text style={styles.selectedCount}>
                {selectedIds.size} selected
              </Text>
            )}
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: t.card }]}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: t.backgroundSecondary },
            ]}
          >
            <Search size={18} color={t.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: t.text }]}
              placeholder="Search files..."
              placeholderTextColor={t.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={18} color={t.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* File List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading files...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredFiles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FileItem
                file={item}
                isSelected={selectedIds.has(item.id)}
                onPress={() => handleFilePress(item)}
                showCheckbox={multiple}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              filteredFiles.length === 0 && styles.listContentEmpty,
            ]}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Confirm Button (only for multiple selection) */}
        {multiple && selectedIds.size > 0 && (
          <View
            style={[
              styles.footer,
              { backgroundColor: t.card, borderTopColor: t.border },
            ]}
          >
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirmSelection}
            >
              <Check size={20} color="white" />
              <Text style={styles.confirmButtonText}>
                Select {selectedIds.size} file{selectedIds.size > 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    epub: "application/epub+zip",
    txt: "text/plain",
    html: "text/html",
  };
  return mimeTypes[extension?.toLowerCase()] || "application/octet-stream";
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "white",
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  headerRight: {
    minWidth: 80,
    alignItems: "flex-end",
  },
  selectedCount: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  searchContainer: {
    padding: spacing.md,
    backgroundColor: "white",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  listContent: {
    padding: spacing.md,
  },
  listContentEmpty: {
    flex: 1,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: "white",
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileItemSelected: {
    borderColor: colors.primary,
    backgroundColor: "#EFF6FF",
  },
  fileIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
  },
  fileIcon: {
    fontSize: 22,
  },
  fileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
    marginBottom: 2,
  },
  fileMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  footer: {
    padding: spacing.md,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: 12,
    gap: spacing.xs,
  },
  confirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default LibraryFilePicker;
