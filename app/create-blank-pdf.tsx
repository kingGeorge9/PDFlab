/**
 * create-blank-pdf.tsx
 *
 * Rich document editor for creating .pdf files.
 * Clean, uncluttered editor with WebView contenteditable for rich text.
 * Home/Insert formatting tools are hidden by default and shown via
 * toggle buttons in a slim bottom toolbar.
 *
 * PERF: Heavy editor components (WebEditor, EditorToolbar, modals) are
 * deferred until after the screen is visible via InteractionManager.
 * This makes the screen appear almost instantly after navigation.
 */

import {
  DocumentProvider,
  useDocument,
} from "@/components/editor/DocumentContext";
import { PINGate } from "@/components/PINGate";
import { markFileAsCreated } from "@/services/fileService";
import { useTheme } from "@/services/ThemeProvider";
import { sanitizeFilename } from "@/utils/file-save-utils";
import { perfMark } from "@/utils/perfLogger";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ── Lazy-loaded heavy editor components (deferred until screen is visible) ──
const WebEditor = React.lazy(() => import("@/components/editor/WebEditor"));
const EditorToolbar = React.lazy(
  () => import("@/components/editor/EditorToolbar"),
);

// Modals are small and conditionally rendered — import directly
import CommentModal from "@/components/editor/modals/CommentModal";
import HyperlinkModal from "@/components/editor/modals/HyperlinkModal";
import {
  AttachmentModal,
  PictureModal,
} from "@/components/editor/modals/MediaModals";
import {
  BookmarkModal,
  DateTimeModal,
} from "@/components/editor/modals/OtherModals";
import SignatureModal from "@/components/editor/modals/SignatureModal";
import TableModal from "@/components/editor/modals/TableModal";

// Cache the expo-print module after first load
let _printToFile: any = null;
const getPrintToFileAsync = async () => {
  if (_printToFile) return _printToFile;
  const mod = await import("expo-print");
  // Metro dynamic import may place exports at top-level or under .default
  _printToFile =
    (mod as any).printToFileAsync ??
    (mod as any).default?.printToFileAsync ??
    null;
  if (!_printToFile) {
    throw new Error("printToFileAsync not found in expo-print module");
  }
  return _printToFile;
};

// ── Inner editor screen (must be inside DocumentProvider) ──────────────────

function PdfEditorScreen() {
  const router = useRouter();
  const { colors: t, mode: themeMode } = useTheme();
  const { state, dispatch, webViewRef } = useDocument();

  const [isSaving, setIsSaving] = useState(false);
  // PERF: Defer heavy editor mount until after screen transition completes
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setEditorReady(true);
    });
    return () => handle.cancel();
  }, []);

  // ── Extract HTML from WebView via promise ──────────────────────────────
  const getEditorHtml = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const ref = webViewRef.current;
      if (!ref) {
        resolve("");
        return;
      }
      const js = `
        (function(){
          var el = document.getElementById('editor');
          if (!el) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type:'GET_CONTENT_RESULT', html: ''
            }));
            return;
          }
          // Clone and strip editor-only UI before serializing
          var clone = el.cloneNode(true);
          clone.querySelectorAll('.table-toolbar').forEach(function(e){ e.remove(); });
          clone.querySelectorAll('.table-add-row-btn').forEach(function(e){ e.remove(); });
          clone.querySelectorAll('.img-action-bar').forEach(function(e){ e.remove(); });
          clone.querySelectorAll('.crop-overlay').forEach(function(e){ e.remove(); });
          clone.querySelectorAll('.crop-btn-bar').forEach(function(e){ e.remove(); });
          clone.querySelectorAll('.img-resize-handle').forEach(function(e){ e.remove(); });
          clone.querySelectorAll('.img-resize-wrap').forEach(function(w){
            var img = w.querySelector('img');
            if (img) { w.parentNode.insertBefore(img, w); }
            w.remove();
          });
          clone.querySelectorAll('[contenteditable]').forEach(function(e){
            e.removeAttribute('contenteditable');
          });
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type:'GET_CONTENT_RESULT',
            html: clone.innerHTML
          }));
        })();
        true;
      `;
      (ref as any).__htmlResolve = resolve;
      ref.injectJavaScript(js);
      setTimeout(() => {
        if ((ref as any).__htmlResolve) {
          (ref as any).__htmlResolve("");
          delete (ref as any).__htmlResolve;
        }
      }, 3000);
    });
  }, [webViewRef]);

  // ── Save as .pdf ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const endSave = perfMark("PDF.save.total");
    try {
      const endHtml = perfMark("PDF.save.getHtml");
      const editorHtml = await getEditorHtml();
      endHtml();
      const title = sanitizeFilename(state.title);

      if (!editorHtml && !title) {
        Alert.alert("Empty Document", "Please enter some content first.");
        setIsSaving(false);
        return;
      }

      // Yield to let the spinner render before heavy work
      await new Promise<void>((r) =>
        InteractionManager.runAfterInteractions(() => r()),
      );

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 60px 50px;
      line-height: 1.6;
      color: #1a1a1a;
    }
    h1 {
      font-size: 28px; font-weight: 700; color: #000;
      margin-bottom: 24px; letter-spacing: -0.5px;
    }
    img { max-width: 100%; height: auto; }
    a { color: #007AFF; text-decoration: underline; }
    .page-break { page-break-after: always; }
    .comment-marker {
      background: #fff3cd; border-left: 3px solid #ffc107;
      padding: 4px 8px; margin: 4px 0; font-size: 12px;
    }
    /* ── Table borders for PDF export ─────────────────────────── */
    table, table.editor-table, table.docx-table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
      font-size: 14px;
      page-break-inside: auto;
    }
    tr { page-break-inside: avoid; page-break-after: auto; }
    td, th {
      border: 1px solid #333;
      padding: 6px 10px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    th, table.editor-table tr:first-child td {
      background-color: #f0f0f0;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <h1>${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1>
  ${editorHtml || ""}
</body>
</html>`;

      const endPrint = perfMark("PDF.save.printToFile");
      const printToFile = await getPrintToFileAsync();
      const { uri } = await printToFile({
        html: fullHtml,
        base64: false,
      });
      endPrint();

      const endMark = perfMark("PDF.save.markCreated");
      await markFileAsCreated(uri, title, "pdf");
      endMark();
      endSave();

      Alert.alert("PDF Created", "Your PDF has been created successfully!", [
        {
          text: "View",
          onPress: () => {
            (router as any).push({
              pathname: "/pdf-viewer",
              params: { uri, name: title + ".pdf" },
            });
          },
        },
        { text: "OK" },
      ]);
    } catch (error) {
      console.error("PDF save error:", error);
      Alert.alert(
        "Error",
        `Failed to save: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  }, [getEditorHtml, state.title, router]);

  // ── Undo / Redo (call the correct WebView function names) ──────────────
  const handleUndo = useCallback(() => {
    webViewRef.current?.injectJavaScript("doUndo(); true;");
  }, [webViewRef]);

  const handleRedo = useCallback(() => {
    webViewRef.current?.injectJavaScript("doRedo(); true;");
  }, [webViewRef]);

  // ── Modal helpers ──────────────────────────────────────────────────────
  const isModal = useCallback(
    (name: string) => state.activeModal === name,
    [state.activeModal],
  );
  const closeModal = useCallback(
    () => dispatch({ type: "SET_MODAL", modal: null }),
    [dispatch],
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: t.card }]}
      edges={["top", "bottom"]}
    >
      <StatusBar
        barStyle={themeMode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={t.card}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          { backgroundColor: t.card, borderBottomColor: t.border },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        <Text style={[styles.headerTitle, { color: t.text }]}>New PDF</Text>

        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={[styles.createBtn, isSaving && styles.createBtnDisabled]}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </Pressable>
      </View>

      {/* ── Title bar with undo/redo ───────────────────────────────────── */}
      <View style={[styles.titleRow, { borderBottomColor: t.border }]}>
        <View style={styles.titleInputWrap}>
          <TextInput
            style={[
              styles.titleInput,
              { color: t.text, borderColor: t.border },
            ]}
            value={state.title}
            onChangeText={(text) =>
              dispatch({ type: "SET_TITLE", title: text })
            }
            placeholder=""
            maxLength={120}
            returnKeyType="done"
            selectTextOnFocus
          />
          {!state.title && (
            <View style={styles.titlePlaceholderWrap} pointerEvents="none">
              <Text
                style={[
                  styles.titlePlaceholder,
                  { color: t.textTertiary ?? "#999" },
                ]}
              >
                Enter Title
              </Text>
            </View>
          )}
        </View>

        <View style={styles.undoRedoRow}>
          <Pressable
            onPress={handleUndo}
            disabled={!state.canUndo}
            style={styles.undoRedoBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name="arrow-undo"
              size={24}
              color={state.canUndo ? "#007AFF" : "#C0C0C0"}
            />
          </Pressable>
          <Pressable
            onPress={handleRedo}
            disabled={!state.canRedo}
            style={styles.undoRedoBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name="arrow-redo"
              size={24}
              color={state.canRedo ? "#007AFF" : "#C0C0C0"}
            />
          </Pressable>
        </View>
      </View>

      {/* ── Editor (maximised) ─────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.editorFlex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {editorReady ? (
          <React.Suspense
            fallback={
              <View style={styles.editorPlaceholder}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            }
          >
            <WebEditor />
          </React.Suspense>
        ) : (
          <View style={styles.editorPlaceholder}>
            <ActivityIndicator size="small" color="#007AFF" />
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Home / Insert toggle toolbar ───────────────────────────────── */}
      {editorReady && (
        <React.Suspense fallback={null}>
          <EditorToolbar />
        </React.Suspense>
      )}

      {/* ── Modals (only mount when active — conditional render) ───────── */}
      {isModal("signature") && <SignatureModal visible onClose={closeModal} />}
      {isModal("hyperlink") && <HyperlinkModal visible onClose={closeModal} />}
      {isModal("comment") && <CommentModal visible onClose={closeModal} />}
      {isModal("table") && <TableModal visible onClose={closeModal} />}
      {isModal("picture") && (
        <PictureModal visible onClose={closeModal} mode="gallery" />
      )}
      {isModal("attachment") && (
        <AttachmentModal visible onClose={closeModal} />
      )}
      {isModal("datetime") && <DateTimeModal visible onClose={closeModal} />}
      {isModal("bookmark") && <BookmarkModal visible onClose={closeModal} />}
    </SafeAreaView>
  );
}

// ── Exported screen ────────────────────────────────────────────────────────

export default function CreateBlankPdfScreen() {
  return (
    <PINGate screen="createFiles">
      <DocumentProvider initialTitle="">
        <PdfEditorScreen />
      </DocumentProvider>
    </PINGate>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  cancelText: { fontSize: 17, color: "#007AFF", fontWeight: "400" },
  headerTitle: { fontSize: 18, fontWeight: "600" },
  createBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    minWidth: 70,
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  /* Title row */
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  titlePlaceholderWrap: {
    position: "absolute",
    left: 2,
  },
  titlePlaceholder: {
    fontSize: 17,
    fontStyle: "italic",
  },
  titleInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    borderBottomWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },

  undoRedoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  undoRedoBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  /* Editor */
  editorFlex: { flex: 1 },
  editorPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
