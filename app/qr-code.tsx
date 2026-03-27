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
  QrCode,
  Share2,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const POSITIONS = [
  { key: "bottom-right", label: "Bottom Right" },
  { key: "bottom-left", label: "Bottom Left" },
  { key: "top-right", label: "Top Right" },
  { key: "top-left", label: "Top Left" },
  { key: "center", label: "Center" },
] as const;

export default function QRCodeScreen() {
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
  const [qrData, setQrData] = useState("");
  const [position, setPosition] = useState("bottom-right");
  const [size, setSize] = useState("100");
  const [pages, setPages] = useState("all");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // File source picker
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const { files: libraryFiles, addFile } = useFileIndex();

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
      setSelectedFile({ name: res.files[0].name, uri: res.files[0].uri, mimeType: res.files[0].mimeType });
      setResultUri(null);
      setDone(false);
      setError(null);
    }
  }, []);

  const handleLibrarySelect = useCallback((files: SelectedFile[]) => {
    setShowLibraryPicker(false);
    if (files.length === 0) return;
    setSelectedFile({ name: files[0].name, uri: files[0].uri, mimeType: files[0].mimeType });
    setResultUri(null);
    setDone(false);
    setError(null);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!qrData.trim()) return;
    setPreviewing(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.TOOLS.QRCODE_PREVIEW, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: qrData, size: parseInt(size) || 200 }),
      });

      if (!response.ok) throw new Error("Preview failed");

      const blob = await response.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setPreviewUri(dataUrl);
    } catch (err: any) {
      setError(err.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, [qrData, size]);

  const handleEmbed = useCallback(async () => {
    if (!selectedFile || !qrData.trim()) return;
    setLoading(true);
    setError(null);
    setResultUri(null);
    setDone(false);

    try {
      const formData = new FormData();
      formData.append("pdf", { uri: selectedFile.uri, type: selectedFile.mimeType, name: selectedFile.name } as any);
      formData.append("data", qrData);
      formData.append("position", position);
      formData.append("size", size);
      formData.append("pages", pages);

      const response = await fetch(API_ENDPOINTS.TOOLS.QRCODE, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.downloadUrl) throw new Error("No download URL returned from server");

      const outputDir = `${FileSystem.documentDirectory}pdfiq-outputs/`;
      await FileSystem.makeDirectoryAsync(outputDir, { intermediates: true });
      const outputName = `qr_${selectedFile.name}`;
      const outputUri = `${outputDir}${outputName}`;
      const downloadResult = await FileSystem.downloadAsync(data.downloadUrl, outputUri);
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }

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
      setError(err.message || "Failed to embed QR code");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, qrData, position, size, pages]);

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
        <Text style={[styles.headerTitle, { color: t.text }]}>QR Code</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* QR Data Input */}
        <Text style={[styles.label, { color: t.text }]}>QR Code Content</Text>
        <TextInput
          value={qrData}
          onChangeText={setQrData}
          placeholder="URL, text, or any data..."
          placeholderTextColor={t.textSecondary}
          style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
        />

        {/* Preview QR */}
        <TouchableOpacity
          onPress={handlePreview}
          disabled={!qrData.trim() || previewing}
          style={[styles.previewBtn, { borderColor: t.primary }, (!qrData.trim() || previewing) && styles.btnDisabled]}
        >
          {previewing ? (
            <ActivityIndicator color={t.primary} size="small" />
          ) : (
            <>
              <Eye size={16} color={t.primary} />
              <Text style={[styles.previewBtnText, { color: t.primary }]}>Preview QR</Text>
            </>
          )}
        </TouchableOpacity>

        {previewUri && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          </View>
        )}

        {/* File Picker */}
        <Text style={[styles.label, { color: t.text, marginTop: 16 }]}>PDF to Embed QR Into</Text>
        <TouchableOpacity
          onPress={() => setShowSourcePicker(true)}
          style={[styles.filePicker, { backgroundColor: t.card, borderColor: t.border }]}
        >
          <FileText size={22} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.fileLabel, { color: t.text }]}>
              {selectedFile ? selectedFile.name : "Select a PDF"}
            </Text>
            {!selectedFile && (
              <Text style={[styles.fileSubLabel, { color: t.textSecondary }]}>Tap to choose from App or Device</Text>
            )}
          </View>
          {selectedFile && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); setSelectedFile(null); setResultUri(null); setDone(false); }}
              hitSlop={8}
            >
              <X size={20} color={t.textSecondary} />
            </Pressable>
          )}
        </TouchableOpacity>

        {/* Position */}
        <Text style={[styles.label, { color: t.text }]}>Position</Text>
        <View style={styles.positionGrid}>
          {POSITIONS.map((p) => (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPosition(p.key)}
              style={[
                styles.positionChip,
                {
                  backgroundColor: position === p.key ? colors.primary : t.card,
                  borderColor: position === p.key ? colors.primary : t.border,
                },
              ]}
            >
              <Text style={{ color: position === p.key ? "#fff" : t.text, fontSize: 12, fontWeight: "600" }}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Size */}
        <Text style={[styles.label, { color: t.text }]}>Size (px)</Text>
        <TextInput
          value={size}
          onChangeText={setSize}
          keyboardType="numeric"
          placeholder="100"
          placeholderTextColor={t.textSecondary}
          style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
        />

        {/* Pages */}
        <Text style={[styles.label, { color: t.text }]}>Pages</Text>
        <TextInput
          value={pages}
          onChangeText={setPages}
          placeholder="all, or 1-3,5"
          placeholderTextColor={t.textSecondary}
          style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
        />

        {/* Embed Button */}
        <TouchableOpacity
          onPress={handleEmbed}
          disabled={!selectedFile || !qrData.trim() || loading}
          style={[styles.actionBtn, (!selectedFile || !qrData.trim() || loading) && styles.btnDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <QrCode size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Embed QR Code</Text>
            </>
          )}
        </TouchableOpacity>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.errorLight }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {/* Success State */}
        {done && resultUri && (
          <View style={[styles.successContainer, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={styles.successIconCircle}>
              <CheckCircle color="#16a34a" size={40} />
            </View>
            <Text style={[styles.successTitle, { color: t.text }]}>QR Code Embedded</Text>
            <Text style={[styles.successMessage, { color: t.textSecondary }]}>
              QR code has been successfully added to your PDF.
            </Text>
            <View style={styles.successActions}>
              <Pressable style={[styles.successBtn, { backgroundColor: "#10b981" }]} onPress={handleShare}>
                <Share2 color="#fff" size={18} />
                <Text style={styles.successBtnText}>Share PDF</Text>
              </Pressable>
              <Pressable
                style={[styles.successBtn, { backgroundColor: "#6366F1" }]}
                onPress={() => { setDone(false); setResultUri(null); }}
              >
                <Check color="#fff" size={18} />
                <Text style={styles.successBtnText}>Done</Text>
              </Pressable>
            </View>
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
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    marginBottom: 12,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 12,
  },
  previewBtnText: { fontSize: 14, fontWeight: "700" },
  previewContainer: {
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 12,
  },
  previewImage: { width: 160, height: 160 },
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
  positionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  positionChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnDisabled: { opacity: 0.45 },
  actionBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  errorBox: { padding: 12, borderRadius: 8, marginTop: 12 },
  errorText: { fontSize: 14 },
  // Success UI
  successContainer: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
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
