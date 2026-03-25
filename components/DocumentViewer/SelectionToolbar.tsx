/**
 * SelectionToolbar — WPS-Style contextual action menu for text selection.
 * Shows Copy, Highlight, Underline, Share, Search, Explain near the
 * selected text. Falls back to a bottom bar when positioning is unreliable.
 *
 * Expects `rect` in WebView document coordinates and `scrollY` at selection
 * time so we can convert to approximate screen position.
 */
import type { SelectionAction } from "@/src/types/document-viewer.types";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

// ── Action definitions ──────────────────────────────────────────────
const ACTIONS: {
  key: SelectionAction;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
}[] = [
  { key: "copy", label: "Copy", icon: "content-copy" },
  { key: "highlight", label: "Highlight", icon: "highlight" },
  { key: "underline", label: "Underline", icon: "format-underlined" },
  { key: "share", label: "Share", icon: "share" },
  { key: "search", label: "Search", icon: "search" },
  { key: "explain", label: "Explain", icon: "auto-awesome" },
];

// ── Props ───────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  selectedText: string;
  /** Bounding rect of selected text (document coords from WebView). */
  rect?: { x: number; y: number; width: number; height: number };
  /** Document scrollY at time of selection. */
  scrollY?: number;
  onAction: (action: SelectionAction) => void;
  onDismiss: () => void;
}

const TOOLBAR_HEIGHT = 52;
const TOOLBAR_WIDTH = 340;
const SCREEN_PADDING = 8;
const ARROW_GAP = 8;

export function SelectionToolbar({
  visible,
  selectedText,
  rect,
  scrollY = 0,
  onAction,
  onDismiss,
}: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [visible]);

  if (!visible || !selectedText) return null;

  const { width: screenW, height: screenH } = Dimensions.get("window");

  // ── Position calculation ──────────────────────────────────────
  // rect is in document coordinates; subtract scrollY for viewport-relative
  let top: number = 0;
  let left: number = 0;
  let useBottomBar = false;

  if (rect && rect.width > 0) {
    const viewportY = rect.y - scrollY;
    // Try to place above the selection
    top = viewportY - TOOLBAR_HEIGHT - ARROW_GAP;
    if (top < SCREEN_PADDING + 56) {
      // Not enough space above → below selection
      top = viewportY + rect.height + ARROW_GAP;
    }
    if (top + TOOLBAR_HEIGHT > screenH - SCREEN_PADDING) {
      useBottomBar = true;
    }
    // Horizontal centering
    left = rect.x + rect.width / 2 - TOOLBAR_WIDTH / 2;
    left = Math.max(
      SCREEN_PADDING,
      Math.min(left, screenW - TOOLBAR_WIDTH - SCREEN_PADDING),
    );
  } else {
    useBottomBar = true;
  }

  if (useBottomBar) {
    top =
      screenH -
      TOOLBAR_HEIGHT -
      (Platform.OS === "ios" ? 34 : 16) -
      SCREEN_PADDING;
    left = (screenW - TOOLBAR_WIDTH) / 2;
  }

  return (
    <>
      {/* Tap-outside overlay */}
      <Pressable style={styles.overlay} onPress={onDismiss} />

      <Animated.View
        style={[
          styles.toolbar,
          {
            top,
            left,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
        pointerEvents="box-none"
      >
        {ACTIONS.map((a) => (
          <Pressable
            key={a.key}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.actionBtnPressed,
            ]}
            onPress={() => onAction(a.key)}
          >
            <MaterialIcons name={a.icon} size={18} color="#333" />
            <Text style={styles.actionLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
  },
  toolbar: {
    position: "absolute",
    zIndex: 999,
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    alignItems: "center",
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 48,
  },
  actionBtnPressed: {
    backgroundColor: "#E3F2FD",
  },
  actionLabel: {
    fontSize: 10,
    color: "#555",
    fontWeight: "500",
    marginTop: 1,
  },
});
