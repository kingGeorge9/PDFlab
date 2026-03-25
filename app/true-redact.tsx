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
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle,
  Eye,
  FileText,
  Share2,
  Shield,
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface PreviewMatch {
  page: number;
  text: string;
  count: number;
}

export default function TrueRedactScreen() {
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
  const [searchTerms, setSearchTerms] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [matches, setMatches] = useState<PreviewMatch[] | null>(null);
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // File source picker state
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const { files: libraryFiles } = useFileIndex();

  const hasLibraryPdfs = useMemo(
    () => libraryFiles.some((f) => f.extension?.toLowerCase() === "pdf" || f.type?.toLowerCase() === "pdf"),
    [libraryFiles],
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setMatches(null);
    setResultUri(null);
    setDone(false);
    setError(null);
  }, []);

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
      setSelectedFile({ name: res.files[0].name, uri: res.files[0].uri, mimeType: res.files[0].mimeType });
      setMatches(null);
      setResultUri(null);
      setDone(false);
      setError(null);
    }
  }, []);

  const handleLibrarySelect = useCallback((files: SelectedFile[]) => {
    setShowLibraryPicker(false);
    if (files.length === 0) return;
    setSelectedFile({ name: files[0].name, uri: files[0].uri, mimeType: files[0].mimeType });
    setMatches(null);
    setResultUri(null);
    setDone(false);
    setError(null);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!selectedFile || !searchTerms.trim()) return;
    setPreviewing(true);
    setError(null);
    setMatches(null);

    try {
      const formData = new FormData();
      formData.append("pdf", { uri: selectedFile.uri, type: selectedFile.mimeType, name: selectedFile.name } as any);
      formData.append("searchTerms", searchTerms);
      formData.append("caseSensitive", String(caseSensitive));

      const response = await fetch(API_ENDPOINTS.TOOLS.TRUE_REDACT_PREVIEW, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setMatches(data.matches || []);
    } catch (err: any) {
      setError(err.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, [selectedFile, searchTerms, caseSensitive]);

  const handleRedact = useCallback(async () => {
    if (!selectedFile || !searchTerms.trim()) return;

    Alert.alert(
      "Permanent Redaction",
      "This will permanently and irreversibly remove the matched content. The original text cannot be recovered. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Redact",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            setError(null);
            setResultUri(null);
            setDone(false);

            try {
              const formData = new FormData();
              formData.append("pdf", { uri: selectedFile.uri, type: selectedFile.mimeType, name: selectedFile.name } as any);
              formData.append("searchTerms", searchTerms);
              formData.append("caseSensitive", String(caseSensitive));

              const response = await fetch(API_ENDPOINTS.TOOLS.TRUE_REDACT, { method: "POST", body: formData });

              if (!response.ok) {
                const errData = await response.json().catch(() => null);
                throw new Error(errData?.error || `Server error: ${response.status}`);
              }

              const data = await response.json();
              if (!data.downloadUrl) throw new Error("No download URL returned from server");

              const outputUri = `${FileSystem.cacheDirectory}redacted_${selectedFile.name}`;
              const downloadResult = await FileSystem.downloadAsync(data.downloadUrl, outputUri);
              if (downloadResult.status !== 200) {
                throw new Error(`Download failed with status ${downloadResult.status}`);
              }

              setResultUri(outputUri);
              setDone(true);
            } catch (err: any) {
              setError(err.message || "Redaction failed");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [selectedFile, searchTerms, caseSensitive]);

  const handleShare = useCallback(async () => {
    if (!resultUri) return;
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(resultUri);
  }, [resultUri]);

  const totalMatches = matches ? matches.reduce((s, m) => s + m.count, 0) : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.settingsBg }]}>
      <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={t.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>True Redaction</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Warning Banner */}
        <View style={[styles.warningBanner, { backgroundColor: colors.warningLight }]}>
          <AlertTriangle size={18} color={colors.warning} />
          <Text style={styles.warningText}>
            True redaction permanently removes content. It cannot be undone.
          </Text>
        </View>

        {/* File Picker */}
        <TouchableOpacity
          onPress={() => setShowSourcePicker(true)}
          style={[styles.filePicker, { backgroundColor: t.card, borderColor: t.border }]}
        >
          <FileText size={24} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.fileLabel, { color: t.text }]}>
              {selectedFile ? selectedFile.name : "Select a PDF"}
            </Text>
            {!selectedFile && (
              <Text style={[styles.fileSubLabel, { color: t.textSecondary }]}>Tap to choose from App or Device</Text>
            )}
          </View>
          {selectedFile && (
            <Pressable onPress={(e) => { e.stopPropagation(); clearFile(); }} hitSlop={8}>
              <X size={20} color={t.textSecondary} />
            </Pressable>
          )}
        </TouchableOpacity>

        {/* Success State */}
        {done && resultUri && (
          <View style={[styles.successContainer, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={styles.successIconCircle}>
              <CheckCircle color="#16a34a" size={40} />
            </View>
            <Text style={[styles.successTitle, { color: t.text }]}>Redaction Complete</Text>
            <Text style={[styles.successMessage, { color: t.textSecondary }]}>
              Content has been permanently removed from your PDF.
            </Text>
            <View style={styles.successActions}>
              <Pressable style={[styles.successBtn, { backgroundColor: "#10b981" }]} onPress={handleShare}>
                <Share2 color="#fff" size={18} />
                <Text style={styles.successBtnText}>Share Redacted PDF</Text>
              </Pressable>
              <Pressable
                style={[styles.successBtn, { backgroundColor: "#6366F1" }]}
                onPress={() => { setDone(false); setResultUri(null); setMatches(null); setSearchTerms(""); }}
              >
                <Check color="#fff" size={18} />
                <Text style={styles.successBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!done && (
          <>
            <Text style={[styles.label, { color: t.text }]}>Text to Redact</Text>
            <TextInput
              value={searchTerms}
              onChangeText={setSearchTerms}
              placeholder="Enter text, separate multiple with commas..."
              placeholderTextColor={t.textSecondary}
              multiline
              style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text, minHeight: 60 }]}
            />
            <Text style={[styles.hint, { color: t.textSecondary }]}>
              Separate multiple terms with commas
            </Text>

            <View style={[styles.toggleRow, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.toggleLabel, { color: t.text }]}>Case Sensitive</Text>
              <Switch value={caseSensitive} onValueChange={setCaseSensitive} />
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={handlePreview}
                disabled={!selectedFile || !searchTerms.trim() || previewing}
                style={[styles.previewBtn, { borderColor: t.primary }, (!selectedFile || !searchTerms.trim() || previewing) && styles.btnDisabled]}
              >
                {previewing ? (
                  <ActivityIndicator color={t.primary} size="small" />
                ) : (
                  <>
                    <Eye size={18} color={t.primary} />
                    <Text style={[styles.previewBtnText, { color: t.primary }]}>Preview</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRedact}
                disabled={!selectedFile || !searchTerms.trim() || loading}
                style={[styles.redactBtn, (!selectedFile || !searchTerms.trim() || loading) && styles.btnDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Shield size={18} color="#fff" />
                    <Text style={styles.redactBtnText}>Redact</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: colors.errorLight }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            {matches !== null && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.sectionTitle, { color: t.text }]}>
                  {totalMatches} occurrence{totalMatches !== 1 ? "s" : ""} found
                </Text>
                {totalMatches === 0 && (
                  <Text style={[styles.noMatches, { color: t.textSecondary }]}>No matches found</Text>
                )}
                {matches.map((m, idx) => (
                  <View key={idx} style={[styles.matchCard, { backgroundColor: t.card, borderColor: t.border }]}>
                    <Text style={[styles.matchPage, { color: t.textSecondary }]}>
                      Page {m.page} — {m.count} match{m.count > 1 ? "es" : ""}
                    </Text>
                    <Text style={[styles.matchText, { color: t.text }]}>"{m.text}"</Text>
                  </View>
                ))}
              </View>
            )}
          </>
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
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  warningText: { flex: 1, color: "#92400E", fontSize: 13, fontWeight: "500" },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  fileLabel: { fontSize: 15, fontWeight: "600" },
  fileSubLabel: { fontSize: 12, marginTop: 2 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    textAlignVertical: "top",
  },
  hint: { fontSize: 12, marginTop: 4, marginBottom: 12 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  toggleLabel: { fontSize: 15, fontWeight: "500" },
  btnRow: { flexDirection: "row", gap: 10 },
  previewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 2,
  },
  previewBtnText: { fontSize: 15, fontWeight: "700" },
  redactBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.error,
  },
  redactBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.45 },
  errorBox: { padding: 12, borderRadius: 8, marginTop: 12 },
  errorText: { fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  noMatches: { fontSize: 14, fontStyle: "italic" },
  matchCard: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  matchPage: { fontSize: 12, marginBottom: 2 },
  matchText: { fontSize: 14 },
  // Success UI
  successContainer: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  successTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  successMessage: { fontSize: 13, textAlign: "center", marginBottom: 20 },
  successActions: { width: "100%", gap: 8 },
  successBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  successBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
