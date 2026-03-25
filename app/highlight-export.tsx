import { API_ENDPOINTS } from "@/config/api";
import { colors } from "@/constants/theme";
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
  Highlighter,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GROUP_OPTIONS = [
  { key: "page", label: "By Page", desc: "Annotations ordered as they appear" },
  { key: "color", label: "By Color", desc: "Grouped by highlight colour" },
  { key: "author", label: "By Author", desc: "Grouped by annotator name" },
] as const;

interface ExportResult {
  url: string;
  total: number;
  pages: number;
  groups: number;
  breakdown: Record<string, number>;
}

export default function HighlightExportScreen() {
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
  const [groupBy, setGroupBy] = useState("page");
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeColors, setIncludeColors] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
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

  const handleExport = useCallback(async () => {
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
      formData.append("groupBy", groupBy);
      formData.append("includeNotes", String(includeNotes));
      formData.append("includeColors", String(includeColors));

      const response = await fetch(API_ENDPOINTS.TOOLS.HIGHLIGHT_EXPORT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Export failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, groupBy, includeNotes, includeColors]);

  const handleDownload = useCallback(async () => {
    if (!result?.url) return;
    try {
      const filename = `highlights_${selectedFile?.name || "export"}.pdf`;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      const download = await FileSystem.downloadAsync(result.url, localUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(download.uri);
      }
    } catch (err: any) {
      Alert.alert("Download Failed", err.message);
    }
  }, [result, selectedFile]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: t.settingsBg }]}
    >
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
          Export Highlights
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

        {/* Group By */}
        <Text style={[styles.sectionTitle, { color: t.text }]}>
          Group By
        </Text>
        <View style={styles.groupRow}>
          {GROUP_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setGroupBy(opt.key)}
              style={[
                styles.groupChip,
                {
                  backgroundColor:
                    groupBy === opt.key ? colors.primary : t.card,
                  borderColor:
                    groupBy === opt.key ? colors.primary : t.border,
                },
              ]}
            >
              <Text
                style={{
                  color: groupBy === opt.key ? "#fff" : t.text,
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Toggles */}
        <View
          style={[
            styles.toggleRow,
            { backgroundColor: t.card, borderColor: t.border },
          ]}
        >
          <Text style={[styles.toggleLabel, { color: t.text }]}>
            Include Notes
          </Text>
          <Switch value={includeNotes} onValueChange={setIncludeNotes} />
        </View>
        <View
          style={[
            styles.toggleRow,
            { backgroundColor: t.card, borderColor: t.border },
          ]}
        >
          <Text style={[styles.toggleLabel, { color: t.text }]}>
            Include Colors
          </Text>
          <Switch value={includeColors} onValueChange={setIncludeColors} />
        </View>

        {/* Export Button */}
        <TouchableOpacity
          onPress={handleExport}
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
              <Highlighter size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Export Highlights</Text>
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
          <View
            style={[
              styles.resultBox,
              { backgroundColor: t.card, borderColor: t.border },
            ]}
          >
            <Text style={[styles.resultTitle, { color: t.text }]}>
              Export Complete
            </Text>
            <Text style={{ color: t.textSecondary, marginBottom: 8 }}>
              Found {result.total} annotation{result.total !== 1 ? "s" : ""} across{" "}
              {result.pages} page{result.pages !== 1 ? "s" : ""}
            </Text>

            {/* Breakdown */}
            {Object.entries(result.breakdown).map(([type, count]) => (
              <View key={type} style={styles.breakdownRow}>
                <Text style={{ color: t.text, fontSize: 14 }}>
                  {type}
                </Text>
                <Text
                  style={{ color: t.textSecondary, fontSize: 14 }}
                >
                  {count}
                </Text>
              </View>
            ))}

            <TouchableOpacity onPress={handleDownload} style={styles.downloadResultBtn}>
              <Download size={18} color="#fff" />
              <Text style={styles.downloadResultText}>Download Summary PDF</Text>
            </TouchableOpacity>
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
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  groupRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  groupChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  toggleLabel: { fontSize: 15, fontWeight: "500" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
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
  resultBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  resultTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  downloadResultBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.success,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  downloadResultText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
