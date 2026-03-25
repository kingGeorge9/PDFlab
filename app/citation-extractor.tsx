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
  BookOpen,
  Download,
  FileText,
  RefreshCw,
  X,
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

const STYLES = [
  { key: "apa", label: "APA 7th" },
  { key: "mla", label: "MLA 9th" },
  { key: "chicago", label: "Chicago 17th" },
] as const;

interface Citation {
  raw: string;
  formatted: string;
  authors?: string;
  year?: string;
  title?: string;
}

interface ExtractResult {
  citations: Citation[];
  pdfUrl?: string;
  style: string;
}

export default function CitationExtractorScreen() {
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
  const [style, setStyle] = useState("apa");
  const [loading, setLoading] = useState(false);
  const [reformatting, setReformatting] = useState(false);
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
      formData.append("style", style);

      const response = await fetch(API_ENDPOINTS.TOOLS.CITATIONS_EXTRACT, {
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
      setError(err.message || "Extraction failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, style]);

  const handleReformat = useCallback(
    async (newStyle: string) => {
      if (!result || result.citations.length === 0) return;
      setReformatting(true);
      setError(null);

      try {
        const response = await fetch(API_ENDPOINTS.TOOLS.CITATIONS_FORMAT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            citations: result.citations.map((c) => c.raw),
            style: newStyle,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        setResult(data);
        setStyle(newStyle);
      } catch (err: any) {
        setError(err.message || "Reformat failed");
      } finally {
        setReformatting(false);
      }
    },
    [result],
  );

  const handleDownload = useCallback(async () => {
    if (!result?.pdfUrl) return;
    try {
      const filename = `citations_${selectedFile?.name || "export"}.pdf`;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      const download = await FileSystem.downloadAsync(result.pdfUrl, localUri);
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
          Citation Extractor
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
              {selectedFile ? selectedFile.name : "Select an academic PDF"}
            </Text>
            {!selectedFile && (
              <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                Works best with papers that have a References section
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

        {/* Style Selector */}
        <Text style={[styles.label, { color: t.text }]}>
          Citation Style
        </Text>
        <View style={styles.styleRow}>
          {STYLES.map((s) => (
            <TouchableOpacity
              key={s.key}
              onPress={() => {
                setStyle(s.key);
                if (result) handleReformat(s.key);
              }}
              style={[
                styles.styleChip,
                {
                  backgroundColor:
                    style === s.key ? colors.primary : t.card,
                  borderColor:
                    style === s.key ? colors.primary : t.border,
                },
              ]}
            >
              <Text
                style={{
                  color: style === s.key ? "#fff" : t.text,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
              <BookOpen size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Extract Citations</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Reformatting indicator */}
        {reformatting && (
          <View style={{ alignItems: "center", marginTop: 16 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: t.textSecondary, marginTop: 6 }}>
              Reformatting...
            </Text>
          </View>
        )}

        {/* Results */}
        {result && !reformatting && (
          <View style={{ marginTop: 16 }}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultTitle, { color: t.text }]}>
                {result.citations.length} citation
                {result.citations.length !== 1 ? "s" : ""} found
              </Text>
              {result.pdfUrl && (
                <TouchableOpacity onPress={handleDownload} style={styles.pdfBtn}>
                  <Download size={14} color="#fff" />
                  <Text style={styles.pdfBtnText}>PDF</Text>
                </TouchableOpacity>
              )}
            </View>

            {result.citations.map((cit, idx) => (
              <View
                key={idx}
                style={[
                  styles.citationCard,
                  { backgroundColor: t.card, borderColor: t.border },
                ]}
              >
                <Text
                  style={[styles.citationNum, { color: t.textSecondary }]}
                >
                  [{idx + 1}]
                </Text>
                <Text style={[styles.citationText, { color: t.text }]}>
                  {cit.formatted}
                </Text>
              </View>
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
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  styleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  styleChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
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
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pdfBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  citationCard: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  citationNum: { fontSize: 13, fontWeight: "700", minWidth: 24 },
  citationText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
