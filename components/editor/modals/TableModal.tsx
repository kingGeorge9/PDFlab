/**
 * TableModal.tsx
 *
 * Modal for inserting a table into the document editor.
 * Presents a visual grid selector (up to 8×8) for choosing rows & columns,
 * plus a numeric fallback for larger tables.
 */

import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useDocument } from "../DocumentContext";

// ── Constants ──────────────────────────────────────────────────────────────
const MAX_GRID = 8;
const CELL = 28;
const GAP = 3;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function TableModal({ visible, onClose }: Props) {
  const { sendScript, dispatch } = useDocument();

  // Grid selection state — user taps cells to SET the size, does NOT insert yet
  const [selRow, setSelRow] = useState(0);
  const [selCol, setSelCol] = useState(0);

  // Numeric input fallback
  const [showNumeric, setShowNumeric] = useState(false);
  const [numRows, setNumRows] = useState("3");
  const [numCols, setNumCols] = useState("3");

  // ── Actually insert the table into the editor ─────────────────────────
  const doInsert = useCallback(
    (rows: number, cols: number) => {
      if (rows < 1 || cols < 1 || rows > 50 || cols > 20) return;
      sendScript(`insertTable(${rows}, ${cols});`);
      dispatch({ type: "SET_MODAL", modal: null });
      // Reset state
      setSelRow(0);
      setSelCol(0);
      setShowNumeric(false);
      setNumRows("3");
      setNumCols("3");
      onClose();
    },
    [sendScript, dispatch, onClose],
  );

  // Grid cell tap — just selects, does NOT insert
  const handleGridSelect = useCallback((row: number, col: number) => {
    setSelRow(row + 1);
    setSelCol(col + 1);
  }, []);

  // "Done" button on grid view
  const handleGridDone = useCallback(() => {
    if (selRow > 0 && selCol > 0) {
      doInsert(selRow, selCol);
    }
  }, [selRow, selCol, doInsert]);

  // "Insert" button on numeric view
  const handleNumericInsert = useCallback(() => {
    const r = parseInt(numRows, 10);
    const c = parseInt(numCols, 10);
    if (isNaN(r) || isNaN(c) || r < 1 || c < 1) return;
    doInsert(Math.min(r, 50), Math.min(c, 20));
  }, [numRows, numCols, doInsert]);

  const handleClose = useCallback(() => {
    setSelRow(0);
    setSelCol(0);
    setShowNumeric(false);
    setNumRows("3");
    setNumCols("3");
    onClose();
  }, [onClose]);

  const hasSelection = selRow > 0 && selCol > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ justifyContent: "center", alignItems: "center", flex: 1 }}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Insert Table</Text>

            {!showNumeric ? (
              <>
                {/* Grid label */}
                <Text style={styles.gridLabel}>
                  {hasSelection
                    ? `${selRow} × ${selCol}`
                    : "Tap to select size"}
                </Text>

                {/* Visual grid */}
                <View style={styles.grid}>
                  {Array.from({ length: MAX_GRID }).map((_, r) => (
                    <View key={r} style={styles.gridRow}>
                      {Array.from({ length: MAX_GRID }).map((_, c) => {
                        const active = r < selRow && c < selCol;
                        return (
                          <TouchableOpacity
                            key={c}
                            style={[
                              styles.gridCell,
                              active && styles.gridCellActive,
                            ]}
                            onPress={() => handleGridSelect(r, c)}
                            activeOpacity={0.7}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>

                {/* Action row: Cancel / Done */}
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={handleClose}
                  >
                    <Text style={styles.btnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.btnPrimary,
                      !hasSelection && styles.btnDisabled,
                    ]}
                    onPress={handleGridDone}
                    disabled={!hasSelection}
                  >
                    <Text style={styles.btnPrimaryText}>Done</Text>
                  </TouchableOpacity>
                </View>

                {/* Custom size link */}
                <TouchableOpacity
                  style={styles.customLink}
                  onPress={() => setShowNumeric(true)}
                >
                  <Text style={styles.customLinkText}>Custom size…</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Numeric inputs */}
                <View style={styles.numericRow}>
                  <View style={styles.numericField}>
                    <Text style={styles.numericLabel}>Rows</Text>
                    <TextInput
                      style={styles.numericInput}
                      value={numRows}
                      onChangeText={setNumRows}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                  </View>
                  <Text style={styles.numericX}>×</Text>
                  <View style={styles.numericField}>
                    <Text style={styles.numericLabel}>Columns</Text>
                    <TextInput
                      style={styles.numericInput}
                      value={numCols}
                      onChangeText={setNumCols}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                  </View>
                </View>
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => setShowNumeric(false)}
                  >
                    <Text style={styles.btnSecondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={handleNumericInsert}
                  >
                    <Text style={styles.btnPrimaryText}>Insert</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: 300,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#212121",
    marginBottom: 12,
  },
  gridLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#616161",
    marginBottom: 10,
    minHeight: 20,
  },
  grid: {
    gap: GAP,
  },
  gridRow: {
    flexDirection: "row",
    gap: GAP,
  },
  gridCell: {
    width: CELL,
    height: CELL,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
  },
  gridCellActive: {
    backgroundColor: "#1976D2",
    borderColor: "#1565C0",
  },
  customLink: {
    marginTop: 14,
    paddingVertical: 6,
  },
  customLinkText: {
    fontSize: 14,
    color: "#1976D2",
    fontWeight: "500",
  },
  numericRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  numericField: {
    alignItems: "center",
    gap: 4,
  },
  numericLabel: {
    fontSize: 13,
    color: "#757575",
    fontWeight: "500",
  },
  numericInput: {
    width: 60,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#212121",
  },
  numericX: {
    fontSize: 20,
    color: "#9E9E9E",
    fontWeight: "600",
    marginTop: 18,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    alignItems: "center",
  },
  btnSecondaryText: {
    fontSize: 15,
    color: "#757575",
    fontWeight: "600",
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#1976D2",
    alignItems: "center",
  },
  btnDisabled: {
    backgroundColor: "#BDBDBD",
  },
  btnPrimaryText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
});
