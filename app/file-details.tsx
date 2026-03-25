import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { colors, spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import {
  deleteFileReference,
  FileInfo,
  formatDate,
  formatFileSize,
  isFavorite,
  shareFile,
  toggleFavorite,
} from "@/services/fileService";
import {
  Folder,
  getFileFolderId,
  getFolderPath,
} from "@/services/folderService";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  FileText,
  Folder as FolderIcon,
  HardDrive,
  Info,
  Share2,
  Star,
  Trash2,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function FileDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors: t } = useTheme();
  const backgroundColor = t.background;
  const textColor = t.text;
  const primaryColor = t.primary;

  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  useEffect(() => {
    loadFileInfo();
    loadFavoriteStatus();
    loadFolderPath();
  }, []);

  const loadFileInfo = () => {
    try {
      const info: FileInfo = {
        id: params.fileId as string,
        name: params.fileName as string,
        uri: params.fileUri as string,
        size: parseInt(params.fileSize as string) || 0,
        type: (params.fileType as string) || "document",
        mimeType: (params.fileMimeType as string) || "application/octet-stream",
        dateAdded: parseInt(params.dateAdded as string) || Date.now(),
        dateModified: parseInt(params.dateModified as string) || Date.now(),
        lastModified: parseInt(params.lastModified as string) || Date.now(),
        lastOpened: params.lastOpened
          ? parseInt(params.lastOpened as string)
          : undefined,
        source: (params.source as any) || "imported",
      };
      setFileInfo(info);
      setNewFileName(info.name.replace(/\.[^/.]+$/, "")); // Remove extension
    } catch (error) {
      console.error("Error loading file info:", error);
      Alert.alert("Error", "Failed to load file information");
      router.back();
    }
  };

  const loadFavoriteStatus = async () => {
    if (params.fileId) {
      const isFav = await isFavorite(params.fileId as string);
      setFavorite(isFav);
    }
  };

  const loadFolderPath = async () => {
    if (params.fileId) {
      const folderId = await getFileFolderId(params.fileId as string);
      if (folderId) {
        const path = await getFolderPath(folderId);
        setFolderPath(path);
      }
    }
  };

  const handleToggleFavorite = async () => {
    if (!fileInfo) return;
    try {
      const newStatus = await toggleFavorite(fileInfo.id);
      setFavorite(newStatus);
    } catch {
      Alert.alert("Error", "Failed to update favorite status");
    }
  };

  const handleOpenFile = () => {
    if (!fileInfo) return;

    // Navigate to appropriate viewer based on file type
    if (fileInfo.type === "pdf") {
      router.push({
        pathname: "/pdf-viewer",
        params: {
          uri: fileInfo.uri,
          name: fileInfo.name,
        },
      });
    } else if (fileInfo.type === "word") {
      // Navigate to DOCX viewer for Word documents
      (router as any).push({
        pathname: "/docx-viewer",
        params: {
          uri: fileInfo.uri,
          name: fileInfo.name,
        },
      });
    } else if (fileInfo.type === "epub") {
      // Navigate to EPUB viewer for EPUB files
      router.push({
        pathname: "/epub-viewer",
        params: {
          uri: fileInfo.uri,
          name: fileInfo.name,
        },
      });
    } else {
      // For other file types, use share to open in system app
      handleShareFile();
    }
  };

  const handleShareFile = async () => {
    if (!fileInfo) return;
    try {
      await shareFile(fileInfo);
    } catch {
      Alert.alert("Error", "Failed to share file");
    }
  };

  const handleRenameFile = () => {
    setShowRenameDialog(true);
  };

  const confirmRename = () => {
    setShowRenameDialog(false);
    Alert.alert(
      "Rename",
      "Rename functionality will be fully implemented soon!",
    );
    // TODO: Implement actual file renaming
  };

  const handleMoveFile = () => {
    setShowMoveDialog(true);
  };

  const handleDeleteFile = () => {
    if (!fileInfo) return;
    Alert.alert(
      "Delete File",
      `Are you sure you want to remove "${fileInfo.name}" from the app?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFileReference(fileInfo.id);
              Alert.alert("Success", "File deleted successfully");
              router.back();
            } catch {
              Alert.alert("Error", "Failed to delete file");
            }
          },
        },
      ],
    );
  };

  const getFileIcon = () => {
    switch (fileInfo?.type) {
      case "pdf":
        return { icon: "document-text", color: "#DC2626" };
      case "word":
        return { icon: "document-text", color: "#2563EB" };
      case "epub":
        return { icon: "book", color: "#7C3AED" };
      case "ppt":
        return { icon: "easel", color: "#EA580C" };
      case "excel":
        return { icon: "grid", color: "#059669" };
      default:
        return { icon: "document", color: colors.primary };
    }
  };

  const getSourceLabel = (source?: string) => {
    switch (source) {
      case "downloaded":
        return "Downloaded from device";
      case "created":
        return "Created in app";
      case "imported":
        return "Imported via picker";
      default:
        return "Unknown source";
    }
  };

  if (!fileInfo) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <View style={styles.centerContainer}>
          <Text style={[styles.loadingText, { color: textColor }]}>
            Loading file information...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const fileIconData = getFileIcon();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <View style={styles.container}>
        {/* Header */}
        <AppHeaderContainer>
          <View style={[styles.header, { backgroundColor: primaryColor }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>File Details</Text>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={handleToggleFavorite}
            >
              <Star
                color="white"
                size={24}
                strokeWidth={2.5}
                fill={favorite ? "white" : "none"}
              />
            </TouchableOpacity>
          </View>
        </AppHeaderContainer>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* File Preview Card */}
          <View style={[styles.previewCard, { backgroundColor: t.card }]}>
            <View
              style={[
                styles.fileIconLarge,
                { backgroundColor: `${fileIconData.color}15` },
              ]}
            >
              <Ionicons
                name={fileIconData.icon as any}
                size={64}
                color={fileIconData.color}
              />
            </View>
            <Text
              style={[styles.fileName, { color: textColor }]}
              numberOfLines={2}
            >
              {fileInfo.name}
            </Text>
            <Text style={[styles.fileType, { color: t.textSecondary }]}>
              {fileInfo.type.toUpperCase()} • {formatFileSize(fileInfo.size)}
            </Text>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: primaryColor }]}
              onPress={handleOpenFile}
            >
              <Eye color="white" size={20} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Open</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#10B981" }]}
              onPress={handleShareFile}
            >
              <Share2 color="white" size={20} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#F59E0B" }]}
              onPress={handleRenameFile}
            >
              <Edit3 color="white" size={20} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#EF4444" }]}
              onPress={handleDeleteFile}
            >
              <Trash2 color="white" size={20} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>

          {/* File Information */}
          <View style={[styles.infoSection, { backgroundColor: t.card }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              <Info color={textColor} size={20} strokeWidth={2} /> Information
            </Text>

            {/* Location */}
            {folderPath.length > 0 && (
              <View style={styles.infoRow}>
                <View style={styles.infoLabel}>
                  <FolderIcon
                    color={t.textSecondary}
                    size={18}
                    strokeWidth={2}
                  />
                  <Text
                    style={[styles.infoLabelText, { color: t.textSecondary }]}
                  >
                    Location
                  </Text>
                </View>
                <View style={styles.folderPath}>
                  {folderPath.map((folder, index) => (
                    <View key={folder.id} style={styles.folderPathItem}>
                      {index > 0 && (
                        <ChevronRight color="#999" size={14} strokeWidth={2} />
                      )}
                      <Text style={[styles.infoValue, { color: primaryColor }]}>
                        {folder.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* File Path */}
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <HardDrive color={t.textSecondary} size={18} strokeWidth={2} />
                <Text
                  style={[styles.infoLabelText, { color: t.textSecondary }]}
                >
                  Path
                </Text>
              </View>
              <Text
                style={[styles.infoValue, { color: textColor }]}
                numberOfLines={2}
              >
                {fileInfo.uri}
              </Text>
            </View>

            {/* File Size */}
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <FileText color={t.textSecondary} size={18} strokeWidth={2} />
                <Text
                  style={[styles.infoLabelText, { color: t.textSecondary }]}
                >
                  Size
                </Text>
              </View>
              <Text style={[styles.infoValue, { color: textColor }]}>
                {formatFileSize(fileInfo.size)}
              </Text>
            </View>

            {/* Date Created */}
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <Calendar color={t.textSecondary} size={18} strokeWidth={2} />
                <Text
                  style={[styles.infoLabelText, { color: t.textSecondary }]}
                >
                  Date Created
                </Text>
              </View>
              <Text style={[styles.infoValue, { color: textColor }]}>
                {new Date(fileInfo.dateAdded).toLocaleString()}
              </Text>
            </View>

            {/* Date Modified */}
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <Clock color={t.textSecondary} size={18} strokeWidth={2} />
                <Text
                  style={[styles.infoLabelText, { color: t.textSecondary }]}
                >
                  Date Modified
                </Text>
              </View>
              <Text style={[styles.infoValue, { color: textColor }]}>
                {new Date(fileInfo.dateModified).toLocaleString()}
              </Text>
            </View>

            {/* Last Opened */}
            {fileInfo.lastOpened && (
              <View style={styles.infoRow}>
                <View style={styles.infoLabel}>
                  <Eye color={t.textSecondary} size={18} strokeWidth={2} />
                  <Text
                    style={[styles.infoLabelText, { color: t.textSecondary }]}
                  >
                    Last Opened
                  </Text>
                </View>
                <Text style={[styles.infoValue, { color: textColor }]}>
                  {formatDate(fileInfo.lastOpened)}
                </Text>
              </View>
            )}

            {/* Source */}
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={t.textSecondary}
                />
                <Text
                  style={[styles.infoLabelText, { color: t.textSecondary }]}
                >
                  Source
                </Text>
              </View>
              <Text style={[styles.infoValue, { color: textColor }]}>
                {getSourceLabel(fileInfo.source)}
              </Text>
            </View>
          </View>

          {/* Move to Folder */}
          <TouchableOpacity
            style={[styles.moveButton, { backgroundColor: t.card }]}
            onPress={handleMoveFile}
          >
            <View style={styles.moveButtonContent}>
              <FolderIcon color={primaryColor} size={24} strokeWidth={2} />
              <View style={styles.moveButtonText}>
                <Text style={[styles.moveButtonTitle, { color: textColor }]}>
                  Move to Folder
                </Text>
                <Text
                  style={[
                    styles.moveButtonSubtitle,
                    { color: t.textSecondary },
                  ]}
                >
                  Organize this file in a folder
                </Text>
              </View>
            </View>
            <ChevronRight color="#999" size={20} strokeWidth={2} />
          </TouchableOpacity>
        </ScrollView>

        {/* Rename Dialog */}
        <Modal
          visible={showRenameDialog}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRenameDialog(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.renameDialog, { backgroundColor: t.card }]}>
              <Text style={[styles.renameTitle, { color: textColor }]}>
                Rename File
              </Text>
              <TextInput
                style={[
                  styles.renameInput,
                  { color: textColor, borderColor: primaryColor },
                ]}
                value={newFileName}
                onChangeText={setNewFileName}
                placeholder="Enter new name"
                placeholderTextColor="#999"
                autoFocus
              />
              <View style={styles.renameButtons}>
                <TouchableOpacity
                  style={[
                    styles.renameButton,
                    styles.renameCancelButton,
                    { backgroundColor: t.backgroundSecondary },
                  ]}
                  onPress={() => setShowRenameDialog(false)}
                >
                  <Text style={[styles.renameCancelText, { color: textColor }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.renameButton,
                    { backgroundColor: primaryColor },
                  ]}
                  onPress={confirmRename}
                >
                  <Text style={styles.renameConfirmText}>Rename</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Move to Folder Dialog - Placeholder */}
        <Modal
          visible={showMoveDialog}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMoveDialog(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.moveDialog, { backgroundColor: t.card }]}>
              <Text style={[styles.moveDialogTitle, { color: textColor }]}>
                Move to Folder
              </Text>
              <Text style={[styles.moveDialogText, { color: t.textSecondary }]}>
                Folder selection will be implemented with folder management UI
              </Text>
              <TouchableOpacity
                style={[
                  styles.moveDialogButton,
                  { backgroundColor: primaryColor },
                ]}
                onPress={() => setShowMoveDialog(false)}
              >
                <Text style={styles.moveDialogButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "white",
    marginLeft: spacing.md,
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  previewCard: {
    margin: spacing.lg,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  fileIconLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  fileName: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  fileType: {
    fontSize: 14,
    fontWeight: "500",
  },
  actionsContainer: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    gap: spacing.xs,
  },
  actionButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  infoSection: {
    margin: spacing.lg,
    borderRadius: 16,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  infoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  infoLabelText: {
    fontSize: 13,
    fontWeight: "600",
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "500",
    marginLeft: spacing.lg + spacing.xs,
  },
  folderPath: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    marginLeft: spacing.lg + spacing.xs,
  },
  folderPathItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  moveButton: {
    margin: spacing.lg,
    marginTop: 0,
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  moveButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  moveButtonText: {
    flex: 1,
  },
  moveButtonTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  moveButtonSubtitle: {
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  renameDialog: {
    marginHorizontal: spacing.lg,
    borderRadius: 16,
    padding: spacing.lg,
    width: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.lg,
  },
  renameInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  renameButtons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  renameButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
  },
  renameCancelButton: {},
  renameCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  renameConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  moveDialog: {
    marginHorizontal: spacing.lg,
    borderRadius: 16,
    padding: spacing.xl,
    width: "80%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  moveDialogTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  moveDialogText: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  moveDialogButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  moveDialogButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
