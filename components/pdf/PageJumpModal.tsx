/**
 * Page Jump Modal
 * Allows user to enter a page number and jump directly to it.
 * Styled to match the app's design system and theme.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  Palette,
  Spacing,
  Typography,
  type LightTheme,
} from "@/services/document-manager";

interface PageJumpModalProps {
  visible: boolean;
  currentPage: number;
  totalPages: number;
  theme: typeof LightTheme;
  onClose: () => void;
  onJumpToPage: (page: number) => void;
}

export function PageJumpModal({
  visible,
  currentPage,
  totalPages,
  theme,
  onClose,
  onJumpToPage,
}: PageJumpModalProps) {
  const [pageInput, setPageInput] = useState(currentPage.toString());

  const handleJump = () => {
    const pageNumber = parseInt(pageInput, 10);
    if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
      return; // silently clamp — no crash
    }
    const validPage = Math.max(1, Math.min(pageNumber, totalPages));
    onJumpToPage(validPage);
    onClose();
  };

  const handleModalShow = () => {
    setPageInput(currentPage.toString());
  };

  const quickJump = (page: number) => {
    onJumpToPage(page);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={handleModalShow}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={[styles.modal, { backgroundColor: theme.surface.primary }]}
            >
              {/* Header */}
              <View
                style={[
                  styles.header,
                  { borderBottomColor: theme.border.light },
                ]}
              >
                <Text style={[styles.title, { color: theme.text.primary }]}>
                  Jump to Page
                </Text>
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <MaterialIcons
                    name="close"
                    size={22}
                    color={theme.text.secondary}
                  />
                </Pressable>
              </View>

              {/* Content */}
              <View style={styles.content}>
                <Text style={[styles.label, { color: theme.text.secondary }]}>
                  Enter page number (1–{totalPages})
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: Palette.primary[500],
                      color: theme.text.primary,
                      backgroundColor: theme.background.primary,
                    },
                  ]}
                  value={pageInput}
                  onChangeText={setPageInput}
                  keyboardType="number-pad"
                  placeholder={`Current: ${currentPage}`}
                  placeholderTextColor={theme.text.secondary}
                  selectTextOnFocus
                  autoFocus
                  maxLength={totalPages.toString().length + 1}
                  onSubmitEditing={handleJump}
                  returnKeyType="go"
                />

                {/* Quick Jump Buttons */}
                <View style={styles.quickJump}>
                  <Pressable
                    style={[
                      styles.quickButton,
                      { backgroundColor: theme.background.primary },
                    ]}
                    onPress={() => quickJump(1)}
                  >
                    <MaterialIcons
                      name="first-page"
                      size={18}
                      color={Palette.primary[500]}
                    />
                    <Text
                      style={[
                        styles.quickButtonText,
                        { color: Palette.primary[500] },
                      ]}
                    >
                      First
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.quickButton,
                      { backgroundColor: theme.background.primary },
                    ]}
                    onPress={() => quickJump(Math.ceil(totalPages / 2))}
                  >
                    <MaterialIcons
                      name="unfold-more"
                      size={18}
                      color={Palette.primary[500]}
                    />
                    <Text
                      style={[
                        styles.quickButtonText,
                        { color: Palette.primary[500] },
                      ]}
                    >
                      Middle
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.quickButton,
                      { backgroundColor: theme.background.primary },
                    ]}
                    onPress={() => quickJump(totalPages)}
                  >
                    <MaterialIcons
                      name="last-page"
                      size={18}
                      color={Palette.primary[500]}
                    />
                    <Text
                      style={[
                        styles.quickButtonText,
                        { color: Palette.primary[500] },
                      ]}
                    >
                      Last
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Actions */}
              <View
                style={[styles.actions, { borderTopColor: theme.border.light }]}
              >
                <Pressable
                  style={[
                    styles.actionButton,
                    {
                      borderRightWidth: 1,
                      borderRightColor: theme.border.light,
                    },
                  ]}
                  onPress={onClose}
                >
                  <Text
                    style={[styles.cancelText, { color: theme.text.secondary }]}
                  >
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: Palette.primary[500] },
                  ]}
                  onPress={handleJump}
                >
                  <Text style={styles.jumpText}>Jump</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  keyboardView: {
    width: "100%",
    alignItems: "center",
  },
  modal: {
    width: 300,
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: Spacing.lg,
  },
  label: {
    fontSize: Typography.size.sm,
    marginBottom: Spacing.md,
  },
  input: {
    borderWidth: 2,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: 24,
    fontWeight: Typography.weight.bold,
    textAlign: "center",
  },
  quickJump: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  quickButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    gap: 4,
  },
  quickButtonText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  jumpText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Palette.white,
  },
});
