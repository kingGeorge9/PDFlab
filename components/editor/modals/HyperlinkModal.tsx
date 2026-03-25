/**
 * HyperlinkModal.tsx
 *
 * Bottom-sheet style modal for inserting a hyperlink.
 */

import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useDocument } from "../DocumentContext";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function HyperlinkModal({ visible, onClose }: Props) {
  const { sendScript } = useDocument();
  const [displayText, setDisplayText] = useState("");
  const [url, setUrl] = useState("https://");

  const handleInsert = useCallback(() => {
    if (!url.trim()) return;
    const text = displayText.trim() || url.trim();
    const safeText = text.replace(/'/g, "\\'");
    const safeUrl = url.trim().replace(/'/g, "\\'");
    sendScript(`insertHyperlink('${safeText}', '${safeUrl}');`);
    setDisplayText("");
    setUrl("https://");
    onClose();
  }, [displayText, url, sendScript, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ justifyContent: "flex-end" }}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Insert Hyperlink</Text>

          <Text style={styles.label}>Display Text</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Click here"
            value={displayText}
            onChangeText={setDisplayText}
            autoCapitalize="none"
          />

          <Text style={styles.label}>URL *</Text>
          <TextInput
            style={styles.input}
            placeholder="https://example.com"
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.insertBtn, !url && styles.insertBtnDisabled]}
              onPress={handleInsert}
            >
              <Text style={styles.insertText}>Insert</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#212121",
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    color: "#757575",
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#212121",
  },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: { color: "#757575", fontSize: 15, fontWeight: "600" },
  insertBtn: {
    flex: 1,
    backgroundColor: "#1976D2",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  insertBtnDisabled: { backgroundColor: "#BDBDBD" },
  insertText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
