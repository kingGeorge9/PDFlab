/**
 * Share Screen
 * Multi-select file grid for sharing files to other apps.
 * Tap a card to select/deselect, then tap "Share" to share all selected files.
 * No delete or pin actions here — sharing only.
 *
 * Root-cause fix for "Sharing is not available":
 *   expo-sharing.isAvailableAsync() returns false on some Android builds even
 *   when sharing works fine. We skip that guard entirely and call shareAsync()
 *   directly, converting content:// SAF URIs to a cached file:// path first.
 */

import { GradientView } from "@/components/GradientView";
import { PINGate } from "@/components/PINGate";
import { colors } from "@/constants/theme";
import { useFileIndex } from "@/hooks/useFileIndex";
import {
  formatFileSize,
  getFileTypeConfig,
  useQuickAccess,
  type QuickAccessFile,
} from "@/services/document-manager";
import { addSourceTag, getFileByUri } from "@/services/fileIndexService";
import { useTheme } from "@/services/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { Search, Share2 } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 8;
const HORIZONTAL_PADDING = 16;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Ensure a shareable file:// URI.
 * content:// (SAF) URIs cannot always be passed directly to expo-sharing on
 * Android — copy to app cache first.
 */
async function getShareableUri(file: QuickAccessFile): Promise<string> {
  const uri = file.uri;
  try {
    const ext = file.extension ? `.${file.extension}` : "";
    const displayName = file.displayName || "document";
    const baseName = displayName.replace(/\.[^/.]+$/, ""); // strip extension if present
    const safeName = baseName
      .replace(/[\/\\:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "document";
    const dest = `${FileSystem.cacheDirectory}${safeName}${ext}`;
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    }
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function ShareScreen() {
  const { colors: t, mode } = useTheme();
  const backgroundColor = t.background;
  const textColor = t.text;

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSharing, setIsSharing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Long-press action sheet ──────────────────────────────────────────────
  const [actionFile, setActionFile] = useState<QuickAccessFile | null>(null);

  // ── Data sources ──────────────────────────────────────────────────────────
  const {
    files: legacyFiles,
    isLoading: legacyLoading,
    refresh: refreshLegacy,
  } = useQuickAccess();

  const {
    files: indexFiles,
    isLoading: indexLoading,
    refresh: refreshIndex,
  } = useFileIndex();

  // Deduplicated merged file list
  const files = useMemo(() => {
    const uriMap = new Map<string, QuickAccessFile>();
    for (const file of legacyFiles) {
      uriMap.set(file.uri, file);
    }
    for (const indexFile of indexFiles) {
      if (!uriMap.has(indexFile.uri)) {
        const converted: QuickAccessFile = {
          id: indexFile.id,
          uri: indexFile.uri,
          originalUri: indexFile.originalUri || indexFile.uri,
          displayName: indexFile.name,
          extension: indexFile.extension,
          mimeType: indexFile.mimeType,
          size: indexFile.size,
          lastOpenedAt: indexFile.lastOpenedAt,
          dateAdded: indexFile.createdAt,
          source: indexFile.source === "created" ? "created" : "picked",
          isSafUri: indexFile.isSafUri || false,
          cacheValid: indexFile.cacheValid,
        } as QuickAccessFile;
        uriMap.set(indexFile.uri, converted);
      }
    }
    return Array.from(uriMap.values()).sort(
      (a, b) => b.lastOpenedAt - a.lastOpenedAt,
    );
  }, [legacyFiles, indexFiles]);

  const isLoading = legacyLoading || indexLoading;

  const refresh = useCallback(async () => {
    await Promise.all([refreshLegacy(), refreshIndex()]);
  }, [refreshLegacy, refreshIndex]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      setSelectedIds(new Set());
    }, [refresh]),
  );

  // Filtered by search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [files, searchQuery]);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFiles.map((f) => f.id)));
    }
  }, [selectedIds.size, filteredFiles]);

  /**
   * Share all selected files sequentially.
   * Skips isAvailableAsync() — see file header for root-cause explanation.
   */
  const handleShareSelected = useCallback(async () => {
    if (selectedIds.size === 0 || isSharing) return;

    const filesToShare = Array.from(selectedIds)
      .map((id) => filteredFiles.find((f) => f.id === id))
      .filter((f): f is QuickAccessFile => !!f);

    setIsSharing(true);
    let failCount = 0;

    for (const file of filesToShare) {
      try {
        const shareUri = await getShareableUri(file);
        await Sharing.shareAsync(shareUri, {
          mimeType: file.mimeType || "application/octet-stream",
          dialogTitle: `Share ${file.displayName}`,
          UTI: file.mimeType,
        });
        const record = await getFileByUri(file.uri);
        if (record) addSourceTag(record.id, "shared").catch(() => {});
      } catch (err: any) {
        const isCancelled =
          err?.message?.toLowerCase().includes("cancel") ||
          err?.message?.toLowerCase().includes("dismiss") ||
          err?.code === "E_SHARE_CANCELLED";
        if (!isCancelled) {
          failCount++;
          console.warn("[Share] Failed to share:", file.displayName, err);
        }
      }
    }

    setIsSharing(false);
    if (failCount > 0) {
      showToast(
        `${failCount} file${failCount > 1 ? "s" : ""} could not be shared.`,
      );
    }
  }, [selectedIds, filteredFiles, isSharing, showToast]);

  // ── Share a single file (from long press) ──────────────────────────────────
  const handleShareSingleFile = useCallback(
    async (file: QuickAccessFile) => {
      setActionFile(null);
      setIsSharing(true);
      try {
        const shareUri = await getShareableUri(file);
        await Sharing.shareAsync(shareUri, {
          mimeType: file.mimeType || "application/octet-stream",
          dialogTitle: `Share ${file.displayName}`,
          UTI: file.mimeType,
        });
        const record = await getFileByUri(file.uri);
        if (record) addSourceTag(record.id, "shared").catch(() => {});
      } catch (err: any) {
        const isCancelled =
          err?.message?.toLowerCase().includes("cancel") ||
          err?.message?.toLowerCase().includes("dismiss");
        if (!isCancelled) {
          showToast(`Could not share ${file.displayName}.`);
        }
      } finally {
        setIsSharing(false);
      }
    },
    [showToast],
  );

  // ── Card type styling ──────────────────────────────────────────────────────
  const getFileTypeStyle = (file: QuickAccessFile) => {
    const typeConfig = getFileTypeConfig(file.displayName);
    const ext = file.extension?.toLowerCase();
    if (ext === "pdf" || typeConfig.color === colors.pdf)
      return { bgColor: "#FEE2E2", iconColor: colors.pdf };
    if (ext === "docx" || ext === "doc" || typeConfig.color === colors.word)
      return { bgColor: "#DBEAFE", iconColor: colors.word };
    if (ext === "pptx" || ext === "ppt" || typeConfig.color === colors.ppt)
      return { bgColor: "#FFEDD5", iconColor: colors.ppt };
    if (ext === "xlsx" || ext === "xls" || typeConfig.color === colors.excel)
      return { bgColor: "#D1FAE5", iconColor: colors.excel };
    return { bgColor: "#EEF2FF", iconColor: colors.primary };
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderFileCard = (file: QuickAccessFile) => {
    const typeConfig = getFileTypeConfig(file.displayName);
    const style = getFileTypeStyle(file);
    const isSelected = selectedIds.has(file.id);
    const cardWidth = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

    return (
      <Pressable
        key={file.id}
        style={({ pressed }) => [
          styles.fileCard,
          {
            width: cardWidth,
            backgroundColor: isSelected
              ? t.primary + "18"
              : pressed
                ? t.card + "CC"
                : t.card,
            borderColor: isSelected ? t.primary : t.borderLight,
            borderWidth: isSelected ? 2 : 1,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        onPress={() => handleToggleSelect(file.id)}
        disabled={isSharing}
        android_ripple={{ color: t.primary + "20" }}
      >
        {/* File Type Icon */}
        <View
          style={[styles.fileIconContainer, { backgroundColor: style.bgColor }]}
        >
          <MaterialIcons
            name={typeConfig.icon as keyof typeof MaterialIcons.glyphMap}
            size={20}
            color={style.iconColor}
          />
        </View>

        <Text
          style={[styles.fileName, { color: textColor }]}
          numberOfLines={2}
          ellipsizeMode="middle"
        >
          {file.displayName}
        </Text>
        <Text style={styles.fileSize}>{formatFileSize(file.size || 0)}</Text>

        {/* Selection / share indicator */}
        <View
          style={[
            styles.selectionIndicator,
            { backgroundColor: isSelected ? t.primary : style.bgColor },
          ]}
        >
          {isSelected ? (
            <Ionicons name="checkmark" size={14} color="#fff" />
          ) : (
            <Share2 color={style.iconColor} size={14} strokeWidth={2.5} />
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <GradientView
        colors={
          mode === "dark" ? ["#1E293B", "#0F172A"] : ["#EEF2FF", "#F8FAFC"]
        }
        style={styles.emptyIconContainer}
      >
        <Share2 color={t.primary} size={40} strokeWidth={1.5} />
      </GradientView>
      <Text style={[styles.emptyTitle, { color: textColor }]}>
        No files to share
      </Text>
      <Text style={styles.emptyDescription}>
        Import or create files first, then come back here to share them.
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push("/library")}
      >
        <GradientView
          colors={[colors.gradientStart, colors.gradientMid]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyButtonGradient}
        >
          <Text style={styles.emptyButtonText}>Go to Library</Text>
        </GradientView>
      </TouchableOpacity>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={t.primary} />
      <Text style={[styles.loadingText, { color: textColor }]}>
        Loading files…
      </Text>
    </View>
  );

  const renderShareBar = () => {
    if (filteredFiles.length === 0 || isLoading || selectedIds.size === 0)
      return null;
    const allSelected = selectedIds.size === filteredFiles.length;
    return (
      <View
        style={[
          styles.shareBar,
          { backgroundColor: t.card, borderTopColor: t.borderLight },
        ]}
      >
        <TouchableOpacity
          onPress={handleSelectAll}
          style={styles.selectAllBtn}
          disabled={isSharing}
        >
          <Ionicons
            name={allSelected ? "checkbox" : "square-outline"}
            size={22}
            color={allSelected ? t.primary : t.textSecondary}
          />
          <Text style={[styles.selectAllText, { color: t.textSecondary }]}>
            {allSelected ? "Deselect all" : "Select all"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.shareButton,
            { opacity: selectedIds.size === 0 || isSharing ? 0.45 : 1 },
          ]}
          onPress={handleShareSelected}
          disabled={selectedIds.size === 0 || isSharing}
          activeOpacity={0.8}
        >
          <GradientView
            colors={["#4F46E5", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shareButtonGradient}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Share2 color="#fff" size={18} strokeWidth={2.5} />
            )}
            <Text style={styles.shareButtonText}>
              {isSharing
                ? "Sharing…"
                : selectedIds.size === 0
                  ? "Share"
                  : `Share ${selectedIds.size} file${selectedIds.size > 1 ? "s" : ""}`}
            </Text>
          </GradientView>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <PINGate screen="shareFiles">
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <GradientView
            colors={["#4F46E5", "#7C3AED", "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerTop}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerTitleContainer}>
                <GradientView
                  colors={["#4F46E5", "#7C3AED"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.headerPill}
                >
                  <Text style={styles.headerTitle}>Share Files</Text>
                </GradientView>
                <Text style={styles.headerSubtitle}>
                  Tap files to select, then tap Share
                </Text>
              </View>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchBar, { backgroundColor: t.card }]}>
              <Search color={t.primary} size={20} strokeWidth={2.5} />
              <TextInput
                placeholder="Search files…"
                placeholderTextColor={t.textTertiary}
                style={[styles.searchInput, { color: t.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={t.textTertiary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </GradientView>
        </View>

        {/* File count */}
        {!isLoading && filteredFiles.length > 0 && (
          <View style={styles.countContainer}>
            <Text style={[styles.countText, { color: t.textSecondary }]}>
              {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}{" "}
              available
              {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
            </Text>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          renderLoading()
        ) : filteredFiles.length === 0 ? (
          renderEmptyState()
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
          >
            {filteredFiles.map((file) => renderFileCard(file))}
          </ScrollView>
        )}

        {/* Bottom share bar */}
        {renderShareBar()}

        {/* Long-press action sheet */}
        <Modal
          visible={actionFile !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setActionFile(null)}
        >
          <Pressable
            style={styles.actionBackdrop}
            onPress={() => setActionFile(null)}
          >
            <View style={[styles.actionSheet, { backgroundColor: t.card }]}>
              <Text
                style={[styles.actionFileName, { color: t.text }]}
                numberOfLines={2}
              >
                {actionFile?.displayName}
              </Text>
              {actionFile && (
                <Text
                  style={[styles.actionFileMeta, { color: t.textSecondary }]}
                >
                  {formatFileSize(actionFile.size || 0)}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: t.borderLight }]}
                onPress={() => actionFile && handleShareSingleFile(actionFile)}
              >
                <Share2 color={t.primary} size={18} strokeWidth={2.2} />
                <Text style={[styles.actionBtnText, { color: t.text }]}>
                  Share this file
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: t.borderLight }]}
                onPress={() => {
                  if (actionFile) handleToggleSelect(actionFile.id);
                  setActionFile(null);
                }}
              >
                <Ionicons
                  name={
                    actionFile && selectedIds.has(actionFile.id)
                      ? "checkmark-circle"
                      : "ellipse-outline"
                  }
                  size={18}
                  color={t.primary}
                />
                <Text style={[styles.actionBtnText, { color: t.text }]}>
                  {actionFile && selectedIds.has(actionFile.id)
                    ? "Deselect"
                    : "Select for sharing"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionCancelBtn,
                  { backgroundColor: t.backgroundSecondary || t.background },
                ]}
                onPress={() => setActionFile(null)}
              >
                <Text
                  style={[styles.actionCancelText, { color: t.textSecondary }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {/* Toast */}
        {toastMsg ? (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </PINGate>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: {
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 20 : 16,
    paddingBottom: 18,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: { flex: 1 },
  headerPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
    paddingHorizontal: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 48,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  countContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: { flex: 1 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 24,
    gap: CARD_GAP,
  },
  fileCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: CARD_GAP,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    minHeight: 110,
    justifyContent: "space-between",
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
    lineHeight: 18,
  },
  fileSize: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
    marginBottom: 8,
  },
  selectionIndicator: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    marginTop: -60,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  emptyButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  // ── Bottom share bar ──────────────────────────────────────────────────────
  shareBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "600",
  },
  shareButton: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  shareButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  // ── Toast ─────────────────────────────────────────────────────────────────
  toast: {
    position: "absolute",
    bottom: 110,
    alignSelf: "center",
    backgroundColor: "rgba(15,23,42,0.92)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    maxWidth: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  // ── Long-press action sheet ───────────────────────────────────────────────
  actionBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  actionFileName: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
    textAlign: "center",
  },
  actionFileMeta: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 20,
    textAlign: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  actionCancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  actionCancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
