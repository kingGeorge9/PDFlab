/**
 * EpubViewerScreen.tsx
 *
 * Full integration screen for EPUB reading with TTS.
 * Mirrors PdfViewerScreen so both screens share the same
 * ReadAloudBar, VoicePicker, and playback UX.
 *
 * Replace the MockEpubViewer block with your real EPUB renderer
 * (e.g. react-native-epub-view or a WebView-based renderer).
 */

import { ReadAloudBar } from "@/components/ReadAloudBar";
import { VoicePicker } from "@/components/VoicePicker";
import { TextChunk } from "@/utils/chunkText";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEpubReadAloud } from "../hooks/useEpubReadAloud";
import { EpubChapter } from "../utils/epubExtractor";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

interface Props {
  route?: { params?: { filePath?: string; fileName?: string } };
}

export const EpubViewerScreen: React.FC<Props> = ({ route }) => {
  const filePath = route?.params?.filePath ?? null;
  const fileName = route?.params?.fileName ?? "Book";

  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // ── EPUB extraction + TTS ──────────────────────────────────────────────────

  const epub = useEpubReadAloud({
    filePath,
    initialRate: 1.0,
    onChapterChange: (chapterIndex) => {
      // Auto-scroll chapter list to the current chapter
      // (if you render chapters in a FlatList, call scrollToIndex here)
      console.log("[EpubViewer] Now reading chapter", chapterIndex);
    },
  });

  // ── Jump to chapter from the chapter list ─────────────────────────────────

  const handleChapterTap = useCallback(
    (chapterIndex: number) => {
      epub.jumpToChapter(chapterIndex);
      setShowChapterList(false);
    },
    [epub],
  );

  // ---------------------------------------------------------------------------
  // Render — loading / error states
  // ---------------------------------------------------------------------------

  const renderBody = () => {
    if (!filePath) {
      return (
        <View style={styles.centred}>
          <Text style={styles.hint}>No EPUB file provided.</Text>
        </View>
      );
    }

    if (epub.loadStatus === "extracting") {
      return (
        <View style={styles.centred}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={styles.hint}>Reading book content…</Text>
          <Text style={styles.subHint}>Large books may take a moment</Text>
        </View>
      );
    }

    if (epub.loadStatus === "error") {
      return (
        <View style={styles.centred}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.error}>Could not load this EPUB file.</Text>
          <Text style={styles.subHint}>{epub.errorMessage}</Text>
        </View>
      );
    }

    return (
      <>
        {/*
         * ── Replace MockEpubViewer with your real renderer ──
         *
         * Options:
         *  - react-native-epub-view  (WebView-based)
         *  - A custom WebView loading each chapter's HTML
         *
         * Pass currentChapterIndex to keep the renderer in sync with TTS.
         */}
        <MockEpubViewer
          book={epub.book}
          chunks={epub.chunks}
          currentChapterIndex={epub.currentChapterIndex}
          currentChunkIndex={epub.controls.currentChunkIndex}
          onChapterTap={handleChapterTap}
        />
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {epub.book && (
            <Pressable
              onPress={() => setShowChapterList(true)}
              style={styles.chaptersBtn}
              accessibilityLabel="Chapter list"
            >
              <Text style={styles.chaptersBtnText}>≡ Chapters</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {epub.book?.title || fileName}
        </Text>

        <Pressable
          onPress={() => setShowVoicePicker(true)}
          style={styles.voiceButton}
          accessibilityLabel="Choose reading voice"
        >
          <Text style={styles.voiceButtonText}>Voice</Text>
        </Pressable>
      </View>

      {/* ── Book info bar (author + progress) ── */}
      {epub.book && (
        <View style={styles.infoBar}>
          <Text style={styles.author} numberOfLines={1}>
            {epub.book.author}
          </Text>
          <Text style={styles.progress}>
            Ch. {epub.currentChapterIndex + 1} / {epub.book.chapters.length}
            {"  ·  "}
            {epub.chunks.length > 0
              ? `${Math.round(
                  ((epub.controls.currentChunkIndex + 1) / epub.chunks.length) *
                    100,
                )}%`
              : "—"}
          </Text>
        </View>
      )}

      {/* ── Body ── */}
      <View style={styles.body}>{renderBody()}</View>

      {/* ── Read-Aloud bar ── */}
      <ReadAloudBar {...epub.controls} visible={epub.ready} />

      {/* ── Voice picker ── */}
      <VoicePicker
        visible={showVoicePicker}
        onClose={() => setShowVoicePicker(false)}
      />

      {/* ── Chapter list sheet ── */}
      {showChapterList && epub.book && (
        <ChapterListSheet
          chapters={epub.book.chapters}
          currentIndex={epub.currentChapterIndex}
          onSelect={handleChapterTap}
          onClose={() => setShowChapterList(false)}
        />
      )}
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Chapter list sheet
// ---------------------------------------------------------------------------

interface ChapterListSheetProps {
  chapters: EpubChapter[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

const ChapterListSheet: React.FC<ChapterListSheetProps> = ({
  chapters,
  currentIndex,
  onSelect,
  onClose,
}) => (
  <View style={sheet.overlay}>
    <Pressable style={sheet.backdrop} onPress={onClose} />
    <View style={sheet.container}>
      <View style={sheet.handle} />
      <Text style={sheet.title}>Chapters</Text>
      <FlatList
        data={chapters}
        keyExtractor={(c) => String(c.index)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.index)}
            style={[sheet.row, item.index === currentIndex && sheet.rowActive]}
          >
            <Text style={sheet.rowNum}>{item.index + 1}</Text>
            <Text
              style={[
                sheet.rowTitle,
                item.index === currentIndex && sheet.rowTitleActive,
              ]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {item.index === currentIndex && (
              <View style={sheet.nowPlaying}>
                <Text style={sheet.nowPlayingText}>▶</Text>
              </View>
            )}
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  </View>
);

// ---------------------------------------------------------------------------
// MockEpubViewer — replace with your real EPUB renderer
// ---------------------------------------------------------------------------

interface MockEpubViewerProps {
  book: ReturnType<typeof useEpubReadAloud>["book"];
  chunks: TextChunk[];
  currentChapterIndex: number;
  currentChunkIndex: number;
  onChapterTap: (index: number) => void;
}

const MockEpubViewer: React.FC<MockEpubViewerProps> = ({
  book,
  chunks,
  currentChapterIndex,
  currentChunkIndex,
}) => {
  if (!book) return null;

  const chapter = book.chapters[currentChapterIndex];
  if (!chapter) return null;

  const chapterChunks = chunks.filter(
    (c) => c.pageIndex === currentChapterIndex,
  );

  return (
    <ScrollView style={mock.scroll} contentContainerStyle={mock.content}>
      <Text style={mock.chapterTitle}>{chapter.title}</Text>

      {chapterChunks.map((c) => {
        const isActive = c.chunkIndex === currentChunkIndex;
        return (
          <Text
            key={c.chunkIndex}
            style={[mock.sentence, isActive && mock.sentenceActive]}
          >
            {c.text}
          </Text>
        );
      })}

      {/* Spacer so content isn't hidden under the ReadAloudBar */}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const ACCENT = "#4F6EF7";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  headerLeft: { width: 90 },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 8,
  },
  chaptersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#2C2C2E",
  },
  chaptersBtnText: { color: "#aaa", fontSize: 12, fontWeight: "600" },
  voiceButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  voiceButtonText: { color: ACCENT, fontSize: 13, fontWeight: "600" },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#161616",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2a2a2a",
  },
  author: { color: "#666", fontSize: 12 },
  progress: { color: "#555", fontSize: 12 },
  body: { flex: 1 },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
  },
  hint: { color: "#888", fontSize: 15 },
  subHint: { color: "#555", fontSize: 13, textAlign: "center" },
  errorIcon: { fontSize: 36 },
  error: { color: "#F87171", fontSize: 15, textAlign: "center" },
});

const mock = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#fafaf8" },
  content: { padding: 24 },
  chapterTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 20,
    lineHeight: 28,
  },
  sentence: {
    fontSize: 16,
    color: "#333",
    lineHeight: 26,
    marginBottom: 6,
    padding: 3,
    borderRadius: 4,
  },
  sentenceActive: {
    backgroundColor: "#FFF3B0",
    color: "#111",
  },
});

const sheet = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 99,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  container: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "65%",
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#555",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2C2C2E",
    gap: 12,
  },
  rowActive: { backgroundColor: "#2C2C2E", borderRadius: 10 },
  rowNum: { color: "#555", fontSize: 13, width: 28, textAlign: "right" },
  rowTitle: { flex: 1, color: "#ccc", fontSize: 14, lineHeight: 20 },
  rowTitleActive: { color: "#fff", fontWeight: "600" },
  nowPlaying: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  nowPlayingText: { color: "#fff", fontSize: 9 },
});
