// ============================================
// Chat With Document Screen
// RAG-powered conversational document Q&A
// ============================================

import { AIChatBubble } from "@/components/ai";
import { LibraryFilePicker } from "@/components/LibraryFilePicker";
import { spacing } from "@/constants/theme";
import type { AIChatMessage, AIDocumentRef } from "@/services/ai";
import {
  createMessage,
  createSession,
  initAIProvider,
  pickDocument,
  saveSession,
} from "@/services/ai";
import {
  askDocumentQuestion,
  extractDocumentForChat,
  type DocumentChatSession,
} from "@/services/documentChatService";
import { useTheme } from "@/services/ThemeProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  BookOpen,
  FileSearch,
  FileText,
  MessageSquarePlus,
  Paperclip,
  RefreshCw,
  Send,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ACCENT = "#EC4899"; // pink-500 — matches the AI feature color
const SCREEN_WIDTH = Dimensions.get("window").width;

type ChatPhase = "pick" | "processing" | "ready" | "error";

export default function ChatWithDocumentScreen() {
  const { colors: t, mode } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    uri?: string;
    name?: string;
    mimeType?: string;
  }>();

  // ── State ─────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<ChatPhase>("pick");
  const [doc, setDoc] = useState<AIDocumentRef | null>(null);
  const [chatSession, setChatSession] = useState<DocumentChatSession | null>(
    null,
  );
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // File picker modals
  const [showFileSourcePicker, setShowFileSourcePicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages.length]);

  // ── Initialize on mount ───────────────────────────────────────────────────
  useEffect(() => {
    initAIProvider();

    // If opened with document params (from a viewer), start processing
    if (params.uri && params.name) {
      const docRef: AIDocumentRef = {
        uri: params.uri,
        name: params.name,
        mimeType: params.mimeType || "application/octet-stream",
      };
      processDocument(docRef);
    }
  }, []);

  // ── Process document ──────────────────────────────────────────────────────
  const processDocument = useCallback(async (docRef: AIDocumentRef) => {
    setDoc(docRef);
    setPhase("processing");
    setProcessingStatus("Uploading and extracting text...");
    setMessages([]);
    setErrorMessage("");

    try {
      setProcessingStatus("Extracting text from document...");
      const session = await extractDocumentForChat(docRef);

      setProcessingStatus("Generating embeddings...");
      // Embeddings are generated server-side during extraction
      setChatSession(session);
      setPhase("ready");

      // Add welcome message
      const welcomeMsg = createMessage(
        "assistant",
        `📄 **${session.filename}** is ready!\n\n` +
          `**${session.totalPages} ${session.fileType === "epub" ? "chapters" : "pages"}** · ` +
          `${session.chunkCount} sections indexed` +
          `${session.embeddingProvider !== "none" ? ` · ${session.embeddingProvider} embeddings` : ""}\n\n` +
          `Ask me anything about this document. I'll find the relevant sections and answer based on the content.\n\n` +
          (session.suggestedPrompts.length > 0
            ? `**Try asking:**\n${session.suggestedPrompts.map((p) => `• ${p}`).join("\n")}`
            : ""),
      );
      setMessages([welcomeMsg]);

      // Save as an AI session
      const aiSession = createSession("chat-with-document", docRef);
      aiSession.messages = [welcomeMsg];
      saveSession(aiSession);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to process document";
      setErrorMessage(msg);
      setPhase("error");
    }
  }, []);

  // ── Pick from device ──────────────────────────────────────────────────────
  const handlePickFromDevice = useCallback(async () => {
    setShowFileSourcePicker(false);
    const picked = await pickDocument();
    if (picked) {
      processDocument(picked);
    }
  }, [processDocument]);

  // ── Pick from app library ─────────────────────────────────────────────────
  const handlePickFromApp = useCallback(() => {
    setShowFileSourcePicker(false);
    setShowLibraryPicker(true);
  }, []);

  const handleLibraryFileSelected = useCallback(
    (files: any[]) => {
      setShowLibraryPicker(false);
      if (files.length === 0) return;

      const f = files[0];
      const docRef: AIDocumentRef = {
        uri: f.uri,
        name: f.name,
        mimeType: f.mimeType || "application/octet-stream",
        size: f.size,
      };
      processDocument(docRef);
    },
    [processDocument],
  );

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading || !chatSession) return;

    const userMsg = createMessage("user", text);
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    try {
      const result = await askDocumentQuestion(
        chatSession.docId,
        text,
        messages,
      );

      // Format the answer with citations
      let answerText = result.answer;

      if (result.citations && result.citations.length > 0) {
        const citationList = result.citations
          .filter((c) => c.quote)
          .map(
            (c) =>
              `> "${c.quote}" — ${chatSession.fileType === "epub" ? "Chapter" : "Page"} ${c.page}`,
          )
          .join("\n\n");
        if (citationList) {
          answerText += `\n\n---\n📌 **Sources:**\n${citationList}`;
        }
      }

      if (!result.found) {
        answerText = "⚠️ " + answerText;
      }

      const assistantMsg = createMessage("assistant", answerText);
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Something went wrong";

      if (errMsg.includes("DOCUMENT_EXPIRED")) {
        // Re-process the document
        const reprocessMsg = createMessage(
          "assistant",
          "⏳ The document session has expired. Let me re-process it for you...",
        );
        setMessages((prev) => [...prev, reprocessMsg]);

        if (doc) {
          processDocument(doc);
        }
        return;
      }

      const errorResponseMsg = createMessage(
        "assistant",
        `❌ ${errMsg}\n\nPlease try rephrasing your question.`,
      );
      setMessages((prev) => [...prev, errorResponseMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, chatSession, messages, doc, processDocument]);

  // ── Suggested prompt handler ──────────────────────────────────────────────
  const handleSuggestedPrompt = useCallback((prompt: string) => {
    setInputText(prompt);
  }, []);

  // ── New document ──────────────────────────────────────────────────────────
  const handleNewDocument = useCallback(() => {
    setPhase("pick");
    setDoc(null);
    setChatSession(null);
    setMessages([]);
    setInputText("");
    setErrorMessage("");
  }, []);

  // ── Reset conversation (keep document) ────────────────────────────────────
  const handleResetConversation = useCallback(() => {
    if (!chatSession) return;
    Alert.alert(
      "Reset Conversation",
      "This will clear the chat history but keep the document loaded.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          onPress: () => {
            const welcomeMsg = createMessage(
              "assistant",
              `📄 Conversation reset. "${chatSession.filename}" is still loaded.\n\nAsk me a new question!`,
            );
            setMessages([welcomeMsg]);
          },
        },
      ],
    );
  }, [chatSession]);

  // ── Render: Document Picker Phase ─────────────────────────────────────────
  const renderPickPhase = () => (
    <View style={styles.centerContainer}>
      <View
        style={[
          styles.pickCard,
          { backgroundColor: t.card, borderColor: t.border },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${ACCENT}15` }]}>
          <FileText size={40} color={ACCENT} />
        </View>
        <Text style={[styles.pickTitle, { color: t.text }]}>
          Chat with File
        </Text>
        <Text style={[styles.pickSubtitle, { color: t.textSecondary }]}>
          Upload a PDF, DOCX, or EPUB and ask questions about its content.
          Powered by AI with document grounding.
        </Text>

        <TouchableOpacity
          style={[styles.pickButton, { backgroundColor: ACCENT }]}
          onPress={() => setShowFileSourcePicker(true)}
          activeOpacity={0.8}
        >
          <Paperclip size={20} color="#FFF" />
          <Text style={styles.pickButtonText}>Select Document</Text>
        </TouchableOpacity>

        <View style={styles.formatRow}>
          {["PDF", "DOCX", "EPUB", "TXT"].map((fmt) => (
            <View
              key={fmt}
              style={[
                styles.formatBadge,
                {
                  backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9",
                },
              ]}
            >
              <Text
                style={[styles.formatBadgeText, { color: t.textSecondary }]}
              >
                {fmt}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  // ── Render: Processing Phase ──────────────────────────────────────────────
  const renderProcessingPhase = () => (
    <View style={styles.centerContainer}>
      <View
        style={[
          styles.pickCard,
          { backgroundColor: t.card, borderColor: t.border },
        ]}
      >
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={[styles.processingTitle, { color: t.text }]}>
          Processing Document
        </Text>
        <Text style={[styles.processingStatus, { color: t.textSecondary }]}>
          {processingStatus}
        </Text>
        {doc && (
          <Text
            style={[styles.processingFilename, { color: t.textTertiary }]}
            numberOfLines={1}
          >
            {doc.name}
          </Text>
        )}
      </View>
    </View>
  );

  // ── Render: Error Phase ───────────────────────────────────────────────────
  const renderErrorPhase = () => (
    <View style={styles.centerContainer}>
      <View
        style={[
          styles.pickCard,
          { backgroundColor: t.card, borderColor: t.border },
        ]}
      >
        <AlertCircle size={40} color="#EF4444" />
        <Text style={[styles.pickTitle, { color: t.text }]}>
          Processing Failed
        </Text>
        <Text style={[styles.pickSubtitle, { color: t.textSecondary }]}>
          {errorMessage}
        </Text>

        <TouchableOpacity
          style={[styles.pickButton, { backgroundColor: ACCENT }]}
          onPress={() => {
            if (doc) {
              processDocument(doc);
            } else {
              setPhase("pick");
            }
          }}
          activeOpacity={0.8}
        >
          <RefreshCw size={20} color="#FFF" />
          <Text style={styles.pickButtonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.pickButton,
            {
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: t.border,
              marginTop: 8,
            },
          ]}
          onPress={handleNewDocument}
          activeOpacity={0.8}
        >
          <Text style={[styles.pickButtonText, { color: t.text }]}>
            Choose Different Document
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render: Chat Phase ────────────────────────────────────────────────────
  const renderChatPhase = () => (
    <>
      {/* Document Info Bar */}
      {chatSession && (
        <View
          style={[
            styles.docInfoBar,
            {
              backgroundColor: mode === "dark" ? "#1E293B" : "#FDF2F8",
              borderColor: mode === "dark" ? "#334155" : "#FBCFE8",
            },
          ]}
        >
          <FileText size={16} color={ACCENT} />
          <View style={styles.docInfoContent}>
            <Text
              style={[styles.docInfoName, { color: t.text }]}
              numberOfLines={1}
            >
              {chatSession.filename}
            </Text>
            <Text style={[styles.docInfoMeta, { color: t.textTertiary }]}>
              {chatSession.totalPages}{" "}
              {chatSession.fileType === "epub" ? "chapters" : "pages"} ·{" "}
              {chatSession.chunkCount} sections
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleResetConversation}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.resetBtn}
          >
            <RefreshCw size={16} color={t.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNewDocument}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MessageSquarePlus size={16} color={t.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Chat Messages */}
      <View
        style={[
          styles.chatContainer,
          { backgroundColor: t.card, borderColor: t.border },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((msg) => (
            <AIChatBubble key={msg.id} message={msg} />
          ))}
          {isLoading && (
            <View
              style={[
                styles.loadingBubble,
                {
                  backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9",
                },
              ]}
            >
              <ActivityIndicator size="small" color={ACCENT} />
              <Text style={[styles.loadingText, { color: t.textSecondary }]}>
                Searching document...
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Suggested prompts (show only when chat is empty-ish) */}
        {chatSession &&
          messages.length <= 1 &&
          chatSession.suggestedPrompts.length > 0 && (
            <View style={styles.suggestionsRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionsContent}
              >
                {chatSession.suggestedPrompts.map((prompt, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.suggestionChip,
                      {
                        backgroundColor:
                          mode === "dark" ? "#1E293B" : "#FDF2F8",
                        borderColor: mode === "dark" ? "#334155" : "#FBCFE8",
                      },
                    ]}
                    onPress={() => handleSuggestedPrompt(prompt)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.suggestionText, { color: ACCENT }]}
                      numberOfLines={1}
                    >
                      {prompt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

        {/* Input Area */}
        <View style={[styles.inputRow, { borderTopColor: t.border }]}>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              chatSession
                ? `Ask about "${chatSession.filename}"...`
                : "Ask a question..."
            }
            placeholderTextColor={t.textTertiary}
            style={[
              styles.textInput,
              {
                backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9",
                color: t.text,
              },
            ]}
            multiline
            maxLength={2000}
            editable={!isLoading}
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  inputText.trim() && !isLoading ? ACCENT : t.border,
              },
            ]}
            activeOpacity={0.7}
          >
            <Send
              color={inputText.trim() && !isLoading ? "#FFF" : t.textTertiary}
              size={18}
            />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: t.background }]}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: t.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerBackBtn}
          >
            <X size={22} color={t.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleRow}>
            <FileText size={18} color={ACCENT} />
            <Text style={[styles.headerTitle, { color: t.text }]}>
              Chat with File
            </Text>
          </View>

          {phase === "ready" && (
            <TouchableOpacity
              onPress={handleNewDocument}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MessageSquarePlus size={20} color={t.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content based on phase */}
        {phase === "pick" && renderPickPhase()}
        {phase === "processing" && renderProcessingPhase()}
        {phase === "error" && renderErrorPhase()}
        {phase === "ready" && renderChatPhase()}
      </KeyboardAvoidingView>

      {/* File Source Picker Modal */}
      {showFileSourcePicker && (
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>
              Select Document
            </Text>
            <Text style={[styles.modalSubtitle, { color: t.textSecondary }]}>
              Choose a document to chat with
            </Text>

            <TouchableOpacity
              style={[
                styles.modalOption,
                { backgroundColor: t.backgroundSecondary },
              ]}
              onPress={handlePickFromApp}
              activeOpacity={0.7}
            >
              <BookOpen size={24} color={ACCENT} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 16, fontWeight: "600", color: t.text }}
                >
                  From App Library
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: t.textSecondary,
                    marginTop: 2,
                  }}
                >
                  Choose from imported documents
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalOption,
                { backgroundColor: t.backgroundSecondary },
              ]}
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
                  From Device
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: t.textSecondary,
                    marginTop: 2,
                  }}
                >
                  Browse files on your device
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancel}
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

      {/* Library Picker */}
      <LibraryFilePicker
        visible={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onSelect={handleLibraryFileSelected}
        allowedTypes={["pdf", "docx", "epub", "txt"]}
        multiple={false}
        title="Select Document to Chat With"
      />
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBackBtn: {
    marginRight: 12,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  // Center container (pick, processing, error)
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  pickCard: {
    width: "100%",
    maxWidth: 400,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  pickTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  pickSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 24,
  },
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    width: "100%",
  },
  pickButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  formatRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  formatBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  formatBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Processing
  processingTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 8,
  },
  processingStatus: {
    fontSize: 14,
    textAlign: "center",
  },
  processingFilename: {
    fontSize: 12,
    marginTop: 8,
  },

  // Document info bar
  docInfoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.md,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  docInfoContent: {
    flex: 1,
  },
  docInfoName: {
    fontSize: 13,
    fontWeight: "600",
  },
  docInfoMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  resetBtn: {
    marginRight: 4,
  },

  // Chat area
  chatContainer: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 16,
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
  },

  // Suggestions
  suggestionsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    paddingVertical: 6,
  },
  suggestionsContent: {
    paddingHorizontal: 8,
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Input area
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  // Modals
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalCard: {
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  modalCancel: {
    padding: 12,
    alignItems: "center",
    marginTop: 4,
  },
});
