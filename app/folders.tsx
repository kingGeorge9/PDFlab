/**
 * Folders Screen
 * Full folder management system with nested folder navigation,
 * breadcrumb trail, file display, and CRUD operations.
 */

import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { GradientView } from "@/components/GradientView";
import { colors } from "@/constants/theme";
import { useFileIndex } from "@/hooks/useFileIndex";
import {
  type QuickAccessFile,
  formatFileSize,
  formatRelativeTime,
  getFileTypeConfig,
  openWithSystemApp,
  showOpenFailedAlert,
  useQuickAccess,
} from "@/services/document-manager";
import {
  addToFavorites,
  getFavorites,
  removeFromFavorites,
} from "@/services/fileService";
import {
  FOLDER_COLORS,
  type FileFolderMap,
  type Folder,
  createFolder,
  deleteFolder,
  getAllFolders,
  getFileFolderMap,
  getFolderPath,
  moveFileToFolder,
  moveFilesToFolder,
  removeFileFromAllFolders,
  updateFolder,
} from "@/services/folderService";
import { recycleFile } from "@/services/recycleBinService";
import { useTheme } from "@/services/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import {
  ChevronRight,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Grid3x3,
  Home,
  List,
  Search,
} from "lucide-react-native";
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
  KeyboardAvoidingView,
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
const FOLDER_VIEW_MODE_KEY = "@pdflab_folder_view_mode";

type ViewMode = "list" | "grid";

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function FoldersScreen() {
  const { colors: t, mode } = useTheme();

  // ── Navigation state ────────────────────────────────────────────────────
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);

  // ── Data ────────────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<Folder[]>([]);
  const [fileFolderMap, setFileFolderMap] = useState<FileFolderMap>({});
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // ── Modals ──────────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [actionFolder, setActionFolder] = useState<Folder | null>(null);
  const [actionFile, setActionFile] = useState<QuickAccessFile | null>(null);

  // ── View mode ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // ── Add files modal ──────────────────────────────────────────────────────
  const [showAddFiles, setShowAddFiles] = useState(false);
  const [addFilesSearch, setAddFilesSearch] = useState("");
  const [addFilesSelected, setAddFilesSelected] = useState<Set<string>>(
    new Set(),
  );

  // ── Search bar visibility ────────────────────────────────────────────────
  const [showSearchBar, setShowSearchBar] = useState(false);

  // ── Toast ───────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── File hooks ──────────────────────────────────────────────────────────
  const {
    files: legacyFiles,
    removeFile,
    updateLastOpened,
    refresh: refreshLegacy,
  } = useQuickAccess();
  const {
    files: indexFiles,
    refresh: refreshIndex,
    updateLastOpened: updateIndexLastOpened,
    removeFile: removeIndexFile,
  } = useFileIndex();

  // Combine files from both sources
  const allFiles = useMemo(() => {
    const uriMap = new Map<string, QuickAccessFile>();
    for (const file of legacyFiles) uriMap.set(file.uri, file);
    for (const indexFile of indexFiles) {
      if (!uriMap.has(indexFile.uri)) {
        uriMap.set(indexFile.uri, {
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
        } as QuickAccessFile);
      }
    }
    return Array.from(uriMap.values());
  }, [legacyFiles, indexFiles]);

  // ── Data loading ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [allFolders, map, favs] = await Promise.all([
      getAllFolders(),
      getFileFolderMap(),
      getFavorites(),
    ]);
    setFolders([...allFolders]); // always new array reference so React re-renders
    setFileFolderMap({ ...map }); // always new object reference
    setFavoriteIds(favs);
  }, []);

  const loadBreadcrumbs = useCallback(async () => {
    if (currentFolderId) {
      const path = await getFolderPath(currentFolderId);
      setBreadcrumbs(path);
    } else {
      setBreadcrumbs([]);
    }
  }, [currentFolderId]);

  useEffect(() => {
    loadData();
    AsyncStorage.getItem(FOLDER_VIEW_MODE_KEY).then((v) => {
      if (v === "grid" || v === "list") setViewMode(v);
    });
  }, [loadData]);

  useEffect(() => {
    loadBreadcrumbs();
  }, [loadBreadcrumbs]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ── Toast dismiss ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!toastMsg) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2500);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toastMsg]);

  // ── Derived data ────────────────────────────────────────────────────────
  const currentSubfolders = useMemo(() => {
    return folders
      .filter((f) => f.parentId === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, currentFolderId]);

  const currentFiles = useMemo(() => {
    // Root level shows only folders — no files
    if (currentFolderId === null) return [];
    return allFiles
      .filter((file) => fileFolderMap[file.id] === currentFolderId)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }, [allFiles, fileFolderMap, currentFolderId]);

  const filteredSubfolders = useMemo(() => {
    if (!searchQuery.trim()) return currentSubfolders;
    const q = searchQuery.toLowerCase();
    return currentSubfolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [currentSubfolders, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return currentFiles;
    const q = searchQuery.toLowerCase();
    return currentFiles.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [currentFiles, searchQuery]);

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) ?? null,
    [folders, currentFolderId],
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshLegacy(), refreshIndex(), loadData()]);
    setRefreshing(false);
  }, [refreshLegacy, refreshIndex, loadData]);

  const handleNavigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearchQuery("");
    setShowSearchBar(false);
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(name, currentFolderId, newFolderColor);
      setShowCreateModal(false);
      setNewFolderName("");
      setNewFolderColor(FOLDER_COLORS[0]);
      await loadData();
      setToastMsg(`Folder "${name}" created`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to create folder");
    }
  }, [newFolderName, newFolderColor, currentFolderId, loadData]);

  const handleRenameFolder = useCallback(async () => {
    if (!editingFolder) return;
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await updateFolder(editingFolder.id, { name });
      setEditingFolder(null);
      setNewFolderName("");
      await loadData();
      setToastMsg(`Renamed to "${name}"`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to rename folder");
    }
  }, [editingFolder, newFolderName, loadData]);

  const handleDeleteFolder = useCallback(
    (folder: Folder) => {
      setActionFolder(null);
      Alert.alert(
        "Delete Folder",
        `Delete "${folder.name}"? Files inside will be moved to the parent folder.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteFolder(folder.id);
                await loadData();
                setToastMsg(`"${folder.name}" deleted`);
              } catch (e: any) {
                Alert.alert("Error", e?.message || "Failed to delete folder");
              }
            },
          },
        ],
      );
    },
    [loadData],
  );

  const handleRemoveFileFromFolder = useCallback(
    async (file: QuickAccessFile) => {
      setActionFile(null);
      try {
        await moveFileToFolder(file.id, null);
        await loadData();
        setToastMsg(`"${file.displayName}" removed from folder`);
      } catch {
        setToastMsg("Failed to remove file from folder");
      }
    },
    [loadData],
  );

  const handleFilePress = useCallback(
    async (file: QuickAccessFile) => {
      const extension = file.extension?.toLowerCase();
      const isImage = ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(
        extension,
      );
      const isPdf = extension === "pdf";
      const isDocx = extension === "docx" || extension === "doc";
      const isEpub = extension === "epub";

      await updateLastOpened(file.id);
      updateIndexLastOpened(file.id).catch(console.error);

      if (isImage) {
        router.push({
          pathname: "/image-viewer",
          params: {
            uri: file.uri,
            name: file.displayName,
            type: file.mimeType || "image/jpeg",
          },
        });
      } else if (isPdf) {
        router.push({
          pathname: "/pdf-viewer",
          params: { uri: file.uri, name: file.displayName },
        });
      } else if (isDocx) {
        (router as any).push({
          pathname: "/docx-viewer",
          params: { uri: file.uri, name: file.displayName },
        });
      } else if (isEpub) {
        router.push({
          pathname: "/epub-viewer",
          params: { uri: file.uri, name: file.displayName },
        });
      } else {
        const result = await openWithSystemApp({
          uri: file.uri,
          mimeType: file.mimeType,
          displayName: file.displayName,
        });
        if (!result.success)
          showOpenFailedAlert(file.displayName, result.error);
      }
    },
    [updateLastOpened, updateIndexLastOpened],
  );

  const handleShareFile = useCallback(async (file: QuickAccessFile) => {
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

  const handleDeleteFile = useCallback(
    (file: QuickAccessFile) => {
      setActionFile(null);

      if (currentFolderId !== null) {
        // Inside a folder: spec rule — file stays in Library, NOT recycled
        Alert.alert(
          "Remove from Folder",
          `Remove "${file.displayName}" from this folder? The file will remain in your Library.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Remove",
              style: "destructive",
              onPress: async () => {
                try {
                  await moveFileToFolder(file.id, null);
                  await loadData();
                  setToastMsg("Removed from folder");
                } catch (err: any) {
                  setToastMsg(`Failed${err?.message ? `: ${err.message}` : "."}`);
                }
              },
            },
          ],
        );
      } else {
        // Root / no folder: standard library delete → send to Recycle Bin
        Alert.alert(
          "Delete File",
          `Delete "${file.displayName}"? It will be moved to the Recycle Bin.`,
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
                    type: file.extension || "unknown",
                    mimeType: file.mimeType || "application/octet-stream",
                    source: file.source,
                  });
                  removeFile(file.id);
                  await removeIndexFile(file.id);
                  await loadData();
                } catch (err: any) {
                  setToastMsg(`Delete failed${err?.message ? `: ${err.message}` : "."}`);
                }
              },
            },
          ],
        );
      }
    },
    [currentFolderId, loadData, removeFile, removeIndexFile],
  );

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

  // ── View mode toggle ─────────────────────────────────────────────────────
  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === "list" ? "grid" : "list";
      AsyncStorage.setItem(FOLDER_VIEW_MODE_KEY, next).catch(console.error);
      return next;
    });
  }, []);

  // ── Files available to add (not already in this folder) ─────────────────
  const availableFilesToAdd = useMemo(() => {
    if (!currentFolderId) return [];
    return allFiles
      .filter((file) => fileFolderMap[file.id] !== currentFolderId)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }, [allFiles, fileFolderMap, currentFolderId]);

  const filteredAddFiles = useMemo(() => {
    if (!addFilesSearch.trim()) return availableFilesToAdd;
    const q = addFilesSearch.toLowerCase();
    return availableFilesToAdd.filter((f) =>
      f.displayName.toLowerCase().includes(q),
    );
  }, [availableFilesToAdd, addFilesSearch]);

  // ── Add selected files to current folder ────────────────────────────────
  const handleConfirmAddFiles = useCallback(async () => {
    if (!currentFolderId || addFilesSelected.size === 0) return;
    try {
      await moveFilesToFolder(Array.from(addFilesSelected), currentFolderId);
      await loadData();
      setToastMsg(
        `${addFilesSelected.size} file${addFilesSelected.size > 1 ? "s" : ""} added`,
      );
      setShowAddFiles(false);
      setAddFilesSelected(new Set());
      setAddFilesSearch("");
    } catch {
      setToastMsg("Failed to add files");
    }
  }, [currentFolderId, addFilesSelected, loadData]);

  const handleToggleAddFileSelect = useCallback((fileId: string) => {
    setAddFilesSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  const renderFolderItem = useCallback(
    (folder: Folder) => {
      const fileCount = Object.values(fileFolderMap).filter(
        (fid) => fid === folder.id,
      ).length;
      const subCount = folders.filter((f) => f.parentId === folder.id).length;

      return (
        <Pressable
          key={folder.id}
          style={({ pressed }) => [
            s.folderCard,
            {
              backgroundColor: pressed ? t.card + "CC" : t.card,
              borderColor: t.borderLight,
            },
          ]}
          onPress={() => handleNavigateToFolder(folder.id)}
          onLongPress={() => setActionFolder(folder)}
          delayLongPress={500}
        >
          <View
            style={[s.folderIcon, { backgroundColor: folder.color + "20" }]}
          >
            <Ionicons
              name={(folder.icon as any) || "folder"}
              size={24}
              color={folder.color}
            />
          </View>
          <View style={s.folderContent}>
            <Text style={[s.folderName, { color: t.text }]} numberOfLines={1}>
              {folder.name}
            </Text>
            <Text style={[s.folderMeta, { color: t.textSecondary }]}>
              {fileCount} file{fileCount !== 1 ? "s" : ""}
              {subCount > 0
                ? ` · ${subCount} folder${subCount !== 1 ? "s" : ""}`
                : ""}
            </Text>
          </View>
          <ChevronRight color={t.textTertiary} size={20} />
        </Pressable>
      );
    },
    [t, folders, fileFolderMap, handleNavigateToFolder],
  );

  const renderFileItem = useCallback(
    (file: QuickAccessFile) => {
      const typeConfig = getFileTypeConfig(file.displayName);
      const metaParts: string[] = [];
      if (file.size) metaParts.push(formatFileSize(file.size));
      metaParts.push(typeConfig.label);
      if (file.lastOpenedAt)
        metaParts.push(formatRelativeTime(file.lastOpenedAt));

      const getTypeBgColor = (color: string) => {
        if (color === colors.pdf) return "#FEE2E2";
        if (color === colors.word) return "#DBEAFE";
        if (color === colors.excel) return "#D1FAE5";
        if (color === colors.ppt) return "#FFEDD5";
        if (color === colors.image) return "#F3E8FF";
        if (color === colors.epub) return "#EDE9FE";
        return "#EEF2FF";
      };

      const isFav = favoriteIds.has(file.id);

      return (
        <Pressable
          key={file.id}
          style={({ pressed }) => [
            s.fileCard,
            {
              backgroundColor: pressed ? t.card + "CC" : t.card,
              borderColor: t.borderLight,
            },
          ]}
          onPress={() => handleFilePress(file)}
          onLongPress={() => setActionFile(file)}
          delayLongPress={500}
        >
          <View
            style={[
              s.fileIcon,
              { backgroundColor: getTypeBgColor(typeConfig.color) },
            ]}
          >
            <MaterialIcons
              name={typeConfig.icon as keyof typeof MaterialIcons.glyphMap}
              size={22}
              color={typeConfig.color}
            />
          </View>
          <View style={s.fileContent}>
            <Text
              style={[s.fileName, { color: t.text }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {file.displayName}
            </Text>
            <Text style={[s.fileMeta, { color: t.textSecondary }]}>
              {metaParts.join(" · ")}
            </Text>
          </View>
          {isFav && (
            <MaterialIcons
              name="star"
              size={18}
              color="#F59E0B"
              style={{ marginRight: 4 }}
            />
          )}
          <TouchableOpacity
            onPress={() => setActionFile(file)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialIcons name="more-vert" size={22} color={t.textTertiary} />
          </TouchableOpacity>
        </Pressable>
      );
    },
    [t, favoriteIds, handleFilePress],
  );

  const renderGridFolderItem = useCallback(
    (folder: Folder) => {
      const fileCount = Object.values(fileFolderMap).filter(
        (fid) => fid === folder.id,
      ).length;
      const subCount = folders.filter((f) => f.parentId === folder.id).length;

      return (
        <Pressable
          key={folder.id}
          style={({ pressed }) => [
            s.gridCard,
            {
              backgroundColor: pressed ? t.card + "CC" : t.card,
              borderColor: t.borderLight,
            },
          ]}
          onPress={() => handleNavigateToFolder(folder.id)}
          onLongPress={() => setActionFolder(folder)}
          delayLongPress={500}
        >
          <View
            style={[s.gridIconArea, { backgroundColor: folder.color + "20" }]}
          >
            <Ionicons
              name={(folder.icon as any) || "folder"}
              size={28}
              color={folder.color}
            />
          </View>
          <Text style={[s.gridFileName, { color: t.text }]} numberOfLines={2}>
            {folder.name}
          </Text>
          <Text
            style={[s.gridFileMeta, { color: t.textSecondary }]}
            numberOfLines={1}
          >
            {fileCount} file{fileCount !== 1 ? "s" : ""}
            {subCount > 0
              ? ` · ${subCount} folder${subCount !== 1 ? "s" : ""}`
              : ""}
          </Text>
          <TouchableOpacity
            style={s.gridMoreBtn}
            onPress={() => setActionFolder(folder)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="more-horiz" size={20} color={t.textTertiary} />
          </TouchableOpacity>
        </Pressable>
      );
    },
    [t, folders, fileFolderMap, handleNavigateToFolder],
  );

  const renderGridFileItem = useCallback(
    (file: QuickAccessFile) => {
      const typeConfig = getFileTypeConfig(file.displayName);
      const isFav = favoriteIds.has(file.id);

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
          key={file.id}
          style={({ pressed }) => [
            s.gridCard,
            {
              backgroundColor: pressed ? t.card + "CC" : t.card,
              borderColor: t.borderLight,
            },
          ]}
          onPress={() => handleFilePress(file)}
          onLongPress={() => setActionFile(file)}
          delayLongPress={500}
        >
          <View
            style={[
              s.gridIconArea,
              { backgroundColor: getTypeBgColor(typeConfig.color) },
            ]}
          >
            <MaterialIcons
              name={typeConfig.icon as keyof typeof MaterialIcons.glyphMap}
              size={26}
              color={typeConfig.color}
            />
            {isFav && (
              <MaterialIcons
                name="star"
                size={14}
                color="#F59E0B"
                style={s.gridFavStar}
              />
            )}
          </View>
          <Text
            style={[s.gridFileName, { color: t.text }]}
            numberOfLines={2}
            ellipsizeMode="middle"
          >
            {file.displayName}
          </Text>
          <Text
            style={[s.gridFileMeta, { color: t.textSecondary }]}
            numberOfLines={1}
          >
            {file.size ? formatFileSize(file.size) : typeConfig.label}
          </Text>
          <TouchableOpacity
            style={s.gridMoreBtn}
            onPress={() => setActionFile(file)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="more-horiz" size={20} color={t.textTertiary} />
          </TouchableOpacity>
        </Pressable>
      );
    },
    [t, favoriteIds, handleFilePress],
  );

  const data = useMemo(() => {
    const items: { type: "folder" | "file"; item: any }[] = [];
    for (const f of filteredSubfolders) items.push({ type: "folder", item: f });
    for (const f of filteredFiles) items.push({ type: "file", item: f });
    return items;
  }, [filteredSubfolders, filteredFiles]);

  const isEmpty = data.length === 0;
  const folderTitle = currentFolder?.name ?? "Folders";

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.background }]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <AppHeaderContainer>
        <View style={s.headerContainer}>
          <GradientView
            colors={
              currentFolder
                ? [
                    currentFolder.color,
                    currentFolder.color + "CC",
                    currentFolder.color + "99",
                  ]
                : [colors.gradientStart, colors.gradientMid, colors.gradientEnd]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.header}
          >
            <View style={s.headerTop}>
              <TouchableOpacity
                style={s.backButton}
                onPress={() => {
                  if (currentFolderId) {
                    handleNavigateToFolder(currentFolder?.parentId ?? null);
                  } else {
                    router.back();
                  }
                }}
              >
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={s.headerTitleContainer}>
                <Text style={s.headerTitle} numberOfLines={1}>
                  {folderTitle}
                </Text>
              </View>
              <TouchableOpacity
                style={s.headerViewToggle}
                onPress={toggleViewMode}
                activeOpacity={0.8}
              >
                {viewMode === "list" ? (
                  <Grid3x3 color="#FFFFFF" size={18} strokeWidth={2.5} />
                ) : (
                  <List color="#FFFFFF" size={18} strokeWidth={2.5} />
                )}
              </TouchableOpacity>
              {currentFolderId && (
                <TouchableOpacity
                  style={s.headerIconBtn}
                  onPress={() => {
                    setAddFilesSearch("");
                    setAddFilesSelected(new Set());
                    setShowAddFiles(true);
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="Add files to folder"
                >
                  <FilePlus color="#FFFFFF" size={20} strokeWidth={2.5} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.headerIconBtn}
                onPress={() => {
                  setNewFolderName("");
                  setNewFolderColor(FOLDER_COLORS[0]);
                  setShowCreateModal(true);
                }}
                activeOpacity={0.8}
                accessibilityLabel="New folder"
              >
                <FolderPlus color="#FFFFFF" size={20} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          </GradientView>
        </View>
      </AppHeaderContainer>

      {/* ── Breadcrumbs ────────────────────────────────────────────────── */}
      {breadcrumbs.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[
            s.breadcrumbBar,
            { backgroundColor: t.background, borderBottomColor: t.borderLight },
          ]}
          contentContainerStyle={s.breadcrumbContent}
        >
          <TouchableOpacity
            style={s.breadcrumbItem}
            onPress={() => handleNavigateToFolder(null)}
          >
            <Home color={t.primary} size={16} />
            <Text style={[s.breadcrumbText, { color: t.primary }]}>
              Folders
            </Text>
          </TouchableOpacity>
          {breadcrumbs.map((bc, idx) => (
            <React.Fragment key={bc.id}>
              <ChevronRight color={t.textTertiary} size={14} />
              <TouchableOpacity
                style={s.breadcrumbItem}
                onPress={() => handleNavigateToFolder(bc.id)}
              >
                <Text
                  style={[
                    s.breadcrumbText,
                    {
                      color:
                        idx === breadcrumbs.length - 1 ? t.text : t.primary,
                      fontWeight:
                        idx === breadcrumbs.length - 1 ? "700" : "500",
                    },
                  ]}
                  numberOfLines={1}
                >
                  {bc.name}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </ScrollView>
      )}

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <View style={[s.searchSection, { backgroundColor: t.background }]}>
        <View
          style={[
            s.searchBar,
            { backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9" },
          ]}
        >
          <Search color={t.textTertiary} size={18} />
          <TextInput
            placeholder="Search folders & files..."
            placeholderTextColor={t.textTertiary}
            style={[s.searchInput, { color: t.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color={t.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <View style={s.emptyContainer}>
          <GradientView
            colors={
              mode === "dark" ? ["#1E293B", "#0F172A"] : ["#EEF2FF", "#F8FAFC"]
            }
            style={s.emptyIconBg}
          >
            <FolderOpen color={t.primary} size={38} strokeWidth={1.5} />
          </GradientView>
          <Text style={[s.emptyText, { color: t.textSecondary }]}>
            {currentFolderId
              ? "This folder is empty. Add files using the button below."
              : "No folders yet. Create one to organize your files."}
          </Text>
          {currentFolderId ? (
            <TouchableOpacity
              style={s.emptyButton}
              onPress={() => {
                setAddFilesSearch("");
                setAddFilesSelected(new Set());
                setShowAddFiles(true);
              }}
              activeOpacity={0.8}
            >
              <GradientView
                colors={[colors.gradientStart, colors.gradientMid]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.emptyButtonGradient}
              >
                <FilePlus color="white" size={20} strokeWidth={2.5} />
                <Text style={s.emptyButtonText}>Add Files</Text>
              </GradientView>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.emptyButton}
              onPress={() => {
                setNewFolderName("");
                setNewFolderColor(FOLDER_COLORS[0]);
                setShowCreateModal(true);
              }}
              activeOpacity={0.8}
            >
              <GradientView
                colors={[colors.gradientStart, colors.gradientMid]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.emptyButtonGradient}
              >
                <FolderPlus color="white" size={20} strokeWidth={2.5} />
                <Text style={s.emptyButtonText}>Create Folder</Text>
              </GradientView>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          key={viewMode}
          data={data}
          keyExtractor={(item) =>
            item.type === "folder" ? `f_${item.item.id}` : `d_${item.item.id}`
          }
          renderItem={({ item: entry }) => {
            if (viewMode === "grid") {
              return entry.type === "folder"
                ? renderGridFolderItem(entry.item)
                : renderGridFileItem(entry.item);
            }
            return entry.type === "folder"
              ? renderFolderItem(entry.item)
              : renderFileItem(entry.item);
          }}
          {...(viewMode === "grid"
            ? { numColumns: 2, columnWrapperStyle: s.gridRow }
            : {})}
          contentContainerStyle={
            viewMode === "grid" ? s.gridContent : s.listContent
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListHeaderComponent={
            <View style={s.sectionHeader}>
              {filteredSubfolders.length > 0 && (
                <Text style={[s.sectionLabel, { color: t.textSecondary }]}>
                  {filteredSubfolders.length} folder
                  {filteredSubfolders.length !== 1 ? "s" : ""}
                  {filteredFiles.length > 0
                    ? ` · ${filteredFiles.length} file${filteredFiles.length !== 1 ? "s" : ""}`
                    : ""}
                </Text>
              )}
              {filteredSubfolders.length === 0 && filteredFiles.length > 0 && (
                <Text style={[s.sectionLabel, { color: t.textSecondary }]}>
                  {filteredFiles.length} file
                  {filteredFiles.length !== 1 ? "s" : ""}
                </Text>
              )}
            </View>
          }
        />
      )}

      {/* ── Create / Rename Folder Modal ───────────────────────────────── */}
      <Modal
        visible={showCreateModal || editingFolder !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCreateModal(false);
          setEditingFolder(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowCreateModal(false);
            setEditingFolder(null);
          }}
        >
          <View
            style={[s.createModal, { backgroundColor: t.card }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[s.modalTitle, { color: t.text }]}>
              {editingFolder ? "Rename Folder" : "New Folder"}
            </Text>
            <TextInput
              style={[
                s.modalInput,
                {
                  backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9",
                  color: t.text,
                  borderColor: t.borderLight,
                },
              ]}
              placeholder="Folder name"
              placeholderTextColor={t.textTertiary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              maxLength={50}
            />
            {!editingFolder && (
              <View style={s.colorPicker}>
                {FOLDER_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      s.colorDot,
                      { backgroundColor: c },
                      newFolderColor === c && s.colorDotSelected,
                    ]}
                    onPress={() => setNewFolderColor(c)}
                  />
                ))}
              </View>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[
                  s.modalBtn,
                  { backgroundColor: mode === "dark" ? "#334155" : "#F1F5F9" },
                ]}
                onPress={() => {
                  setShowCreateModal(false);
                  setEditingFolder(null);
                }}
              >
                <Text style={[s.modalBtnText, { color: t.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.modalBtn,
                  {
                    backgroundColor: newFolderName.trim()
                      ? colors.primary
                      : colors.primary + "40",
                  },
                ]}
                onPress={
                  editingFolder ? handleRenameFolder : handleCreateFolder
                }
                disabled={!newFolderName.trim()}
              >
                <Text style={[s.modalBtnText, { color: "#fff" }]}>
                  {editingFolder ? "Rename" : "Create"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Folder Action Sheet ────────────────────────────────────────── */}
      <Modal
        visible={actionFolder !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionFolder(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionFolder(null)}
        >
          <View
            style={[s.actionSheet, { backgroundColor: t.card }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[s.actionHandle, { backgroundColor: t.border }]} />
            <Text style={[s.actionTitle, { color: t.text }]} numberOfLines={2}>
              {actionFolder?.name}
            </Text>
            {/* Rename */}
            <TouchableOpacity
              style={[s.actionItem, { borderBottomColor: t.borderLight }]}
              onPress={() => {
                if (actionFolder) {
                  setNewFolderName(actionFolder.name);
                  setEditingFolder(actionFolder);
                  setActionFolder(null);
                }
              }}
            >
              <MaterialIcons name="edit" size={22} color={t.text} />
              <Text style={[s.actionItemText, { color: t.text }]}>Rename</Text>
            </TouchableOpacity>
            {/* Delete */}
            <TouchableOpacity
              style={[s.actionItem, { borderBottomColor: t.borderLight }]}
              onPress={() => actionFolder && handleDeleteFolder(actionFolder)}
            >
              <MaterialIcons
                name="delete-outline"
                size={22}
                color={colors.error}
              />
              <Text style={[s.actionItemText, { color: colors.error }]}>
                Delete
              </Text>
            </TouchableOpacity>
            {/* Cancel */}
            <TouchableOpacity
              style={s.actionCancel}
              onPress={() => setActionFolder(null)}
            >
              <Text style={[s.actionCancelText, { color: t.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── File Action Sheet ──────────────────────────────────────────── */}
      <Modal
        visible={actionFile !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionFile(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionFile(null)}
        >
          <View
            style={[s.actionSheet, { backgroundColor: t.card }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[s.actionHandle, { backgroundColor: t.border }]} />
            <Text style={[s.actionTitle, { color: t.text }]} numberOfLines={2}>
              {actionFile?.displayName}
            </Text>
            {/* Open */}
            <TouchableOpacity
              style={[s.actionItem, { borderBottomColor: t.borderLight }]}
              onPress={() => {
                if (actionFile) {
                  setActionFile(null);
                  handleFilePress(actionFile);
                }
              }}
            >
              <MaterialIcons name="open-in-new" size={22} color={t.text} />
              <Text style={[s.actionItemText, { color: t.text }]}>Open</Text>
            </TouchableOpacity>
            {/* Share */}
            <TouchableOpacity
              style={[s.actionItem, { borderBottomColor: t.borderLight }]}
              onPress={() => actionFile && handleShareFile(actionFile)}
            >
              <MaterialIcons name="share" size={22} color={t.text} />
              <Text style={[s.actionItemText, { color: t.text }]}>Share</Text>
            </TouchableOpacity>
            {/* Favorite */}
            <TouchableOpacity
              style={[s.actionItem, { borderBottomColor: t.borderLight }]}
              onPress={() => actionFile && handleToggleFavorite(actionFile)}
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
              <Text style={[s.actionItemText, { color: t.text }]}>
                {favoriteIds.has(actionFile?.id ?? "")
                  ? "Remove from Favorites"
                  : "Add to Favorites"}
              </Text>
            </TouchableOpacity>
            {/* Remove from folder */}
            {currentFolderId && (
              <TouchableOpacity
                style={[s.actionItem, { borderBottomColor: t.borderLight }]}
                onPress={() =>
                  actionFile && handleRemoveFileFromFolder(actionFile)
                }
              >
                <MaterialIcons name="folder-off" size={22} color={t.text} />
                <Text style={[s.actionItemText, { color: t.text }]}>
                  Remove from Folder
                </Text>
              </TouchableOpacity>
            )}
            {/* File Info */}
            <TouchableOpacity
              style={[s.actionItem, { borderBottomColor: t.borderLight }]}
              onPress={() => actionFile && handleFileInfo(actionFile)}
            >
              <MaterialIcons name="info-outline" size={22} color={t.text} />
              <Text style={[s.actionItemText, { color: t.text }]}>
                File Info
              </Text>
            </TouchableOpacity>
            {/* Delete */}
            <TouchableOpacity
              style={[s.actionItem, { borderBottomColor: t.borderLight }]}
              onPress={() => actionFile && handleDeleteFile(actionFile)}
            >
              <MaterialIcons
                name="delete-outline"
                size={22}
                color={colors.error}
              />
              <Text style={[s.actionItemText, { color: colors.error }]}>
                Delete
              </Text>
            </TouchableOpacity>
            {/* Cancel */}
            <TouchableOpacity
              style={s.actionCancel}
              onPress={() => setActionFile(null)}
            >
              <Text style={[s.actionCancelText, { color: t.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add Files Modal ────────────────────────────────────────────── */}
      <Modal
        visible={showAddFiles}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddFiles(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddFiles(false)}
        >
          <View
            style={[s.addFilesModal, { backgroundColor: t.card }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[s.modalTitle, { color: t.text }]}>
              Add Files to Folder
            </Text>
            {/* Search */}
            <View
              style={[
                s.addFilesSearchBar,
                { backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9" },
              ]}
            >
              <Search color={t.textTertiary} size={16} />
              <TextInput
                placeholder="Search files..."
                placeholderTextColor={t.textTertiary}
                style={[s.addFilesSearchInput, { color: t.text }]}
                value={addFilesSearch}
                onChangeText={setAddFilesSearch}
              />
              {addFilesSearch.length > 0 && (
                <TouchableOpacity onPress={() => setAddFilesSearch("")}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={t.textTertiary}
                  />
                </TouchableOpacity>
              )}
            </View>
            {/* File list */}
            <ScrollView style={s.addFilesList}>
              {filteredAddFiles.length === 0 ? (
                <Text style={[s.addFilesEmpty, { color: t.textSecondary }]}>
                  {addFilesSearch
                    ? "No matching files"
                    : "No files available to add"}
                </Text>
              ) : (
                filteredAddFiles.map((file) => {
                  const typeConfig = getFileTypeConfig(file.displayName);
                  const selected = addFilesSelected.has(file.id);
                  return (
                    <TouchableOpacity
                      key={file.id}
                      style={[
                        s.addFilesItem,
                        { borderBottomColor: t.borderLight },
                        selected && { backgroundColor: t.primary + "12" },
                      ]}
                      onPress={() => handleToggleAddFileSelect(file.id)}
                    >
                      <View
                        style={[
                          s.addFilesCheckbox,
                          selected && {
                            backgroundColor: t.primary,
                            borderColor: t.primary,
                          },
                        ]}
                      >
                        {selected && (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>
                      <MaterialIcons
                        name={
                          typeConfig.icon as keyof typeof MaterialIcons.glyphMap
                        }
                        size={20}
                        color={typeConfig.color}
                      />
                      <Text
                        style={[s.addFilesItemText, { color: t.text }]}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {file.displayName}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            {/* Actions */}
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[
                  s.modalBtn,
                  { backgroundColor: mode === "dark" ? "#334155" : "#F1F5F9" },
                ]}
                onPress={() => setShowAddFiles(false)}
              >
                <Text style={[s.modalBtnText, { color: t.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.modalBtn,
                  {
                    backgroundColor:
                      addFilesSelected.size > 0
                        ? colors.primary
                        : colors.primary + "40",
                  },
                ]}
                onPress={handleConfirmAddFiles}
                disabled={addFilesSelected.size === 0}
              >
                <Text style={[s.modalBtnText, { color: "#fff" }]}>
                  Add{" "}
                  {addFilesSelected.size > 0
                    ? `(${addFilesSelected.size})`
                    : ""}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toastMsg && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const s = StyleSheet.create({
  container: { flex: 1 },
  // ── Header ──
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
  headerTitleContainer: { flex: 1 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFF",
    letterSpacing: -0.3,
  },
  headerViewToggle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    marginRight: 6,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // ── Breadcrumbs ──
  breadcrumbBar: {
    borderBottomWidth: 1,
    maxHeight: 44,
  },
  breadcrumbContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  breadcrumbItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  breadcrumbText: {
    fontSize: 13,
    fontWeight: "500",
    maxWidth: 120,
  },
  // ── Search ──
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  // ── List ──
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  // ── Folder card ──
  folderCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  folderIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  folderContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  folderName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  folderMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  // ── File card ──
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
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
  fileIcon: {
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
  fileMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  // ── Empty ──
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyText: {
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
  // ── Create modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  createModal: {
    borderRadius: 20,
    padding: 24,
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
  },
  modalInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    borderWidth: 1,
    fontWeight: "500",
  },
  colorPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
    justifyContent: "center",
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // ── Action sheet ──
  actionSheet: {
    borderRadius: 20,
    paddingBottom: 34,
    paddingTop: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    width: SCREEN_WIDTH * 0.7,
    maxWidth: 320,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  actionHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  actionCancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  actionCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // ── Grid view ──
  gridRow: {
    justifyContent: "space-between",
    paddingHorizontal: 0,
  },
  gridContent: {
    paddingHorizontal: 15,
    paddingBottom: 100,
  },
  gridCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
    borderWidth: 1,
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
  // ── Add Files modal ──
  addFilesModal: {
    borderRadius: 20,
    padding: 20,
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 420,
    maxHeight: "75%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  addFilesSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 12,
  },
  addFilesSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  addFilesList: {
    maxHeight: 320,
  },
  addFilesItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addFilesCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  addFilesItemText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  addFilesEmpty: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
  },
  // ── Toast ──
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
