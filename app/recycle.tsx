/**
 * Recycle Bin Screen
 * Shows soft-deleted files with restore, permanent delete, and empty actions.
 * Files auto-expire after 20 days.
 */
import { useTheme } from "@/services/ThemeProvider";
import {
  daysRemaining,
  emptyRecycleBin,
  getRecycledFiles,
  permanentlyDelete,
  RecycledFile,
  restoreFile,
} from "@/services/recycleBinService";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock,
  RotateCcw,
  Trash2,
  TrashIcon,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RecycleBinScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const [files, setFiles] = useState<RecycledFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getRecycledFiles();
      // Sort newest first
      items.sort((a, b) => b.deletedAt - a.deletedAt);
      setFiles(items);
    } catch (e) {
      console.error("Failed to load recycle bin:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRestore = (file: RecycledFile) => {
    Alert.alert("Restore File", `Restore "${file.name}" to your library?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: async () => {
          await restoreFile(file.id);
          load();
        },
      },
    ]);
  };

  const handleDelete = (file: RecycledFile) => {
    Alert.alert(
      "Permanently Delete",
      `This cannot be undone. Delete "${file.name}" permanently?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await permanentlyDelete(file.id);
            load();
          },
        },
      ],
    );
  };

  const handleEmptyAll = () => {
    if (files.length === 0) return;
    Alert.alert(
      "Empty Recycle Bin",
      `Permanently delete all ${files.length} file(s)? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Empty All",
          style: "destructive",
          onPress: async () => {
            await emptyRecycleBin();
            load();
          },
        },
      ],
    );
  };

  const formatDeletedDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const renderItem = ({ item }: { item: RecycledFile }) => {
    const days = daysRemaining(item);
    return (
      <View
        style={[
          styles.fileCard,
          { backgroundColor: t.card, borderColor: t.border },
        ]}
      >
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: t.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: t.textSecondary }]}>
              {formatSize(item.size)}
            </Text>
            <View style={[styles.dot, { backgroundColor: t.textTertiary }]} />
            <Text style={[styles.metaText, { color: t.textSecondary }]}>
              {formatDeletedDate(item.deletedAt)}
            </Text>
          </View>
          <View style={styles.expiryRow}>
            <Clock size={12} color={days <= 3 ? t.error : t.textTertiary} />
            <Text
              style={[
                styles.expiryText,
                { color: days <= 3 ? t.error : t.textTertiary },
              ]}
            >
              {days <= 0
                ? "Expiring soon"
                : `${days} day${days !== 1 ? "s" : ""} remaining`}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: t.primary + "18" }]}
            onPress={() => handleRestore(item)}
          >
            <RotateCcw size={18} color={t.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: t.error + "18" }]}
            onPress={() => handleDelete(item)}
          >
            <Trash2 size={18} color={t.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: t.surface }]}
        >
          <ArrowLeft size={20} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Recycle Bin</Text>
        {files.length > 0 && (
          <TouchableOpacity onPress={handleEmptyAll}>
            <Text style={[styles.emptyAllText, { color: t.error }]}>
              Empty All
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.center}>
          <TrashIcon size={56} color={t.textTertiary} strokeWidth={1.2} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>
            Recycle Bin is Empty
          </Text>
          <Text style={[styles.emptySubtitle, { color: t.textSecondary }]}>
            Deleted files will appear here for 20 days before being permanently
            removed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.countText, { color: t.textSecondary }]}>
              {files.length} file{files.length !== 1 ? "s" : ""} in recycle bin
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 12,
  },
  emptyAllText: {
    fontSize: 14,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  list: { padding: 16, paddingBottom: 32 },
  countText: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 12,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  fileInfo: { flex: 1 },
  fileName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  metaText: { fontSize: 12, fontWeight: "500" },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 6,
  },
  expiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  expiryText: { fontSize: 11, fontWeight: "500" },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 12,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
});
