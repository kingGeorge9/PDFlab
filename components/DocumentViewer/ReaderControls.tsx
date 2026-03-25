/**
 * ReaderControls — Bottom sheet UI for Mobile View settings:
 * font size, line height, and theme.
 */
import type {
  ReaderSettings,
  ReaderTheme,
} from "@/src/types/document-viewer.types";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Slider from "@react-native-community/slider";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  visible: boolean;
  settings: ReaderSettings;
  onApply: (settings: ReaderSettings) => void;
  onClose: () => void;
}

const THEMES: { label: string; value: ReaderTheme; bg: string; fg: string }[] =
  [
    { label: "Light", value: "light", bg: "#ffffff", fg: "#1a1a1a" },
    { label: "Sepia", value: "sepia", bg: "#f4ecd8", fg: "#5c4a3a" },
    { label: "Dark", value: "dark", bg: "#1a1a1a", fg: "#e0e0e0" },
  ];

export function ReaderControls({ visible, settings, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<ReaderSettings>({ ...settings });

  // Reset draft when opening
  React.useEffect(() => {
    if (visible) setDraft({ ...settings });
  }, [visible]);

  const apply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Reader Settings</Text>

        {/* Font Size */}
        <View style={styles.row}>
          <Text style={styles.label}>Font Size</Text>
          <Text style={styles.value}>{draft.fontSize}px</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={12}
          maximumValue={32}
          step={1}
          value={draft.fontSize}
          onValueChange={(v) => setDraft((p) => ({ ...p, fontSize: v }))}
          minimumTrackTintColor="#2196F3"
          maximumTrackTintColor="#ccc"
          thumbTintColor="#2196F3"
        />

        {/* Line Height */}
        <View style={styles.row}>
          <Text style={styles.label}>Line Spacing</Text>
          <Text style={styles.value}>{draft.lineHeight.toFixed(1)}</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={1.2}
          maximumValue={2.4}
          step={0.1}
          value={draft.lineHeight}
          onValueChange={(v) =>
            setDraft((p) => ({ ...p, lineHeight: parseFloat(v.toFixed(1)) }))
          }
          minimumTrackTintColor="#2196F3"
          maximumTrackTintColor="#ccc"
          thumbTintColor="#2196F3"
        />

        {/* Theme */}
        <Text style={[styles.label, { marginBottom: 8 }]}>Theme</Text>
        <View style={styles.themeRow}>
          {THEMES.map((t) => (
            <Pressable
              key={t.value}
              style={[
                styles.themeBtn,
                {
                  backgroundColor: t.bg,
                  borderColor: t.bg === "#ffffff" ? "#ddd" : t.bg,
                },
                draft.theme === t.value && styles.themeBtnActive,
              ]}
              onPress={() => setDraft((p) => ({ ...p, theme: t.value }))}
            >
              <Text style={[styles.themeLabel, { color: t.fg }]}>
                {t.label}
              </Text>
              {draft.theme === t.value && (
                <MaterialIcons name="check-circle" size={16} color="#2196F3" />
              )}
            </Pressable>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.applyBtn} onPress={apply}>
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: { fontSize: 15, fontWeight: "600", color: "#333" },
  value: { fontSize: 14, color: "#666" },
  slider: { width: "100%", height: 40, marginBottom: 16 },
  themeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  themeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    gap: 6,
  },
  themeBtnActive: {
    borderColor: "#2196F3",
  },
  themeLabel: { fontSize: 14, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: "#666" },
  applyBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#2196F3",
  },
  applyText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
