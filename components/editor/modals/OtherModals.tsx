/**
 * OtherModals.tsx
 *
 * Date & Time picker, Shapes picker, and Bookmark modal
 * for the document editor Insert tab.
 */

import type { ShapeType } from "@/src/types/editor.types";
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

// ── Date & Time Modal ──────────────────────────────────────────────────────

interface DateTimeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DateTimeModal({ visible, onClose }: DateTimeModalProps) {
  const { sendScript } = useDocument();
  const now = new Date();

  const formats = [
    { label: "Short Date", value: now.toLocaleDateString() },
    {
      label: "Long Date",
      value: now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    },
    {
      label: "Short Time",
      value: now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    { label: "Long Time", value: now.toLocaleTimeString() },
    { label: "Date & Time", value: now.toLocaleString() },
    { label: "ISO", value: now.toISOString().split("T")[0] },
  ];

  const handleInsert = useCallback(
    (formatted: string) => {
      const safe = formatted.replace(/'/g, "\\'");
      sendScript(`insertDateTime('${safe}');`);
      onClose();
    },
    [sendScript, onClose],
  );

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
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Date & Time</Text>
        {formats.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={styles.formatItem}
            onPress={() => handleInsert(f.value)}
          >
            <Text style={styles.formatLabel}>{f.label}</Text>
            <Text style={styles.formatValue}>{f.value}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

// ── Shapes Modal ───────────────────────────────────────────────────────────

interface ShapesModalProps {
  visible: boolean;
  onClose: () => void;
}

const SHAPES: { key: ShapeType; icon: string; label: string }[] = [
  { key: "rectangle", icon: "▬", label: "Rectangle" },
  { key: "circle", icon: "⬭", label: "Circle" },
  { key: "line", icon: "─", label: "Line" },
  { key: "arrow", icon: "→", label: "Arrow" },
];

export function ShapesModal({ visible, onClose }: ShapesModalProps) {
  const { sendScript } = useDocument();

  const handleShape = useCallback(
    (type: ShapeType) => {
      sendScript(`insertShape('${type}');`);
      onClose();
    },
    [sendScript, onClose],
  );

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
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Insert Shape</Text>
        <View style={styles.shapesGrid}>
          {SHAPES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={styles.shapeItem}
              onPress={() => handleShape(s.key)}
            >
              <Text style={styles.shapeIcon}>{s.icon}</Text>
              <Text style={styles.shapeLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ── Bookmark Modal ─────────────────────────────────────────────────────────

interface BookmarkModalProps {
  visible: boolean;
  onClose: () => void;
}

export function BookmarkModal({ visible, onClose }: BookmarkModalProps) {
  const { sendScript, dispatch } = useDocument();
  const [name, setName] = useState("");

  const handleInsert = useCallback(() => {
    if (!name.trim()) return;
    const id = Date.now().toString();
    const safe = name.trim().replace(/'/g, "\\'").replace(/\s+/g, "_");
    sendScript(`insertBookmark('${safe}', '${id}');`);
    dispatch({
      type: "ADD_BOOKMARK",
      bookmark: { id, name: name.trim() },
    });
    setName("");
    onClose();
  }, [name, sendScript, dispatch, onClose]);

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
          <Text style={styles.title}>Insert Bookmark</Text>
          <Text style={styles.hint}>
            Bookmarks let you quickly navigate to this location later.
          </Text>
          <Text style={styles.label}>Bookmark Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Introduction"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.insertBtn,
                !name.trim() && styles.insertBtnDisabled,
              ]}
              onPress={handleInsert}
              disabled={!name.trim()}
            >
              <Text style={styles.insertText}>Insert</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

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
    marginBottom: 16,
  },
  hint: { fontSize: 13, color: "#9E9E9E", marginBottom: 12 },
  label: {
    fontSize: 13,
    color: "#757575",
    fontWeight: "600",
    marginBottom: 6,
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
  formatItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E0E0",
  },
  formatLabel: {
    fontSize: 12,
    color: "#9E9E9E",
    fontWeight: "600",
    marginBottom: 2,
  },
  formatValue: { fontSize: 15, color: "#212121" },
  shapesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  shapeItem: {
    width: "45%" as unknown as number,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  shapeIcon: { fontSize: 28, color: "#424242" },
  shapeLabel: { fontSize: 13, color: "#616161", fontWeight: "500" },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 20 },
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
