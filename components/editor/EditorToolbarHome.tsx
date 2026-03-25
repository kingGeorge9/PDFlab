/**
 * EditorToolbarHome.tsx
 *
 * Home tab of the WPS-style editor toolbar.
 * Formatting controls: Bold, Italic, Underline, Strikethrough,
 * Font family, Font size, Highlight, Alignment, Line spacing.
 *
 * Text color feature has been removed — only highlight remains.
 * Font picker shows preview text using natively loaded bundled fonts.
 */

import {
  EDITOR_FONTS,
  EDITOR_FONT_SIZES,
  EDITOR_HIGHLIGHT_COLORS,
  LINE_SPACINGS,
} from "@/src/types/editor.types";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useDocument } from "./DocumentContext";

// ── Alignment icons — each one is visually distinct using line bars ─────────

function AlignIcon({
  type,
  active,
}: {
  type: "left" | "center" | "right" | "justify";
  active: boolean;
}) {
  const color = active ? "#1976D2" : "#555";
  const linesMap: Record<string, { width: string; ml?: string }[]> = {
    left: [
      { width: "100%" },
      { width: "70%" },
      { width: "90%" },
      { width: "55%" },
    ],
    center: [
      { width: "100%", ml: "0%" },
      { width: "60%", ml: "20%" },
      { width: "80%", ml: "10%" },
      { width: "50%", ml: "25%" },
    ],
    right: [
      { width: "100%", ml: "0%" },
      { width: "70%", ml: "30%" },
      { width: "85%", ml: "15%" },
      { width: "55%", ml: "45%" },
    ],
    justify: [
      { width: "100%" },
      { width: "100%" },
      { width: "100%" },
      { width: "60%" },
    ],
  };

  const lines = linesMap[type] || [];

  return (
    <View style={{ width: 22, height: 18, justifyContent: "space-between" }}>
      {lines.map((line, i) => (
        <View
          key={i}
          style={{
            height: 2.5,
            width: line.width as any,
            marginLeft: (line.ml || "0%") as any,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      ))}
    </View>
  );
}

export default function EditorToolbarHome() {
  const { state, dispatch, sendScript } = useDocument();
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showSpacingPicker, setShowSpacingPicker] = useState(false);

  // ── Format toggles ────────────────────────────────────────────────────

  const toggleFormat = useCallback(
    (type: "bold" | "italic" | "underline" | "strikethrough") => {
      const commands: Record<string, string> = {
        bold: "applyBold",
        italic: "applyItalic",
        underline: "applyUnderline",
        strikethrough: "applyStrikethrough",
      };
      sendScript(`${commands[type]}();`);
      dispatch({
        type: "SET_FORMAT",
        key: type,
        value: !state[type],
      });
    },
    [state, dispatch, sendScript],
  );

  const applyFont = useCallback(
    (font: string) => {
      sendScript(`applyFontFamily('${font}');`);
      dispatch({ type: "SET_FORMAT", key: "fontFamily", value: font });
      setShowFontPicker(false);
    },
    [dispatch, sendScript],
  );

  const applySize = useCallback(
    (size: number) => {
      sendScript(`applyFontSize(${size});`);
      dispatch({ type: "SET_FORMAT", key: "fontSize", value: size });
      setShowSizePicker(false);
    },
    [dispatch, sendScript],
  );

  const applyHighlight = useCallback(
    (color: string | null) => {
      sendScript(`applyHighlight('${color || "none"}');`);
      dispatch({ type: "SET_FORMAT", key: "highlightColor", value: color });
      setShowHighlightPicker(false);
    },
    [dispatch, sendScript],
  );

  const removeHighlight = useCallback(() => {
    sendScript(`applyHighlight('none');`);
    dispatch({ type: "SET_FORMAT", key: "highlightColor", value: null });
    setShowHighlightPicker(false);
  }, [dispatch, sendScript]);

  const applyAlign = useCallback(
    (align: string) => {
      sendScript(`applyAlign('${align}');`);
      dispatch({
        type: "SET_FORMAT",
        key: "textAlign",
        value: align,
      });
    },
    [dispatch, sendScript],
  );

  const applySpacing = useCallback(
    (spacing: number) => {
      sendScript(`applyLineSpacing(${spacing});`);
      dispatch({ type: "SET_FORMAT", key: "lineSpacing", value: spacing });
      setShowSpacingPicker(false);
    },
    [dispatch, sendScript],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* ── ROW 1: Font + Size ────────────────────────────────────────── */}
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.fontPicker}
          onPress={() => setShowFontPicker(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.fontName} numberOfLines={1}>
            {state.fontFamily}
          </Text>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sizePicker}
          onPress={() => setShowSizePicker(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.sizeLabel}>Size</Text>
          <Text style={styles.sizeValue}>{state.fontSize}</Text>
        </TouchableOpacity>
      </View>

      {/* ── ROW 2: Bold / Italic / Underline / Strikethrough ─────────── */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Style </Text>
        {(
          [
            {
              key: "bold",
              label: "B",
              extra: { fontWeight: "900" as const, fontFamily: "serif" },
            },
            {
              key: "italic",
              label: "I",
              extra: { fontStyle: "italic" as const, fontFamily: "serif" },
            },
            {
              key: "underline",
              label: "U",
              extra: { textDecorationLine: "underline" as const },
            },
            {
              key: "strikethrough",
              label: "S",
              extra: { textDecorationLine: "line-through" as const },
            },
          ] as const
        ).map((btn) => (
          <TouchableOpacity
            key={btn.key}
            style={[styles.fmtBtn, state[btn.key] && styles.fmtBtnOn]}
            onPress={() => toggleFormat(btn.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.fmtBtnTxt,
                btn.extra,
                state[btn.key] && styles.fmtBtnTxtOn,
              ]}
            >
              {btn.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── ROW 3: Alignment — 4 visually distinct icons ─────────────── */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Align </Text>
        {(["left", "center", "right", "justify"] as const).map((align) => (
          <TouchableOpacity
            key={align}
            style={[
              styles.alignBtn,
              state.textAlign === align && styles.alignBtnOn,
            ]}
            onPress={() => applyAlign(align)}
            activeOpacity={0.7}
          >
            <AlignIcon type={align} active={state.textAlign === align} />
          </TouchableOpacity>
        ))}
      </View>

      {/* ── ROW 4: Line Spacing ───────────────────────────────────────── */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Spacing</Text>
        <TouchableOpacity
          style={styles.spacingBtn}
          onPress={() => setShowSpacingPicker(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.spacingValue}>{state.lineSpacing}×</Text>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* ── ROW 5: Highlight ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Highlight</Text>
          <TouchableOpacity onPress={removeHighlight}>
            <Text style={styles.moreBtn}>Remove ✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.colorScroll}
        >
          {EDITOR_HIGHLIGHT_COLORS.map(({ color, label }) => (
            <TouchableOpacity
              key={color}
              onPress={() => applyHighlight(color)}
              style={[
                styles.colorDot,
                { backgroundColor: color },
                state.highlightColor === color && styles.colorDotSelected,
              ]}
              activeOpacity={0.8}
            >
              <Text style={styles.hlLabel}>{label[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ═══════════════════════ MODALS ═══════════════════════════════════ */}

      {/* Font Picker */}
      <Modal
        visible={showFontPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFontPicker(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowFontPicker(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Font Family</Text>
          <FlatList
            data={EDITOR_FONTS}
            keyExtractor={(f) => f.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  item.value === state.fontFamily && styles.pickerItemOn,
                ]}
                onPress={() => applyFont(item.value)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerItemLeft}>
                  <Text
                    style={[
                      styles.pickerPreview,
                      { fontFamily: item.nativeName },
                    ]}
                  >
                    Abc — The quick brown fox
                  </Text>
                  <Text style={styles.pickerItemLabel}>{item.label}</Text>
                </View>
                {item.value === state.fontFamily && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Size Picker */}
      <Modal
        visible={showSizePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSizePicker(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowSizePicker(false)}
        />
        <View style={[styles.sheet, { height: 360 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Font Size</Text>
          <FlatList
            data={EDITOR_FONT_SIZES}
            keyExtractor={(s) => String(s)}
            numColumns={4}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.sizeItem,
                  item === state.fontSize && styles.pickerItemOn,
                ]}
                onPress={() => applySize(item)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sizeItemTxt,
                    item === state.fontSize && {
                      color: "#1976D2",
                      fontWeight: "700",
                    },
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Spacing Picker */}
      <Modal
        visible={showSpacingPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSpacingPicker(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowSpacingPicker(false)}
        />
        <View style={[styles.sheet, { height: 380 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Line Spacing</Text>
          {LINE_SPACINGS.map(({ label, value }) => (
            <TouchableOpacity
              key={label}
              style={[
                styles.pickerItem,
                state.lineSpacing === value && styles.pickerItemOn,
              ]}
              onPress={() => applySpacing(value)}
              activeOpacity={0.7}
            >
              {/* Visual preview of line spacing */}
              <View style={{ gap: value * 3 }}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.spacingLine,
                      i === 2 && { width: "60%" as any },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.pickerItemLabel, { marginLeft: 16 }]}>
                {label}
              </Text>
              {state.lineSpacing === value && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    color: "#9E9E9E",
    fontWeight: "600",
    width: 54,
  },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#424242" },
  moreBtn: { fontSize: 12, color: "#1976D2", fontWeight: "600" },

  // Font + Size row
  fontPicker: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  fontName: { fontSize: 14, color: "#212121", fontWeight: "500", flex: 1 },
  chevron: { color: "#9E9E9E", fontSize: 13 },
  sizePicker: {
    width: 80,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  sizeLabel: { fontSize: 10, color: "#9E9E9E", fontWeight: "600" },
  sizeValue: { fontSize: 18, color: "#1976D2", fontWeight: "800" },

  // Format buttons
  fmtBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fmtBtnOn: { backgroundColor: "#E3F2FD", borderColor: "#1976D2" },
  fmtBtnTxt: { fontSize: 17, color: "#424242" },
  fmtBtnTxtOn: { color: "#1976D2" },

  // Alignment
  alignBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  alignBtnOn: { backgroundColor: "#E3F2FD", borderColor: "#1976D2" },

  // Spacing
  spacingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  spacingValue: { fontSize: 15, color: "#1976D2", fontWeight: "700" },
  spacingLine: {
    height: 2,
    width: "100%" as any,
    backgroundColor: "#9E9E9E",
    borderRadius: 1,
  },

  // Highlight colors
  colorScroll: { flexDirection: "row" },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotSelected: { borderWidth: 3, borderColor: "#1976D2" },
  hlLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowRadius: 2,
  },

  // Modals
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 36,
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#212121",
    marginBottom: 14,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerItemOn: { backgroundColor: "#E3F2FD" },
  pickerItemLeft: { flex: 1 },
  pickerPreview: { fontSize: 16, color: "#212121", marginBottom: 2 },
  pickerItemLabel: {
    fontSize: 11,
    color: "#9E9E9E",
    fontWeight: "600",
  },
  checkmark: { color: "#1976D2", fontSize: 18, fontWeight: "700" },
  sizeItem: {
    flex: 1,
    margin: 4,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    alignItems: "center",
  },
  sizeItemTxt: { fontSize: 15, color: "#424242", fontWeight: "600" },
});
