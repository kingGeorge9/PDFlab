/**
 * Thumbnail Grid
 * Full-screen modal showing all PDF pages as miniature thumbnails.
 * Tapping a thumbnail navigates to that page and closes the grid.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Pdf from "react-native-pdf";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Palette,
  Spacing,
  Typography,
  type LightTheme,
} from "@/services/document-manager";

// ── Layout constants ─────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMNS = 3;
const MARGIN = 8;
const THUMB_W = (SCREEN_WIDTH - (COLUMNS + 1) * MARGIN) / COLUMNS;
const THUMB_H = THUMB_W * 1.414; // A4 aspect ratio

interface ThumbnailGridProps {
  visible: boolean;
  /** Must be the same `source` format used by the main <Pdf> component */
  source: { uri: string; cache?: boolean };
  totalPages: number;
  currentPage: number;
  theme: typeof LightTheme;
  onClose: () => void;
  onSelectPage: (page: number) => void;
}

export function ThumbnailGrid({
  visible,
  source,
  totalPages,
  currentPage,
  theme,
  onClose,
  onSelectPage,
}: ThumbnailGridProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  const handleSelect = useCallback(
    (pageNumber: number) => {
      onSelectPage(pageNumber);
      onClose();
    },
    [onSelectPage, onClose],
  );

  const renderThumbnail = useCallback(
    ({ item: pageNumber }: { item: number }) => {
      const isCurrent = pageNumber === currentPage;

      return (
        <Pressable
          style={styles.thumbContainer}
          onPress={() => handleSelect(pageNumber)}
        >
          <View
            style={[
              styles.thumbWrapper,
              {
                borderColor: isCurrent
                  ? Palette.primary[500]
                  : theme.border.light,
                borderWidth: isCurrent ? 3 : 1,
                backgroundColor: theme.surface.primary,
              },
            ]}
          >
            {/* Miniature PDF render */}
            <Pdf
              source={source}
              page={pageNumber}
              scale={0.3}
              spacing={0}
              style={styles.thumb}
              enablePaging={false}
              horizontal={false}
              enableDoubleTapZoom={false}
            />

            {/* Current page badge */}
            {isCurrent && (
              <View style={styles.currentOverlay}>
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>CURRENT</Text>
                </View>
              </View>
            )}
          </View>

          {/* Page number label */}
          <View
            style={[
              styles.pageLabel,
              {
                backgroundColor: isCurrent
                  ? Palette.primary[500]
                  : theme.surface.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.pageLabelText,
                { color: isCurrent ? Palette.white : theme.text.primary },
              ]}
            >
              {pageNumber}
            </Text>
          </View>
        </Pressable>
      );
    },
    [currentPage, source, theme, handleSelect],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: THUMB_H + MARGIN * 2 + 30,
      offset: (THUMB_H + MARGIN * 2 + 30) * Math.floor(index / COLUMNS),
      index,
    }),
    [],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.secondary },
        ]}
        edges={["top", "bottom"]}
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.surface.primary,
              borderBottomColor: theme.border.light,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: theme.text.primary }]}>
              All Pages
            </Text>
            <Text
              style={[styles.headerSubtitle, { color: theme.text.secondary }]}
            >
              {totalPages} page{totalPages !== 1 ? "s" : ""}
            </Text>
          </View>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <MaterialIcons
              name="close"
              size={24}
              color={theme.text.secondary}
            />
          </Pressable>
        </View>

        {/* ── Grid ──────────────────────────────────────────────── */}
        <FlatList
          data={pages}
          renderItem={renderThumbnail}
          keyExtractor={(item) => `thumb-${item}`}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator
          initialScrollIndex={Math.max(0, currentPage - 2)}
          getItemLayout={getItemLayout}
          onScrollToIndexFailed={() => {
            /* noop – FlatList will still attempt best-effort scroll */
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: Typography.size["2xl"],
    fontWeight: Typography.weight.bold,
  },
  headerSubtitle: {
    fontSize: Typography.size.sm,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  grid: {
    padding: MARGIN,
  },
  thumbContainer: {
    width: THUMB_W,
    margin: MARGIN,
  },
  thumbWrapper: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 8,
    overflow: "hidden",
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
  },
  currentOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 8,
  },
  currentBadge: {
    backgroundColor: Palette.primary[500],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  currentBadgeText: {
    color: Palette.white,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
  },
  pageLabel: {
    marginTop: 6,
    paddingVertical: 5,
    alignItems: "center",
    borderRadius: 4,
  },
  pageLabelText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
});
