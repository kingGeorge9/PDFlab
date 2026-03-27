import { API_BASE_URL } from "@/config/api";
import { LibraryFilePicker, type SelectedFile as LibSelectedFile } from "@/components/LibraryFilePicker";
import { colors, spacing } from "@/constants/theme";
import { pickFilesWithResult } from "@/services/document-manager";
import { notifyProcessingComplete } from "@/services/notificationService";
import { loadSettings } from "@/services/settingsService";
import {
  getToolConfig,
  isToolSupported,
  processWithTool,
  wakeUpBackend,
} from "@/services/pdfToolsService";
import { useTheme } from "@/services/ThemeProvider";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  DefaultResultUI,
  DiffResultUI,
  InfoResultUI,
  SearchResultUI,
  ValidateResultUI,
} from "@/components/ToolResultRenderers";
import {
  VisualToolEditor,
  VisualCropEditor,
  type PlacementResult,
  type VisualToolType,
  type CropMargins,
} from "@/components/VisualToolEditor";
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronRight,
  ClipboardPaste,
  Eye,
  FileText,
  Paperclip,
  PenLine,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ============================================================================
// MODULE-LEVEL PURE FUNCTIONS & CONSTANTS
// ============================================================================

const TOOL_TITLES: Record<string, string> = {
  split: "Split PDF",
  remove: "Remove Pages",
  extract: "Extract Pages",
  organize: "Organize Pages",
  compress: "Compress PDF",
  rotate: "Rotate PDF",
  watermark: "Add Watermark/Logo",
  merge: "Merge PDFs",
  crop: "Crop PDF",
  "page-numbers": "Add Page Numbers",
  protect: "Password Protect",
  unlock: "Remove Password",
  reverse: "Reverse Pages",
  duplicate: "Duplicate Pages",
  repair: "Repair PDF",
  "optimize-images": "Optimize Images",
  "remove-duplicates": "Remove Duplicates",
  flatten: "Flatten PDF",
  redact: "Redact Content",
  annotate: "Annotate PDF",
  "add-text": "Add Text",
  "add-stamps": "Add Stamps",
  ocr: "OCR (Extract Text)",
  "black-white": "Convert to Grayscale",
  encrypt: "Encrypt PDF",
  decrypt: "Decrypt File",
  compare: "Compare PDFs",
  "header-footer": "Add Header & Footer",
  resize: "Resize Pages",
  "fill-form": "Fill Form",
  "extract-data": "Extract Form Data",
  diff: "Show Differences",
  "merge-review": "Merge Reviews",
  "fix-orientation": "Fix Orientation",
  "remove-blank": "Remove Blank Pages",
  bookmarks: "Add Bookmarks",
  hyperlinks: "Add Hyperlinks",
  attachments: "Manage Attachments",
  "pdf-to-word": "PDF to Word",
  "pdf-to-jpg": "PDF to Images",
  "word-to-pdf": "Word to PDF",
  "jpg-to-pdf": "Images to PDF",
  "ppt-to-pdf": "PowerPoint to PDF",
  "excel-to-pdf": "Excel to PDF",
  "pdf-to-text": "PDF to Text",
  "pdf-to-html": "PDF to HTML",
  "text-to-pdf": "Text to PDF",
  "html-to-pdf": "HTML to PDF",
  "png-to-pdf": "PNG to PDF",
  "pdf-to-png": "PDF to PNG",
  info: "PDF Info",
  metadata: "Edit Metadata",
  search: "Search PDF",
  validate: "Validate PDF",
  "read-aloud": "Read Aloud",
  "pdf-to-ppt": "PDF to PowerPoint",
  "pdf-to-excel": "PDF to Excel",
  "extract-images": "Extract Images",
  "batch-compress": "Batch Compress",
  "find-replace": "Find & Replace",
  "qr-code": "QR Code",
  "highlight-export": "Export Highlights",
  "citation-extractor": "Citation Extractor",
};

const getTitle = (tool: string): string => TOOL_TITLES[tool] || "Process File";

// Unit conversion helpers for resize tool
const ptToUnit = (pt: number, unit: "mm" | "in" | "pt"): number => {
  if (unit === "mm") return (pt * 25.4) / 72;
  if (unit === "in") return pt / 72;
  return pt;
};
const unitToPt = (val: number, unit: "mm" | "in" | "pt"): number => {
  if (unit === "mm") return (val * 72) / 25.4;
  if (unit === "in") return val * 72;
  return val;
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  compress: "Reduce file size while maintaining quality.",
  rotate: "Rotate all pages in the PDF.",
  watermark: "Add watermark text to your PDF.",
  split: "Enter page numbers where you want to split the PDF.",
  remove: "Enter page numbers or ranges to process.",
  extract: "Enter page numbers or ranges to process.",
  duplicate: "Duplicate pages in your PDF.",
  protect: "Add password protection to your PDF.",
  unlock: "Remove password protection from your PDF.",
  encrypt:
    "Encrypt your PDF with AES-256-GCM encryption. Creates a .pdflab file.",
  decrypt: "Decrypt a .pdflab encrypted file back to PDF.",
  "header-footer": "Add header and footer text to every page.",
  "text-to-pdf": "Create a PDF from your text content.",
  annotate: "Add annotations to your PDF.",
  "add-text": "Add text at a specific position on a page.",
  "add-stamps": "Add a stamp (APPROVED, DRAFT, CONFIDENTIAL) to your PDF.",
  organize: "Reorder pages by entering the new page order.",
  resize: "Resize all pages to a new width and height.",
  info: "View page count, file size, and metadata.",
  metadata: "Edit the title, author, subject, and keywords.",
  search: "Search for text within your PDF.",
  validate: "Check your PDF for structural errors.",
  "fill-form": "Fill in form fields of a PDF.",
  "extract-data": "Extract form field data from your PDF.",
  diff: "Compare two PDFs side by side.",
  compare: "Compare two PDFs side by side.",
  "merge-review": "Compare two PDFs side by side.",
  "fix-orientation": "Auto-detect and fix page orientation.",
  "remove-blank": "Remove blank pages from your PDF.",
  bookmarks: "Add bookmarks / table of contents.",
  hyperlinks: "Add clickable hyperlinks to your PDF.",
  attachments: "Manage file attachments in your PDF.",
  "read-aloud": "Extract text from your PDF for reading aloud.",
  merge: "Combine multiple PDF files into a single document.",
  reverse: "Reverse the order of all pages in your PDF.",
  repair: "Attempt to fix a corrupted or damaged PDF file.",
  "optimize-images": "Compress and optimize images embedded in your PDF.",
  "remove-duplicates": "Detect and remove duplicate pages from your PDF.",
  "jpg-to-pdf": "Convert JPG images into a PDF document.",
  "png-to-pdf": "Convert PNG images into a PDF document.",
  "word-to-pdf": "Convert a Word document (.docx) to PDF.",
  "ppt-to-pdf": "Convert a PowerPoint presentation to PDF.",
  "excel-to-pdf": "Convert an Excel spreadsheet to PDF.",
  "html-to-pdf": "Convert an HTML file or web page to PDF.",
  "pdf-to-jpg": "Convert each PDF page to a JPG image.",
  "pdf-to-png": "Convert each PDF page to a PNG image.",
  "pdf-to-word": "Convert your PDF to an editable Word document.",
  "pdf-to-text": "Extract all text content from your PDF.",
  "pdf-to-html": "Convert your PDF to an HTML file.",
  "pdf-to-ppt": "Convert your PDF to a PowerPoint presentation.",
  "pdf-to-excel": "Convert your PDF to an Excel spreadsheet.",
  redact: "Black out a rectangular area to hide sensitive content.",
  crop: "Trim page edges by setting crop margins.",
  "page-numbers": "Add page numbers to every page of your PDF.",
  flatten: "Flatten form fields into static content.",
  ocr: "Run optical character recognition on scanned pages.",
  "black-white": "Convert all pages to grayscale (black & white).",
  "extract-images": "Extract all embedded images from your PDF.",
  "batch-compress": "Compress multiple PDFs at once.",
  "find-replace": "Find and replace text in your PDF.",
  "qr-code": "Add QR codes to your PDF pages.",
  "highlight-export": "Export annotations and highlights from your PDF.",
  "citation-extractor": "Extract and format academic references.",
};

const getToolDescription = (tool: string): string =>
  TOOL_DESCRIPTIONS[tool] || "Process your file with the selected tool.";

const parsePageInput = (input: string): number[] => {
  if (!input.trim()) return [];
  const pages: number[] = [];
  const parts = input.split(",").map((p) => p.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((n) => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          if (!pages.includes(i)) pages.push(i);
        }
      }
    } else {
      const page = parseInt(part);
      if (!isNaN(page) && !pages.includes(page)) {
        pages.push(page);
      }
    }
  }
  return pages.sort((a, b) => a - b);
};

/** Tool sets for O(1) conditional checks */
const PAGE_INPUT_TOOLS = new Set(["split", "remove", "extract"]);
const MULTI_FILE_TOOLS = new Set(["merge", "compare", "diff", "merge-review"]);

/** Static option arrays (avoid re-creation in render) */
const COMPRESSION_OPTIONS = [
  { id: "low", label: "Maximum Compression", desc: "Smallest file size" },
  { id: "medium", label: "Balanced", desc: "Good quality and size" },
  { id: "high", label: "High Quality", desc: "Larger file size" },
] as const;

const ROTATION_OPTIONS = [
  { angle: 90, label: "90° Clockwise" },
  { angle: 180, label: "180° (Flip)" },
  { angle: 270, label: "90° Counter-clockwise" },
  { angle: 0, label: "Reset to Original" },
] as const;

const STAMP_OPTIONS = [
  { id: "approved", label: "APPROVED", desc: "Green approval stamp" },
  { id: "draft", label: "DRAFT", desc: "Gray draft watermark" },
  { id: "confidential", label: "CONFIDENTIAL", desc: "Red confidential stamp" },
] as const;

const RESIZE_PRESETS = [
  { label: "A4", w: "595", h: "842" },
  { label: "A3", w: "842", h: "1191" },
  { label: "Letter", w: "612", h: "792" },
  { label: "Legal", w: "612", h: "1008" },
] as const;

/** Friendly position presets for text/annotation placement (PDF Letter page) */
const POSITION_PRESETS = [
  { id: "top-left", label: "Top Left", x: 50, y: 740 },
  { id: "top-center", label: "Top Center", x: 250, y: 740 },
  { id: "top-right", label: "Top Right", x: 450, y: 740 },
  { id: "center-left", label: "Center Left", x: 50, y: 400 },
  { id: "center", label: "Center", x: 250, y: 400 },
  { id: "center-right", label: "Center Right", x: 450, y: 400 },
  { id: "bottom-left", label: "Bottom Left", x: 50, y: 80 },
  { id: "bottom-center", label: "Bottom Center", x: 250, y: 80 },
  { id: "bottom-right", label: "Bottom Right", x: 450, y: 80 },
] as const;

/** Friendly redaction area presets */
const REDACT_PRESETS = [
  { id: "top-banner", label: "Top Banner", x: 0, y: 740, w: 612, h: 52 },
  { id: "bottom-banner", label: "Bottom Banner", x: 0, y: 0, w: 612, h: 52 },
  { id: "top-left-block", label: "Top-Left Block", x: 30, y: 700, w: 200, h: 60 },
  { id: "top-right-block", label: "Top-Right Block", x: 382, y: 700, w: 200, h: 60 },
  { id: "center-block", label: "Center Block", x: 156, y: 366, w: 300, h: 60 },
  { id: "custom", label: "Custom Area", x: 0, y: 0, w: 100, h: 20 },
] as const;

export default function ToolProcessorScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const { tool, file, fileUri, fileMimeType, additionalFiles } =
    useLocalSearchParams();

  // State for various tool options
  const [pageInput, setPageInput] = useState("");
  const [duplicateAll, setDuplicateAll] = useState(false);
  const [rotation, setRotation] = useState(90);
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkOpacity, setWatermarkOpacity] = useState("30");
  const [watermarkFontSize, setWatermarkFontSize] = useState("50");
  const [logoUri, setLogoUri] = useState("");
  const [logoPosition, setLogoPosition] = useState<
    "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"
  >("center");
  const [compressionQuality, setCompressionQuality] = useState<
    "low" | "medium" | "high"
  >("medium");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cropMargins, setCropMargins] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const [cropApplyTo, setCropApplyTo] = useState<"all" | "custom">("all");
  const [cropPageInput, setCropPageInput] = useState("");
  const [cropPreviewPage, setCropPreviewPage] = useState(1);
  // Scroll lock: prevents parent ScrollView from scrolling during crop drag
  const [scrollLocked, setScrollLocked] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [stampType, setStampType] = useState<
    "approved" | "draft" | "confidential"
  >("approved");

  // Header & Footer state
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  // Text to PDF state
  const [textContent, setTextContent] = useState("");
  const [textInputMode, setTextInputMode] = useState<"write" | "paste">("write");
  // Encrypt state
  const [encryptionType, setEncryptionType] = useState<"AES-128" | "AES-256">(
    "AES-256",
  );
  // Annotation position state
  const [annotationPage, setAnnotationPage] = useState("1");
  const [annotationX, setAnnotationX] = useState("50");
  const [annotationY, setAnnotationY] = useState("700");
  const [selectedPositionPreset, setSelectedPositionPreset] = useState("top-left");

  // Find & Replace state
  const [frSearchText, setFrSearchText] = useState("");
  const [frReplaceText, setFrReplaceText] = useState("");
  const [frCaseSensitive, setFrCaseSensitive] = useState(false);
  // Organize pages state
  const [pageOrderInput, setPageOrderInput] = useState("");
  // Resize state
  const [resizeWidth, setResizeWidth] = useState("595");
  const [resizeHeight, setResizeHeight] = useState("842");
  const [resizeOrientation, setResizeOrientation] = useState<"portrait" | "landscape">("portrait");
  const [resizeUnit, setResizeUnit] = useState<"mm" | "in" | "pt">("mm");
  const [resizeShowCustom, setResizeShowCustom] = useState(false);
  const [resizeCustomW, setResizeCustomW] = useState("");
  const [resizeCustomH, setResizeCustomH] = useState("");
  // Metadata state
  const [metaTitle, setMetaTitle] = useState("");
  const [metaAuthor, setMetaAuthor] = useState("");
  const [metaSubject, setMetaSubject] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [metaCreator, setMetaCreator] = useState("");
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  // Bookmarks state
  const [bookmarkTitle, setBookmarkTitle] = useState("Chapter 1");
  const [bookmarkPage, setBookmarkPage] = useState("1");
  // Hyperlinks state
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkText, setLinkText] = useState("");
  // Redact state
  const [redactPage, setRedactPage] = useState("1");
  const [redactX, setRedactX] = useState("0");
  const [redactY, setRedactY] = useState("0");
  const [redactWidth, setRedactWidth] = useState("100");
  const [redactHeight, setRedactHeight] = useState("20");
  const [selectedRedactPreset, setSelectedRedactPreset] = useState("top-banner");
  // Fill-form state: extracted field names + user-entered values
  const [fillFormFields, setFillFormFields] = useState<
    Array<{ name: string; value: string; type?: string; options?: string[] }>
  >([]);
  const [fillFormLoading, setFillFormLoading] = useState(false);
  const [fillFormLoaded, setFillFormLoaded] = useState(false);
  // Attachments state: files to attach
  const [attachmentFiles, setAttachmentFiles] = useState<
    Array<{ uri: string; name: string; mimeType: string }>
  >([]);
  const [showAttachSourcePicker, setShowAttachSourcePicker] = useState(false);
  const [showAttachLibraryPicker, setShowAttachLibraryPicker] = useState(false);

  // Visual placement state for tools that support tap-to-place
  const VISUAL_TOOLS = new Set(["add-text", "annotate", "redact", "add-stamps", "hyperlinks"]);
  const isVisualTool = VISUAL_TOOLS.has(tool as string);
  const needsPageInfo = isVisualTool || tool === "crop";
  const [visualPlacement, setVisualPlacement] = useState<PlacementResult>({
    pageNumber: 0,
    x: 200,
    y: 400,
    width: 200,
    height: 40,
  });
  const [pdfPageInfo, setPdfPageInfo] = useState({ pageCount: 1, pageWidth: 612, pageHeight: 792 });

  // Fetch PDF page info for visual tools and crop
  useEffect(() => {
    if (!needsPageInfo || !fileUri) return;
    (async () => {
      try {
        const form = new FormData();
        form.append("file", {
          uri: fileUri as string,
          name: (file as string) || "document.pdf",
          type: "application/pdf",
        } as any);
        const resp = await fetch(`${API_BASE_URL}/pdf/info`, {
          method: "POST",
          body: form,
        });
        if (resp.ok) {
          const data = await resp.json();
          setPdfPageInfo({
            pageCount: data.pageCount || 1,
            pageWidth: data.pageWidth || 612,
            pageHeight: data.pageHeight || 792,
          });
        }
      } catch {
        // Use defaults
      }
    })();
  }, [needsPageInfo, fileUri]);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [result, setResult] = useState<{
    success: boolean;
    outputUri?: string;
    outputFileName?: string;
    error?: string;
    message?: string;
  } | null>(null);

  // Guard against state updates on unmounted component
  const isMountedRef = useRef(true);
  // AbortController for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Abort any pending request on unmount
      abortControllerRef.current?.abort();
    };
  }, []);

  // Wake up backend on mount
  useEffect(() => {
    wakeUpBackend().catch(console.warn);
  }, []);

  // Extract existing form field names for fill-form tool
  const loadFormFields = async () => {
    if (!fileUri || fillFormLoaded) return;
    setFillFormLoading(true);
    try {
      const result = await processWithTool(
        {
          toolId: "extract-data",
          fileUri: fileUri as string,
          fileName: file as string,
          fileMimeType: (fileMimeType as string) || "application/pdf",
          params: {},
        },
        () => {},
      );
      if (result.success && result.jsonData) {
        const data = result.jsonData;
        // New API returns { fields: [{name, type, value, options}], count }
        const fields: Array<{ name: string; type?: string; value?: string; options?: string[] }> =
          data.fields || [];
        if (fields.length > 0) {
          setFillFormFields(
            fields.map((f) => ({
              name: f.name,
              type: f.type || "text",
              value: f.value || "",
              options: f.options,
            })),
          );
        } else {
          setFillFormFields([{ name: "", value: "", type: "text" }]);
        }
      } else {
        setFillFormFields([{ name: "", value: "", type: "text" }]);
      }
    } catch (e) {
      console.warn("Failed to extract form fields:", e);
      setFillFormFields([{ name: "", value: "" }]);
    } finally {
      setFillFormLoading(false);
      setFillFormLoaded(true);
    }
  };

  // Auto-load form fields when tool is fill-form
  useEffect(() => {
    if (tool === "fill-form" && fileUri && !fillFormLoaded) {
      loadFormFields();
    }
  }, [tool, fileUri]);

  // Pick attachment files from device
  const handlePickAttachmentsFromDevice = async () => {
    setShowAttachSourcePicker(false);
    try {
      const res = await pickFilesWithResult({
        types: ["*/*"],
        multiple: true,
        copyToCacheDirectory: true,
        showAlerts: true,
      });
      if (!res.cancelled && res.success && res.files.length > 0) {
        const newFiles = res.files.map((f: any) => ({
          uri: f.uri,
          name: f.name,
          mimeType: f.mimeType || "application/octet-stream",
        }));
        setAttachmentFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (e) {
      console.warn("Attachment device picker error:", e);
    }
  };

  // Pick attachment files from app library
  const handlePickAttachmentsFromLibrary = () => {
    setShowAttachSourcePicker(false);
    setShowAttachLibraryPicker(true);
  };

  // Handle library file selection for attachments
  const handleAttachLibrarySelect = useCallback((selected: LibSelectedFile[]) => {
    setShowAttachLibraryPicker(false);
    if (selected.length === 0) return;
    const newFiles = selected.map((f) => ({
      uri: f.uri,
      name: f.name,
      mimeType: f.mimeType || "application/octet-stream",
    }));
    setAttachmentFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // Show a simple action-sheet-style source picker
  const handlePickAttachments = () => {
    Alert.alert(
      "Add Attachment",
      "Where would you like to pick files from?",
      [
        {
          text: "From Device",
          onPress: handlePickAttachmentsFromDevice,
        },
        {
          text: "From App Library",
          onPress: handlePickAttachmentsFromLibrary,
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const handleProgress = useCallback(
    (progressValue: number, message: string) => {
      setProgress(progressValue);
      setProgressMessage(message);
    },
    [],
  );

  const handleProcess = async () => {
    if (isProcessing) return;

    // Validate inputs based on tool type
    if (PAGE_INPUT_TOOLS.has(tool as string)) {
      const pages = parsePageInput(pageInput);
      if (pages.length === 0) {
        Alert.alert(
          "Input Required",
          "Please enter page numbers or ranges (e.g., 1, 3, 5-9)",
        );
        return;
      }
    }

    if (tool === "duplicate" && !duplicateAll && !pageInput.trim()) {
      Alert.alert(
        "Input Required",
        "Please enter page numbers to duplicate or select ALL",
      );
      return;
    }

    if (tool === "watermark" && !watermarkText.trim() && !logoUri) {
      Alert.alert(
        "Input Required",
        "Please enter watermark text or select a logo.",
      );
      return;
    }

    if (tool === "protect") {
      if (!password.trim()) {
        Alert.alert("Input Required", "Please enter a password.");
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert(
          "Password Mismatch",
          "Passwords do not match. Please try again.",
        );
        return;
      }
    }

    if (tool === "unlock") {
      if (!password.trim()) {
        Alert.alert("Input Required", "Please enter the current password.");
        return;
      }
      // Show confirmation for removing password
      Alert.alert(
        "Confirm Action",
        "Are you sure you want to remove the password from this PDF?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove Password",
            style: "destructive",
            onPress: () => processFile(),
          },
        ],
      );
      return;
    }

    if (["annotate", "add-text"].includes(tool as string) && !noteText.trim()) {
      Alert.alert("Input Required", "Please enter text for annotation.");
      return;
    }

    if (tool === "header-footer" && !headerText.trim() && !footerText.trim()) {
      Alert.alert("Input Required", "Please enter header or footer text.");
      return;
    }

    if (tool === "text-to-pdf" && !textContent.trim()) {
      Alert.alert("Input Required", "Please enter or paste text content.");
      return;
    }

    if (tool === "encrypt") {
      if (!password.trim() || password.trim().length < 6) {
        Alert.alert(
          "Input Required",
          "Password must be at least 6 characters.",
        );
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert("Password Mismatch", "Passwords do not match.");
        return;
      }
    }

    if (tool === "decrypt") {
      if (!password.trim()) {
        Alert.alert("Input Required", "Please enter the decryption password.");
        return;
      }
    }

    if (tool === "organize" && !pageOrderInput.trim()) {
      Alert.alert(
        "Input Required",
        "Please enter the new page order (e.g., 3,1,2,4).",
      );
      return;
    }

    if (tool === "search" && !searchQuery.trim()) {
      Alert.alert("Input Required", "Please enter a search term.");
      return;
    }

    if (tool === "metadata") {
      if (
        !metaTitle.trim() &&
        !metaAuthor.trim() &&
        !metaSubject.trim() &&
        !metaKeywords.trim() &&
        !metaCreator.trim()
      ) {
        Alert.alert("Input Required", "Please fill in at least one field.");
        return;
      }
    }

    if (tool === "bookmarks" && !bookmarkTitle.trim()) {
      Alert.alert("Input Required", "Please enter a bookmark title.");
      return;
    }

    if (tool === "hyperlinks" && !linkUrl.trim()) {
      Alert.alert("Input Required", "Please enter a URL.");
      return;
    }

    if (tool === "fill-form") {
      const hasValues = fillFormFields.some(
        (f) => f.name.trim() && f.value.trim(),
      );
      if (!hasValues) {
        Alert.alert(
          "Input Required",
          "Please enter a value for at least one form field.",
        );
        return;
      }
    }

    if (tool === "attachments") {
      if (attachmentFiles.length === 0) {
        Alert.alert(
          "Input Required",
          "Please select at least one file to attach.",
        );
        return;
      }
    }

    // Show file size confirmation if the setting is ON
    const appSettings = await loadSettings();
    if (appSettings.showFileSizeBeforeProcessing && fileUri) {
      try {
        const info = await FileSystem.getInfoAsync(fileUri as string);
        const bytes = (info.exists && (info as any).size) ? (info as any).size : 0;
        const sizeLabel = bytes > 0
          ? bytes < 1024 ? `${bytes} B`
            : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
            : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
          : "unknown size";
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            "Ready to Process",
            `File: ${file || "document"}\nSize: ${sizeLabel}\n\nProceed with "${getTitle(tool as string)}"?`,
            [
              { text: "Cancel", style: "cancel", onPress: () => reject(new Error("cancelled")) },
              { text: "Process", onPress: () => resolve() },
            ],
          );
        });
      } catch {
        return; // User cancelled
      }
    }

    await processFile();
  };

  // Cancel the current processing request
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsProcessing(false);
    setProgress(0);
    setProgressMessage("");
    setResult(null);
  }, []);

  const processFile = async () => {
    // Create a new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsProcessing(true);
    setProgress(0);
    setProgressMessage("Starting...");
    setResult(null);

    try {
      // Check if tool is supported
      if (!isToolSupported(tool as string)) {
        Alert.alert(
          "Coming Soon",
          `The "${getTitle(tool as string)}" tool is currently under development. Check back soon!`,
        );
        setIsProcessing(false);
        return;
      }

      // Build parameters based on tool
      const params: Record<string, any> = {};

      switch (tool) {
        case "split": {
          // User enters split points (page numbers where the PDF should be divided).
          // E.g. for a 10-page PDF, entering "3, 7" means:
          //   Part 1: pages 1-3, Part 2: pages 4-7, Part 3: pages 8-10
          const splitPoints = parsePageInput(pageInput).sort((a, b) => a - b);
          if (splitPoints.length > 0) {
            const ranges: number[][] = [];
            let start = 0; // 0-based page index
            for (const point of splitPoints) {
              const end = point - 1; // convert 1-based to 0-based inclusive
              if (end >= start) {
                const range: number[] = [];
                for (let p = start; p <= end; p++) range.push(p);
                ranges.push(range);
                start = end + 1;
              }
            }
            // Remaining pages after last split point go into the final part
            // (handled by backend if needed, but we signal with a marker)
            // We'll add remaining pages as a final range — need total page count
            // Since we don't know total pages here, push -1 as sentinel
            // Actually, just add split points and let backend handle remainder
            params.pageRanges = ranges;
            params.splitAfterLastPoint = true; // tell backend to include remaining pages
          }
          break;
        }
        case "remove":
        case "extract":
          params.pages = parsePageInput(pageInput);
          break;
        case "duplicate":
          if (duplicateAll) {
            params.duplicateAll = true;
          } else {
            params.pages = parsePageInput(pageInput);
          }
          break;
        case "rotate":
          params.rotation = rotation;
          break;
        case "fix-orientation":
          params.rotation = rotation;
          if (pageInput.trim()) {
            params.pages = parsePageInput(pageInput);
          }
          break;
        case "watermark":
          if (watermarkText.trim()) {
            params.text = watermarkText;
            params.opacity = (parseInt(watermarkOpacity) || 30) / 100;
            params.fontSize = parseInt(watermarkFontSize) || 50;
          }
          break;
        case "compress":
          params.quality = compressionQuality;
          break;
        case "optimize-images": {
          // Map compression quality to image quality percentage
          const qualityMap = { low: 85, medium: 65, high: 45 };
          params.quality = qualityMap[compressionQuality] || 65;
          break;
        }
        case "protect":
          params.password = password.trim();
          break;
        case "unlock":
          params.password = password.trim();
          if (__DEV__) {
            console.log(
              `[ToolProcessor] unlock | pwdLen=${password.trim().length}`,
            );
          }
          break;
        case "crop":
          params.cropBox = {
            x: cropMargins.left,
            y: cropMargins.bottom,
            width: pdfPageInfo.pageWidth - cropMargins.left - cropMargins.right,
            height: pdfPageInfo.pageHeight - cropMargins.top - cropMargins.bottom,
          };
          if (cropApplyTo === "custom" && cropPageInput.trim()) {
            params.pages = parsePageInput(cropPageInput);
          }
          break;
        case "annotate":
        case "add-text": {
          params.text = noteText;
          // Use visual placement coordinates
          params.x = visualPlacement.x;
          params.y = visualPlacement.y;
          params.pageNumber = visualPlacement.pageNumber;
          if (pageInput.trim()) {
            params.pages = parsePageInput(pageInput);
          }
          break;
        }
        case "add-stamps":
          params.stampType = stampType;
          params.pageNumber = visualPlacement.pageNumber;
          if (pageInput.trim()) {
            params.pages = parsePageInput(pageInput);
          }
          break;

        case "header-footer":
          params.headerCenter = headerText;
          params.footerCenter = footerText;
          break;
        case "text-to-pdf":
          params.text = textContent;
          break;
        case "encrypt":
          params.password = password.trim();
          params.filename = file as string;
          break;
        case "decrypt":
          params.password = password.trim();
          break;
        case "organize":
          params.pageOrder = pageOrderInput
            .split(",")
            .map((n: string) => parseInt(n.trim(), 10))
            .filter((n: number) => !isNaN(n));
          break;
        case "resize":
          params.width = parseFloat(resizeWidth) || 595;
          params.height = parseFloat(resizeHeight) || 842;
          break;
        case "metadata": {
          const metaObj: Record<string, string> = {};
          if (metaTitle.trim()) metaObj.title = metaTitle;
          if (metaAuthor.trim()) metaObj.author = metaAuthor;
          if (metaSubject.trim()) metaObj.subject = metaSubject;
          if (metaKeywords.trim()) metaObj.keywords = metaKeywords;
          if (metaCreator.trim()) metaObj.creator = metaCreator;
          params.metadata = JSON.stringify(metaObj);
          break;
        }
        case "search":
          params.query = searchQuery;
          break;
        case "bookmarks":
          params.bookmarks = JSON.stringify([
            {
              title: bookmarkTitle,
              page: parseInt(bookmarkPage) || 1,
            },
          ]);
          break;
        case "hyperlinks": {
          const linkPages = pageInput.trim()
            ? parsePageInput(pageInput)
            : [];
          params.links = JSON.stringify([
            {
              url: linkUrl,
              text: linkText || linkUrl,
              pageNumber: visualPlacement.pageNumber,
              x: visualPlacement.x,
              y: visualPlacement.y,
              ...(linkPages.length > 0 ? { pages: linkPages } : {}),
            },
          ]);
          break;
        }
        case "redact": {
          // Use visual placement for redaction area
          params.pageNumber = visualPlacement.pageNumber;
          params.x = visualPlacement.x;
          params.y = visualPlacement.y;
          params.width = visualPlacement.width || 200;
          params.height = visualPlacement.height || 40;
          break;
        }
        case "find-replace":
          params.search = frSearchText;
          params.replace = frReplaceText;
          params.caseSensitive = frCaseSensitive ? "true" : "false";
          break;
        case "fill-form": {
          // Build key-value map from fill form fields
          const fillData: Record<string, string> = {};
          fillFormFields.forEach((f) => {
            if (f.name.trim() && f.value.trim()) {
              fillData[f.name] = f.value;
            }
          });
          params.data = JSON.stringify(fillData);
          break;
        }
        case "attachments":
          // Pass attachment files as JSON for pdfToolsService to append
          params.attachmentFiles = JSON.stringify(attachmentFiles);
          break;
      }

      // Parse additional files for merge / compare / diff / merge-review
      let parsedAdditionalFiles:
        | Array<{ uri: string; name: string; mimeType: string }>
        | undefined;
      if (MULTI_FILE_TOOLS.has(tool as string) && additionalFiles) {
        try {
          parsedAdditionalFiles = JSON.parse(additionalFiles as string);
        } catch (e) {
          console.warn("Failed to parse additionalFiles", e);
        }
      }

      // Process the file
      const processingResult = await processWithTool(
        {
          toolId: tool as string,
          fileUri: fileUri as string,
          fileName: file as string,
          fileMimeType: (fileMimeType as string) || "application/pdf",
          additionalFiles: parsedAdditionalFiles,
          params,
          signal: controller.signal,
        },
        handleProgress,
      );

      if (!isMountedRef.current || controller.signal.aborted) return;
      setResult(processingResult);

      if (processingResult.success) {
        setProgressMessage("Complete!");
        notifyProcessingComplete(file as string);
      } else {
        Alert.alert(
          "Processing Failed",
          processingResult.error ||
            "An error occurred while processing the file.",
        );
      }
    } catch (error) {
      console.error("Processing error:", error);
      if (!isMountedRef.current || controller.signal.aborted) return;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setResult({
        success: false,
        error: errorMessage,
      });
      Alert.alert(
        "Processing Failed",
        `An error occurred: ${errorMessage}\n\nPlease check your internet connection and try again.`,
      );
    } finally {
      if (isMountedRef.current && !controller.signal.aborted)
        setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleViewResult = () => {
    if (result?.outputUri) {
      // Navigate to the appropriate viewer based on output type
      const toolConfig = getToolConfig(tool as string);
      const extension = toolConfig?.outputExtension || "pdf";

      if (extension === "pdf") {
        router.push({
          pathname: "/pdf-viewer",
          params: {
            uri: result.outputUri,
            name: result.outputFileName || "Processed PDF",
          },
        });
      } else if (extension === "docx") {
        router.push({
          pathname: "/docx-viewer",
          params: {
            uri: result.outputUri,
            name: result.outputFileName || "Converted Document",
          },
        });
      } else {
        // For unsupported viewing types (images, html, txt, zip, etc.) — offer share
        Alert.alert(
          "File Saved",
          "This file type cannot be previewed in the app. Would you like to share it instead?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Share",
              onPress: () => handleShareResult(),
            },
          ],
        );
      }
    }
  };

  const handleShareResult = useCallback(async () => {
    if (!result?.outputUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Sharing Not Available", "Sharing is not available on this device.");
        return;
      }
      const rawName = result.outputFileName || "processed_file.pdf";
      const safeName = rawName
        .replace(/[\/\\:*?"<>|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const dest = `${FileSystem.cacheDirectory}${safeName}`;
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
      await FileSystem.copyAsync({ from: result.outputUri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: getToolConfig(tool as string)?.outputMimeType || "application/pdf",
        dialogTitle: "Share Processed File",
      });
    } catch (e) {
      console.warn("Share failed:", e);
    }
  }, [result?.outputUri, result?.outputFileName, tool]);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: t.card, borderBottomColor: t.border },
        ]}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => {
              if (isProcessing) {
                handleCancel();
              }
              router.back();
            }}
            style={{ padding: spacing.sm }}
          >
            <X color={t.text} size={20} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: t.text }]}>
              {getTitle(tool as string)}
            </Text>
            <Text
              style={[styles.headerSubtitle, { color: t.textSecondary }]}
              numberOfLines={1}
            >
              {file}
            </Text>
          </View>
        </View>

        {/* Process Button at Top - shown when not processing and no success result */}
        {!isProcessing && !result?.success && (
          <TouchableOpacity
            onPress={handleProcess}
            style={styles.processButtonTop}
            disabled={isProcessing}
          >
            <ChevronRight color="white" size={20} />
            <Text style={styles.processButtonText}>Process PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={Keyboard.dismiss}
          accessible={false}
        >
          <ScrollView
            style={{
              flex: 1,
              padding: spacing.md,
              backgroundColor: t.background,
            }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 200 }}
            automaticallyAdjustKeyboardInsets
            scrollEnabled={!scrollLocked}
          >
            {/* Processing Status */}
            {isProcessing && (
              <View
                style={[styles.processingCard, { backgroundColor: t.card }]}
              >
                <ActivityIndicator size="large" color={t.primary} />
                <Text style={[styles.processingTitle, { color: t.text }]}>
                  Processing...
                </Text>
                <Text
                  style={[styles.processingMessage, { color: t.textSecondary }]}
                >
                  {progressMessage}
                </Text>
                <View
                  style={[
                    styles.progressBarContainer,
                    { backgroundColor: t.backgroundSecondary },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${progress}%`, backgroundColor: t.primary },
                    ]}
                  />
                </View>
                <Text style={[styles.progressText, { color: t.textSecondary }]}>
                  {progress}%
                </Text>
                <TouchableOpacity
                  onPress={handleCancel}
                  style={{
                    marginTop: spacing.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.xl,
                    borderRadius: 10,
                    backgroundColor: "#EF4444",
                  }}
                >
                  <Text
                    style={{ color: "white", fontWeight: "600", fontSize: 14 }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Success Result — matches sign-document done screen */}
            {result?.success && !isProcessing && (
              <View style={styles.successContainer}>
                <View style={styles.successIconCircle}>
                  <CheckCircle color="#16a34a" size={40} />
                </View>
                <Text style={[styles.successTitle, { color: t.text }]}>
                  {getTitle(tool as string)} Complete
                </Text>
                <Text
                  style={[styles.successMessage, { color: t.textSecondary }]}
                >
                  {result.message ||
                    "Your file has been processed successfully."}
                </Text>

                {/* JSON Data Display — Professional result renderers */}
                {(result as any).jsonData && (
                  <View style={{ width: "100%", marginTop: spacing.md }}>
                    {(() => {
                      const data = (result as any).jsonData;
                      const currentTool = tool as string;

                      if (currentTool === "validate")
                        return <ValidateResultUI data={data} t={t} />;
                      if (currentTool === "info")
                        return <InfoResultUI data={data} t={t} />;
                      if (currentTool === "diff" || currentTool === "compare") {
                        let file2Name = "Modified";
                        try {
                          const af = JSON.parse(additionalFiles as string || "[]");
                          if (af[0]?.name) file2Name = af[0].name;
                        } catch {}
                        return (
                          <DiffResultUI
                            data={data}
                            t={t}
                            fileNames={[file as string, file2Name]}
                          />
                        );
                      }
                      if (currentTool === "search")
                        return (
                          <SearchResultUI
                            data={data}
                            t={t}
                            searchQuery={searchQuery}
                          />
                        );
                      return <DefaultResultUI data={data} t={t} />;
                    })()}
                  </View>
                )}

                {result.outputFileName && !(result as any).jsonData && (
                  <View
                    style={[
                      styles.fileInfoContainer,
                      { backgroundColor: t.backgroundSecondary },
                    ]}
                  >
                    <FileText color={t.primary} size={20} />
                    <Text style={[styles.fileInfoText, { color: t.text }]}>
                      {result.outputFileName}
                    </Text>
                  </View>
                )}

                <View style={styles.successActions}>
                  {!(result as any).jsonData && (
                    <>
                      <Pressable
                        style={[styles.successBtn, { backgroundColor: "#2563eb" }]}
                        onPress={handleViewResult}
                      >
                        <Eye color="white" size={20} />
                        <Text style={styles.successBtnText}>View File</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.successBtn, { backgroundColor: "#10b981" }]}
                        onPress={handleShareResult}
                      >
                        <Share2 color="white" size={20} />
                        <Text style={styles.successBtnText}>Share</Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable
                    style={[styles.successBtn, { backgroundColor: "#6366F1" }]}
                    onPress={handleDone}
                  >
                    <Check color="white" size={20} />
                    <Text style={styles.successBtnText}>Done</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Error Result */}
            {result && !result.success && !isProcessing && (
              <View style={[styles.errorCard, { backgroundColor: t.card }]}>
                <AlertCircle color="#EF4444" size={48} />
                <Text style={styles.errorTitle}>Processing Failed</Text>
                <Text style={[styles.errorMessage, { color: t.textSecondary }]}>
                  {result.error ||
                    "An error occurred while processing your file."}
                </Text>
                <View style={{ gap: spacing.sm, width: "100%", marginTop: spacing.sm }}>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={handleProcess}
                  >
                    <Text style={styles.retryButtonText}>Try Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.retryButton,
                      { backgroundColor: t.backgroundSecondary },
                    ]}
                    onPress={handleDone}
                  >
                    <Text style={[styles.retryButtonText, { color: t.text }]}>
                      Go Back
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Tool Options (shown when not processing and no result) */}
            {!isProcessing && !result && (
              <>
                {/* Description */}
                <View style={[styles.section, { backgroundColor: t.card }]}>
                  <Text
                    style={[styles.descriptionText, { color: t.textSecondary }]}
                  >
                    {getToolDescription(tool as string)}
                  </Text>
                </View>

                {/* Compress Options */}
                {(tool === "compress" || tool === "optimize-images") && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Compression Quality
                    </Text>
                    <View style={{ gap: spacing.sm }}>
                      {COMPRESSION_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.id}
                          onPress={() =>
                            setCompressionQuality(option.id as any)
                          }
                          style={[
                            styles.optionButton,
                            { backgroundColor: t.backgroundSecondary },
                            compressionQuality === option.id &&
                              styles.optionButtonActive,
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.optionText,
                                { color: t.text },
                                compressionQuality === option.id &&
                                  styles.optionTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                styles.optionDescription,
                                { color: t.textSecondary },
                              ]}
                            >
                              {option.desc}
                            </Text>
                          </View>
                          {compressionQuality === option.id && (
                            <Check color={colors.primary} size={20} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Rotate Options */}
                {(tool === "rotate" || tool === "fix-orientation") && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Rotation Angle
                    </Text>
                    <View style={{ gap: spacing.sm }}>
                      {ROTATION_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.angle}
                          onPress={() => setRotation(option.angle)}
                          style={[
                            styles.optionButton,
                            { backgroundColor: t.backgroundSecondary },
                            rotation === option.angle &&
                              styles.optionButtonActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionText,
                              { color: t.text },
                              rotation === option.angle &&
                                styles.optionTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                          {rotation === option.angle && (
                            <Check color={t.primary} size={20} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Page scope for fix-orientation */}
                    {tool === "fix-orientation" && (
                      <View style={{ marginTop: spacing.md }}>
                        <Text style={[styles.helperText, { color: t.textSecondary, marginBottom: spacing.xs }]}>
                          Apply to pages (leave empty for all pages)
                        </Text>
                        <TextInput
                          value={pageInput}
                          onChangeText={setPageInput}
                          placeholder="e.g. 1, 3, 5-7"
                          placeholderTextColor={t.textTertiary}
                          style={[
                            styles.textInput,
                            {
                              backgroundColor: t.backgroundSecondary,
                              color: t.text,
                            },
                          ]}
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                    )}
                  </View>
                )}

                {/* Watermark Options */}
                {tool === "watermark" && (
                  <>
                    <View style={[styles.section, { backgroundColor: t.card }]}>
                      <Text style={[styles.sectionTitle, { color: t.text }]}>
                        Watermark Text
                      </Text>
                      <TextInput
                        value={watermarkText}
                        onChangeText={setWatermarkText}
                        placeholder="Enter watermark text..."
                        placeholderTextColor={t.textTertiary}
                        style={[
                          styles.textInput,
                          {
                            backgroundColor: t.backgroundSecondary,
                            color: t.text,
                          },
                        ]}
                        maxLength={100}
                      />
                    </View>

                    <View style={[styles.section, { backgroundColor: t.card }]}>
                      <Text style={[styles.sectionTitle, { color: t.text }]}>
                        Settings
                      </Text>
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.helperText,
                              { color: t.textSecondary, marginBottom: 4 },
                            ]}
                          >
                            Opacity (%)
                          </Text>
                          <TextInput
                            value={watermarkOpacity}
                            onChangeText={setWatermarkOpacity}
                            placeholder="30"
                            placeholderTextColor={t.textTertiary}
                            style={[
                              styles.textInput,
                              {
                                backgroundColor: t.backgroundSecondary,
                                color: t.text,
                              },
                            ]}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.helperText,
                              { color: t.textSecondary, marginBottom: 4 },
                            ]}
                          >
                            Font Size
                          </Text>
                          <TextInput
                            value={watermarkFontSize}
                            onChangeText={setWatermarkFontSize}
                            placeholder="50"
                            placeholderTextColor={t.textTertiary}
                            style={[
                              styles.textInput,
                              {
                                backgroundColor: t.backgroundSecondary,
                                color: t.text,
                              },
                            ]}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    </View>
                  </>
                )}

                {/* Password Protection - with confirmation */}
                {tool === "protect" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Set Password
                    </Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter new password..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.md,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      maxLength={50}
                    />
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Confirm Password
                    </Text>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter password..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      maxLength={50}
                    />
                  </View>
                )}

                {/* Remove Password */}
                {tool === "unlock" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Enter Current Password
                    </Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter password to unlock..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      maxLength={50}
                    />
                  </View>
                )}

                {/* Page Input for Split/Remove/Extract Pages */}
                {PAGE_INPUT_TOOLS.has(tool as string) && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Page Numbers
                    </Text>
                    <Text
                      style={[styles.helperText, { color: t.textSecondary }]}
                    >
                      Enter page numbers or ranges (e.g., 1, 3, 5-9)
                    </Text>
                    <TextInput
                      value={pageInput}
                      onChangeText={setPageInput}
                      placeholder="e.g., 1, 3, 5-9"
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      keyboardType="default"
                    />
                  </View>
                )}

                {/* Duplicate Pages - with ALL option */}
                {tool === "duplicate" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Duplicate Options
                    </Text>
                    <TouchableOpacity
                      onPress={() => setDuplicateAll(!duplicateAll)}
                      style={[
                        styles.optionButton,
                        { backgroundColor: t.backgroundSecondary },
                        duplicateAll && styles.optionButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          { color: t.text },
                          duplicateAll && styles.optionTextActive,
                        ]}
                      >
                        Duplicate ALL pages
                      </Text>
                      {duplicateAll && <Check color={t.primary} size={20} />}
                    </TouchableOpacity>

                    {!duplicateAll && (
                      <>
                        <Text
                          style={[
                            styles.helperText,
                            { marginTop: spacing.md, color: t.textSecondary },
                          ]}
                        >
                          Or enter specific page numbers/ranges:
                        </Text>
                        <TextInput
                          value={pageInput}
                          onChangeText={setPageInput}
                          placeholder="e.g., 18, 44 or 2-5"
                          placeholderTextColor={t.textTertiary}
                          style={[
                            styles.textInput,
                            {
                              backgroundColor: t.backgroundSecondary,
                              color: t.text,
                            },
                          ]}
                          keyboardType="default"
                          editable={!duplicateAll}
                        />
                      </>
                    )}
                  </View>
                )}

                {/* Encrypt PDF */}
                {tool === "encrypt" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Encryption Password
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: t.textSecondary,
                        marginBottom: spacing.sm,
                      }}
                    >
                      AES-256-GCM encryption. Minimum 6 characters.
                    </Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Create a strong password..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.sm,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      maxLength={50}
                    />
                    {password.length > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: spacing.sm,
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                            height: 4,
                            backgroundColor: t.backgroundSecondary,
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              height: "100%",
                              borderRadius: 2,
                              width:
                                password.length < 6
                                  ? "20%"
                                  : password.length < 10
                                    ? "40%"
                                    : password.length >= 12 &&
                                        /[^A-Za-z0-9]/.test(password)
                                      ? "100%"
                                      : /[A-Z]/.test(password) &&
                                          /[0-9]/.test(password)
                                        ? "80%"
                                        : "60%",
                              backgroundColor:
                                password.length < 6
                                  ? "#e74c3c"
                                  : password.length < 10
                                    ? "#e67e22"
                                    : password.length >= 12 &&
                                        /[^A-Za-z0-9]/.test(password)
                                      ? "#2ecc71"
                                      : /[A-Z]/.test(password) &&
                                          /[0-9]/.test(password)
                                        ? "#27ae60"
                                        : "#f1c40f",
                            }}
                          />
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color:
                              password.length < 6
                                ? "#e74c3c"
                                : password.length < 10
                                  ? "#e67e22"
                                  : "#27ae60",
                          }}
                        >
                          {password.length < 6
                            ? "Too short"
                            : password.length < 10
                              ? "Weak"
                              : password.length >= 12 &&
                                  /[^A-Za-z0-9]/.test(password)
                                ? "Strong"
                                : /[A-Z]/.test(password) &&
                                    /[0-9]/.test(password)
                                  ? "Good"
                                  : "Medium"}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Confirm Password
                    </Text>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter password..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.sm,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      maxLength={50}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        color: t.textSecondary,
                        marginTop: spacing.xs,
                        lineHeight: 18,
                      }}
                    >
                      💡 Use 12+ characters with uppercase, numbers & symbols
                      for best security. Your password is never stored.
                    </Text>
                  </View>
                )}

                {/* Decrypt UI */}
                {tool === "decrypt" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Decryption Password
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: t.textSecondary,
                        marginBottom: spacing.sm,
                      }}
                    >
                      Enter the password that was used to encrypt this file.
                    </Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter password..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.sm,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                    />
                  </View>
                )}

                {/* Header & Footer */}
                {tool === "header-footer" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Header Text
                    </Text>
                    <TextInput
                      value={headerText}
                      onChangeText={setHeaderText}
                      placeholder="Enter header text (optional)..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.md,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      maxLength={200}
                    />
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Footer Text
                    </Text>
                    <TextInput
                      value={footerText}
                      onChangeText={setFooterText}
                      placeholder="Enter footer text (optional)..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      maxLength={200}
                    />
                  </View>
                )}

                {/* Text to PDF - tabbed input: Write or Copy Text From */}
                {tool === "text-to-pdf" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    {/* Mode Toggle */}
                    <View style={styles.textModeToggle}>
                      <TouchableOpacity
                        style={[
                          styles.textModeTab,
                          { borderColor: t.border },
                          textInputMode === "write" && {
                            backgroundColor: t.primary,
                            borderColor: t.primary,
                          },
                        ]}
                        onPress={() => setTextInputMode("write")}
                      >
                        <PenLine
                          size={16}
                          color={textInputMode === "write" ? "#fff" : t.textSecondary}
                        />
                        <Text
                          style={[
                            styles.textModeTabLabel,
                            {
                              color:
                                textInputMode === "write" ? "#fff" : t.textSecondary,
                            },
                          ]}
                        >
                          Input Text
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.textModeTab,
                          { borderColor: t.border },
                          textInputMode === "paste" && {
                            backgroundColor: t.primary,
                            borderColor: t.primary,
                          },
                        ]}
                        onPress={() => setTextInputMode("paste")}
                      >
                        <ClipboardPaste
                          size={16}
                          color={textInputMode === "paste" ? "#fff" : t.textSecondary}
                        />
                        <Text
                          style={[
                            styles.textModeTabLabel,
                            {
                              color:
                                textInputMode === "paste" ? "#fff" : t.textSecondary,
                            },
                          ]}
                        >
                          Copy Text From
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Write mode — direct text input */}
                    {textInputMode === "write" && (
                      <>
                        <Text style={[styles.sectionTitle, { color: t.text }]}>
                          Text Content
                        </Text>
                        <TextInput
                          value={textContent}
                          onChangeText={setTextContent}
                          placeholder="Type or paste your text here..."
                          placeholderTextColor={t.textTertiary}
                          style={[
                            styles.textInput,
                            {
                              backgroundColor: t.backgroundSecondary,
                              color: t.text,
                              minHeight: 200,
                              textAlignVertical: "top",
                            },
                          ]}
                          multiline
                          numberOfLines={10}
                        />
                      </>
                    )}

                    {/* Paste mode — copy from other apps workflow */}
                    {textInputMode === "paste" && (
                      <>
                        <View
                          style={[
                            styles.pasteInstructions,
                            { backgroundColor: t.backgroundSecondary },
                          ]}
                        >
                          <Text style={[styles.pasteInstructionTitle, { color: t.text }]}>
                            Copy text from another app
                          </Text>
                          <Text style={[styles.pasteInstructionStep, { color: t.textSecondary }]}>
                            1. Switch to WhatsApp, Notes, Browser, or any app
                          </Text>
                          <Text style={[styles.pasteInstructionStep, { color: t.textSecondary }]}>
                            2. Select and copy the text you need
                          </Text>
                          <Text style={[styles.pasteInstructionStep, { color: t.textSecondary }]}>
                            3. Return here and tap "Paste from Clipboard"
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.pasteClipboardBtn, { backgroundColor: t.primary }]}
                          onPress={async () => {
                            try {
                              const clip = await Clipboard.getStringAsync();
                              if (clip && clip.trim()) {
                                setTextContent((prev) =>
                                  prev ? prev + "\n" + clip : clip,
                                );
                              } else {
                                Alert.alert(
                                  "Clipboard Empty",
                                  "No text found on clipboard. Copy some text first, then try again.",
                                );
                              }
                            } catch {
                              Alert.alert("Error", "Could not read clipboard.");
                            }
                          }}
                        >
                          <ClipboardPaste size={18} color="#fff" />
                          <Text style={styles.pasteClipboardBtnText}>
                            Paste from Clipboard
                          </Text>
                        </TouchableOpacity>
                        {textContent.length > 0 && (
                          <>
                            <Text
                              style={[
                                styles.sectionTitle,
                                { color: t.text, marginTop: spacing.md },
                              ]}
                            >
                              Pasted Content
                            </Text>
                            <TextInput
                              value={textContent}
                              onChangeText={setTextContent}
                              placeholder="Pasted text will appear here..."
                              placeholderTextColor={t.textTertiary}
                              style={[
                                styles.textInput,
                                {
                                  backgroundColor: t.backgroundSecondary,
                                  color: t.text,
                                  minHeight: 150,
                                  textAlignVertical: "top",
                                },
                              ]}
                              multiline
                              numberOfLines={8}
                            />
                          </>
                        )}
                      </>
                    )}

                    {textContent.length > 0 && (
                      <Text style={{ color: t.textTertiary, fontSize: 12, marginTop: 6 }}>
                        {textContent.length.toLocaleString()} characters
                      </Text>
                    )}
                  </View>
                )}

                {/* Annotation / Add-Text with visual editor */}
                {["annotate", "add-text"].includes(tool as string) && (
                  <>
                    <View style={[styles.section, { backgroundColor: t.card }]}>
                      <Text style={[styles.sectionTitle, { color: t.text }]}>
                        {tool === "add-text" ? "Text to Add" : "Annotation Text"}
                      </Text>
                      <TextInput
                        value={noteText}
                        onChangeText={setNoteText}
                        placeholder="Enter text..."
                        placeholderTextColor={t.textTertiary}
                        style={[
                          styles.textInput,
                          {
                            backgroundColor: t.backgroundSecondary,
                            color: t.text,
                            minHeight: 80,
                            textAlignVertical: "top",
                          },
                        ]}
                        multiline
                        numberOfLines={4}
                      />
                    </View>

                    <View style={[styles.section, { backgroundColor: t.card, minHeight: 420 }]}>
                      <Text style={[styles.sectionTitle, { color: t.text }]}>
                        Position on Page
                      </Text>
                      <VisualToolEditor
                        toolType={tool as VisualToolType}
                        fileUri={fileUri as string}
                        fileName={file as string}
                        pageCount={pdfPageInfo.pageCount}
                        pageWidth={pdfPageInfo.pageWidth}
                        pageHeight={pdfPageInfo.pageHeight}
                        placement={visualPlacement}
                        onPlacementChange={setVisualPlacement}
                        previewLabel={noteText.slice(0, 30) || "Text"}
                        onScrollLock={setScrollLocked}
                        t={t}
                      />
                    </View>
                  </>
                )}

                {/* Add Stamps with visual placement */}
                {tool === "add-stamps" && (
                  <>
                    <View style={[styles.section, { backgroundColor: t.card }]}>
                      <Text style={[styles.sectionTitle, { color: t.text }]}>
                        Stamp Type
                      </Text>
                      <View style={{ gap: spacing.sm }}>
                        {STAMP_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.id}
                            onPress={() => setStampType(option.id as any)}
                            style={[
                              styles.optionButton,
                              { backgroundColor: t.backgroundSecondary },
                              stampType === option.id &&
                                styles.optionButtonActive,
                            ]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.optionText,
                                  { color: t.text },
                                  stampType === option.id &&
                                    styles.optionTextActive,
                                ]}
                              >
                                {option.label}
                              </Text>
                              <Text
                                style={[
                                  styles.optionDescription,
                                  { color: t.textSecondary },
                                ]}
                              >
                                {option.desc}
                              </Text>
                            </View>
                            {stampType === option.id && (
                              <Check color={colors.primary} size={20} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={[styles.section, { backgroundColor: t.card, minHeight: 380 }]}>
                      <Text style={[styles.sectionTitle, { color: t.text }]}>
                        Stamp Position
                      </Text>
                      <VisualToolEditor
                        toolType="add-stamps"
                        fileUri={fileUri as string}
                        fileName={file as string}
                        pageCount={pdfPageInfo.pageCount}
                        pageWidth={pdfPageInfo.pageWidth}
                        pageHeight={pdfPageInfo.pageHeight}
                        placement={visualPlacement}
                        onPlacementChange={setVisualPlacement}
                        previewLabel={stampType.toUpperCase()}
                        onScrollLock={setScrollLocked}
                        t={t}
                      />
                    </View>

                    <View style={[styles.section, { backgroundColor: t.card }]}>
                      <Text
                        style={[
                          styles.sectionTitle,
                          { color: t.text },
                        ]}
                      >
                        Apply to Pages (optional)
                      </Text>
                      <TextInput
                        value={pageInput}
                        onChangeText={setPageInput}
                        placeholder="All pages (or e.g., 1, 3)"
                        placeholderTextColor={t.textTertiary}
                        style={[
                          styles.textInput,
                          {
                            backgroundColor: t.backgroundSecondary,
                            color: t.text,
                          },
                        ]}
                        keyboardType="default"
                      />
                    </View>
                  </>
                )}

                {/* Organize Pages */}
                {tool === "organize" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      New Page Order
                    </Text>
                    <Text
                      style={[
                        styles.helperText,
                        { color: t.textSecondary, marginBottom: spacing.sm },
                      ]}
                    >
                      Enter comma-separated page numbers in the desired order
                      (e.g., 3,1,2,4)
                    </Text>
                    <TextInput
                      value={pageOrderInput}
                      onChangeText={setPageOrderInput}
                      placeholder="e.g. 3,1,2,4"
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      keyboardType="numeric"
                    />
                  </View>
                )}

                {/* Resize Pages — professional grid UI */}
                {tool === "resize" && (() => {
                  const PAGE_SIZES = [
                    { id: "a4",     label: "A4",     wPt: 595,  hPt: 842,  wMm: 210, hMm: 297 },
                    { id: "a5",     label: "A5",     wPt: 420,  hPt: 595,  wMm: 148, hMm: 210 },
                    { id: "a3",     label: "A3",     wPt: 842,  hPt: 1191, wMm: 297, hMm: 420 },
                    { id: "letter", label: "Letter", wPt: 612,  hPt: 792,  wMm: 216, hMm: 279 },
                    { id: "legal",  label: "Legal",  wPt: 612,  hPt: 1008, wMm: 216, hMm: 356 },
                    { id: "b5",     label: "B5",     wPt: 499,  hPt: 709,  wMm: 176, hMm: 250 },
                  ];
                  return (
                    <View style={[styles.section, { backgroundColor: t.card }]}>
                      <Text style={[styles.sectionTitle, { color: t.text }]}>
                        Page Size
                      </Text>

                      {/* Portrait / Landscape toggle */}
                      <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md }}>
                        {(["portrait", "landscape"] as const).map((orient) => {
                          const isActive = resizeOrientation === orient;
                          return (
                            <TouchableOpacity
                              key={orient}
                              onPress={() => {
                                if (resizeOrientation !== orient) {
                                  setResizeOrientation(orient);
                                  // Swap W and H to switch orientation
                                  const tmp = resizeWidth;
                                  setResizeWidth(resizeHeight);
                                  setResizeHeight(tmp);
                                }
                              }}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 7,
                                paddingHorizontal: 14,
                                paddingVertical: 9,
                                borderRadius: 20,
                                borderWidth: 1.5,
                                borderColor: isActive ? colors.primary : t.border,
                                backgroundColor: isActive ? colors.primary + "12" : t.backgroundSecondary,
                              }}
                            >
                              {/* Paper shape icon */}
                              <View
                                style={{
                                  width: orient === "portrait" ? 10 : 15,
                                  height: orient === "portrait" ? 15 : 10,
                                  borderWidth: 1.5,
                                  borderColor: isActive ? colors.primary : t.textSecondary,
                                  borderRadius: 2,
                                  backgroundColor: isActive ? colors.primary + "20" : "transparent",
                                }}
                              />
                              <Text style={{ fontSize: 13, fontWeight: isActive ? "700" : "500", color: isActive ? colors.primary : t.text }}>
                                {orient === "portrait" ? "Portrait" : "Landscape"}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Size grid (2 columns) */}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
                        {PAGE_SIZES.map((size) => {
                          const isPortrait = resizeOrientation === "portrait";
                          const w = isPortrait ? String(size.wPt) : String(size.hPt);
                          const h = isPortrait ? String(size.hPt) : String(size.wPt);
                          const wmm = isPortrait ? size.wMm : size.hMm;
                          const hmm = isPortrait ? size.hMm : size.wMm;
                          const isActive = resizeWidth === w && resizeHeight === h;
                          const iconW = isPortrait ? 12 : 18;
                          const iconH = isPortrait ? 18 : 12;
                          return (
                            <TouchableOpacity
                              key={size.id}
                              onPress={() => { setResizeWidth(w); setResizeHeight(h); }}
                              style={{
                                width: "47%",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                                paddingHorizontal: 14,
                                paddingVertical: 13,
                                borderRadius: 12,
                                borderWidth: isActive ? 2 : 1,
                                borderColor: isActive ? colors.primary : t.border,
                                backgroundColor: isActive ? colors.primary + "10" : t.backgroundSecondary,
                              }}
                            >
                              {/* Paper icon */}
                              <View
                                style={{
                                  width: iconW,
                                  height: iconH,
                                  borderWidth: 1.5,
                                  borderColor: isActive ? colors.primary : t.textSecondary,
                                  borderRadius: 2,
                                  backgroundColor: isActive ? colors.primary + "20" : "transparent",
                                }}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: "700", color: isActive ? colors.primary : t.text }}>
                                  {size.label}
                                </Text>
                                <Text style={{ fontSize: 11, color: t.textSecondary, marginTop: 1 }}>
                                  {wmm} × {hmm} mm
                                </Text>
                              </View>
                              {isActive && <Check size={16} color={colors.primary} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Custom size section (expandable) */}
                      <TouchableOpacity
                        onPress={() => setResizeShowCustom((v) => !v)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: spacing.sm,
                          borderTopWidth: 1,
                          borderTopColor: t.border,
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: t.text }}>Custom Size</Text>
                        <Text style={{ fontSize: 13, color: t.textSecondary }}>{resizeShowCustom ? "Hide ▲" : "Show ▼"}</Text>
                      </TouchableOpacity>

                      {resizeShowCustom && (
                        <View style={{ marginTop: spacing.xs }}>
                          {/* Unit toggle */}
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm }}>
                            {(["mm", "in", "pt"] as const).map((unit) => (
                              <TouchableOpacity
                                key={unit}
                                onPress={() => {
                                  setResizeUnit(unit);
                                  setResizeCustomW("");
                                  setResizeCustomH("");
                                }}
                                style={{
                                  paddingHorizontal: 14,
                                  paddingVertical: 7,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: resizeUnit === unit ? colors.primary : t.border,
                                  backgroundColor: resizeUnit === unit ? colors.primary + "12" : t.backgroundSecondary,
                                }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: "600", color: resizeUnit === unit ? colors.primary : t.text }}>
                                  {unit}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            <Text style={{ fontSize: 11, color: t.textTertiary, marginLeft: 4 }}>
                              {resizeUnit === "mm" ? "millimetres" : resizeUnit === "in" ? "inches" : "points (1 pt = 1/72″)"}
                            </Text>
                          </View>

                          <View style={{ flexDirection: "row", gap: spacing.sm }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.helperText, { color: t.textSecondary, marginBottom: 4 }]}>Width</Text>
                              <TextInput
                                value={resizeCustomW}
                                onChangeText={(v) => {
                                  setResizeCustomW(v);
                                  const pt = unitToPt(parseFloat(v) || 0, resizeUnit);
                                  if (pt >= 10) setResizeWidth(String(Math.round(pt)));
                                }}
                                placeholder={ptToUnit(parseFloat(resizeWidth) || 595, resizeUnit).toFixed(1)}
                                placeholderTextColor={t.textTertiary}
                                style={[styles.textInput, { backgroundColor: t.backgroundSecondary, color: t.text }]}
                                keyboardType="decimal-pad"
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.helperText, { color: t.textSecondary, marginBottom: 4 }]}>Height</Text>
                              <TextInput
                                value={resizeCustomH}
                                onChangeText={(v) => {
                                  setResizeCustomH(v);
                                  const pt = unitToPt(parseFloat(v) || 0, resizeUnit);
                                  if (pt >= 10) setResizeHeight(String(Math.round(pt)));
                                }}
                                placeholder={ptToUnit(parseFloat(resizeHeight) || 842, resizeUnit).toFixed(1)}
                                placeholderTextColor={t.textTertiary}
                                style={[styles.textInput, { backgroundColor: t.backgroundSecondary, color: t.text }]}
                                keyboardType="decimal-pad"
                              />
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 6 }}>
                            Current: {resizeWidth} × {resizeHeight} pt
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Metadata Editor */}
                {tool === "metadata" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Edit PDF Metadata
                    </Text>
                    {[
                      {
                        label: "Title",
                        value: metaTitle,
                        setter: setMetaTitle,
                      },
                      {
                        label: "Author",
                        value: metaAuthor,
                        setter: setMetaAuthor,
                      },
                      {
                        label: "Subject",
                        value: metaSubject,
                        setter: setMetaSubject,
                      },
                      {
                        label: "Keywords",
                        value: metaKeywords,
                        setter: setMetaKeywords,
                      },
                      {
                        label: "Creator",
                        value: metaCreator,
                        setter: setMetaCreator,
                      },
                    ].map((field) => (
                      <View
                        key={field.label}
                        style={{ marginBottom: spacing.sm }}
                      >
                        <Text
                          style={[
                            styles.helperText,
                            { color: t.textSecondary, marginBottom: 4 },
                          ]}
                        >
                          {field.label}
                        </Text>
                        <TextInput
                          value={field.value}
                          onChangeText={field.setter}
                          placeholder={`Enter ${field.label.toLowerCase()}...`}
                          placeholderTextColor={t.textTertiary}
                          style={[
                            styles.textInput,
                            {
                              backgroundColor: t.backgroundSecondary,
                              color: t.text,
                            },
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                )}

                {/* Search */}
                {tool === "search" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Search Text
                    </Text>
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Enter search term..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      autoFocus
                    />
                  </View>
                )}

                {/* Find & Replace */}
                {tool === "find-replace" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Find & Replace
                    </Text>
                    <Text style={[styles.helperText, { color: t.textSecondary, marginBottom: spacing.sm }]}>
                      Find text in your PDF and replace it with new text.
                    </Text>
                    <Text style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4 }}>Find</Text>
                    <TextInput
                      value={frSearchText}
                      onChangeText={setFrSearchText}
                      placeholder="Text to find..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        { backgroundColor: t.backgroundSecondary, color: t.text, marginBottom: spacing.sm },
                      ]}
                      autoFocus
                    />
                    <Text style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4 }}>Replace with</Text>
                    <TextInput
                      value={frReplaceText}
                      onChangeText={setFrReplaceText}
                      placeholder="Replacement text..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        { backgroundColor: t.backgroundSecondary, color: t.text, marginBottom: spacing.sm },
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => setFrCaseSensitive((v) => !v)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingVertical: spacing.xs,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          borderWidth: 1.5,
                          borderColor: frCaseSensitive ? colors.primary : t.border,
                          backgroundColor: frCaseSensitive ? colors.primary : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {frCaseSensitive && <Check size={14} color="#fff" />}
                      </View>
                      <Text style={{ fontSize: 14, color: t.text }}>Case sensitive</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Bookmarks */}
                {tool === "bookmarks" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Add Bookmark
                    </Text>
                    <Text
                      style={[
                        styles.helperText,
                        { color: t.textSecondary, marginBottom: spacing.sm },
                      ]}
                    >
                      Bookmark Title
                    </Text>
                    <TextInput
                      value={bookmarkTitle}
                      onChangeText={setBookmarkTitle}
                      placeholder="e.g. Chapter 1"
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.sm,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.helperText,
                        { color: t.textSecondary, marginBottom: spacing.sm },
                      ]}
                    >
                      Target Page
                    </Text>
                    <TextInput
                      value={bookmarkPage}
                      onChangeText={setBookmarkPage}
                      placeholder="1"
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      keyboardType="numeric"
                    />
                  </View>
                )}

                {/* Hyperlinks — visual placement on page preview */}
                {tool === "hyperlinks" && (
                  <View style={[styles.section, { backgroundColor: t.card, minHeight: 420 }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Add Hyperlink
                    </Text>
                    <Text
                      style={[
                        styles.helperText,
                        { color: t.textSecondary, marginBottom: spacing.sm },
                      ]}
                    >
                      Enter the URL and link text, then tap on the page to place
                      the hyperlink.
                    </Text>
                    <TextInput
                      value={linkUrl}
                      onChangeText={setLinkUrl}
                      placeholder="https://..."
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.sm,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                    <TextInput
                      value={linkText}
                      onChangeText={setLinkText}
                      placeholder="Link text (optional)"
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.sm,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                    />
                    <TextInput
                      value={pageInput}
                      onChangeText={setPageInput}
                      placeholder="Page number(s) e.g. 1, 3, 5-7 (leave empty for placed page only)"
                      placeholderTextColor={t.textTertiary}
                      style={[
                        styles.textInput,
                        {
                          marginBottom: spacing.md,
                          backgroundColor: t.backgroundSecondary,
                          color: t.text,
                        },
                      ]}
                      keyboardType="numbers-and-punctuation"
                    />
                    <VisualToolEditor
                      toolType="hyperlinks"
                      fileUri={fileUri as string}
                      fileName={file as string}
                      pageCount={pdfPageInfo.pageCount}
                      pageWidth={pdfPageInfo.pageWidth}
                      pageHeight={pdfPageInfo.pageHeight}
                      placement={visualPlacement}
                      onPlacementChange={setVisualPlacement}
                      previewLabel={linkText || linkUrl || "Link"}
                      onScrollLock={setScrollLocked}
                      t={t}
                    />
                  </View>
                )}

                {/* Crop PDF — Visual crop editor */}
                {tool === "crop" && (
                  <View style={[styles.section, { backgroundColor: t.card, minHeight: 460 }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Crop PDF
                    </Text>

                    {/* Page scope selector */}
                    <View style={{ marginBottom: spacing.md }}>
                      <Text style={[styles.helperText, { color: t.textSecondary, marginBottom: spacing.sm }]}>
                        Apply crop to
                      </Text>
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        {(["all", "custom"] as const).map((val) => {
                          const isActive = cropApplyTo === val;
                          return (
                            <TouchableOpacity
                              key={val}
                              onPress={() => setCropApplyTo(val)}
                              style={{
                                paddingHorizontal: 16,
                                paddingVertical: 10,
                                borderRadius: 10,
                                borderWidth: 1.5,
                                borderColor: isActive ? colors.primary : t.border,
                                backgroundColor: isActive ? colors.primary + "15" : t.backgroundSecondary,
                              }}
                            >
                              <Text style={{
                                fontSize: 14,
                                fontWeight: isActive ? "700" : "500",
                                color: isActive ? colors.primary : t.text,
                              }}>
                                {val === "all" ? "All pages" : "Selected pages"}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {cropApplyTo === "custom" && (
                        <View style={{ marginTop: spacing.sm }}>
                          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                            <TextInput
                              value={cropPageInput}
                              onChangeText={setCropPageInput}
                              placeholder="e.g. 1, 3, 5-7"
                              placeholderTextColor={t.textTertiary}
                              style={[styles.textInput, { backgroundColor: t.backgroundSecondary, color: t.text, flex: 1 }]}
                              keyboardType="numbers-and-punctuation"
                              onSubmitEditing={() => {
                                const pages = parsePageInput(cropPageInput);
                                if (pages.length > 0) setCropPreviewPage(pages[0]);
                              }}
                            />
                            <TouchableOpacity
                              onPress={() => {
                                const pages = parsePageInput(cropPageInput);
                                if (pages.length > 0) {
                                  setCropPreviewPage(pages[0]);
                                }
                              }}
                              style={{
                                paddingHorizontal: 18,
                                paddingVertical: 12,
                                borderRadius: 10,
                                backgroundColor: colors.primary,
                              }}
                            >
                              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Go</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>
                            Enter pages then tap Go to preview. Crop applies only to these pages.
                          </Text>
                        </View>
                      )}
                    </View>

                    <VisualCropEditor
                      fileUri={fileUri as string}
                      fileName={file as string}
                      pageWidth={pdfPageInfo.pageWidth}
                      pageHeight={pdfPageInfo.pageHeight}
                      pageCount={pdfPageInfo.pageCount}
                      cropMargins={cropMargins}
                      onCropChange={setCropMargins}
                      onScrollLock={setScrollLocked}
                      requestedPage={cropPreviewPage}
                      t={t}
                    />
                  </View>
                )}

                {/* Redact Content - Visual editor */}
                {tool === "redact" && (
                  <View style={[styles.section, { backgroundColor: t.card, minHeight: 420 }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Redaction Area
                    </Text>
                    <Text
                      style={[
                        styles.helperText,
                        { color: t.textSecondary, marginBottom: spacing.sm },
                      ]}
                    >
                      Tap on the page to place the redaction area, then drag to reposition.
                    </Text>

                    {/* Quick size presets */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md }}>
                      {[
                        { label: "Small", w: 100, h: 20 },
                        { label: "Medium", w: 200, h: 40 },
                        { label: "Wide", w: 400, h: 30 },
                        { label: "Block", w: 250, h: 80 },
                        { label: "Full Width", w: 612, h: 52 },
                      ].map((size) => {
                        const isActive = visualPlacement.width === size.w && visualPlacement.height === size.h;
                        return (
                          <TouchableOpacity
                            key={size.label}
                            onPress={() => setVisualPlacement(prev => ({ ...prev, width: size.w, height: size.h }))}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 16,
                              borderWidth: isActive ? 2 : 1,
                              borderColor: isActive ? colors.primary : t.border,
                              backgroundColor: isActive ? colors.primary + "12" : t.backgroundSecondary,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: isActive ? "700" : "500", color: isActive ? colors.primary : t.text }}>
                              {size.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <VisualToolEditor
                      toolType="redact"
                      fileUri={fileUri as string}
                      fileName={file as string}
                      pageCount={pdfPageInfo.pageCount}
                      pageWidth={pdfPageInfo.pageWidth}
                      pageHeight={pdfPageInfo.pageHeight}
                      placement={visualPlacement}
                      onPlacementChange={setVisualPlacement}
                      previewLabel="Redacted"
                      onScrollLock={setScrollLocked}
                      t={t}
                    />
                  </View>
                )}

                {/* Fill Form - Professional structured layout */}
                {tool === "fill-form" && (
                  <View style={{ gap: spacing.sm }}>
                    {fillFormLoading && (
                      <View style={{ alignItems: "center", paddingVertical: spacing.xl, backgroundColor: t.card, borderRadius: 12 }}>
                        <ActivityIndicator size="large" color={t.primary} />
                        <Text style={{ color: t.textSecondary, fontSize: 14, marginTop: spacing.md }}>
                          Scanning for form fields…
                        </Text>
                      </View>
                    )}

                    {!fillFormLoading && (
                      <>
                        {/* Progress bar */}
                        {fillFormFields.some((f) => f.name) && (
                          <View style={{ backgroundColor: t.card, borderRadius: 12, padding: spacing.md }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                              <Text style={{ color: t.textSecondary, fontSize: 12 }}>
                                {fillFormFields[0]?.name
                                  ? `${fillFormFields.length} field${fillFormFields.length !== 1 ? "s" : ""} detected`
                                  : "Add fields below"}
                              </Text>
                              <Text style={{ color: t.primary, fontSize: 12, fontWeight: "700" }}>
                                {fillFormFields.filter((f) => f.value.trim()).length}/{fillFormFields.length} filled
                              </Text>
                            </View>
                            <View style={{ height: 4, borderRadius: 2, backgroundColor: t.backgroundSecondary, overflow: "hidden" }}>
                              <View style={{
                                height: "100%", borderRadius: 2, backgroundColor: t.primary,
                                width: `${fillFormFields.length > 0 ? (fillFormFields.filter((f) => f.value.trim()).length / fillFormFields.length) * 100 : 0}%`,
                              }} />
                            </View>
                          </View>
                        )}

                        {fillFormFields.map((field, index) => {
                          const isCheckbox = field.type === "checkbox";
                          const isDropdown = field.type === "dropdown" || field.type === "radio" || field.type === "listbox";
                          const filled = field.value.trim().length > 0;
                          return (
                            <View
                              key={index}
                              style={{
                                backgroundColor: t.card,
                                borderRadius: 12,
                                padding: spacing.md,
                                borderLeftWidth: 3,
                                borderLeftColor: filled ? "#10B981" : t.border,
                              }}
                            >
                              {/* Field name row */}
                              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: isCheckbox ? 0 : 10 }}>
                                <View style={{
                                  width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10,
                                  backgroundColor: isCheckbox ? "#F59E0B15" : isDropdown ? "#8B5CF615" : t.primary + "15",
                                }}>
                                  <Text style={{
                                    fontSize: 10, fontWeight: "800",
                                    color: isCheckbox ? "#F59E0B" : isDropdown ? "#8B5CF6" : t.primary,
                                  }}>
                                    {isCheckbox ? "☑" : isDropdown ? "▼" : "T"}
                                  </Text>
                                </View>
                                <TextInput
                                  value={field.name}
                                  onChangeText={(v) => {
                                    const updated = [...fillFormFields];
                                    updated[index] = { ...updated[index], name: v };
                                    setFillFormFields(updated);
                                  }}
                                  placeholder="Field name"
                                  placeholderTextColor={t.textTertiary}
                                  style={{ flex: 1, fontSize: 14, fontWeight: "600", color: t.text, paddingVertical: 0 }}
                                  editable={!field.name || true}
                                />
                                {filled && <CheckCircle color="#10B981" size={16} style={{ marginLeft: 6 }} />}
                                <TouchableOpacity
                                  onPress={() => {
                                    const updated = fillFormFields.filter((_, i) => i !== index);
                                    setFillFormFields(updated.length > 0 ? updated : [{ name: "", value: "", type: "text" }]);
                                  }}
                                  style={{ padding: 4, marginLeft: 4 }}
                                >
                                  <Trash2 color={t.textTertiary} size={15} />
                                </TouchableOpacity>
                              </View>

                              {/* Value input */}
                              {isCheckbox ? (
                                <TouchableOpacity
                                  onPress={() => {
                                    const updated = [...fillFormFields];
                                    updated[index] = { ...updated[index], value: field.value === "true" ? "false" : "true" };
                                    setFillFormFields(updated);
                                  }}
                                  style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}
                                >
                                  <View style={{
                                    width: 22, height: 22, borderRadius: 4, borderWidth: 2,
                                    borderColor: field.value === "true" ? "#10B981" : t.border,
                                    backgroundColor: field.value === "true" ? "#10B981" : "transparent",
                                    alignItems: "center", justifyContent: "center",
                                  }}>
                                    {field.value === "true" && <Check color="#fff" size={14} />}
                                  </View>
                                  <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                                    {field.value === "true" ? "Checked" : "Unchecked"}
                                  </Text>
                                </TouchableOpacity>
                              ) : isDropdown && field.options && field.options.length > 0 ? (
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                                  {field.options.map((opt) => (
                                    <TouchableOpacity
                                      key={opt}
                                      onPress={() => {
                                        const updated = [...fillFormFields];
                                        updated[index] = { ...updated[index], value: opt };
                                        setFillFormFields(updated);
                                      }}
                                      style={{
                                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                                        backgroundColor: field.value === opt ? "#8B5CF6" : t.backgroundSecondary,
                                        borderWidth: 1, borderColor: field.value === opt ? "#8B5CF6" : t.border,
                                      }}
                                    >
                                      <Text style={{ color: field.value === opt ? "#fff" : t.text, fontSize: 13 }}>{opt}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              ) : (
                                <TextInput
                                  value={field.value}
                                  onChangeText={(v) => {
                                    const updated = [...fillFormFields];
                                    updated[index] = { ...updated[index], value: v };
                                    setFillFormFields(updated);
                                  }}
                                  placeholder={`Enter ${field.name || "value"}…`}
                                  placeholderTextColor={t.textTertiary}
                                  style={[
                                    styles.textInput,
                                    {
                                      backgroundColor: t.backgroundSecondary,
                                      color: t.text,
                                      borderWidth: 1,
                                      borderColor: filled ? "#10B981" + "40" : t.border,
                                      marginBottom: 0,
                                    },
                                  ]}
                                />
                              )}
                            </View>
                          );
                        })}

                        <TouchableOpacity
                          onPress={() => setFillFormFields([...fillFormFields, { name: "", value: "", type: "text" }])}
                          style={{
                            flexDirection: "row", alignItems: "center", justifyContent: "center",
                            backgroundColor: t.card, borderRadius: 12, padding: spacing.md,
                            borderWidth: 1, borderColor: t.primary + "30", borderStyle: "dashed",
                          }}
                        >
                          <Plus color={t.primary} size={18} />
                          <Text style={{ color: t.primary, fontWeight: "600", marginLeft: spacing.xs }}>
                            Add Field
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}

                {/* Attachments - File Picker for files to attach */}
                {tool === "attachments" && (
                  <View style={[styles.section, { backgroundColor: t.card }]}>
                    <Text style={[styles.sectionTitle, { color: t.text }]}>
                      Files to Attach
                    </Text>
                    <Text
                      style={[
                        styles.helperText,
                        { color: t.textSecondary, marginBottom: spacing.sm },
                      ]}
                    >
                      Select one or more files to embed as attachments in your
                      PDF.
                    </Text>
                    {attachmentFiles.length > 0 && (
                      <View style={{ marginBottom: spacing.sm }}>
                        {attachmentFiles.map((af, index) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              backgroundColor: t.backgroundSecondary,
                              borderRadius: 8,
                              padding: spacing.sm,
                              marginBottom: spacing.xs,
                              gap: spacing.sm,
                            }}
                          >
                            <Paperclip color={t.textSecondary} size={16} />
                            <Text
                              style={{ color: t.text, flex: 1, fontSize: 13 }}
                              numberOfLines={1}
                            >
                              {af.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() =>
                                setAttachmentFiles(
                                  attachmentFiles.filter((_, i) => i !== index),
                                )
                              }
                              style={{ padding: 4 }}
                            >
                              <Trash2 color="#EF4444" size={16} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={handlePickAttachments}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor: t.backgroundSecondary,
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Plus color={t.primary} size={18} />
                      <Text
                        style={[
                          styles.optionText,
                          { color: t.primary, marginLeft: spacing.xs },
                        ]}
                      >
                        Select Files
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
      <LibraryFilePicker
        visible={showAttachLibraryPicker}
        onClose={() => setShowAttachLibraryPicker(false)}
        onSelect={handleAttachLibrarySelect}
        title="Select Files to Attach"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  headerSubtitle: {
    fontSize: 12,
  },
  processButtonTop: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  processButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  section: {
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: spacing.sm,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  helperText: {
    fontSize: 12,
  },
  optionButton: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
  },
  optionButtonActive: {
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  optionTextActive: {
    color: colors.primary,
  },
  optionDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  textInput: {
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
  },
  // Text to PDF mode toggle
  textModeToggle: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  textModeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  textModeTabLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  pasteInstructions: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pasteInstructionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  pasteInstructionStep: {
    fontSize: 13,
    lineHeight: 22,
  },
  pasteClipboardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: spacing.sm,
  },
  pasteClipboardBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  processingCard: {
    borderRadius: 16,
    padding: spacing.xl,
    marginBottom: spacing.md,
    alignItems: "center",
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: spacing.md,
  },
  processingMessage: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  progressBarContainer: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  // Success state — matches sign-document done screen
  successContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: spacing.md,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  successMessage: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  fileInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
    gap: spacing.xs,
    alignSelf: "center",
  },
  fileInfoText: {
    fontSize: 12,
    fontWeight: "500",
  },
  successActions: {
    width: "100%",
    gap: 8,
  },
  successBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
  },
  successBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  // Error state
  errorCard: {
    borderRadius: 16,
    padding: spacing.xl,
    marginBottom: spacing.md,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#EF4444",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EF4444",
    marginTop: spacing.md,
  },
  errorMessage: {
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  retryButton: {
    marginTop: spacing.lg,
    backgroundColor: "#EF4444",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  retryButtonText: {
    color: "white",
    fontWeight: "600",
  },
});
