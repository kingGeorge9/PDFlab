import { API_ENDPOINTS } from "@/config/api";
import { colors } from "@/constants/theme";
import { FileSourcePicker, type FileSourceOption } from "@/components/FileSourcePicker";
import { LibraryFilePicker, type SelectedFile } from "@/components/LibraryFilePicker";
import { useFileIndex } from "@/hooks/useFileIndex";
import { pickFilesWithResult } from "@/services/document-manager";
import { useTheme } from "@/services/ThemeProvider";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  CheckCircle,
  Download,
  FileText,
  Plus,
  Trash2,
  Zap,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const LEVELS = [
  { key: "low", label: "Low", desc: "Minimal compression, best quality" },
  { key: "medium", label: "Medium", desc: "Balanced — recommended" },
  { key: "high", label: "High", desc: "Maximum compression, smaller files" },
] as const;

interface CompressResult {
  originalName: string;
  originalSize: number;
  compressedSize: number;
  reduction: string;
  url: string;
}

export default function BatchCompressScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();

  const [files, setFiles] = useState<Array<{ name: string; uri: string; mimeType: string }>>([]);
  const [level, setLevel] = useState<string>("medium");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CompressResult[] | null>(null);
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
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.cancelled || !res.success || res.files.length === 0) return;
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.uri));
        const added = res.files
          .filter((f) => !existing.has(f.uri))
          .map((f) => ({ name: f.name, uri: f.uri, mimeType: f.mimeType }));
        return [...prev, ...added];
      });
      setResults(null);
      setError(null);
    }
  }, []);

  const handleLibrarySelect = useCallback((selected: SelectedFile[]) => {
    setShowLibraryPicker(false);
    if (selected.length === 0) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.uri));
      const added = selected
        .filter((f) => !existing.has(f.uri))
        .map((f) => ({ name: f.name, uri: f.uri, mimeType: f.mimeType }));
      return [...prev, ...added];
    });
    setResults(null);
    setError(null);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResults(null);
  }, []);

  const handleCompress = useCallback(async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      files.forEach((f) => {
        formData.append("pdfs", { uri: f.uri, type: f.mimeType, name: f.name } as any);
      });
      // Backend reads "compressionLevel", not "level"
      formData.append("compressionLevel", level);

      const response = await fetch(API_ENDPOINTS.TOOLS.BATCH_COMPRESS, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err: any) {
      setError(err.message || "Compression failed");
    } finally {
      setLoading(false);
    }
  }, [files, level]);

  const handleDownload = useCallback(async (url: string, name: string) => {
    try {
      const localUri = `${FileSystem.cacheDirectory}compressed_${name}`;
      const download = await FileSystem.downloadAsync(url, localUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(download.uri);
      }
    } catch (err: any) {
      Alert.alert("Download Failed", err.message);
    }
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.settingsBg }]}>
      <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={t.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>Batch Compress</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Add Files Button */}
        <TouchableOpacity
          onPress={() => setShowSourcePicker(true)}
          style={[styles.addFilesBtn, { backgroundColor: t.card, borderColor: t.border }]}
        >
          <Plus size={22} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.addFilesLabel, { color: t.text }]}>
              {files.length > 0
                ? `${files.length} PDF${files.length > 1 ? "s" : ""} selected`
                : "Add PDFs to compress"}
            </Text>
            <Text style={[styles.addFilesSubLabel, { color: t.textSecondary }]}>
              Tap to add from App or Device
            </Text>
          </View>
        </TouchableOpacity>

        {/* File List */}
        {files.map((f, idx) => (
          <View
            key={`${f.uri}-${idx}`}
            style={[styles.fileRow, { backgroundColor: t.card, borderColor: t.border }]}
          >
            <FileText size={18} color={colors.pdf} />
            <Text style={[styles.fileName, { color: t.text }]} numberOfLines={1}>
              {f.name}
            </Text>
            <Pressable onPress={() => removeFile(idx)} hitSlop={8}>
              <Trash2 size={18} color={colors.error} />
            </Pressable>
          </View>
        ))}

        {/* Compression Level */}
        <Text style={[styles.sectionTitle, { color: t.text }]}>Compression Level</Text>
        {LEVELS.map((l) => (
          <TouchableOpacity
            key={l.key}
            onPress={() => setLevel(l.key)}
            style={[
              styles.levelCard,
              {
                backgroundColor: t.card,
                borderColor: level === l.key ? colors.primary : t.border,
                borderWidth: level === l.key ? 2 : 1,
              },
            ]}
          >
            <View>
              <Text style={[styles.levelLabel, { color: t.text }]}>{l.label}</Text>
              <Text style={{ color: t.textSecondary, fontSize: 13 }}>{l.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Compress Button */}
        <TouchableOpacity
          onPress={handleCompress}
          disabled={files.length === 0 || loading}
          style={[styles.actionBtn, (files.length === 0 || loading) && styles.btnDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Zap size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Compress All</Text>
            </>
          )}
        </TouchableOpacity>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.errorLight }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {/* Results */}
        {results && (
          <View style={{ marginTop: 16 }}>
            <View style={[styles.resultsHeader, { backgroundColor: t.card, borderColor: t.border }]}>
              <CheckCircle size={20} color={colors.success} />
              <Text style={[styles.resultsTitle, { color: t.text }]}>
                {results.length} file{results.length !== 1 ? "s" : ""} compressed
              </Text>
            </View>
            {results.map((r, idx) => (
              <View
                key={idx}
                style={[styles.resultCard, { backgroundColor: t.card, borderColor: t.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultName, { color: t.text }]} numberOfLines={1}>
                    {r.originalName}
                  </Text>
                  <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                    {formatSize(r.originalSize)} → {formatSize(r.compressedSize)}
                  </Text>
                  <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600" }}>
                    {r.reduction} saved
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDownload(r.url, r.originalName)}
                  style={styles.downloadBtn}
                >
                  <Download size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <FileSourcePicker
        visible={showSourcePicker}
        onClose={() => setShowSourcePicker(false)}
        onSelect={handleSourceSelect}
        title="Add PDFs"
        allowMultiple={true}
        showLibraryOption={hasLibraryPdfs}
      />
      <LibraryFilePicker
        visible={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onSelect={handleLibrarySelect}
        allowedTypes={["pdf"]}
        multiple={true}
        title="Select PDFs"
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
  addFilesBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  addFilesLabel: { fontSize: 15, fontWeight: "600" },
  addFilesSubLabel: { fontSize: 12, marginTop: 2 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  fileName: { flex: 1, fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  levelCard: { padding: 14, borderRadius: 10, marginBottom: 6 },
  levelLabel: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.45 },
  actionBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  errorBox: { padding: 12, borderRadius: 8, marginTop: 12 },
  errorText: { fontSize: 14 },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  resultsTitle: { fontSize: 15, fontWeight: "700" },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  resultName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  downloadBtn: { padding: 8 },
});
