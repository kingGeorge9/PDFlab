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
  Check,
  CheckCircle,
  Eye,
  FileText,
  Replace,
  Search,
  Share2,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  snippet: string;
}

export default function FindReplaceScreen() {
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

  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
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
  const { files: libraryFiles, addFile } = useFileIndex();

  const hasLibraryPdfs = useMemo(
    () => libraryFiles.some((f) => f.extension?.toLowerCase() === "pdf" || f.type?.toLowerCase() === "pdf"),
    [libraryFiles],
  );

  const handleSourceSelect = useCallback(
    async (source: FileSourceOption) => {
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
    },
    [],
  );

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
    if (!selectedFile || !searchText.trim()) return;
    setPreviewing(true);
    setError(null);
    setMatches(null);

    try {
      const formData = new FormData();
      formData.append("pdf", { uri: selectedFile.uri, type: selectedFile.mimeType, name: selectedFile.name } as any);
      formData.append("search", searchText);
      formData.append("caseSensitive", String(caseSensitive));

      const response = await fetch(API_ENDPOINTS.TOOLS.FIND_REPLACE_PREVIEW, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setMatches(data.matches || []);
      if (data.warning) {
        setError(data.warning);
      }
    } catch (err: any) {
      setError(err.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, [selectedFile, searchText, caseSensitive]);

  const handleReplace = useCallback(async () => {
    if (!selectedFile || !searchText.trim()) return;
    setLoading(true);
    setError(null);
    setResultUri(null);
    setDone(false);

    try {
      const formData = new FormData();
      formData.append("pdf", { uri: selectedFile.uri, type: selectedFile.mimeType, name: selectedFile.name } as any);
      formData.append("search", searchText);
      formData.append("replace", replaceText);
      formData.append("caseSensitive", String(caseSensitive));

      const response = await fetch(API_ENDPOINTS.TOOLS.FIND_REPLACE, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.downloadUrl) throw new Error("No download URL returned from server");

      // Save to documents directory so it persists, then register in the library
      const outputDir = `${FileSystem.documentDirectory}pdfiq-outputs/`;
      await FileSystem.makeDirectoryAsync(outputDir, { intermediates: true });
      const outputName = `replaced_${selectedFile.name}`;
      const outputUri = `${outputDir}${outputName}`;
      const downloadResult = await FileSystem.downloadAsync(data.downloadUrl, outputUri);
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }

      // Register in the app library
      await addFile({
        uri: outputUri,
        name: outputName,
        type: "pdf",
        extension: "pdf",
        mimeType: "application/pdf",
        source: "created",
      });

      setResultUri(outputUri);
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Replace failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, searchText, replaceText, caseSensitive]);

  const handleShare = useCallback(async () => {
    if (!resultUri) return;
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(resultUri);
  }, [resultUri]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.settingsBg }]}>
      <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={t.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>Find & Replace</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
          {selectedFile ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setMatches(null);
                setResultUri(null);
                setDone(false);
              }}
              hitSlop={8}
            >
              <X size={20} color={t.textSecondary} />
            </Pressable>
          ) : null}
        </TouchableOpacity>

        {/* Success State */}
        {done && resultUri && (
          <View style={[styles.successContainer, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={styles.successIconCircle}>
              <CheckCircle color="#16a34a" size={40} />
            </View>
            <Text style={[styles.successTitle, { color: t.text }]}>Find & Replace Complete</Text>
            <Text style={[styles.successMessage, { color: t.textSecondary }]}>
              Your PDF has been updated successfully.
            </Text>
            <View style={styles.successActions}>
              <Pressable style={[styles.successBtn, { backgroundColor: "#10b981" }]} onPress={handleShare}>
                <Share2 color="#fff" size={18} />
                <Text style={styles.successBtnText}>Share</Text>
              </Pressable>
              <Pressable
                style={[styles.successBtn, { backgroundColor: "#6366F1" }]}
                onPress={() => {
                  setDone(false);
                  setResultUri(null);
                  setMatches(null);
                  setSearchText("");
                  setReplaceText("");
                }}
              >
                <Check color="#fff" size={18} />
                <Text style={styles.successBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!done && (
          <>
            <Text style={[styles.label, { color: t.text }]}>Find</Text>
            <View style={[styles.inputRow, { backgroundColor: t.card, borderColor: t.border }]}>
              <Search size={18} color={t.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Text to find..."
                placeholderTextColor={t.textSecondary}
                style={[styles.inputInner, { color: t.text }]}
              />
            </View>

            <Text style={[styles.label, { color: t.text }]}>Replace With</Text>
            <View style={[styles.inputRow, { backgroundColor: t.card, borderColor: t.border }]}>
              <Replace size={18} color={t.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                value={replaceText}
                onChangeText={setReplaceText}
                placeholder="Replacement text (leave blank to delete)"
                placeholderTextColor={t.textSecondary}
                style={[styles.inputInner, { color: t.text }]}
              />
            </View>

            <View style={[styles.toggleRow, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.toggleLabel, { color: t.text }]}>Case Sensitive</Text>
              <Switch value={caseSensitive} onValueChange={setCaseSensitive} />
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={handlePreview}
                disabled={!selectedFile || !searchText.trim() || previewing}
                style={[styles.previewBtn, { borderColor: t.primary }, (!selectedFile || !searchText.trim() || previewing) && styles.btnDisabled]}
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
                onPress={handleReplace}
                disabled={!selectedFile || !searchText.trim() || loading}
                style={[styles.replaceBtn, (!selectedFile || !searchText.trim() || loading) && styles.btnDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Replace size={18} color="#fff" />
                    <Text style={styles.replaceBtnText}>Replace All</Text>
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
                  {matches.length} match{matches.length !== 1 ? "es" : ""} found
                </Text>
                {matches.length === 0 && (
                  <Text style={[styles.noMatches, { color: t.textSecondary }]}>No matches found for "{searchText}"</Text>
                )}
                {matches.map((m, idx) => (
                  <View key={idx} style={[styles.matchCard, { backgroundColor: t.card, borderColor: t.border }]}>
                    <Text style={[styles.matchPage, { color: t.textSecondary }]}>Page {m.page}</Text>
                    <Text style={[styles.matchSnippet, { color: t.text }]}>{m.snippet}</Text>
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
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  fileLabel: { fontSize: 15, fontWeight: "600" },
  fileSubLabel: { fontSize: 12, marginTop: 2 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  inputInner: { flex: 1, fontSize: 15, paddingVertical: 2 },
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
  replaceBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  replaceBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.45 },
  errorBox: { padding: 12, borderRadius: 8, marginTop: 12 },
  errorText: { fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  noMatches: { fontSize: 14, fontStyle: "italic" },
  matchCard: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  matchPage: { fontSize: 12, marginBottom: 2 },
  matchSnippet: { fontSize: 14 },
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
