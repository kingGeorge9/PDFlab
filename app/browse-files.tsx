import { useTheme } from "@/services/ThemeProvider";
import { pickFilesWithResult } from "@/services/document-manager";
import { useLibrary } from "@/services/document-manager/hooks/use-library";
import { FileItem } from "@/src/components/FileItem";
import { useFolderAccess } from "@/src/hooks/useFolderAccess";
import { FileMetadata } from "@/src/types/folder.types";
import * as Haptics from "expo-haptics";
import * as IntentLauncher from "expo-intent-launcher";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  ChevronLeft,
  FileText,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Trash2,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Browse Files Screen
 * Uses @react-native-documents/picker for Android SAF folder access
 * with persistent permissions that survive app restarts
 */
export default function BrowseFilesScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const backgroundColor = t.background;
  const textColor = t.text;
  const primaryColor = t.primary;

  // Use the new folder access hook
  const { folder, files, loading, error, actions } = useFolderAccess();

  // Use library hook for importing files
  const { addFile } = useLibrary();

  // Local state for recursion toggle
  const [isRecursive, setIsRecursive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  /**
   * Sort files: directories first, then by name
   */
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      // Directories first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      // Then by name
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [files]);

  /**
   * Calculate stats from files
   */
  const stats = useMemo(() => {
    const fileCount = files.filter((f) => !f.isDirectory).length;
    const directoryCount = files.filter((f) => f.isDirectory).length;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    return { fileCount, directoryCount, totalSize, totalCount: files.length };
  }, [files]);

  /**
   * Handle folder picker
   */
  const handleOpenFolder = useCallback(async () => {
    await actions.pick();
  }, [actions]);

  /**
   * Handle direct file picker (using DocumentPicker)
   */
  const handlePickFile = useCallback(async () => {
    if (isImporting) return;

    setIsImporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await pickFilesWithResult({
        types: ["*/*"], // Accept all file types
        multiple: false,
        copyToCacheDirectory: true,
        showAlerts: true,
      });

      // Handle cancellation
      if (result.cancelled) {
        setIsImporting(false);
        return;
      }

      // Handle errors
      if (!result.success || result.files.length === 0) {
        setIsImporting(false);
        return;
      }

      // Import the picked file to library
      const picked = result.files[0];
      const importResult = await addFile({
        uri: picked.uri,
        displayName: picked.name,
        mimeType: picked.mimeType,
        size: picked.size,
        source: "picked",
      });

      if (importResult.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // File imported successfully - no alert needed
      } else {
        throw new Error(importResult.error || "Failed to import file");
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Import Failed",
        error.message || "Could not import file to library",
      );
    } finally {
      setIsImporting(false);
    }
  }, [addFile, isImporting, router]);

  /**
   * Handle pull-to-refresh
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await actions.refresh(isRecursive);
    setIsRefreshing(false);
  }, [actions, isRecursive]);

  /**
   * Toggle recursion and refresh
   */
  const handleToggleRecursion = useCallback(
    async (value: boolean) => {
      setIsRecursive(value);
      if (folder) {
        await actions.refresh(value);
      }
    },
    [folder, actions],
  );

  /**
   * Clear folder selection
   */
  const handleClearFolder = useCallback(async () => {
    Alert.alert(
      "Clear Folder",
      "Are you sure you want to clear the selected folder?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => actions.clear(),
        },
      ],
    );
  }, [actions]);

  /**
   * Handle file item press
   */
  const handleFilePress = useCallback(async (file: FileMetadata) => {
    if (file.isDirectory) {
      Alert.alert(
        "Folder",
        `This is a folder: ${file.name}\n\nEnable recursive mode to see files inside folders.`,
      );
      return;
    }

    // Show file options with import/open
    Alert.alert(
      file.name || "File",
      `Size: ${formatSize(file.size)}\nModified: ${formatDate(file.modificationTime)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import to Library",
          onPress: () => importFileToLibrary(file),
        },
        {
          text: "Open",
          onPress: () => openFile(file),
        },
      ],
    );
  }, []);

  /**
   * Import file to library
   */
  const importFileToLibrary = async (file: FileMetadata) => {
    if (isImporting) return;

    setIsImporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await addFile({
        uri: file.uri,
        displayName: file.name || undefined,
        size: file.size || undefined,
        source: "picked",
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // File imported successfully - no alert needed
      } else {
        throw new Error(result.error || "Failed to import file");
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Import Failed",
        error.message || "Could not import file to library",
      );
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Open file in the appropriate in-app viewer, or fall back to system intent
   */
  const openFile = async (file: FileMetadata) => {
    const name = file.name || "";
    const ext = name.split(".").pop()?.toLowerCase() || "";

    if (ext === "epub") {
      router.push({
        pathname: "/epub-viewer",
        params: { uri: file.uri, name },
      });
      return;
    }

    if (ext === "pdf") {
      router.push({
        pathname: "/pdf-viewer",
        params: { uri: file.uri, name },
      });
      return;
    }

    if (ext === "docx" || ext === "doc") {
      (router as any).push({
        pathname: "/docx-viewer",
        params: { uri: file.uri, name },
      });
      return;
    }

    // Fall back to system intent for other file types
    if (Platform.OS !== "android") return;

    try {
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: file.uri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
    } catch (err) {
      Alert.alert(
        "Error",
        "Could not open file. No app found to handle this file type.",
      );
      console.error("Open file error:", err);
    }
  };

  /**
   * Format file size
   */
  const formatSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  /**
   * Format date
   */
  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => {
    if (loading) return null;

    if (!folder) {
      return (
        <View style={styles.emptyState}>
          <HardDrive size={64} color={textColor + "40"} />
          <Text style={[styles.emptyTitle, { color: textColor }]}>
            No Folder Selected
          </Text>
          <Text style={[styles.emptySubtitle, { color: textColor + "80" }]}>
            Pick a single file or browse a folder to import files
          </Text>

          {/* Pick Single File Button */}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: primaryColor }]}
            onPress={handlePickFile}
            disabled={isImporting}
          >
            <FileText size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {isImporting ? "Importing..." : "Pick File"}
            </Text>
          </TouchableOpacity>

          {/* Browse Folder Button */}
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: primaryColor }]}
            onPress={handleOpenFolder}
          >
            <FolderOpen size={20} color={primaryColor} />
            <Text style={[styles.secondaryButtonText, { color: primaryColor }]}>
              Browse Folder
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <AlertCircle size={64} color={textColor + "40"} />
        <Text style={[styles.emptyTitle, { color: textColor }]}>
          No Files Found
        </Text>
        <Text style={[styles.emptySubtitle, { color: textColor + "80" }]}>
          This folder appears to be empty
        </Text>
      </View>
    );
  };

  /**
   * Render header stats
   */
  const renderStats = () => {
    if (!folder) return null;

    return (
      <View
        style={[
          styles.statsContainer,
          { backgroundColor: primaryColor + "15" },
        ]}
      >
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: primaryColor }]}>
            {stats.fileCount}
          </Text>
          <Text style={[styles.statLabel, { color: textColor + "80" }]}>
            Files
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: primaryColor }]}>
            {stats.directoryCount}
          </Text>
          <Text style={[styles.statLabel, { color: textColor + "80" }]}>
            Folders
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: primaryColor }]}>
            {formatSize(stats.totalSize)}
          </Text>
          <Text style={[styles.statLabel, { color: textColor + "80" }]}>
            Total Size
          </Text>
        </View>
      </View>
    );
  };

  /**
   * Render controls
   */
  const renderControls = () => {
    if (!folder) return null;

    return (
      <View style={[styles.controls, { borderBottomColor: textColor + "20" }]}>
        <View style={styles.recursiveToggle}>
          <Text style={[styles.toggleLabel, { color: textColor }]}>
            Include subfolders
          </Text>
          <Switch
            value={isRecursive}
            onValueChange={handleToggleRecursion}
            trackColor={{ false: textColor + "30", true: primaryColor + "60" }}
            thumbColor={isRecursive ? primaryColor : "#f4f3f4"}
          />
        </View>
        <View style={styles.controlButtons}>
          <TouchableOpacity
            style={[styles.controlButton, { borderColor: primaryColor }]}
            onPress={handleRefresh}
            disabled={loading}
          >
            <RefreshCw size={18} color={primaryColor} />
            <Text style={[styles.controlButtonText, { color: primaryColor }]}>
              Refresh
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlButton, { borderColor: "#d32f2f" }]}
            onPress={handleClearFolder}
          >
            <Trash2 size={18} color="#d32f2f" />
            <Text style={[styles.controlButtonText, { color: "#d32f2f" }]}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor }]}
      edges={["top"]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: textColor + "20" }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: textColor }]}>
            Browse Files
          </Text>
          {folder && (
            <Text
              style={[styles.folderName, { color: textColor + "80" }]}
              numberOfLines={1}
            >
              📂 {folder.name}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handlePickFile}
          disabled={isImporting}
        >
          <FileText
            size={22}
            color={isImporting ? textColor + "40" : primaryColor}
          />
        </TouchableOpacity>
        {folder && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleOpenFolder}
          >
            <FolderOpen size={22} color={primaryColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorContainer}>
          <AlertCircle size={18} color="#c62828" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Stats */}
      {renderStats()}

      {/* Controls */}
      {renderControls()}

      {/* Loading State */}
      {loading && !isRefreshing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.loadingText, { color: textColor + "80" }]}>
            Loading files...
          </Text>
        </View>
      )}

      {/* File List */}
      {!loading && sortedFiles.length > 0 && (
        <FlatList
          data={sortedFiles}
          keyExtractor={(item, index) => `${item.uri}-${index}`}
          renderItem={({ item }) => (
            <FileItem
              file={item}
              onPress={handleFilePress}
              textColor={textColor}
              primaryColor={primaryColor}
              showImportHint={true}
            />
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[primaryColor]}
              tintColor={primaryColor}
            />
          }
          ListHeaderComponent={
            <Text style={[styles.fileCount, { color: textColor + "80" }]}>
              {stats.totalCount} items
            </Text>
          }
        />
      )}

      {/* Empty State */}
      {!loading && sortedFiles.length === 0 && renderEmptyState()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  folderName: {
    fontSize: 13,
    marginTop: 2,
  },
  headerButton: {
    padding: 8,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffebee22",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: "#c62828",
    flex: 1,
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "600",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(128,128,128,0.2)",
    marginHorizontal: 8,
  },
  controls: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  recursiveToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  toggleLabel: {
    fontSize: 15,
  },
  controlButtons: {
    flexDirection: "row",
    gap: 12,
  },
  controlButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  fileCount: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
  },
});
