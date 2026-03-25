// ============================================
// AI Session History – modal list of past sessions
// ============================================

import { spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import { deriveSessionTitle } from "@/services/ai";
import type { AISession } from "@/services/ai/ai.types";
import { Clock, MessageSquare, Trash2, X } from "lucide-react-native";
import React from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  visible: boolean;
  sessions: AISession[];
  onSelect: (session: AISession) => void;
  onDelete: (sessionId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export const AISessionHistory = React.memo(function AISessionHistory({
  visible,
  sessions,
  onSelect,
  onDelete,
  onClearAll,
  onClose,
}: Props) {
  const { colors: t, mode } = useTheme();

  const renderItem = ({ item }: { item: AISession }) => (
    <TouchableOpacity
      style={[
        styles.sessionItem,
        { backgroundColor: t.card, borderColor: t.border },
      ]}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.sessionIcon}>
        <MessageSquare size={18} color="#9333EA" />
      </View>
      <View style={styles.sessionInfo}>
        <Text
          style={[styles.sessionTitle, { color: t.text }]}
          numberOfLines={1}
        >
          {deriveSessionTitle(item)}
        </Text>
        <Text style={[styles.sessionMeta, { color: t.textTertiary }]}>
          {item.messages.length} messages •{" "}
          {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onDelete(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.deleteBtn}
      >
        <Trash2 size={16} color={t.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: t.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            <View style={styles.headerLeft}>
              <Clock size={20} color={t.text} />
              <Text style={[styles.headerTitle, { color: t.text }]}>
                Session History
              </Text>
            </View>
            <View style={styles.headerRight}>
              {sessions.length > 0 && (
                <TouchableOpacity onPress={onClearAll} style={styles.clearBtn}>
                  <Text style={[styles.clearText, { color: t.error }]}>
                    Clear All
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <X size={22} color={t.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* List */}
          {sessions.length === 0 ? (
            <View style={styles.empty}>
              <MessageSquare
                size={40}
                color={t.textTertiary}
                strokeWidth={1.5}
              />
              <Text style={[styles.emptyText, { color: t.textTertiary }]}>
                No sessions yet
              </Text>
              <Text style={[styles.emptySubtext, { color: t.textTertiary }]}>
                Start a conversation to see it here
              </Text>
            </View>
          ) : (
            <FlatList
              data={sessions}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => (
                <View style={{ height: spacing.sm }} />
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "75%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  clearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    padding: spacing.md,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  sessionMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 60,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 13,
  },
});
