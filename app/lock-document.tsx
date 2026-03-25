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
  FileText,
  Key,
  Lock,
  Share2,
  Shield,
  Unlock,
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Tab = "secure" | "weak";

export default function LockDocumentScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const params = useLocalSearchParams<{
    file?: string;
    fileUri?: string;
    fileMimeType?: string;
  }>();

  const [tab, setTab] = useState<Tab>("secure");
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

  // Secure mode
  const [passphrase, setPassphrase] = useState("");
  const [expiresIn, setExpiresIn] = useState("24");
  const [maxOpens, setMaxOpens] = useState("");
  const [lockId, setLockId] = useState<string | null>(null);

  // Weak mode
  const [weakTitle, setWeakTitle] = useState("");
  const [weakExpiry, setWeakExpiry] = useState("");
  const [weakResultUri, setWeakResultUri] = useState<string | null>(null);
  const [weakDone, setWeakDone] = useState(false);

  // Check / Open
  const [checkLockId, setCheckLockId] = useState("");
  const [checkPassphrase, setCheckPassphrase] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File source picker
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const { files: libraryFiles } = useFileIndex();

  const hasLibraryPdfs = useMemo(
    () => libraryFiles.some((f) => f.extension?.toLowerCase() === "pdf" || f.type?.toLowerCase() === "pdf"),
    [libraryFiles],
  );

  const clearFileState = useCallback(() => {
    setLockId(null);
    setWeakResultUri(null);
    setWeakDone(false);
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
      clearFileState();
    }
  }, [clearFileState]);

  const handleLibrarySelect = useCallback((files: SelectedFile[]) => {
    setShowLibraryPicker(false);
    if (files.length === 0) return;
    setSelectedFile({ name: files[0].name, uri: files[0].uri, mimeType: files[0].mimeType });
    clearFileState();
  }, [clearFileState]);

  const handleSecureLock = useCallback(async () => {
    if (!selectedFile || !passphrase.trim()) {
      Alert.alert("Missing Info", "Please select a file and enter a passphrase.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("pdf", { uri: selectedFile.uri, type: selectedFile.mimeType, name: selectedFile.name } as any);
      formData.append("passphrase", passphrase);
      formData.append("expiresInHours", expiresIn || "24");
      if (maxOpens.trim()) formData.append("maxOpens", maxOpens);

      const response = await fetch(API_ENDPOINTS.TOOLS.LOCK_SET, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setLockId(data.lockId);
    } catch (err: any) {
      setError(err.message || "Lock failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, passphrase, expiresIn, maxOpens]);

  const handleCheckLock = useCallback(async () => {
    if (!checkLockId.trim()) return;
    setLoading(true);
    setError(null);
    setCheckResult(null);

    try {
      const response = await fetch(API_ENDPOINTS.TOOLS.LOCK_CHECK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lockId: checkLockId }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }
      setCheckResult(await response.json());
    } catch (err: any) {
      setError(err.message || "Check failed");
    } finally {
      setLoading(false);
    }
  }, [checkLockId]);

  const handleOpenLock = useCallback(async () => {
    if (!checkLockId.trim() || !checkPassphrase.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.TOOLS.LOCK_OPEN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lockId: checkLockId, passphrase: checkPassphrase }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }
      const data = await response.json();
      if (!data.granted) {
        Alert.alert("Access Denied", data.reason || "Could not open document.");
        return;
      }
      Alert.alert("Access Granted", `Document unlocked. Opens remaining: ${data.opensRemaining ?? "unlimited"}`);
    } catch (err: any) {
      setError(err.message || "Open failed");
    } finally {
      setLoading(false);
    }
  }, [checkLockId, checkPassphrase]);

  const handleWeakEmbed = useCallback(async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setWeakResultUri(null);
    setWeakDone(false);

    try {
      const formData = new FormData();
      formData.append("pdf", { uri: selectedFile.uri, type: selectedFile.mimeType, name: selectedFile.name } as any);
      if (weakTitle.trim()) formData.append("title", weakTitle);
      if (weakExpiry.trim()) formData.append("expiry", weakExpiry);
      else {
        // Default to 30 days from now if no expiry provided
        const defaultExpiry = new Date(Date.now() + 30 * 86400000).toISOString();
        formData.append("expiry", defaultExpiry);
      }

      const response = await fetch(API_ENDPOINTS.TOOLS.LOCK_EMBED, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.downloadUrl) throw new Error("No download URL returned from server");

      const outputUri = `${FileSystem.cacheDirectory}locked_${selectedFile.name}`;
      const downloadResult = await FileSystem.downloadAsync(data.downloadUrl, outputUri);
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }
      setWeakResultUri(outputUri);
      setWeakDone(true);
    } catch (err: any) {
      setError(err.message || "Embed failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, weakTitle, weakExpiry]);

  const handleShareWeak = useCallback(async () => {
    if (!weakResultUri) return;
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(weakResultUri);
  }, [weakResultUri]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.settingsBg }]}>
      <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={t.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>Lock Document</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: t.card }]}>
        <TouchableOpacity
          onPress={() => setTab("secure")}
          style={[styles.tab, tab === "secure" && { backgroundColor: colors.primary }]}
        >
          <Shield size={16} color={tab === "secure" ? "#fff" : t.text} />
          <Text style={[styles.tabText, { color: tab === "secure" ? "#fff" : t.text }]}>Secure Lock</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("weak")}
          style={[styles.tab, tab === "weak" && { backgroundColor: colors.primary }]}
        >
          <Lock size={16} color={tab === "weak" ? "#fff" : t.text} />
          <Text style={[styles.tabText, { color: tab === "weak" ? "#fff" : t.text }]}>Metadata Lock</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* File Picker */}
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
              onPress={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                clearFileState();
              }}
              hitSlop={8}
            >
              <X size={20} color={t.textSecondary} />
            </Pressable>
          )}
        </TouchableOpacity>

        {tab === "secure" && (
          <>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Create Secure Lock</Text>

            <Text style={[styles.label, { color: t.text }]}>Passphrase</Text>
            <TextInput
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="Enter a passphrase..."
              placeholderTextColor={t.textSecondary}
              secureTextEntry
              style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: t.text }]}>Expires In (hours)</Text>
                <TextInput
                  value={expiresIn}
                  onChangeText={setExpiresIn}
                  keyboardType="numeric"
                  placeholder="24"
                  placeholderTextColor={t.textSecondary}
                  style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: t.text }]}>Max Opens</Text>
                <TextInput
                  value={maxOpens}
                  onChangeText={setMaxOpens}
                  keyboardType="numeric"
                  placeholder="Unlimited"
                  placeholderTextColor={t.textSecondary}
                  style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSecureLock}
              disabled={!selectedFile || !passphrase.trim() || loading}
              style={[styles.actionBtn, (!selectedFile || !passphrase.trim() || loading) && styles.btnDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Lock size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Lock Document</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Lock success */}
            {lockId && (
              <View style={[styles.successBox, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
                <View style={styles.successBoxHeader}>
                  <CheckCircle size={20} color={colors.success} />
                  <Text style={[styles.successBoxTitle, { color: colors.success }]}>Document Locked</Text>
                </View>
                <Text style={styles.successBoxDetail}>Lock ID: {lockId}</Text>
                <Text style={styles.successBoxHint}>Save this Lock ID to check or revoke access later.</Text>
              </View>
            )}

            {/* Check / Open */}
            <Text style={[styles.sectionTitle, { color: t.text, marginTop: 24 }]}>Check / Open Lock</Text>
            <TextInput
              value={checkLockId}
              onChangeText={setCheckLockId}
              placeholder="Enter Lock ID..."
              placeholderTextColor={t.textSecondary}
              style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
            />
            <View style={styles.row}>
              <TouchableOpacity
                onPress={handleCheckLock}
                disabled={!checkLockId.trim() || loading}
                style={[styles.checkBtn, { borderColor: colors.primary }, (!checkLockId.trim() || loading) && styles.btnDisabled]}
              >
                <Key size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Check</Text>
              </TouchableOpacity>
              <TextInput
                value={checkPassphrase}
                onChangeText={setCheckPassphrase}
                placeholder="Passphrase"
                placeholderTextColor={t.textSecondary}
                secureTextEntry
                style={[styles.input, { flex: 1, backgroundColor: t.card, borderColor: t.border, color: t.text, marginBottom: 0 }]}
              />
              <TouchableOpacity
                onPress={handleOpenLock}
                disabled={!checkLockId.trim() || !checkPassphrase.trim() || loading}
                style={[styles.openBtn, (!checkLockId.trim() || !checkPassphrase.trim() || loading) && styles.btnDisabled]}
              >
                <Unlock size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700" }}>Open</Text>
              </TouchableOpacity>
            </View>

            {checkResult && (
              <View style={[styles.resultBox, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[{ color: checkResult.granted ? colors.success : colors.error, fontWeight: "600" }]}>
                  {checkResult.granted ? "Access Granted" : `Denied: ${checkResult.reason}`}
                </Text>
                {checkResult.expiryDate && (
                  <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                    Expires: {new Date(checkResult.expiryDate).toLocaleString()}
                  </Text>
                )}
                {checkResult.expiresIn && (
                  <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                    {checkResult.expiresIn}
                  </Text>
                )}
                {checkResult.opensRemaining != null && (
                  <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                    Opens remaining: {checkResult.opensRemaining}
                  </Text>
                )}
              </View>
            )}
          </>
        )}

        {tab === "weak" && (
          <>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Embed Metadata Lock</Text>
            <Text style={{ color: t.textSecondary, fontSize: 13, marginBottom: 12 }}>
              Embeds lock metadata into the PDF's XMP. This is advisory only and not enforced server-side.
            </Text>

            <Text style={[styles.label, { color: t.text }]}>Document Title (optional)</Text>
            <TextInput
              value={weakTitle}
              onChangeText={setWeakTitle}
              placeholder="My Document"
              placeholderTextColor={t.textSecondary}
              style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
            />

            <Text style={[styles.label, { color: t.text }]}>Expiry Date (optional)</Text>
            <TextInput
              value={weakExpiry}
              onChangeText={setWeakExpiry}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={t.textSecondary}
              style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
            />

            <TouchableOpacity
              onPress={handleWeakEmbed}
              disabled={!selectedFile || loading}
              style={[styles.actionBtn, (!selectedFile || loading) && styles.btnDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Lock size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Embed Lock Metadata</Text>
                </>
              )}
            </TouchableOpacity>

            {weakDone && weakResultUri && (
              <View style={[styles.successContainer, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={styles.successIconCircle}>
                  <CheckCircle color="#16a34a" size={40} />
                </View>
                <Text style={[styles.successTitle, { color: t.text }]}>Metadata Embedded</Text>
                <Text style={[styles.successMessage, { color: t.textSecondary }]}>
                  Lock metadata has been embedded into your PDF.
                </Text>
                <View style={styles.successActions}>
                  <Pressable style={[styles.successBtn, { backgroundColor: "#10b981" }]} onPress={handleShareWeak}>
                    <Share2 color="#fff" size={18} />
                    <Text style={styles.successBtnText}>Save / Share PDF</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.successBtn, { backgroundColor: "#6366F1" }]}
                    onPress={() => { setWeakDone(false); setWeakResultUri(null); }}
                  >
                    <Check color="#fff" size={18} />
                    <Text style={styles.successBtnText}>Done</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.errorLight }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
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
  tabRow: {
    flexDirection: "row",
    padding: 4,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabText: { fontSize: 14, fontWeight: "700" },
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
  fileSubLabel: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    marginBottom: 12,
  },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
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
  checkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.success,
  },
  resultBox: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  errorBox: { padding: 12, borderRadius: 8, marginTop: 12 },
  errorText: { fontSize: 14 },
  successBox: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  successBoxHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  successBoxTitle: { fontSize: 16, fontWeight: "700" },
  successBoxDetail: { color: "#065F46", fontSize: 13, marginTop: 2 },
  successBoxHint: { color: "#065F46", fontSize: 12, marginTop: 8 },
  // Success screen
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
