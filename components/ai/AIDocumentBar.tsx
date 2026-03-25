// ============================================
// AI Document Attachment Bar
// Shows the attached document, allows removal / swap.
// ============================================

import { spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import type { AIDocumentRef } from "@/services/ai/ai.types";
import { FileText, Paperclip, X } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  document: AIDocumentRef | undefined;
  onAttach: () => void;
  onRemove: () => void;
  extractionStatus?: "none" | "extracted" | "partial";
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AIDocumentBar = React.memo(function AIDocumentBar({
  document,
  onAttach,
  onRemove,
  extractionStatus,
}: Props) {
  const { colors: t, mode } = useTheme();

  if (!document) {
    return (
      <TouchableOpacity
        onPress={onAttach}
        style={[
          styles.attachBtn,
          {
            borderColor: t.border,
            backgroundColor: mode === "dark" ? "#1E293B" : "#F8FAFC",
          },
        ]}
        activeOpacity={0.7}
      >
        <Paperclip size={18} color={t.textSecondary} />
        <Text style={[styles.attachText, { color: t.textSecondary }]}>
          Attach a document (PDF, DOCX, EPUB, TXT)
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.docBar,
        {
          backgroundColor: mode === "dark" ? "#1E293B" : "#EEF2FF",
          borderColor: mode === "dark" ? "#334155" : "#C7D2FE",
        },
      ]}
    >
      <FileText size={18} color="#6366F1" />
      <View style={styles.docInfo}>
        <Text style={[styles.docName, { color: t.text }]} numberOfLines={1}>
          {document.name}
        </Text>
        <Text style={[styles.docMeta, { color: t.textTertiary }]}>
          {formatSize(document.size)}
          {extractionStatus === "extracted" && " • Text extracted"}
          {extractionStatus === "partial" && " • Partial extraction"}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <X size={18} color={t.textTertiary} />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  attachText: {
    fontSize: 13,
    fontWeight: "500",
  },
  docBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 13,
    fontWeight: "600",
  },
  docMeta: {
    fontSize: 11,
    marginTop: 1,
  },
});
