/**
 * CommentModal.tsx
 *
 * Bottom-sheet modal for adding a comment to selected text.
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

export default function CommentModal({ visible, onClose }: Props) {
  const { sendScript, dispatch } = useDocument();
  const [commentText, setCommentText] = useState("");

  const handleInsert = useCallback(() => {
    if (!commentText.trim()) return;
    const id = Date.now().toString();
    const safe = commentText.replace(/'/g, "\\'");
    sendScript(`insertComment('${safe}', '${id}');`);
    dispatch({
      type: "ADD_COMMENT",
      comment: {
        id,
        text: commentText,
        date: new Date().toLocaleDateString(),
      },
    });
    setCommentText("");
    onClose();
  }, [commentText, sendScript, dispatch, onClose]);

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
          <Text style={styles.title}>Add Comment</Text>
          <Text style={styles.hint}>
            Select text in the document first, then add your comment.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Write your comment here..."
            value={commentText}
            onChangeText={setCommentText}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoFocus
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.insertBtn,
                !commentText.trim() && styles.insertBtnDisabled,
              ]}
              onPress={handleInsert}
              disabled={!commentText.trim()}
            >
              <Text style={styles.insertText}>Add Comment</Text>
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
    marginBottom: 6,
  },
  hint: { fontSize: 13, color: "#9E9E9E", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#212121",
    minHeight: 100,
  },
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
    backgroundColor: "#FBC02D",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  insertBtnDisabled: { backgroundColor: "#E0E0E0" },
  insertText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
