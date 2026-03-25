/**
 * EditorToolbar.tsx
 *
 * A slim bottom bar with Home / Insert toggle buttons.
 * Pressing a button toggles an overlay panel with the corresponding tools.
 * The panel slides up over the editor without stealing its layout space.
 * Tapping the same button again, or tapping outside, dismisses the panel.
 */

import type { EditorTab } from "@/src/types/editor.types";
import React, { useCallback, useRef } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useDocument } from "./DocumentContext";
import EditorToolbarHome from "./EditorToolbarHome";
import EditorToolbarInsert from "./EditorToolbarInsert";

const PANEL_HEIGHT = 300;
const BUTTON_BAR_HEIGHT = 44;
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const TABS: { key: EditorTab; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "🅰" },
  { key: "insert", label: "Insert", icon: "➕" },
];

export default React.memo(function EditorToolbar() {
  const { state, dispatch } = useDocument();
  const slideAnim = useRef(new Animated.Value(PANEL_HEIGHT)).current; // starts closed (translated down)
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [openTab, setOpenTab] = React.useState<EditorTab | null>(null);

  const animatePanel = useCallback(
    (toOpen: boolean) => {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: toOpen ? 0 : PANEL_HEIGHT,
          useNativeDriver: true,
          friction: 10,
          tension: 60,
        }),
        Animated.timing(opacityAnim, {
          toValue: toOpen ? 1 : 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [slideAnim, opacityAnim],
  );

  const toggleTab = useCallback(
    (tab: EditorTab) => {
      if (openTab === tab) {
        // Close
        setOpenTab(null);
        animatePanel(false);
      } else {
        // Open (or switch)
        setOpenTab(tab);
        dispatch({ type: "SET_ACTIVE_TAB", tab });
        if (!openTab) animatePanel(true); // only animate if was closed
      }
    },
    [openTab, dispatch, animatePanel],
  );

  const closePanel = useCallback(() => {
    setOpenTab(null);
    animatePanel(false);
  }, [animatePanel]);

  return (
    <View style={styles.wrapper}>
      {/* Overlay backdrop — only visible when panel is open */}
      {openTab && <Pressable style={styles.backdrop} onPress={closePanel} />}

      {/* Sliding panel */}
      <Animated.View
        style={[
          styles.panel,
          {
            height: PANEL_HEIGHT,
            transform: [{ translateY: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
        pointerEvents={openTab ? "auto" : "none"}
      >
        {openTab === "home" && <EditorToolbarHome />}
        {openTab === "insert" && <EditorToolbarInsert />}
      </Animated.View>

      {/* Bottom button bar — always visible */}
      <View style={styles.buttonBar}>
        {TABS.map((tab) => {
          const isActive = openTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => toggleTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.spacer} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    // Explicit height so flex layout always reserves space for the button bar
    height: BUTTON_BAR_HEIGHT,
    zIndex: 10,
    overflow: "visible" as const, // allow panel to render above
  },
  backdrop: {
    position: "absolute",
    top: -SCREEN_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
    zIndex: 1,
  },
  panel: {
    position: "absolute",
    bottom: BUTTON_BAR_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    zIndex: 2,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    overflow: "hidden",
  },
  buttonBar: {
    flexDirection: "row",
    height: BUTTON_BAR_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    paddingHorizontal: 8,
    zIndex: 3,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 4,
  },
  tabBtnActive: {
    backgroundColor: "#E3F2FD",
  },
  tabIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#757575",
  },
  tabLabelActive: {
    color: "#1976D2",
    fontWeight: "700",
  },
  spacer: { flex: 1 },
});
