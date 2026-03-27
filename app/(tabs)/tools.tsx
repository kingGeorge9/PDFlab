import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import {
  FileSourcePicker,
  type FileSourceOption,
} from "@/components/FileSourcePicker";
import { GradientView } from "@/components/GradientView";
import {
  LibraryFilePicker,
  type SelectedFile,
} from "@/components/LibraryFilePicker";
import { ToolCategory } from "@/components/ToolCategory";
import { colors } from "@/constants/theme";
import { toolCategories } from "@/constants/tools";
import { useFileIndex } from "@/hooks/useFileIndex";
import { pickFilesWithResult } from "@/services/document-manager";
import { upsertFileRecord } from "@/services/fileIndexService";
import { useTheme } from "@/services/ThemeProvider";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ============================================================================
// TYPES
// ============================================================================

interface PendingToolSelection {
  toolId: string;
  mimeTypes: string[];
  allowedExtensions: string[];
  allowMultiple: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
// STATIC TOOL CONFIGURATION (hoisted to module level to avoid recreation)
// ============================================================================

// Tools that require PDF files
const TOOLS_REQUIRING_PDF = new Set([
  "merge",
  "split",
  "remove",
  "extract",
  "organize",
  "reverse",
  "duplicate",
  "compress",
  "repair",
  "optimize-images",
  "remove-duplicates",
  "pdf-to-jpg",
  "pdf-to-png",
  "pdf-to-word",
  "pdf-to-text",
  "pdf-to-html",
  "pdf-to-ppt",
  "pdf-to-excel",
  "rotate",
  "crop",
  "watermark",
  "page-numbers",
  "sign",
  "redact",
  "flatten",
  "unlock",
  "protect",
  "compare",
  "ocr",
  "black-white",
  "encrypt",
  "decrypt",
  "annotate",
  "add-text",
  "add-stamps",
  "header-footer",
  "resize",
  "info",
  "metadata",
  "search",
  "validate",
  "fill-form",
  "extract-data",
  "diff",
  "merge-review",
  "fix-orientation",
  "remove-blank",
  "bookmarks",
  "hyperlinks",
  "attachments",
  // New dedicated-screen tools that need PDF input
  "extract-images",
  "find-replace",
  "highlight-export",
  "citation-extractor",
]);

// Tools that have dedicated screens (not tool-processor)
const DEDICATED_SCREEN_TOOLS: Record<string, string> = {
  "extract-images": "/extract-images",
  "batch-compress": "/batch-compress",
  "find-replace": "/find-replace",
  "qr-code": "/qr-code",
  "highlight-export": "/highlight-export",
  "citation-extractor": "/citation-extractor",
};

// Conversion tools with their MIME types and extensions
const CONVERSION_TOOLS: Record<
  string,
  { mimeTypes: string[]; extensions: string[] }
> = {
  "jpg-to-pdf": {
    mimeTypes: ["image/jpeg", "image/png", "image/*"],
    extensions: ["jpg", "jpeg", "png", "gif", "webp"],
  },
  "png-to-pdf": {
    mimeTypes: ["image/png", "image/jpeg", "image/*"],
    extensions: ["png", "jpg", "jpeg", "gif", "webp"],
  },
  "word-to-pdf": {
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
    extensions: ["docx", "doc"],
  },
  "ppt-to-pdf": {
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ],
    extensions: ["pptx", "ppt"],
  },
  "excel-to-pdf": {
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    extensions: ["xlsx", "xls"],
  },
  "html-to-pdf": {
    mimeTypes: ["text/html", "*/*"],
    extensions: ["html", "htm"],
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ToolsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = useCallback(
    (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] })),
    [],
  );
  const [loading, setLoading] = useState(false);

  // File index for checking library file availability
  const { files: libraryFiles } = useFileIndex();

  // File source picker state
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [pendingTool, setPendingTool] = useState<PendingToolSelection | null>(
    null,
  );

  // Check if the library has files matching the pending tool's allowed extensions
  const hasMatchingLibraryFiles = useMemo(() => {
    if (!pendingTool) return true;
    const exts = pendingTool.allowedExtensions.map((e) => e.toLowerCase());
    return libraryFiles.some((f) => {
      const ext = f.extension?.toLowerCase();
      const type = f.type?.toLowerCase();
      return exts.includes(ext) || exts.includes(type);
    });
  }, [pendingTool, libraryFiles]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleToolPress = useCallback((toolId: string) => {
    // Batch compress: navigate directly (no file pre-pick needed, multi-file picker is in-screen)
    if (toolId === "batch-compress") {
      router.push("/batch-compress" as any);
      return;
    }

    // QR Code: can start without a file (preview first, then pick)
    if (toolId === "qr-code") {
      router.push("/qr-code" as any);
      return;
    }

    // Text to PDF: navigate directly to tool-processor with text input (no file needed)
    if (toolId === "text-to-pdf") {
      router.push({
        pathname: "/tool-processor",
        params: {
          tool: toolId,
          file: "text-input.pdf",
          fileUri: "",
          fileMimeType: "text/plain",
        },
      });
      return;
    }

    // Determine file requirements for this tool
    if (TOOLS_REQUIRING_PDF.has(toolId)) {
      // PDF tool - show source picker
      setPendingTool({
        toolId,
        mimeTypes: ["application/pdf"],
        allowedExtensions: ["pdf"],
        allowMultiple: ["merge", "compare", "diff", "merge-review"].includes(
          toolId,
        ),
      });
      setShowSourcePicker(true);
    } else if (CONVERSION_TOOLS[toolId]) {
      // Conversion tool - show source picker
      const config = CONVERSION_TOOLS[toolId];
      setPendingTool({
        toolId,
        mimeTypes: config.mimeTypes,
        allowedExtensions: config.extensions,
        allowMultiple: toolId.includes("jpg-to") || toolId.includes("png-to"),
      });
      setShowSourcePicker(true);
    } else {
      // Tool not yet implemented
      Alert.alert(
        "Coming Soon",
        `The "${toolId}" tool is currently under development. Check back soon!`,
      );
    }
  }, []);

  const handleSourceSelect = useCallback(
    async (source: FileSourceOption) => {
      setShowSourcePicker(false);

      if (!source || !pendingTool) {
        setPendingTool(null);
        return;
      }

      if (source === "library") {
        // Show library picker
        setShowLibraryPicker(true);
      } else if (source === "device") {
        // Use device file picker (existing flow)
        await handleDevicePicker();
      }
    },
    [pendingTool],
  );

  const handleDevicePicker = useCallback(async () => {
    if (!pendingTool) return;

    setLoading(true);

    try {
      const result = await pickFilesWithResult({
        types: pendingTool.mimeTypes,
        multiple: pendingTool.allowMultiple,
        copyToCacheDirectory: true,
        showAlerts: true,
      });

      if (result.cancelled) {
        setLoading(false);
        setPendingTool(null);
        return;
      }

      if (!result.success || result.files.length === 0) {
        Alert.alert("Error", "Please select a file to continue.");
        setLoading(false);
        setPendingTool(null);
        return;
      }

      // For merge/compare/diff/merge-review, require at least 2 files
      const multiFileTools = ["merge", "compare", "diff", "merge-review"];
      if (
        multiFileTools.includes(pendingTool.toolId) &&
        result.files.length < 2
      ) {
        Alert.alert(
          "Insufficient Files",
          "Please select at least 2 PDF files.",
        );
        setLoading(false);
        setPendingTool(null);
        return;
      }

      const file = result.files[0];

      // Import the file(s) to the library (file index)
      for (const f of result.files) {
        await upsertFileRecord({
          uri: f.uri,
          name: f.name,
          mimeType: f.mimeType,
          extension: f.extension,
          size: f.size,
          source: "imported",
          sourceTags: ["imported"],
        });
      }

      // Navigate to the appropriate screen
      if (pendingTool.toolId === "sign") {
        router.push({
          pathname: "/sign-document",
          params: {
            file: file.name,
            fileUri: file.uri,
            fileMimeType: file.mimeType,
          },
        });
      } else if (DEDICATED_SCREEN_TOOLS[pendingTool.toolId]) {
        router.push({
          pathname: DEDICATED_SCREEN_TOOLS[pendingTool.toolId] as any,
          params: {
            file: file.name,
            fileUri: file.uri,
            fileMimeType: file.mimeType,
          },
        });
      } else {
        const navParams: Record<string, string> = {
          tool: pendingTool.toolId,
          file: file.name,
          fileUri: file.uri,
          fileMimeType: file.mimeType,
        };

        // For multi-file tools, pass additional files as JSON
        if (
          multiFileTools.includes(pendingTool.toolId) &&
          result.files.length > 1
        ) {
          const additionalFiles = result.files.slice(1).map((f: any) => ({
            uri: f.uri,
            name: f.name,
            mimeType: f.mimeType,
          }));
          navParams.additionalFiles = JSON.stringify(additionalFiles);
        }

        router.push({
          pathname: "/tool-processor",
          params: navParams,
        });
      }
    } catch (error) {
      console.error("Tool error:", error);
      Alert.alert(
        "Error",
        `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
      setPendingTool(null);
    }
  }, [pendingTool, router]);

  const handleLibrarySelect = useCallback(
    (files: SelectedFile[]) => {
      setShowLibraryPicker(false);

      if (!pendingTool || files.length === 0) {
        setPendingTool(null);
        return;
      }

      // For multi-file tools, we need at least 2 files
      const multiFileTools = ["merge", "compare", "diff", "merge-review"];
      if (multiFileTools.includes(pendingTool.toolId) && files.length < 2) {
        Alert.alert(
          "Insufficient Files",
          "Please select at least 2 PDF files.",
        );
        setPendingTool(null);
        return;
      }

      const file = files[0];

      // Navigate to the appropriate screen
      if (pendingTool.toolId === "sign") {
        router.push({
          pathname: "/sign-document",
          params: {
            file: file.name,
            fileUri: file.uri,
            fileMimeType: file.mimeType,
          },
        });
      } else if (DEDICATED_SCREEN_TOOLS[pendingTool.toolId]) {
        router.push({
          pathname: DEDICATED_SCREEN_TOOLS[pendingTool.toolId] as any,
          params: {
            file: file.name,
            fileUri: file.uri,
            fileMimeType: file.mimeType,
          },
        });
      } else {
        const params: Record<string, string> = {
          tool: pendingTool.toolId,
          file: file.name,
          fileUri: file.uri,
          fileMimeType: file.mimeType,
        };

        // For multi-file tools, pass additional files as JSON
        if (multiFileTools.includes(pendingTool.toolId) && files.length > 1) {
          const additionalFiles = files.slice(1).map((f) => ({
            uri: f.uri,
            name: f.name,
            mimeType: f.mimeType,
          }));
          params.additionalFiles = JSON.stringify(additionalFiles);
        }

        router.push({
          pathname: "/tool-processor",
          params,
        });
      }

      setPendingTool(null);
    },
    [pendingTool, router],
  );

  const handleCloseSourcePicker = useCallback(() => {
    setShowSourcePicker(false);
    setPendingTool(null);
  }, []);

  const handleCloseLibraryPicker = useCallback(() => {
    setShowLibraryPicker(false);
    setPendingTool(null);
  }, []);

  // ============================================================================
  // GET PICKER TITLE BASED ON TOOL
  // ============================================================================

  const getPickerTitle = useCallback(() => {
    if (!pendingTool) return "Select File";
    const toolId = pendingTool.toolId;

    if (toolId === "merge") return "Select PDFs to Merge";
    if (toolId.includes("pdf-to")) return "Select PDF to Convert";
    if (toolId.includes("-to-pdf")) return "Select File to Convert";
    if (TOOLS_REQUIRING_PDF.has(toolId)) return "Select PDF";

    return "Select File";
  }, [pendingTool]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: themeColors.settingsBg }]}
    >
      {/* Header */}
      <AppHeaderContainer>
        <GradientView
          colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backBtn}
          >
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleArea}>
            <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>
              PDF Tools
            </Text>
          </View>
          <View style={styles.headerRight} />
        </GradientView>
      </AppHeaderContainer>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {toolCategories.map((category) => (
          <ToolCategory
            key={category.id}
            category={category}
            expanded={!!expanded[category.id]}
            onToggle={() => toggle(category.id)}
            onToolPress={handleToolPress}
          />
        ))}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <View
            style={[styles.loadingCard, { backgroundColor: themeColors.card }]}
          >
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={[styles.loadingText, { color: themeColors.text }]}>
              Processing...
            </Text>
            <Text
              style={[
                styles.loadingSubtext,
                { color: themeColors.textSecondary },
              ]}
            >
              Please wait
            </Text>
          </View>
        </View>
      )}

      {/* File Source Picker Modal */}
      <FileSourcePicker
        visible={showSourcePicker}
        onClose={handleCloseSourcePicker}
        onSelect={handleSourceSelect}
        title={getPickerTitle()}
        description={hasMatchingLibraryFiles ? "Choose where to get your file from" : "Pick a file from your device"}
        allowMultiple={pendingTool?.allowMultiple}
        showLibraryOption={hasMatchingLibraryFiles}
      />

      {/* Library File Picker Modal */}
      <LibraryFilePicker
        visible={showLibraryPicker}
        onClose={handleCloseLibraryPicker}
        onSelect={handleLibrarySelect}
        allowedTypes={pendingTool?.allowedExtensions}
        multiple={pendingTool?.allowMultiple}
        title={getPickerTitle()}
      />
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  headerTitleArea: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerRight: {
    width: 40,
  },
  // listContent: {
  //   paddingTop: 1,
  //   paddingBottom: 1,
  // },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: "center",
    minWidth: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 12,
  },
});
