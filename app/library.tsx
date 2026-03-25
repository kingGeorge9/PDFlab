import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { GradientView } from "@/components/GradientView";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FolderOpen, Grid3x3, List, Plus, Search } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Dimensions,
  FlatList,
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

import { PINGate } from "@/components/PINGate";
import { colors } from "@/constants/theme";
import { useFileIndex } from "@/hooks/useFileIndex";
import {
  SUPPORTED_FILE_TYPES,
  fileMatchesSearch,
  formatFileSize,
  formatRelativeTime,
  getFileTypeConfig,
  openWithSystemApp,
  pickFilesWithResult,
  showOpenFailedAlert,
  useQuickAccess,
  type QuickAccessFile,
} from "@/services/document-manager";
import { getPinnedFileIds } from "@/services/filePinService";
import {
  addToFavorites,
  getFavorites,
  removeFromFavorites,
} from "@/services/fileService";
import {
  getAllFolders,
  moveFileToFolder,
  removeFileFromAllFolders,
  type Folder,
} from "@/services/folderService";
import { recycleFile } from "@/services/recycleBinService";
import { useTheme } from "@/services/ThemeProvider";

const VIEW_MODE_KEY = "@pdflab_library_view_mode";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================================================
// FILTER TYPES
// ============================================================================
type TypeFilter = "all" | "pdf" | "docx" | "ppt" | "epub";
type SourceFilter =
  | "all"
  | "created"
  | "imported"
  | "downloaded"
  | "shared"
  | "favorites";
type ViewMode = "list" | "grid";

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function LibraryScreen() {
  const { colors: t, mode } = useTheme();
  const colorScheme = mode;
  const backgroundColor = t.background;
  const textColor = t.text;
  const primaryColor = t.primary;

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  // ── Mark mode (multi-select) ───────────────────────────────────────────────
  const [markMode, setMarkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Long-press action sheet ────────────────────────────────────────────────
  const [actionFile, setActionFile] = useState<QuickAccessFile | null>(null);

  // ── Toast notification ─────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // longPressTimerRef removed — using Pressable onLongPress instead

  // ── Pinned file IDs ────────────────────────────────────────────────────────
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  // ── Favorites ─────────────────────────────────────────────────────────────
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // ── Grid / List view ──────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // ── Folder picker for "Move to Folder" ────────────────────────────────────
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerFile, setFolderPickerFile] =
    useState<QuickAccessFile | null>(null);
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);

  // ── Navigation params ─────────────────────────────────────────────────────
  const { sourceFilter: sourceFilterParam } = useLocalSearchParams<{
    sourceFilter?: string;
  }>();
  // Track the last param value we applied so navigating back without a param
  // does NOT reset a filter the user manually selected.
  const appliedSourceFilterParam = useRef<string | undefined>(undefined);

  // Library hook (legacy)
  const {
    files: legacyFiles,
    isLoading: legacyLoading,
    addFile,
    removeFile,
    updateLastOpened,
    refresh: refreshLegacy,
  } = useQuickAccess();

  // Unified file index hook
  const {
    files: indexFiles,
    isLoading: indexLoading,
    refresh: refreshIndex,
    updateLastOpened: updateIndexLastOpened,
    removeFile: removeIndexFile,
    clearAllIncludingDownloads,
    clearAllExceptDownloads,
  } = useFileIndex();

  // Combine files from both sources (deduplicated by URI)
  const files = useMemo(() => {
    const uriMap = new Map<string, QuickAccessFile>();

    // Add legacy files first
    for (const file of legacyFiles) {
      uriMap.set(file.uri, file);
    }

    // Add unified index files (may override or add new ones)
    for (const indexFile of indexFiles) {
      if (!uriMap.has(indexFile.uri)) {
        // Convert UnifiedFileRecord to QuickAccessFile format
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
          // Store source tags for filtering
          _sourceTags: indexFile.sourceTags,
          _type: indexFile.type,
        } as QuickAccessFile & { _sourceTags?: string[]; _type?: string };
        uriMap.set(indexFile.uri, converted);
      }
    }

    // Sort by lastOpenedAt
    return Array.from(uriMap.values()).sort(
      (a, b) => b.lastOpenedAt - a.lastOpenedAt,
    );
  }, [legacyFiles, indexFiles]);

  const isLoading = legacyLoading || indexLoading;

  // Refresh both sources
  const refresh = useCallback(async () => {
    await Promise.all([refreshLegacy(), refreshIndex()]);
  }, [refreshLegacy, refreshIndex]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      refresh();
      getFavorites().then(setFavoriteIds);
    }, [refresh]),
  );

  // ── Load pins, favorites, view mode on mount ────────────────────────────
  useEffect(() => {
    getPinnedFileIds().then(setPinnedIds);
    getFavorites().then(setFavoriteIds);
    AsyncStorage.getItem(VIEW_MODE_KEY).then((v) => {
      if (v === "grid" || v === "list") setViewMode(v);
    });
  }, []);

  // ── Apply sourceFilter navigation param ──────────────────────────────────
  // Fires whenever the param changes (e.g. navigated here via Downloads button).
  // Uses a ref to avoid overriding a user-selected filter when re-visiting via
  // the Library tab icon (which carries no param).
  useEffect(() => {
    if (!sourceFilterParam) return;
    if (sourceFilterParam === appliedSourceFilterParam.current) return;
    const valid: SourceFilter[] = [
      "all",
      "created",
      "imported",
      "downloaded",
      "shared",
      "favorites",
    ];
    if (valid.includes(sourceFilterParam as SourceFilter)) {
      appliedSourceFilterParam.current = sourceFilterParam;
      setSourceFilter(sourceFilterParam as SourceFilter);
    }
  }, [sourceFilterParam]);

  // ── Auto-dismiss toast after 2.5 s ───────────────────────────────────────
  useEffect(() => {
    if (!toastMsg) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2500);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toastMsg]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleImportFile = useCallback(async () => {
    // Use the improved file picker with detailed result
    const result = await pickFilesWithResult({
      types: [
        ...SUPPORTED_FILE_TYPES.ALL_DOCUMENTS,
        ...SUPPORTED_FILE_TYPES.ALL_IMAGES,
      ],
      multiple: false,
      copyToCacheDirectory: true,
      showAlerts: true,
    });

    // Handle cancellation
    if (result.cancelled) {
      return;
    }

    // Handle errors
    if (!result.success || result.files.length === 0) {
      console.log("[Library] File import failed or no files selected");
      return;
    }

    // Add the picked file to library
    const picked = result.files[0];
    const addResult = await addFile({
      uri: picked.uri,
      displayName: picked.name,
      mimeType: picked.mimeType,
      size: picked.size,
      source: "picked",
    });

    if (!addResult.success) {
      Alert.alert(
        "Import Error",
        addResult.error || "Failed to import file. Please try again.",
        [{ text: "OK" }],
      );
    }
  }, [addFile]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleFilePress = useCallback(
    async (file: QuickAccessFile) => {
      // Check if this is a viewable file type
      const extension = file.extension?.toLowerCase();
      const isImage = ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(
        extension,
      );
      const isPdf = extension === "pdf";
      const isDocx = extension === "docx" || extension === "doc";
      const isEpub = extension === "epub";

      // Update last opened timestamp in both systems
      await updateLastOpened(file.id);
      updateIndexLastOpened(file.id).catch(console.error);

      if (isImage) {
        // Navigate to image viewer
        router.push({
          pathname: "/image-viewer",
          params: {
            uri: file.uri,
            name: file.displayName,
            type: file.mimeType || "image/jpeg",
          },
        });
      } else if (isPdf) {
        // Navigate to in-app PDF viewer
        router.push({
          pathname: "/pdf-viewer",
          params: {
            uri: file.uri,
            name: file.displayName,
          },
        });
      } else if (isDocx) {
        // Navigate to in-app DOCX viewer
        (router as any).push({
          pathname: "/docx-viewer",
          params: {
            uri: file.uri,
            name: file.displayName,
          },
        });
      } else if (isEpub) {
        // Navigate to in-app EPUB viewer
        router.push({
          pathname: "/epub-viewer",
          params: {
            uri: file.uri,
            name: file.displayName,
          },
        });
      } else if (extension === "pdflab") {
        // Legacy encrypted .pdflab file — offer to decrypt
        Alert.alert(
          "Encrypted File",
          "This file uses a legacy encryption format. Decrypt it to view as a standard PDF.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Decrypt",
              onPress: () =>
                router.push({
                  pathname: "/tool-processor",
                  params: {
                    tool: "decrypt",
                    file: file.displayName,
                    fileUri: file.uri,
                    fileMimeType: "application/octet-stream",
                  },
                }),
            },
          ],
        );
      } else {
        // For other file types, use system app
        const result = await openWithSystemApp({
          uri: file.uri,
          mimeType: file.mimeType,
          displayName: file.displayName,
        });

        if (!result.success) {
          showOpenFailedAlert(file.displayName, result.error);
        }
      }
    },
    [updateLastOpened, updateIndexLastOpened],
  );

  // Long-press enters selection mode directly (standard behavior)
  const handleFileLongPress = useCallback(
    (file: QuickAccessFile) => {
      if (!markMode) {
        setMarkMode(true);
        setSelectedIds(new Set([file.id]));
      }
    },
    [markMode],
  );

  const handleClearAll = useCallback(() => {
    if (files.length === 0) return;

    Alert.alert(
      "Clear All Files",
      "Permanently delete ALL files from Library, Downloads, Folders, and device storage? This cannot be undone and files will NOT be sent to the Recycle Bin.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearAllIncludingDownloads();
            await Promise.all([refreshLegacy(), refreshIndex()]);
            setFavoriteIds(new Set());
          },
        },
      ],
    );
  }, [files.length, clearAllIncludingDownloads, refreshLegacy, refreshIndex]);

  // ── Mark-mode / multi-select handlers ───────────────────────────────────────

  const handleExitMarkMode = useCallback(() => {
    setMarkMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    const msg = count === 1 ? "Delete this file?" : `Delete ${count} files?`;
    Alert.alert("Confirm Delete", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const snapshot = Array.from(selectedIds);
          let failed = 0;
          for (const id of snapshot) {
            const file = files.find((f) => f.id === id);
            if (!file) continue;
            try {
              await recycleFile({
                id: file.id,
                name: file.displayName,
                uri: file.uri,
                size: file.size || 0,
                type: (file as any)._type || file.extension || "unknown",
                mimeType: file.mimeType || "application/octet-stream",
                source: file.source,
              });
              removeFile(file.id);
              await removeIndexFile(file.id);
              await removeFileFromAllFolders(file.id).catch(console.error);
            } catch {
              failed++;
            }
          }
          setMarkMode(false);
          setSelectedIds(new Set());
          if (failed > 0) {
            setToastMsg(
              `${failed} file${failed > 1 ? "s" : ""} could not be deleted.`,
            );
          }
        },
      },
    ]);
  }, [selectedIds, files, removeFile, removeIndexFile]);

  const handleBulkShare = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const file = files.find((f) => f.id === ids[0]);
    if (!file) return;
    try {
      const Sharing = await import("expo-sharing");
      const mod = (Sharing as any).default ?? Sharing;
      await mod.shareAsync(file.uri, {
        mimeType: file.mimeType || "application/octet-stream",
        dialogTitle: `Share ${file.displayName}`,
      });
      setMarkMode(false);
      setSelectedIds(new Set());
    } catch {
      setToastMsg("Failed to share file.");
    }
  }, [selectedIds, files]);

  // ── View mode toggle ─────────────────────────────────────────────────────
  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === "list" ? "grid" : "list";
      AsyncStorage.setItem(VIEW_MODE_KEY, next).catch(console.error);
      return next;
    });
  }, []);

  // ── Favorite toggle ─────────────────────────────────────────────────────
  const handleToggleFavorite = useCallback(
    async (file: QuickAccessFile) => {
      setActionFile(null);
      const isFav = favoriteIds.has(file.id);
      try {
        if (isFav) {
          await removeFromFavorites(file.id);
          setToastMsg(`Removed from favorites`);
        } else {
          await addToFavorites(file.id);
          setToastMsg(`Added to favorites`);
        }
        const updated = await getFavorites();
        setFavoriteIds(updated);
      } catch {
        setToastMsg("Failed to update favorite");
      }
    },
    [favoriteIds],
  );

  // ── Move to Folder ──────────────────────────────────────────────────────
  const handleMoveToFolder = useCallback(async (file: QuickAccessFile) => {
    setActionFile(null);
    try {
      const folders = await getAllFolders();
      setAvailableFolders(folders);
      setFolderPickerFile(file);
      setShowFolderPicker(true);
    } catch {
      setToastMsg("Failed to load folders");
    }
  }, []);

  const handleSelectFolder = useCallback(
    async (folderId: string | null) => {
      if (!folderPickerFile) return;
      try {
        await moveFileToFolder(folderPickerFile.id, folderId);
        setShowFolderPicker(false);
        setFolderPickerFile(null);
        setToastMsg(folderId ? `Moved to folder` : `Removed from folder`);
      } catch {
        setToastMsg("Failed to move file");
      }
    },
    [folderPickerFile],
  );

  // ── Rename file ─────────────────────────────────────────────────────────
  const handleRenameFile = useCallback((file: QuickAccessFile) => {
    setActionFile(null);
    Alert.prompt?.(
      "Rename File",
      "Enter a new name:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Rename",
          onPress: async (newName?: string) => {
            if (!newName?.trim()) return;
            // Note: Renaming in the unified index would need additional implementation
            // For now, show toast indicating the limitation
            setToastMsg("Rename coming soon");
          },
        },
      ],
      "plain-text",
      file.displayName,
    ) ??
      // Android fallback — Alert.prompt is iOS-only
      setToastMsg("Rename is available via File Info");
  }, []);

  // ── File Info navigation ────────────────────────────────────────────────
  const handleFileInfo = useCallback((file: QuickAccessFile) => {
    setActionFile(null);
    router.push({
      pathname: "/file-details",
      params: {
        fileId: file.id,
        fileName: file.displayName,
        fileUri: file.uri,
        fileSize: String(file.size || 0),
        fileType: file.extension || "unknown",
        fileMimeType: file.mimeType || "application/octet-stream",
        dateAdded: String(file.dateAdded || ""),
        lastOpened: String(file.lastOpenedAt || ""),
        source: file.source || "imported",
      },
    });
  }, []);

  // ── Action-sheet item handlers ───────────────────────────────────────────

  const handleActionShare = useCallback(async (file: QuickAccessFile) => {
    setActionFile(null);
    try {
      const Sharing = await import("expo-sharing");
      const mod = (Sharing as any).default ?? Sharing;
      await mod.shareAsync(file.uri, {
        mimeType: file.mimeType || "application/octet-stream",
        dialogTitle: `Share ${file.displayName}`,
      });
    } catch {
      setToastMsg("Failed to share file.");
    }
  }, []);

  const handleActionDelete = useCallback(
    (file: QuickAccessFile) => {
      setActionFile(null);
      Alert.alert(
        "Delete File",
        `Delete "${file.displayName}"? It will be moved to the Recycle Bin and removed from all folders.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await recycleFile({
                  id: file.id,
                  name: file.displayName,
                  uri: file.uri,
                  size: file.size || 0,
                  type: (file as any)._type || file.extension || "unknown",
                  mimeType: file.mimeType || "application/octet-stream",
                  source: file.source,
                });
                removeFile(file.id);
                await removeIndexFile(file.id);
                await removeFileFromAllFolders(file.id).catch(console.error);
              } catch (err: any) {
                setToastMsg(
                  `Delete failed${err?.message ? `: ${err.message}` : "."}`,
                );
              }
            },
          },
        ],
      );
    },
    [removeFile, removeIndexFile],
  );

  // ============================================================================
  // FILTERED DATA
  // ============================================================================
  const filteredFiles = useMemo(() => {
    let result = files;

    // Apply search filter
    if (searchQuery.trim()) {
      result = result.filter((f) =>
        fileMatchesSearch(f.displayName, searchQuery),
      );
    }

    // Apply type filter
    if (typeFilter !== "all") {
      result = result.filter((f) => {
        const ext = f.extension?.toLowerCase();
        const fileType = (f as any)._type;

        switch (typeFilter) {
          case "pdf":
            return ext === "pdf" || fileType === "pdf";
          case "docx":
            return ext === "docx" || ext === "doc" || fileType === "docx";
          case "ppt":
            return ext === "pptx" || ext === "ppt" || fileType === "ppt";
          case "epub":
            return ext === "epub" || fileType === "epub";
          default:
            return true;
        }
      });
    }

    // Apply source filter
    if (sourceFilter !== "all") {
      result = result.filter((f) => {
        // Favorites is a special filter — check favoriteIds set
        if (sourceFilter === "favorites") {
          return favoriteIds.has(f.id);
        }

        const sourceTags = (f as any)._sourceTags as string[] | undefined;
        const source = f.source;

        if (sourceTags && sourceTags.length > 0) {
          return sourceTags.includes(sourceFilter);
        }

        // Fallback to legacy source field
        switch (sourceFilter) {
          case "created":
            return source === "created";
          case "imported":
            return source === "picked" || !source;
          case "downloaded":
            return false; // Legacy doesn't track downloads separately
          case "shared":
            return false; // Legacy doesn't track shares
          default:
            return true;
        }
      });
    }

    // Sort: pinned files first (in pin order), unpinned files follow
    if (pinnedIds.length > 0) {
      const pinned = result
        .filter((f) => pinnedIds.includes(f.id))
        .sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
      const unpinned = result.filter((f) => !pinnedIds.includes(f.id));
      return [...pinned, ...unpinned];
    }

    return result;
  }, [files, searchQuery, typeFilter, sourceFilter, pinnedIds, favoriteIds]);

  // Check if any filters are active
  const hasActiveFilters = typeFilter !== "all" || sourceFilter !== "all";

  // Determine if import button should be shown
  // Hide on CREATED, DOWNLOADED, and SHARED categories since importing doesn't make sense there
  const showImportButton =
    sourceFilter === "all" || sourceFilter === "imported";

  // Reset all filters
  const resetFilters = useCallback(() => {
    setTypeFilter("all");
    setSourceFilter("all");
  }, []);

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  const ITEM_HEIGHT = 72; // Fixed row height for getItemLayout
  const keyExtractor = useCallback((item: QuickAccessFile) => item.id, []);
  const getItemLayout = useCallback(
    (_data: any, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const renderFileItem = useCallback(
    ({ item }: { item: QuickAccessFile }) => {
      const typeConfig = getFileTypeConfig(item.displayName);
      const metaParts: string[] = [];
      if (item.size) metaParts.push(formatFileSize(item.size));
      metaParts.push(typeConfig.label);
      if (item.lastOpenedAt)
        metaParts.push(formatRelativeTime(item.lastOpenedAt));
      const metaText = metaParts.join(" • ");

      // Get enhanced background color for file type
      const getTypeBgColor = (color: string) => {
        if (color === colors.pdf) return "#FEE2E2";
        if (color === colors.word) return "#DBEAFE";
        if (color === colors.excel) return "#D1FAE5";
        if (color === colors.ppt) return "#FFEDD5";
        if (color === colors.image) return "#F3E8FF";
        return "#EEF2FF";
      };

      const isSelected = markMode && selectedIds.has(item.id);
      const isPinned = pinnedIds.includes(item.id);

      return (
        <Pressable
          style={({ pressed }) => [
            styles.fileCard,
            {
              backgroundColor: isSelected
                ? t.primary + "18"
                : pressed
                  ? t.card + "CC"
                  : t.card,
              borderColor: isSelected
                ? t.primary
                : item.cacheValid === false
                  ? colors.error
                  : t.borderLight,
              borderWidth: isSelected ? 2 : 1,
              opacity: pressed ? 0.85 : 1,
            },
            item.cacheValid === false && !isSelected && styles.expiredBorder,
          ]}
          onPress={() =>
            markMode ? handleToggleSelect(item.id) : handleFilePress(item)
          }
          onLongPress={() => handleFileLongPress(item)}
          delayLongPress={500}
          android_ripple={{ color: t.primary + "20" }}
        >
          {/* Icon */}
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor:
                  item.cacheValid === false
                    ? colors.errorLight
                    : getTypeBgColor(typeConfig.color),
              },
            ]}
          >
            <MaterialIcons
              name={typeConfig.icon as keyof typeof MaterialIcons.glyphMap}
              size={22}
              color={
                item.cacheValid === false ? colors.error : typeConfig.color
              }
            />
          </View>

          {/* Content */}
          <View style={styles.fileContent}>
            <Text
              style={[styles.fileName, { color: textColor }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {item.displayName}
            </Text>

            <View style={styles.metaRow}>
              {item.cacheValid === false ? (
                <Text style={[styles.expiredText, { color: colors.error }]}>
                  File unavailable — tap to re-import
                </Text>
              ) : (
                <Text style={[styles.fileMeta, { color: t.textSecondary }]}>
                  {metaText}
                </Text>
              )}
            </View>
          </View>

          {/* Right side: star + pin + checkbox or 3-dot menu */}
          {markMode ? (
            <View
              style={[
                styles.checkbox,
                isSelected && {
                  backgroundColor: t.primary,
                  borderColor: t.primary,
                },
              ]}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
          ) : (
            <View style={styles.chevronRow}>
              {favoriteIds.has(item.id) && (
                <MaterialIcons
                  name="star"
                  size={16}
                  color="#F59E0B"
                  style={{ marginRight: 4 }}
                />
              )}
              {isPinned && (
                <MaterialIcons
                  name="push-pin"
                  size={14}
                  color={t.primary}
                  style={styles.pinIndicator}
                />
              )}
              <TouchableOpacity
                onPress={() => setActionFile(item)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <MaterialIcons
                  name="more-vert"
                  size={22}
                  color={t.textTertiary}
                />
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      );
    },
    [
      colorScheme,
      textColor,
      markMode,
      selectedIds,
      pinnedIds,
      favoriteIds,
      handleFilePress,
      handleFileLongPress,
      handleToggleSelect,
    ],
  );

  // ── Grid item renderer ───────────────────────────────────────────────────
  const renderGridItem = useCallback(
    ({ item }: { item: QuickAccessFile }) => {
      const typeConfig = getFileTypeConfig(item.displayName);
      const isSelected = markMode && selectedIds.has(item.id);
      const isFav = favoriteIds.has(item.id);

      const getTypeBgColor = (color: string) => {
        if (color === colors.pdf) return "#FEE2E2";
        if (color === colors.word) return "#DBEAFE";
        if (color === colors.excel) return "#D1FAE5";
        if (color === colors.ppt) return "#FFEDD5";
        if (color === colors.image) return "#F3E8FF";
        if (color === colors.epub) return "#EDE9FE";
        return "#EEF2FF";
      };

      return (
        <Pressable
          style={({ pressed }) => [
            styles.gridCard,
            {
              backgroundColor: isSelected
                ? t.primary + "18"
                : pressed
                  ? t.card + "CC"
                  : t.card,
              borderColor: isSelected ? t.primary : t.borderLight,
              borderWidth: isSelected ? 2 : 1,
            },
          ]}
          onPress={() =>
            markMode ? handleToggleSelect(item.id) : handleFilePress(item)
          }
          onLongPress={() => handleFileLongPress(item)}
          delayLongPress={500}
        >
          {/* File icon area */}
          <View
            style={[
              styles.gridIconArea,
              { backgroundColor: getTypeBgColor(typeConfig.color) },
            ]}
          >
            <MaterialIcons
              name={typeConfig.icon as keyof typeof MaterialIcons.glyphMap}
              size={26}
              color={typeConfig.color}
            />
            {markMode && (
              <View
                style={[
                  styles.gridCheckbox,
                  isSelected && {
                    backgroundColor: t.primary,
                    borderColor: t.primary,
                  },
                ]}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                )}
              </View>
            )}
            {!markMode && isFav && (
              <MaterialIcons
                name="star"
                size={14}
                color="#F59E0B"
                style={styles.gridFavStar}
              />
            )}
          </View>
          {/* File name */}
          <Text
            style={[styles.gridFileName, { color: t.text }]}
            numberOfLines={2}
            ellipsizeMode="middle"
          >
            {item.displayName}
          </Text>
          <Text
            style={[styles.gridFileMeta, { color: t.textSecondary }]}
            numberOfLines={1}
          >
            {item.size ? formatFileSize(item.size) : typeConfig.label}
          </Text>
          {/* 3-dot */}
          {!markMode && (
            <TouchableOpacity
              style={styles.gridMoreBtn}
              onPress={() => setActionFile(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons
                name="more-horiz"
                size={20}
                color={t.textTertiary}
              />
            </TouchableOpacity>
          )}
        </Pressable>
      );
    },
    [
      t,
      markMode,
      selectedIds,
      favoriteIds,
      handleFilePress,
      handleFileLongPress,
      handleToggleSelect,
    ],
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <GradientView
        colors={
          mode === "dark" ? ["#1E293B", "#0F172A"] : ["#EEF2FF", "#F8FAFC"]
        }
        style={styles.emptyIconContainer}
      >
        <FolderOpen color={t.primary} size={38} strokeWidth={1.5} />
      </GradientView>

      <Text style={[styles.emptyDescription, { color: t.textSecondary }]}>
        Import files from your device or create new ones to make up your
        library.
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={handleImportFile}
        activeOpacity={0.8}
      >
        <GradientView
          colors={[colors.gradientStart, colors.gradientMid]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyButtonGradient}
        >
          <Plus color="white" size={20} strokeWidth={2.5} />
          <Text style={styles.emptyButtonText}>Import File</Text>
        </GradientView>
      </TouchableOpacity>
    </View>
  );

  const renderNoResults = () => (
    <View style={styles.emptyContainer}>
      <GradientView
        colors={
          mode === "dark" ? ["#1E293B", "#0F172A"] : ["#FEF2F2", "#F8FAFC"]
        }
        style={styles.emptyIconContainer}
      >
        <Search color={t.textSecondary} size={40} strokeWidth={1.5} />
      </GradientView>
      <Text style={[styles.emptyDescription, { color: t.textSecondary }]}>
        {hasActiveFilters
          ? "No files match the selected filters"
          : `No files matching "${searchQuery}"`}
      </Text>
      {hasActiveFilters && (
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={resetFilters}
          activeOpacity={0.8}
        >
          <GradientView
            colors={[colors.gradientStart, colors.gradientMid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.emptyButtonGradient}
          >
            <Ionicons name="refresh" size={20} color="white" />
            <Text style={styles.emptyButtonText}>Clear Filters</Text>
          </GradientView>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSkeletons = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.fileCard, { backgroundColor: t.border }]}>
          <View
            style={[
              styles.skeletonIcon,
              { backgroundColor: colors.backgroundTertiary },
            ]}
          />
          <View style={styles.fileContent}>
            <View
              style={[
                styles.skeletonName,
                { backgroundColor: colors.backgroundTertiary },
              ]}
            />
            <View
              style={[
                styles.skeletonMeta,
                { backgroundColor: colors.backgroundTertiary },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <PINGate screen="library">
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        {/* Fixed Header - Always visible */}
        <AppHeaderContainer>
        <View style={styles.headerContainer}>
          <GradientView
            colors={[
              colors.gradientStart,
              colors.gradientMid,
              colors.gradientEnd,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerTop}>
              {/* Left: back button (fixed width for centering) */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>

              {/* Center: title */}
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle}>Library</Text>
              </View>

              {/* Right: view toggle + import button */}
              <TouchableOpacity
                style={styles.headerViewToggle}
                onPress={toggleViewMode}
                activeOpacity={0.8}
              >
                {viewMode === "list" ? (
                  <Grid3x3 color="#FFFFFF" size={18} strokeWidth={2.5} />
                ) : (
                  <List color="#FFFFFF" size={18} strokeWidth={2.5} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerImportBtn}
                onPress={handleImportFile}
                activeOpacity={0.8}
              >
                <Plus color="#FFFFFF" size={18} strokeWidth={2.5} />
                <Text style={styles.headerImportBtnText}>Import</Text>
              </TouchableOpacity>
            </View>
          </GradientView>
        </View>
        </AppHeaderContainer>

        {/* Sticky Filter Chips - Always accessible below header */}
        <View style={[styles.filterSection, { backgroundColor, zIndex: 20 }]}>
          {/* Search Bar (shown when search button is pressed) */}
          {showSearchBar && (
            <View style={styles.searchBarRow}>
              <View
                style={[styles.searchBarExpanded, { backgroundColor: t.card }]}
              >
                <Search color={t.primary} size={20} strokeWidth={2.5} />
                <TextInput
                  placeholder="Search files..."
                  placeholderTextColor={t.textTertiary}
                  style={[styles.searchInput, { color: t.text }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
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
              <TouchableOpacity
                onPress={() => {
                  setShowSearchBar(false);
                  setSearchQuery("");
                }}
                style={styles.searchCloseButton}
              >
                <Text style={{ color: t.primary, fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Filter Row with Search Button + Scrollable Categories */}
          <View style={styles.filterRow}>
            {/* Static Search Button */}
            <TouchableOpacity
              style={[
                styles.searchButton,
                (showSearchBar || searchQuery.length > 0) &&
                  styles.searchButtonActive,
                {
                  backgroundColor:
                    showSearchBar || searchQuery.length > 0
                      ? t.primary
                      : colorScheme === "dark"
                        ? "#334155"
                        : "#F1F5F9",
                },
              ]}
              onPress={() => setShowSearchBar(!showSearchBar)}
            >
              <Search
                color={
                  showSearchBar || searchQuery.length > 0
                    ? "#FFFFFF"
                    : t.primary
                }
                size={18}
                strokeWidth={2.5}
              />
            </TouchableOpacity>

            {/* Type Filters - Scrollable */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsContainer}
            >
              {/* All Types */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  typeFilter === "all" && styles.filterChipActive,
                  {
                    backgroundColor:
                      typeFilter === "all"
                        ? t.primary
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#F1F5F9",
                    borderColor:
                      typeFilter === "all" ? t.primary : "transparent",
                  },
                ]}
                onPress={() => {
                  setTypeFilter("all");
                  setSourceFilter("all");
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: typeFilter === "all" ? "#FFFFFF" : t.textSecondary,
                    },
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>

              {/* PDF */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  typeFilter === "pdf" && styles.filterChipActive,
                  {
                    backgroundColor:
                      typeFilter === "pdf"
                        ? colors.pdf
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#FEE2E2",
                    borderColor:
                      typeFilter === "pdf" ? colors.pdf : "transparent",
                  },
                ]}
                onPress={() => {
                  setTypeFilter("pdf");
                  setSourceFilter("all");
                }}
              >
                <MaterialIcons
                  name="picture-as-pdf"
                  size={14}
                  color={typeFilter === "pdf" ? "#FFFFFF" : colors.pdf}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: typeFilter === "pdf" ? "#FFFFFF" : colors.pdf },
                  ]}
                >
                  PDF
                </Text>
              </TouchableOpacity>

              {/* DOCX */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  typeFilter === "docx" && styles.filterChipActive,
                  {
                    backgroundColor:
                      typeFilter === "docx"
                        ? colors.word
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#DBEAFE",
                    borderColor:
                      typeFilter === "docx" ? colors.word : "transparent",
                  },
                ]}
                onPress={() => {
                  setTypeFilter("docx");
                  setSourceFilter("all");
                }}
              >
                <MaterialIcons
                  name="description"
                  size={14}
                  color={typeFilter === "docx" ? "#FFFFFF" : colors.word}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: typeFilter === "docx" ? "#FFFFFF" : colors.word },
                  ]}
                >
                  DOCX
                </Text>
              </TouchableOpacity>

              {/* PPT */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  typeFilter === "ppt" && styles.filterChipActive,
                  {
                    backgroundColor:
                      typeFilter === "ppt"
                        ? colors.ppt
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#FFEDD5",
                    borderColor:
                      typeFilter === "ppt" ? colors.ppt : "transparent",
                  },
                ]}
                onPress={() => {
                  setTypeFilter("ppt");
                  setSourceFilter("all");
                }}
              >
                <MaterialIcons
                  name="slideshow"
                  size={14}
                  color={typeFilter === "ppt" ? "#FFFFFF" : colors.ppt}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: typeFilter === "ppt" ? "#FFFFFF" : colors.ppt },
                  ]}
                >
                  PPT
                </Text>
              </TouchableOpacity>

              {/* EPUB */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  typeFilter === "epub" && styles.filterChipActive,
                  {
                    backgroundColor:
                      typeFilter === "epub"
                        ? colors.epub
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#EDE9FE",
                    borderColor:
                      typeFilter === "epub" ? colors.epub : "transparent",
                  },
                ]}
                onPress={() => {
                  setTypeFilter("epub");
                  setSourceFilter("all");
                }}
              >
                <MaterialIcons
                  name="menu-book"
                  size={14}
                  color={typeFilter === "epub" ? "#FFFFFF" : colors.epub}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: typeFilter === "epub" ? "#FFFFFF" : colors.epub },
                  ]}
                >
                  EPUB
                </Text>
              </TouchableOpacity>

              {/* Favorites */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  sourceFilter === "favorites" && styles.filterChipActive,
                  {
                    backgroundColor:
                      sourceFilter === "favorites"
                        ? "#F59E0B"
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#FEF3C7",
                    borderColor:
                      sourceFilter === "favorites" ? "#F59E0B" : "transparent",
                  },
                ]}
                onPress={() => {
                  setSourceFilter(
                    sourceFilter === "favorites" ? "all" : "favorites",
                  );
                  setTypeFilter("all");
                }}
              >
                <MaterialIcons
                  name="star"
                  size={14}
                  color={sourceFilter === "favorites" ? "#FFFFFF" : "#F59E0B"}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color:
                        sourceFilter === "favorites" ? "#FFFFFF" : "#F59E0B",
                    },
                  ]}
                >
                  Favorites
                </Text>
              </TouchableOpacity>

              {/* Source: Created */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  sourceFilter === "created" && styles.filterChipActive,
                  {
                    backgroundColor:
                      sourceFilter === "created"
                        ? "#10B981"
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#D1FAE5",
                    borderColor:
                      sourceFilter === "created" ? "#10B981" : "transparent",
                  },
                ]}
                onPress={() => {
                  setSourceFilter(
                    sourceFilter === "created" ? "all" : "created",
                  );
                  setTypeFilter("all");
                }}
              >
                <MaterialIcons
                  name="add-circle"
                  size={14}
                  color={sourceFilter === "created" ? "#FFFFFF" : "#10B981"}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: sourceFilter === "created" ? "#FFFFFF" : "#10B981",
                    },
                  ]}
                >
                  Created
                </Text>
              </TouchableOpacity>

              {/* Source: Downloaded */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  sourceFilter === "downloaded" && styles.filterChipActive,
                  {
                    backgroundColor:
                      sourceFilter === "downloaded"
                        ? "#8B5CF6"
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#EDE9FE",
                    borderColor:
                      sourceFilter === "downloaded" ? "#8B5CF6" : "transparent",
                  },
                ]}
                onPress={() => {
                  setSourceFilter(
                    sourceFilter === "downloaded" ? "all" : "downloaded",
                  );
                  setTypeFilter("all");
                }}
              >
                <MaterialIcons
                  name="download"
                  size={14}
                  color={sourceFilter === "downloaded" ? "#FFFFFF" : "#8B5CF6"}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color:
                        sourceFilter === "downloaded" ? "#FFFFFF" : "#8B5CF6",
                    },
                  ]}
                >
                  Downloaded
                </Text>
              </TouchableOpacity>

              {/* Source: Shared */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  sourceFilter === "shared" && styles.filterChipActive,
                  {
                    backgroundColor:
                      sourceFilter === "shared"
                        ? "#F59E0B"
                        : colorScheme === "dark"
                          ? "#334155"
                          : "#FEF3C7",
                    borderColor:
                      sourceFilter === "shared" ? "#F59E0B" : "transparent",
                  },
                ]}
                onPress={() => {
                  setSourceFilter(sourceFilter === "shared" ? "all" : "shared");
                  setTypeFilter("all");
                }}
              >
                <MaterialIcons
                  name="share"
                  size={14}
                  color={sourceFilter === "shared" ? "#FFFFFF" : "#F59E0B"}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: sourceFilter === "shared" ? "#FFFFFF" : "#F59E0B",
                    },
                  ]}
                >
                  Shared
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={resetFilters}
            >
              <Ionicons name="close-circle" size={16} color={t.error} />
              <Text style={[styles.clearFiltersText, { color: t.error }]}>
                Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Mark Mode Toolbar */}
        {markMode && (
          <View
            style={[
              styles.markToolbar,
              { backgroundColor: t.card, borderBottomColor: t.border },
            ]}
          >
            <TouchableOpacity
              onPress={handleExitMarkMode}
              style={styles.markToolbarBtn}
            >
              <Ionicons name="close" size={20} color={t.text} />
              <Text style={[styles.markToolbarText, { color: t.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.markCount, { color: t.text }]}>
              {selectedIds.size} selected
            </Text>
            <View style={styles.markToolbarRight}>
              <TouchableOpacity
                onPress={handleBulkShare}
                disabled={selectedIds.size === 0}
                style={[
                  styles.markToolbarBtn,
                  { opacity: selectedIds.size === 0 ? 0.4 : 1 },
                ]}
              >
                <Ionicons
                  name="share-outline"
                  size={20}
                  color={t.primary}
                />
                <Text style={[styles.markToolbarText, { color: t.primary }]}>
                  Share
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBulkDelete}
                disabled={selectedIds.size === 0}
                style={[
                  styles.markToolbarBtn,
                  { opacity: selectedIds.size === 0 ? 0.4 : 1 },
                ]}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={colors.error}
                />
                <Text
                  style={[styles.markToolbarText, { color: colors.error }]}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          renderSkeletons()
        ) : filteredFiles.length === 0 ? (
          <View style={{ flex: 1 }}>
            {searchQuery || hasActiveFilters
              ? renderNoResults()
              : renderEmptyState()}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              key={viewMode} // Force re-mount when switching layout
              data={filteredFiles}
              keyExtractor={keyExtractor}
              renderItem={viewMode === "grid" ? renderGridItem : renderFileItem}
              {...(viewMode === "list"
                ? { getItemLayout }
                : { numColumns: 2, columnWrapperStyle: styles.gridRow })}
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={true}
              contentContainerStyle={
                viewMode === "grid" ? styles.gridContent : styles.listContent
              }
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                />
              }
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.listHeaderContainer}>
                  {/* Files Count & Clear All */}
                  {files.length > 0 && !searchQuery && !hasActiveFilters && (
                    <View style={styles.filesHeader}>
                      <Text
                        style={[styles.filesCount, { color: t.textSecondary }]}
                      >
                        {filteredFiles.length} file
                        {filteredFiles.length !== 1 ? "s" : ""}
                      </Text>
                      <TouchableOpacity onPress={handleClearAll}>
                        <Text style={[styles.clearAllText, { color: t.error }]}>
                          Clear All
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Show filtered count when filters are active */}
                  {hasActiveFilters && (
                    <View style={styles.filesHeader}>
                      <Text
                        style={[styles.filesCount, { color: t.textSecondary }]}
                      >
                        {filteredFiles.length} of {files.length} file
                        {files.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                </View>
              }
            />
          </View>
        )}
        {/* ── Action Sheet Modal ───────────────────────────────────────────── */}
        <Modal
          visible={actionFile !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setActionFile(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            onPress={() => setActionFile(null)}
            activeOpacity={1}
          >
            <View
              style={[styles.actionSheet, { backgroundColor: t.card }]}
              onStartShouldSetResponder={() => true}
            >
              {/* Handle bar */}
              <View
                style={[
                  styles.actionSheetHandle,
                  { backgroundColor: t.border },
                ]}
              />
              {/* File name */}
              <Text
                style={[styles.actionSheetTitle, { color: t.text }]}
                numberOfLines={2}
              >
                {actionFile?.displayName}
              </Text>

              {/* Open */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderBottomColor: t.borderLight },
                ]}
                onPress={() => {
                  const f = actionFile!;
                  setActionFile(null);
                  handleFilePress(f);
                }}
              >
                <MaterialIcons name="open-in-new" size={22} color={t.text} />
                <Text style={[styles.actionSheetItemText, { color: t.text }]}>
                  Open
                </Text>
              </TouchableOpacity>

              {/* Share */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderBottomColor: t.borderLight },
                ]}
                onPress={() => handleActionShare(actionFile!)}
              >
                <MaterialIcons name="share" size={22} color={t.text} />
                <Text style={[styles.actionSheetItemText, { color: t.text }]}>
                  Share
                </Text>
              </TouchableOpacity>

              {/* Add to Favorites / Remove */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderBottomColor: t.borderLight },
                ]}
                onPress={() => handleToggleFavorite(actionFile!)}
              >
                <MaterialIcons
                  name={
                    favoriteIds.has(actionFile?.id ?? "")
                      ? "star"
                      : "star-outline"
                  }
                  size={22}
                  color="#F59E0B"
                />
                <Text style={[styles.actionSheetItemText, { color: t.text }]}>
                  {favoriteIds.has(actionFile?.id ?? "")
                    ? "Remove from Favorites"
                    : "Add to Favorites"}
                </Text>
              </TouchableOpacity>

              {/* Move to Folder */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderBottomColor: t.borderLight },
                ]}
                onPress={() => handleMoveToFolder(actionFile!)}
              >
                <MaterialIcons name="folder" size={22} color={t.text} />
                <Text style={[styles.actionSheetItemText, { color: t.text }]}>
                  Move to Folder
                </Text>
              </TouchableOpacity>

              {/* Rename */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderBottomColor: t.borderLight },
                ]}
                onPress={() => handleRenameFile(actionFile!)}
              >
                <MaterialIcons name="edit" size={22} color={t.text} />
                <Text style={[styles.actionSheetItemText, { color: t.text }]}>
                  Rename
                </Text>
              </TouchableOpacity>

              {/* File Info */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderBottomColor: t.borderLight },
                ]}
                onPress={() => handleFileInfo(actionFile!)}
              >
                <MaterialIcons name="info-outline" size={22} color={t.text} />
                <Text style={[styles.actionSheetItemText, { color: t.text }]}>
                  File Info
                </Text>
              </TouchableOpacity>

              {/* Delete */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderBottomColor: t.borderLight },
                ]}
                onPress={() => handleActionDelete(actionFile!)}
              >
                <MaterialIcons
                  name="delete-outline"
                  size={22}
                  color={colors.error}
                />
                <Text
                  style={[styles.actionSheetItemText, { color: colors.error }]}
                >
                  Delete
                </Text>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity
                style={styles.actionSheetCancel}
                onPress={() => setActionFile(null)}
              >
                <Text style={[styles.actionSheetCancelText, { color: t.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Folder Picker Modal ─────────────────────────────────────────── */}
        <Modal
          visible={showFolderPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFolderPicker(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            onPress={() => setShowFolderPicker(false)}
            activeOpacity={1}
          >
            <View
              style={[styles.folderPickerModal, { backgroundColor: t.card }]}
              onStartShouldSetResponder={() => true}
            >
              <Text style={[styles.folderPickerTitle, { color: t.text }]}>
                Move to Folder
              </Text>

              <ScrollView style={styles.folderPickerList}>
                {availableFolders.length === 0 ? (
                  <TouchableOpacity
                    style={styles.folderPickerEmptyBtn}
                    onPress={() => {
                      setShowFolderPicker(false);
                      router.push("/folders");
                    }}
                  >
                    <Text
                      style={[
                        styles.folderPickerEmpty,
                        { color: t.textSecondary },
                      ]}
                    >
                      No created folders.{" "}
                      <Text style={{ color: t.primary, fontWeight: "700" }}>
                        Create folder?
                      </Text>
                    </Text>
                  </TouchableOpacity>
                ) : (
                  availableFolders.map((folder) => (
                    <TouchableOpacity
                      key={folder.id}
                      style={[
                        styles.folderPickerItem,
                        { borderBottomColor: t.borderLight },
                      ]}
                      onPress={() => handleSelectFolder(folder.id)}
                    >
                      <Ionicons
                        name={(folder.icon as any) || "folder"}
                        size={20}
                        color={folder.color}
                      />
                      <Text
                        style={[
                          styles.folderPickerItemText,
                          { color: t.text },
                        ]}
                        numberOfLines={1}
                      >
                        {folder.name}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity
                style={[
                  styles.folderPickerCancel,
                  { backgroundColor: mode === "dark" ? "#334155" : "#F1F5F9" },
                ]}
                onPress={() => setShowFolderPicker(false)}
              >
                <Text
                  style={[styles.folderPickerCancelText, { color: t.text }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Toast ─────────────────────────────────────────────────────── */}
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
  container: {
    flex: 1,
  },
  headerContainer: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 20 : 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 48,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  headerImportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    minWidth: 48,
    justifyContent: "center",
  },
  headerImportBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFF",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.85)",
    fontWeight: "600",
    // marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 16,
    paddingHorizontal: 18,
    height: 48,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  importContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  importButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  importButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 10,
  },
  importButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  filesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  filesCount: {
    fontSize: 14,
    fontWeight: "600",
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 150,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  expiredBorder: {
    borderWidth: 2,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fileContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  fileMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  expiredText: {
    fontSize: 12,
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
    marginBottom: 18,
    marginTop: -120,
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
  skeletonContainer: {
    paddingHorizontal: 10,
    paddingVertical: 20,
  },
  skeletonIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
  },
  skeletonName: {
    width: "70%",
    height: 18,
    borderRadius: 6,
  },
  skeletonMeta: {
    width: "50%",
    height: 14,
    borderRadius: 6,
    marginTop: 10,
  },
  // Filter styles
  filterSection: {
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.15)",
  },
  collapsibleContainer: {
    overflow: "hidden",
    paddingTop: 12,
  },
  animatedImportContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  listHeaderContainer: {
    // Container for file count headers (no extra padding needed)
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipsContainer: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 20,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
    borderWidth: 1,
  },
  filterChipActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  clearFiltersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  clearFiltersText: {
    fontSize: 13,
    fontWeight: "600",
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  searchButtonActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  searchBarExpanded: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  searchCloseButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  // ── Mark toolbar ─────────────────────────────────────────────────────────
  markToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  markToolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  markToolbarText: {
    fontSize: 14,
    fontWeight: "600",
  },
  markCount: {
    fontSize: 14,
    fontWeight: "700",
  },
  markToolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  // ── Checkbox (mark mode) ──────────────────────────────────────────────────
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  // ── Pin indicator ─────────────────────────────────────────────────────────
  pinIndicator: {
    marginRight: 2,
  },
  chevronRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // ── Action sheet ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  actionSheet: {
    borderRadius: 10,
    paddingBottom: 16,
    paddingTop: 5,
    paddingHorizontal: 16,
    marginRight: 16,
    marginBottom: 20,
    width: SCREEN_WIDTH * 0.52,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  actionSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionSheetItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  actionSheetCancel: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionSheetCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // ── Header view toggle ──────────────────────────────────────────────────
  headerViewToggle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  // ── Grid view styles ──────────────────────────────────────────────────
  gridContent: {
    paddingHorizontal: 15,
    paddingBottom: 150,
  },
  gridRow: {
    justifyContent: "space-between",
    paddingHorizontal: 0,
  },
  gridCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    paddingBottom: 8,
  },
  gridIconArea: {
    width: "100%",
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  gridCheckbox: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  gridFavStar: {
    position: "absolute",
    top: 6,
    left: 6,
  },
  gridFileName: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    marginTop: 6,
  },
  gridFileMeta: {
    fontSize: 10,
    fontWeight: "500",
    paddingHorizontal: 8,
    marginTop: 2,
  },
  gridMoreBtn: {
    position: "absolute",
    bottom: 6,
    right: 6,
    padding: 4,
  },

  // ── Folder picker modal ───────────────────────────────────────────────
  folderPickerModal: {
    borderRadius: 20,
    padding: 20,
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 400,
    maxHeight: "60%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  folderPickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  folderPickerList: {
    maxHeight: 300,
  },
  folderPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderPickerItemText: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  folderPickerEmpty: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
    lineHeight: 22,
  },
  folderPickerEmptyBtn: {
    paddingVertical: 20,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  folderPickerCancel: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  folderPickerCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // ── Toast ───────────────────────────────────────────────────────────────
  toast: {
    position: "absolute",
    bottom: 100,
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
});
