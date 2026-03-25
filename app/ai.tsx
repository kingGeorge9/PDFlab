// ============================================
// AI Tab Screen – full-featured AI assistant
// ============================================

import {
  AIChatBubble,
  AIEmptyState,
  AILanguagePicker,
  AISessionHistory,
  XumiHeader,
} from "@/components/ai";
import { LibraryFilePicker } from "@/components/LibraryFilePicker";
import { aiFeatures } from "@/constants/ai-features";
import { spacing } from "@/constants/theme";
import type {
  AIAction,
  AIChatMessage,
  AIDocumentRef,
  AISession,
} from "@/services/ai";
import {
  analyze,
  clearAIScreenState,
  clearAllSessions,
  createMessage,
  createSession,
  deleteSession as deleteSessionStorage,
  extractData,
  extractDocumentText,
  extractTasks,
  fillForm,
  generateContent,
  getAIScreenState,
  hasUnfinishedWork,
  initAIProvider,
  loadSessions,
  pickDocument,
  saveAIScreenState,
  saveSession,
  sendChat,
  summarize,
  SUPPORTED_LANGUAGES,
  translate,
} from "@/services/ai";
import { useTheme } from "@/services/ThemeProvider";
import { useNavigation, useRouter } from "expo-router";
import {
  BookOpen,
  Brain,
  Clock,
  FileSearch,
  FileSignature,
  FileText,
  Globe,
  Languages,
  ListChecks,
  MessageSquare,
  Paperclip,
  Send,
  Wand2,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT = "#9333EA";
const GRID_GAP = 6;
const GRID_COLUMNS = 3;
const GRID_H_PADDING = 12; // matches spacing.md
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - GRID_H_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
    GRID_COLUMNS,
);

// ── Module-level constants (avoid re-creation on each render) ───────────────
const FILE_ONLY_MODES: AIAction[] = [
  "summarize",
  "translate",
  "extract-text",
  "extract-data",
  "analyze",
];

const FEATURE_ICONS: Record<string, React.ComponentType<any>> = {
  summarize: BookOpen,
  translate: Languages,
  "extract-text": FileText,
  "extract-data": FileSearch,
  chat: MessageSquare,
  analyze: Brain,
  tasks: ListChecks,
  "fill-form": FileSignature,
  "generate-content": Wand2,
  "chat-with-document": FileText,
};

export default function AIScreen() {
  const { colors: t, mode } = useTheme();
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeAction, setActiveAction] = useState<AIAction>("chat");
  const [session, setSession] = useState<AISession>(createSession("chat"));
  const [allSessions, setAllSessions] = useState<AISession[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedDoc, setAttachedDoc] = useState<AIDocumentRef | undefined>();
  const [docText, setDocText] = useState<string | undefined>();
  const [extractionStatus, setExtractionStatus] = useState<
    "none" | "extracted" | "partial"
  >("none");

  // Translate-specific
  const [targetLang, setTargetLang] = useState("es");
  const [showLangPicker, setShowLangPicker] = useState(false);

  // History modal
  const [showHistory, setShowHistory] = useState(false);

  // Dropdown features panel
  const [showFeaturesDropdown, setShowFeaturesDropdown] = useState(false);

  // Attachment expansion
  const [attachmentExpanded, setAttachmentExpanded] = useState(false);

  // File source picker modal
  const [showFileSourcePicker, setShowFileSourcePicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);

  const scrollRef = useRef<FlatList>(null);
  const navigation = useNavigation();

  // ── Close dropdown on screen blur / navigation away ─────────────────────
  useEffect(() => {
    const unsubBlur = navigation.addListener("blur", () => {
      setShowFeaturesDropdown(false);
    });
    return unsubBlur;
  }, [navigation]);

  // ── Reset to Chat on screen focus if no unfinished work ─────────────────
  useEffect(() => {
    const unsubFocus = navigation.addListener("focus", () => {
      const saved = getAIScreenState();
      if (hasUnfinishedWork(saved) && saved) {
        setActiveAction(saved.activeAction);
        setSession(saved.session);
        setInputText(saved.inputText);
        setAttachedDoc(saved.attachedDoc);
        setDocText(saved.docText);
        setExtractionStatus(saved.extractionStatus);
        setTargetLang(saved.targetLang);
        setAttachmentExpanded(saved.attachmentExpanded);
      } else {
        // No unfinished work — reset to Chat
        if (activeAction !== "chat" || session.messages.length > 0) {
          setActiveAction("chat");
          setSession(createSession("chat"));
          setInputText("");
          setAttachedDoc(undefined);
          setDocText(undefined);
          setExtractionStatus("none");
          setAttachmentExpanded(false);
        }
        clearAIScreenState();
      }
    });
    return unsubFocus;
  }, [navigation, activeAction, session.messages.length]);

  // ── Close dropdown on Android hardware back ─────────────────────────────
  useEffect(() => {
    if (!showFeaturesDropdown) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      setShowFeaturesDropdown(false);
      return true; // consume the event
    });
    return () => handler.remove();
  }, [showFeaturesDropdown]);

  // ── Restore unfinished work on mount / save on unmount ─────────────────
  useEffect(() => {
    // Probe backend and switch from mock to real AI if available
    initAIProvider();

    const saved = getAIScreenState();
    if (hasUnfinishedWork(saved) && saved) {
      setActiveAction(saved.activeAction);
      setSession(saved.session);
      setInputText(saved.inputText);
      setAttachedDoc(saved.attachedDoc);
      setDocText(saved.docText);
      setExtractionStatus(saved.extractionStatus);
      setTargetLang(saved.targetLang);
      setAttachmentExpanded(saved.attachmentExpanded);
    }
    // else: defaults already set to "chat"

    return () => {
      // Save current state on unmount so it can be restored later
      // We read the latest values via the ref-backed getter below.
    };
  }, []);

  // We need a ref to capture latest state for the unmount cleanup.
  const stateRef = useRef({
    activeAction,
    session,
    inputText,
    attachedDoc,
    docText,
    extractionStatus,
    targetLang,
    attachmentExpanded,
  });
  useEffect(() => {
    stateRef.current = {
      activeAction,
      session,
      inputText,
      attachedDoc,
      docText,
      extractionStatus,
      targetLang,
      attachmentExpanded,
    };
  });

  // Save snapshot when the screen unmounts (user navigates away)
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      saveAIScreenState({
        activeAction: s.activeAction,
        session: s.session,
        inputText: s.inputText,
        attachedDoc: s.attachedDoc,
        docText: s.docText,
        extractionStatus: s.extractionStatus,
        targetLang: s.targetLang,
        attachmentExpanded: s.attachmentExpanded,
      });
    };
  }, []);

  // ── Load sessions on mount ────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    loadSessions()
      .then((s) => {
        if (mounted) setAllSessions(s);
      })
      .catch(console.error);
    return () => {
      mounted = false;
    };
  }, []);

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    if (session.messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [session.messages.length]);

  // ── Persist session whenever messages change ──────────────────────────────
  useEffect(() => {
    if (session.messages.length > 0) {
      const updated = { ...session, updatedAt: Date.now() };
      saveSession(updated);
      loadSessions().then(setAllSessions).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.messages.length]);

  // ── Mode change handler ───────────────────────────────────────────────────
  const handleModeChange = useCallback(
    (action: AIAction) => {
      if (action === activeAction) return;
      if (session.messages.length > 0) {
        saveSession({ ...session, updatedAt: Date.now() });
      }
      setActiveAction(action);
      setSession(createSession(action, attachedDoc));
      setInputText("");
      setAttachmentExpanded(false);
    },
    [activeAction, session, attachedDoc],
  );

  // ── Document attachment ───────────────────────────────────────────────────
  const handleAttachDocument = useCallback(async () => {
    // Show file source picker modal
    setShowFileSourcePicker(true);
  }, []);

  const handlePickFromDevice = useCallback(async () => {
    setShowFileSourcePicker(false);

    const doc = await pickDocument();
    if (!doc) return;

    setAttachedDoc(doc);
    setExtractionStatus("none");

    const text = await extractDocumentText(doc);
    setDocText(text);

    if (
      doc.mimeType === "text/plain" ||
      doc.name.toLowerCase().endsWith(".txt")
    ) {
      setExtractionStatus("extracted");
    } else {
      setExtractionStatus("partial");
    }

    setSession((prev) => ({
      ...prev,
      document: doc,
      updatedAt: Date.now(),
    }));

    const sysMsg = createMessage(
      "assistant",
      `📎 Document attached: "${doc.name}"\n${
        doc.mimeType === "text/plain"
          ? "Text content has been extracted and is ready."
          : "Note: Full text extraction for this format will be available with backend integration. You can paste relevant text in your messages for better results."
      }`,
    );
    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, sysMsg],
    }));
  }, []);

  const handlePickFromApp = useCallback(() => {
    setShowFileSourcePicker(false);
    setShowLibraryPicker(true);
  }, []);

  const handleLibraryFileSelected = useCallback(async (files: any[]) => {
    setShowLibraryPicker(false);

    if (files.length === 0) return;

    const selectedFile = files[0];
    const doc: AIDocumentRef = {
      uri: selectedFile.uri,
      name: selectedFile.name,
      mimeType: selectedFile.mimeType,
      size: selectedFile.size,
    };

    setAttachedDoc(doc);
    setExtractionStatus("none");

    const text = await extractDocumentText(doc);
    setDocText(text);

    if (
      doc.mimeType === "text/plain" ||
      doc.name.toLowerCase().endsWith(".txt")
    ) {
      setExtractionStatus("extracted");
    } else {
      setExtractionStatus("partial");
    }

    setSession((prev) => ({
      ...prev,
      document: doc,
      updatedAt: Date.now(),
    }));

    const sysMsg = createMessage(
      "assistant",
      `📎 Document attached: "${doc.name}"\n${
        doc.mimeType === "text/plain"
          ? "Text content has been extracted and is ready."
          : "Note: Full text extraction for this format will be available with backend integration. You can paste relevant text in your messages for better results."
      }`,
    );
    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, sysMsg],
    }));
  }, []);

  const handleRemoveDocument = useCallback(() => {
    setAttachedDoc(undefined);
    setDocText(undefined);
    setExtractionStatus("none");
    setSession((prev) => ({
      ...prev,
      document: undefined,
    }));
  }, []);

  // ── Modes that can be sent with just a file (no text required) ────────────
  // (hoisted to module level via FILE_ONLY_MODES constant below)

  /** True when the Send button should be enabled. */
  const canSend = useMemo(() => {
    if (isLoading) return false;
    const hasText = inputText.trim().length > 0;
    const hasFile = !!attachedDoc;
    // File-only modes: text OR file is enough
    if (FILE_ONLY_MODES.includes(activeAction)) return hasText || hasFile;
    // Other modes: text is required (file optional)
    return hasText;
  }, [isLoading, inputText, attachedDoc, activeAction]);

  // ── Main send handler ─────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    const hasText = text.length > 0;
    const hasFile = !!attachedDoc;

    // Block if nothing to send
    if (isLoading) return;
    if (!hasText && !hasFile) return;

    // Modes that strictly require a document
    if (
      (activeAction === "fill-form" ||
        activeAction === "chat-with-document" ||
        activeAction === "extract-text") &&
      !hasFile
    ) {
      Alert.alert(
        "Document Required",
        activeAction === "extract-text"
          ? "Please attach a PDF to extract text from."
          : "Please attach a document first for this feature.",
      );
      return;
    }

    // For non-file-only modes, text is required
    if (!hasText && !FILE_ONLY_MODES.includes(activeAction)) return;

    // Build user-visible message
    const displayText = hasText ? text : `📎 Process "${attachedDoc!.name}"`;
    const userMsg = createMessage("user", displayText);
    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      updatedAt: Date.now(),
    }));
    setInputText("");
    setIsLoading(true);

    try {
      let response;

      // Build the effective text for the AI:
      // - If docText exists (extracted from file), use it, optionally prepended by user text
      // - If only user text, use that directly
      // - If file attached but no extracted text, send user text (backend will use file)
      let effectiveText: string;
      if (docText && hasText) {
        effectiveText = `${docText}\n\n---\nUser input: ${text}`;
      } else if (docText) {
        effectiveText = docText;
      } else if (hasText) {
        effectiveText = text;
      } else {
        effectiveText = "";
      }

      switch (activeAction) {
        case "chat":
          response = await sendChat(
            text,
            session.messages,
            docText,
            attachedDoc?.name,
          );
          break;
        case "summarize":
          response = await summarize(effectiveText, attachedDoc?.name);
          break;
        case "translate":
          response = await translate(
            effectiveText,
            targetLang,
            attachedDoc?.name,
          );
          break;
        case "extract-text": {
          // Text Extraction: return the raw extracted text from the document
          // (already extracted during attachment via extractDocumentText)
          let extracted = docText;
          if (!extracted && attachedDoc) {
            extracted = await extractDocumentText(attachedDoc);
            setDocText(extracted);
            setExtractionStatus("extracted");
          }
          if (extracted && !extracted.startsWith("[")) {
            const wordCount = extracted.split(/\s+/).length;
            const pageMatches = extracted.match(/\[Page \d+\]/g);
            const pageCount = pageMatches ? pageMatches.length : 1;
            response = {
              content:
                `📄 **Extracted Text from "${attachedDoc?.name || "document"}"**\n\n` +
                `**Stats:** ${wordCount.toLocaleString()} words · ${pageCount} page${pageCount !== 1 ? "s" : ""}\n\n` +
                `---\n\n${extracted}`,
            };
          } else {
            response = {
              content:
                extracted ||
                "❌ Could not extract text from this document. Please try a different PDF.",
            };
          }
          break;
        }
        case "extract-data":
          response = await extractData(
            effectiveText,
            undefined,
            attachedDoc?.name,
          );
          break;
        case "analyze":
          response = await analyze(effectiveText, undefined, attachedDoc?.name);
          break;
        case "tasks":
          response = await extractTasks(effectiveText, attachedDoc?.name);
          break;
        case "fill-form":
          response = await fillForm(
            effectiveText,
            undefined,
            attachedDoc?.name,
          );
          break;
        case "generate-content":
          response = await generateContent(
            effectiveText,
            undefined,
            attachedDoc?.name,
          );
          break;
        case "chat-with-document":
          response = await sendChat(
            text,
            session.messages,
            docText,
            attachedDoc?.name,
          );
          break;
        default:
          response = await sendChat(text, session.messages);
      }

      const assistantMsg = createMessage(
        "assistant",
        response.content,
        response.structuredData,
      );
      setSession((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMsg],
        updatedAt: Date.now(),
      }));
    } catch (e) {
      const errorMsg = createMessage(
        "assistant",
        `❌ Something went wrong: ${e instanceof Error ? e.message : "Unknown error"}. Please try again.`,
      );
      setSession((prev) => ({
        ...prev,
        messages: [...prev.messages, errorMsg],
      }));
    } finally {
      setIsLoading(false);
    }
  }, [
    inputText,
    isLoading,
    activeAction,
    attachedDoc,
    docText,
    session.messages,
    targetLang,
  ]);

  // ── New session ───────────────────────────────────────────────────────────
  const handleNewSession = useCallback(() => {
    if (session.messages.length > 0) {
      saveSession({ ...session, updatedAt: Date.now() });
    }
    setActiveAction("chat");
    setSession(createSession("chat"));
    setInputText("");
    setAttachedDoc(undefined);
    setDocText(undefined);
    setExtractionStatus("none");
    clearAIScreenState();
    loadSessions().then(setAllSessions);
  }, [session]);

  // ── History handlers ──────────────────────────────────────────────────────
  const handleSelectSession = useCallback(
    (s: AISession) => {
      if (session.messages.length > 0) {
        saveSession({ ...session, updatedAt: Date.now() });
      }
      setSession(s);
      setActiveAction(s.action);
      if (s.document) {
        setAttachedDoc(s.document);
      }
      setShowHistory(false);
    },
    [session],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSessionStorage(sessionId);
      const updated = await loadSessions();
      setAllSessions(updated);
      if (session.id === sessionId) {
        setSession(createSession(activeAction));
      }
    },
    [session.id, activeAction],
  );

  const handleClearAllSessions = useCallback(() => {
    Alert.alert(
      "Clear All History",
      "This will permanently delete all xumi conversation history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            await clearAllSessions();
            setAllSessions([]);
            setActiveAction("chat");
            setSession(createSession("chat"));
            setInputText("");
            setAttachedDoc(undefined);
            setDocText(undefined);
            setExtractionStatus("none");
            clearAIScreenState();
            setShowHistory(false);
          },
        },
      ],
    );
  }, [activeAction]);

  // ── Placeholder text ──────────────────────────────────────────────────────
  const placeholder = useMemo(() => {
    const placeholders: Record<AIAction, string> = {
      chat: "Ask me anything...",
      summarize: "Paste text or attach file...",
      translate: "Paste text or attach file...",
      "extract-text": attachedDoc
        ? `Extract text from "${attachedDoc.name}"...`
        : "Attach a PDF to extract text...",
      "extract-data": "Paste text or attach file...",
      analyze: "Paste text or attach file...",
      tasks: attachedDoc
        ? `Extract tasks from "${attachedDoc.name}"...`
        : "Paste text to find tasks...",
      "fill-form": attachedDoc
        ? "Describe the data to fill..."
        : "Attach a form document first...",
      "generate-content": "Describe what content to generate...",
      "chat-with-document": attachedDoc
        ? `Ask about "${attachedDoc.name}"...`
        : "Attach a document first...",
    };
    return placeholders[activeAction] || "Type a message...";
  }, [activeAction, attachedDoc]);

  // ── Language label ────────────────────────────────────────────────────────
  const langLabel = useMemo(
    () =>
      SUPPORTED_LANGUAGES.find((l) => l.code === targetLang)?.name ||
      targetLang,
    [targetLang],
  );

  // ── Chat FlatList helpers ─────────────────────────────────────────────────
  const renderChatItem = useCallback(
    ({ item }: { item: AIChatMessage }) => <AIChatBubble message={item} />,
    [],
  );
  const chatKeyExtractor = useCallback((item: AIChatMessage) => item.id, []);
  const chatListFooter = useMemo(() => {
    if (!isLoading) return null;
    return (
      <View
        style={[
          styles.loadingBubble,
          { backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9" },
        ]}
      >
        <ActivityIndicator size="small" color={ACCENT} />
        <Text style={[styles.loadingText, { color: t.textSecondary }]}>
          Thinking...
        </Text>
      </View>
    );
  }, [isLoading, mode, t.textSecondary]);
  const chatListEmpty = useMemo(
    () => <AIEmptyState action={activeAction} />,
    [activeAction],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: t.background }]}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* ─── Header ────────────────────────────────────────────── */}
        <XumiHeader
          onBack={() => router.back()}
          onNewChat={handleNewSession}
          onToggleMenu={() => setShowFeaturesDropdown((p) => !p)}
          menuOpen={showFeaturesDropdown}
        />

        {/* ─── Dropdown Features Panel (slides down from header) ── */}
        {showFeaturesDropdown && (
          <>
            {/* Transparent backdrop — tap outside to dismiss */}
            <Pressable
              style={styles.dropdownBackdrop}
              onPress={() => setShowFeaturesDropdown(false)}
            />
            <View
              style={[
                styles.dropdownPanel,
                { backgroundColor: t.card, borderColor: t.border },
              ]}
            >
              <View style={styles.featuresGrid}>
                {aiFeatures.map((feature) => {
                  const Icon =
                    FEATURE_ICONS[feature.id as keyof typeof FEATURE_ICONS] ||
                    Wand2;
                  const isActive = activeAction === feature.id;
                  return (
                    <TouchableOpacity
                      key={feature.id}
                      onPress={() => {
                        setShowFeaturesDropdown(false);
                        if (feature.id === "chat-with-document") {
                          router.push("/chat-with-document");
                          return;
                        }
                        handleModeChange(feature.id as AIAction);
                      }}
                      style={[
                        styles.featureCard,
                        {
                          backgroundColor: isActive
                            ? `${feature.color}15`
                            : t.card,
                          borderColor: isActive ? feature.color : t.border,
                          borderWidth: isActive ? 1.5 : 1,
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.featureIconContainer,
                          { backgroundColor: feature.color },
                        ]}
                      >
                        <Icon color="#FFF" size={13} strokeWidth={2.5} />
                      </View>
                      <Text
                        style={[
                          styles.featureName,
                          {
                            color: isActive ? feature.color : t.text,
                            fontWeight: isActive ? "700" : "600",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {feature.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[
                  styles.dropdownChatBtn,
                  {
                    backgroundColor:
                      t.backgroundSecondary ||
                      (mode === "dark" ? "#1E293B" : "#F1F5F9"),
                    borderColor: t.border,
                  },
                ]}
                onPress={() => {
                  setShowFeaturesDropdown(false);
                  handleModeChange("chat" as AIAction);
                }}
                activeOpacity={0.7}
              >
                <MessageSquare size={16} color={t.text} strokeWidth={2} />
                <Text
                  style={[
                    styles.dropdownChatBtnText,
                    { color: t.text, flex: 1 },
                  ]}
                >
                  Chat
                </Text>
                <Pressable
                  onPress={() => {
                    setShowFeaturesDropdown(false);
                    setShowHistory(true);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                  style={styles.clockIconHit}
                >
                  <Clock size={16} color={t.textSecondary} strokeWidth={2} />
                </Pressable>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─── Translate language bar ────────────────────────────── */}
        {activeAction === "translate" && (
          <TouchableOpacity
            style={[
              styles.langBar,
              {
                backgroundColor: mode === "dark" ? "#1E293B" : "#F3E8FF",
                borderColor: mode === "dark" ? "#334155" : "#D8B4FE",
              },
            ]}
            onPress={() => setShowLangPicker(true)}
            activeOpacity={0.7}
          >
            <Globe size={16} color={ACCENT} />
            <Text style={[styles.langText, { color: t.text }]}>
              Translate to:{" "}
              <Text style={{ fontWeight: "700", color: ACCENT }}>
                {langLabel}
              </Text>
            </Text>
            <Text style={{ color: t.textTertiary, fontSize: 12 }}>
              Change ›
            </Text>
          </TouchableOpacity>
        )}

        {/* ─── Inline Document Bar (shown when doc attached) ────── */}
        {attachedDoc && (
          <View
            style={[
              styles.docBar,
              {
                backgroundColor: mode === "dark" ? "#1E293B" : "#F3E8FF",
                borderColor: mode === "dark" ? "#334155" : "#D8B4FE",
              },
            ]}
          >
            <FileSearch size={16} color={ACCENT} />
            <Text
              style={[styles.docBarName, { color: t.text }]}
              numberOfLines={1}
            >
              {attachedDoc.name}
            </Text>
            <Text style={{ color: t.textTertiary, fontSize: 11 }}>
              {extractionStatus === "extracted"
                ? "✓"
                : extractionStatus === "partial"
                  ? "⚠"
                  : "📄"}
            </Text>
            <TouchableOpacity
              onPress={handleRemoveDocument}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={t.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Chat area ─────────────────────────────────────────── */}
        <View
          style={[
            styles.chatContainer,
            {
              backgroundColor: t.card,
              borderColor: t.border,
            },
          ]}
        >
          <FlatList
            ref={scrollRef}
            data={session.messages}
            renderItem={renderChatItem}
            keyExtractor={chatKeyExtractor}
            style={styles.flex}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={chatListEmpty}
            ListFooterComponent={chatListFooter}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={7}
          />

          {/* ─── Input area ──────────────────────────────────────── */}
          <View style={[styles.inputRow, { borderTopColor: t.border }]}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder={placeholder}
              placeholderTextColor={t.textTertiary}
              style={[
                styles.textInput,
                {
                  backgroundColor:
                    t.backgroundSecondary ||
                    (mode === "dark" ? "#1E293B" : "#F1F5F9"),
                  color: t.text,
                },
              ]}
              multiline
              maxLength={5000}
              editable={!isLoading}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={handleAttachDocument}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={styles.attachIconBtn}
              activeOpacity={0.7}
            >
              <Paperclip
                size={18}
                color={attachedDoc ? ACCENT : t.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: canSend ? ACCENT : t.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Send color={canSend ? "#FFF" : t.textTertiary} size={18} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ─── Modals ──────────────────────────────────────────────── */}
      <AILanguagePicker
        visible={showLangPicker}
        selected={targetLang}
        onSelect={setTargetLang}
        onClose={() => setShowLangPicker(false)}
      />

      {/* File Source Picker Modal */}
      {showFileSourcePicker && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <View
            style={{
              backgroundColor: t.card,
              borderRadius: 16,
              padding: 24,
              width: "85%",
              maxWidth: 400,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: t.text,
                marginBottom: 8,
              }}
            >
              Attach Document
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: t.textSecondary,
                marginBottom: 24,
              }}
            >
              Choose where to pick the document from
            </Text>

            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                backgroundColor: t.backgroundSecondary,
                borderRadius: 12,
                marginBottom: 12,
              }}
              onPress={handlePickFromApp}
              activeOpacity={0.7}
            >
              <BookOpen size={24} color={ACCENT} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 16, fontWeight: "600", color: t.text }}
                >
                  Pick from App Library
                </Text>
                <Text
                  style={{ fontSize: 13, color: t.textSecondary, marginTop: 2 }}
                >
                  Choose from your imported documents
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                backgroundColor: t.backgroundSecondary,
                borderRadius: 12,
                marginBottom: 16,
              }}
              onPress={handlePickFromDevice}
              activeOpacity={0.7}
            >
              <FileSearch
                size={24}
                color={ACCENT}
                style={{ marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 16, fontWeight: "600", color: t.text }}
                >
                  Pick from Device
                </Text>
                <Text
                  style={{ fontSize: 13, color: t.textSecondary, marginTop: 2 }}
                >
                  Browse files on your device
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                padding: 12,
                alignItems: "center",
              }}
              onPress={() => setShowFileSourcePicker(false)}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "600",
                  color: t.textSecondary,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Library Picker Modal */}
      <LibraryFilePicker
        visible={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onSelect={handleLibraryFileSelected}
        allowedTypes={["pdf", "docx", "txt", "epub", "xlsx", "csv"]}
        multiple={false}
        title="Select Document from Library"
      />

      <AISessionHistory
        visible={showHistory}
        sessions={allSessions}
        onSelect={handleSelectSession}
        onDelete={handleDeleteSession}
        onClearAll={handleClearAllSessions}
        onClose={() => setShowHistory(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  // ─── Feature Grid ───
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    zIndex: 9,
    backgroundColor: "transparent",
  },
  dropdownPanel: {
    paddingHorizontal: GRID_H_PADDING,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  dropdownChatBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dropdownChatBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  clockIconHit: {
    padding: 4,
  },
  featuresContainer: {
    paddingHorizontal: GRID_H_PADDING,
    paddingTop: 8,
    paddingBottom: 10,
  },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: GRID_GAP,
    rowGap: 4,
  },
  featureCard: {
    width: CARD_WIDTH,
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  featureIconContainer: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  featureName: {
    fontSize: 9,
    textAlign: "center",
    lineHeight: 11,
  },
  // ─── Language Bar ───
  langBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  langText: {
    flex: 1,
    fontSize: 13,
  },
  // ─── Inline Document Bar ───
  docBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: spacing.md,
    marginBottom: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  docBarName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  // ─── Chat Area ───
  chatContainer: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 16,
    borderWidth: 0,
    overflow: "hidden",
  },
  chatContent: {
    padding: 8,
    flexGrow: 1,
  },
  loadingBubble: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginTop: spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "500",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.sm + 2,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 40,
  },
  attachIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
