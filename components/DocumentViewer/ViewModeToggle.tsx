/**
 * ViewModeToggle — Single toggle button + auto-dismiss toast.
 * Tapping the button switches between Original ↔ Mobile View and shows a
 * 3-second overlay toast confirming the new mode.
 *
 * Used in both PDF and DOCX viewer headers.
 */
import type { ViewMode } from "@/src/types/document-viewer.types";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  /** Current view mode */
  mode: ViewMode;
  /** Callback when the mode changes */
  onModeChange: (mode: ViewMode) => void;
  /** Disable the toggle (e.g. while loading) */
  disabled?: boolean;
}

export function ViewModeToggle({
  mode,
  onModeChange,
  disabled = false,
}: Props) {
  const [toastText, setToastText] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showToast = useCallback(
    (text: string) => {
      // Cancel any previous timer
      if (timerRef.current) clearTimeout(timerRef.current);

      setToastText(text);
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Auto-dismiss after 3 seconds
      timerRef.current = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setToastText(null));
      }, 3000);
    },
    [fadeAnim],
  );

  const handlePress = useCallback(() => {
    const newMode: ViewMode = mode === "original" ? "mobile" : "original";
    onModeChange(newMode);
    showToast(
      newMode === "mobile" ? "Mobile View — Plain text reflow" : "Normal View",
    );
  }, [mode, onModeChange, showToast]);

  const icon = mode === "original" ? "article" : "description";

  return (
    <>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={[styles.button, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={
          mode === "original"
            ? "Switch to Mobile View"
            : "Switch to Normal View"
        }
        hitSlop={6}
      >
        <MaterialIcons
          name={icon}
          size={22}
          color={mode === "mobile" ? "#2196F3" : "#666"}
        />
      </Pressable>

      {/* Toast overlay — centred at top of screen */}
      {toastText && (
        <Animated.View
          style={[styles.toastContainer, { opacity: fadeAnim }]}
          pointerEvents="none"
        >
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastText}</Text>
          </View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  toastContainer: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
    pointerEvents: "none",
  },
  toast: {
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
