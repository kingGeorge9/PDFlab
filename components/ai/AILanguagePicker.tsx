// ============================================
// AI Language Picker – modal for selecting target language
// ============================================

import { spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import type { Language } from "@/services/ai/ai.types";
import { SUPPORTED_LANGUAGES } from "@/services/ai/ai.types";
import { Check, X } from "lucide-react-native";
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
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export const AILanguagePicker = React.memo(function AILanguagePicker({
  visible,
  selected,
  onSelect,
  onClose,
}: Props) {
  const { colors: t } = useTheme();

  const renderItem = ({ item }: { item: Language }) => {
    const isActive = item.code === selected;
    return (
      <TouchableOpacity
        style={[
          styles.item,
          {
            backgroundColor: isActive ? "#EEF2FF" : t.card,
            borderColor: isActive ? "#6366F1" : t.border,
          },
        ]}
        onPress={() => {
          onSelect(item.code);
          onClose();
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.itemText, { color: t.text }]}>{item.name}</Text>
        {isActive && <Check size={18} color="#6366F1" />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: t.background }]}>
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            <Text style={[styles.headerTitle, { color: t.text }]}>
              Select Language
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={t.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={SUPPORTED_LANGUAGES}
            renderItem={renderItem}
            keyExtractor={(item) => item.code}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => (
              <View style={{ height: spacing.sm }} />
            )}
          />
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
    maxHeight: "60%",
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  listContent: {
    padding: spacing.md,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  itemText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
