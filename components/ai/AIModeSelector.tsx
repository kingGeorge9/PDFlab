// ============================================
// AI Mode Selector – horizontal pill tabs for AI actions
// ============================================

import { spacing } from "@/constants/theme";
import type { AIAction, AIFeatureMeta } from "@/services/ai/ai.types";
import { AI_FEATURES } from "@/services/ai/ai.types";
import { useTheme } from "@/services/ThemeProvider";
import {
  BookOpen,
  Brain,
  FileSearch,
  FileSignature,
  FileText,
  Languages,
  ListChecks,
  MessageSquare,
  Wand2,
} from "lucide-react-native";
import React, { useCallback, useRef } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  "message-square": MessageSquare,
  "book-open": BookOpen,
  languages: Languages,
  "file-search": FileSearch,
  brain: Brain,
  "list-checks": ListChecks,
  "file-signature": FileSignature,
  "file-text": FileText,
  "wand-2": Wand2,
};

interface Props {
  selected: AIAction;
  onSelect: (action: AIAction) => void;
}

export const AIModeSelector = React.memo(function AIModeSelector({
  selected,
  onSelect,
}: Props) {
  const { colors: t } = useTheme();
  const listRef = useRef<FlatList>(null);

  const renderItem = useCallback(
    ({ item, index }: { item: AIFeatureMeta; index: number }) => {
      const isActive = item.id === selected;
      const Icon = ICON_MAP[item.icon] || MessageSquare;

      return (
        <TouchableOpacity
          onPress={() => {
            onSelect(item.id);
            listRef.current?.scrollToIndex({
              index,
              animated: true,
              viewPosition: 0.4,
            });
          }}
          activeOpacity={0.7}
          style={[
            styles.pill,
            {
              backgroundColor: isActive ? item.color : t.card,
              borderColor: isActive ? item.color : t.border,
            },
          ]}
        >
          <Icon
            color={isActive ? "#FFFFFF" : item.color}
            size={16}
            strokeWidth={2.5}
          />
          <Text
            style={[styles.pillText, { color: isActive ? "#FFFFFF" : t.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
        </TouchableOpacity>
      );
    },
    [selected, onSelect, t],
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={AI_FEATURES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 140,
          offset: 140 * index,
          index,
        })}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
