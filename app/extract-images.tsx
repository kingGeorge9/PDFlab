import { API_ENDPOINTS } from "@/config/api";
import { colors, spacing } from "@/constants/theme";
import { FileSourcePicker, type FileSourceOption } from "@/components/FileSourcePicker";
import { LibraryFilePicker, type SelectedFile } from "@/components/LibraryFilePicker";
import { useFileIndex } from "@/hooks/useFileIndex";
import { pickFilesWithResult } from "@/services/document-manager";
import { useTheme } from "@/services/ThemeProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  Download,
  FileText,
  Image as ImageIcon,
  Package,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ExtractedImage {
  name: string;
  url: string;
  width: number;
  height: number;
  format: string;
}

interface ExtractResult {
  count: number;
  images: ExtractedImage[];
  zipUrl?: string;
}

export default function ExtractImagesScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const params = useLocalSearchParams<{
    file?: string;
    fileUri?: string;
    fileMimeType?: string;
  }>();

  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    uri: string;
    mimeType: string;
  } | null>(
    params.fileUri
      ? {
          name: params.file || "document.pdf",
          uri: params.fileUri,
          mimeType: params.fileMimeType || "application/pdf",
        }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // File source picker
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const { files: libraryFiles } = useFileIndex();

  const hasLibraryPdfs = useMemo(
    () => libraryFiles.some((f) => f.extension?.toLowerCase() === "pdf" || f.type?.toLowerCase() === "pdf"),
    [libraryFiles],
  );

  const handleSourceSelect = useCallback(async (source: FileSourceOption) => {
    setShowSourcePicker(false);
    if (!source) return;
    if (source === "library") {
      setShowLibraryPicker(true);
    } else {
      const res = await pickFilesWithResult({
        types: ["application/pdf"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.cancelled || !res.success || res.files.length === 0) return;
      setSelectedFile({
        name: res.files[0].name,
        uri: res.files[0].uri,
        mimeType: res.files[0].mimeType,
      });
      setResult(null);
      setError(null);
    }
  }, []);

  const handleLibrarySelect = useCallback((selected: SelectedFile[]) => {
    setShowLibraryPicker(false);
    if (selected.length === 0) return;
    setSelectedFile({ name: selected[0].name, uri: selected[0].uri, mimeType: selected[0].mimeType });
    setResult(null);
    setError(null);
  }, []);

  const handleExtract = useCallback(async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("pdf", {
        uri: selectedFile.uri,
        type: selectedFile.mimeType,
        name: selectedFile.name,
      } as any);

      const response = await fetch(API_ENDPOINTS.TOOLS.EXTRACT_IMAGES, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.error || `Server error: ${response.status}`,
        );
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Extraction failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFile]);

  const handleDownload = useCallback(
    async (url: string, filename: string) => {
      try {
        const localUri = `${FileSystem.cacheDirectory}${filename}`;
        const download = await FileSystem.downloadAsync(url, localUri);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(download.uri);
        } else {
          Alert.alert("Downloaded", `Saved to ${download.uri}`);
        }
      } catch (err: any) {
        Alert.alert("Download Failed", err.message);
      }
    },
    [],
  );

  const renderImageItem = useCallback(
    ({ item }: { item: ExtractedImage }) => (
      <View
        style={[
          styles.imageCard,
          { backgroundColor: t.card, borderColor: t.border },
        ]}
      >
        <Image
          source={{ uri: item.url }}
          style={styles.thumbnail}
          resizeMode="contain"
        />
        <View style={styles.imageInfo}>
          <Text
            style={[styles.imageName, { color: t.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={[styles.imageMeta, { color: t.textSecondary }]}>
            {item.width}x{item.height} &middot; {item.format.toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleDownload(item.url, item.name)}
          style={styles.downloadBtn}
        >
          <Download size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
    ),
    [t, handleDownload],
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: t.settingsBg }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: t.card, borderBottomColor: t.border },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={t.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>
          Extract Images
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* File Picker */}
        <TouchableOpacity
          onPress={() => setShowSourcePicker(true)}
          style={[
            styles.filePicker,
            { backgroundColor: t.card, borderColor: t.border },
          ]}
        >
          <FileText size={24} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.fileLabel, { color: t.text }]}>
              {selectedFile ? selectedFile.name : "Select a PDF"}
            </Text>
            {!selectedFile && (
              <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                Tap to choose from App or Device
              </Text>
            )}
          </View>
          {selectedFile && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setResult(null);
              }}
              hitSlop={8}
            >
              <X size={20} color={t.textSecondary} />
            </Pressable>
          )}
        </TouchableOpacity>

        {/* Extract Button */}
        <TouchableOpacity
          onPress={handleExtract}
          disabled={!selectedFile || loading}
          style={[
            styles.actionBtn,
            (!selectedFile || loading) && styles.actionBtnDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <ImageIcon size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Extract Images</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Results */}
        {result && (
          <View style={{ marginTop: 16 }}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultTitle, { color: t.text }]}>
                {result.count} image{result.count !== 1 ? "s" : ""} found
              </Text>
              {result.zipUrl && (
                <TouchableOpacity
                  onPress={() =>
                    handleDownload(result.zipUrl!, "extracted_images.zip")
                  }
                  style={styles.zipBtn}
                >
                  <Package size={16} color="#fff" />
                  <Text style={styles.zipBtnText}>Download ZIP</Text>
                </TouchableOpacity>
              )}
            </View>

            {result.images.map((img, idx) => (
              <View key={idx}>{renderImageItem({ item: img })}</View>
            ))}
          </View>
        )}
      </ScrollView>

      <FileSourcePicker
        visible={showSourcePicker}
        onClose={() => setShowSourcePicker(false)}
        onSelect={handleSourceSelect}
        title="Select PDF"
        showLibraryOption={hasLibraryPdfs}
      />
      <LibraryFilePicker
        visible={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onSelect={handleLibrarySelect}
        allowedTypes={["pdf"]}
        title="Select PDF"
      />
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
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40 },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  fileLabel: { fontSize: 15, fontWeight: "600" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  errorBox: {
    backgroundColor: colors.errorLight,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: { color: colors.error, fontSize: 14 },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  resultTitle: { fontSize: 17, fontWeight: "700" },
  zipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  zipBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  imageCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  thumbnail: { width: 56, height: 56, borderRadius: 6, backgroundColor: "#f0f0f0" },
  imageInfo: { flex: 1, marginLeft: 12 },
  imageName: { fontSize: 14, fontWeight: "600" },
  imageMeta: { fontSize: 12, marginTop: 2 },
  downloadBtn: { padding: 8 },
});
