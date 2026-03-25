/**
 * EPUB Viewer Screen
 *
 * In-app EPUB reader powered by epub.js running inside a WebView.
 * The epub.js and jszip libraries are bundled as base64 constants
 * (services/epubBundledScripts.ts) so the reader works fully offline.
 *
 * Features:
 *  - Paginated reading (tap left/right thirds or use nav buttons)
 *  - Table-of-contents modal
 *  - Reader settings (theme, font-size)
 *  - Reading progress persistence (via CFI)
 *  - Loading indicator while preparing book
 *  - Graceful error handling for malformed EPUBs
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { ReadAloudBar } from "@/components/ReadAloudBar";
import { VoicePicker } from "@/components/VoicePicker";
import {
  DarkTheme,
  LightTheme,
  Palette,
  Spacing,
  Typography,
  openWithSystemApp,
  showOpenFailedAlert,
} from "@/services/document-manager";
import { markFileOpened } from "@/services/fileIndexService";
import { readAloudPersistence } from "@/services/readAloudPersistence";
import { useEpubReadAloud } from "@/src/hooks/useEpubReadAloud";

import {
  EpubReaderSettings,
  getDefaultReaderSettings,
  getEpubDisplayName,
  loadReaderSettings,
  loadReadingProgress,
  normalizeEpubUri,
  readEpubAsBase64,
  saveReaderSettings,
  saveReadingProgress,
} from "@/services/epubService";
import { loadSettings } from "@/services/settingsService";

import {
  EPUBJS_MIN_JS_B64,
  JSZIP_MIN_JS_B64,
} from "@/services/epubBundledScripts";

// ============================================================================
// Types for messages coming from the WebView
// ============================================================================
interface WVReadyMsg {
  type: "ready";
  data: { title?: string; author?: string };
}
interface WVErrorMsg {
  type: "error";
  data: { message: string };
}
interface WVLocationMsg {
  type: "location";
  data: { cfi: string; percentage: number; chapter: number; total: number };
}
interface WVTocMsg {
  type: "toc";
  data: { toc: Array<{ label: string; href: string }> };
}
interface WVOtherMsg {
  type: "webview-ready" | "end-of-book" | "start-of-book";
}
type WVMessage =
  | WVReadyMsg
  | WVErrorMsg
  | WVLocationMsg
  | WVTocMsg
  | WVOtherMsg;

// ============================================================================
// Component
// ============================================================================
export default function EpubViewerScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = colorScheme === "dark" ? DarkTheme : LightTheme;
  const webViewRef = useRef<WebView>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { uri, name } = useLocalSearchParams<{ uri: string; name: string }>();
  const displayName = name || getEpubDisplayName(uri || "");

  // ---- State ----
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookInfo, setBookInfo] = useState<{ title?: string; author?: string }>(
    {},
  );
  const [progress, setProgress] = useState(0);
  const [toc, setToc] = useState<Array<{ label: string; href: string }>>([]);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReadAloud, setShowReadAloud] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [settings, setSettings] = useState<EpubReaderSettings>(
    getDefaultReaderSettings(),
  );
  const [webViewReady, setWebViewReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // App settings (loaded once on init)
  const [readAloudEnabled, setReadAloudEnabled] = useState(true);
  const confirmBeforeClosingRef = useRef(false);
  const rememberLastPageRef = useRef(true);

  // Refs to survive across renders without triggering re-renders
  const normalizedUriRef = useRef<string | null>(null);
  const savedCfiRef = useRef<string | null>(null);
  const base64DataRef = useRef<string | null>(null);

  const readAloudFilePath = useMemo(() => {
    if (!dataReady) return null;

    const sourcePath = normalizedUriRef.current || uri || null;
    if (!sourcePath) return null;

    // react-native-fs expects an absolute local path, not a file:// URI.
    return decodeURIComponent(sourcePath.replace(/^file:\/\//, ""));
  }, [dataReady, uri]);

  // Auto-restore Read Aloud bar if the user had paused playback in a previous session
  useEffect(() => {
    if (!readAloudFilePath) return;
    readAloudPersistence.getState(readAloudFilePath).then((saved) => {
      if (saved?.status === "paused" && isMountedRef.current) {
        setShowReadAloud(true);
      }
    });
  }, [readAloudFilePath]);

  const epubReadAloud = useEpubReadAloud({
    filePath: readAloudFilePath,
    initialRate: 1.0,
    onChapterChange: (_chapterIndex, chapter) => {
      // When Read Aloud advances to a new chapter, navigate epub.js to it
      if (webViewRef.current && chapter) {
        const href = toc.find((t) => t.label === chapter.title)?.href;
        if (href) {
          webViewRef.current.injectJavaScript(`goToHref("${href}");true;`);
        }
      }
    },
    onChunkChange: (chunk, totalChunks) => {
      // Scroll the WebView so the spoken text appears near the top of the viewport
      if (webViewRef.current && totalChunks > 0) {
        const searchText = JSON.stringify(chunk.text.trim().substring(0, 60));
        const fallbackPercent = totalChunks > 1
          ? Math.max(0, Math.min(100, (chunk.chunkIndex / (totalChunks - 1)) * 100))
          : 0;
        webViewRef.current.injectJavaScript(
          `(function(){` +
          `var s=${searchText};` +
          `var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);` +
          `while(w.nextNode()){` +
          `var t=w.currentNode.textContent;` +
          `if(t&&t.indexOf(s)!==-1){` +
          `var r=document.createRange();r.selectNodeContents(w.currentNode);` +
          `var rect=r.getBoundingClientRect();` +
          `window.scrollTo({top:Math.max(0,window.scrollY+rect.top-80),behavior:'smooth'});` +
          `return;}}` +
          `window.scrollTo({top:document.documentElement.scrollHeight*${fallbackPercent}/100,behavior:'smooth'});` +
          `})(); true;`
        );
      }
    },
  });

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[EpubViewer][ReadAloud] State", {
      filePath: readAloudFilePath,
      loadStatus: epubReadAloud.loadStatus,
      chapters: epubReadAloud.book?.chapters.length ?? 0,
      chunks: epubReadAloud.chunks.length,
    });
  }, [
    readAloudFilePath,
    epubReadAloud.loadStatus,
    epubReadAloud.book,
    epubReadAloud.chunks.length,
  ]);

  useEffect(() => {
    if (!showReadAloud || epubReadAloud.loadStatus !== "error") return;

    const message =
      epubReadAloud.errorMessage ||
      "This document doesn't have extractable text. Read Aloud can't be used.";

    Alert.alert("Read Aloud Unavailable", message, [
      {
        text: "OK",
        onPress: () => setShowReadAloud(false),
      },
    ]);
  }, [showReadAloud, epubReadAloud.loadStatus, epubReadAloud.errorMessage]);

  useEffect(() => {
    if (!showReadAloud) return;
    if (epubReadAloud.loadStatus !== "ready") return;
    if (epubReadAloud.chunks.length === 0) return;

    const { status, play } = epubReadAloud.controls;
    if (status === "idle" || status === "finished") {
      play(0);
    }
    // If status is "paused" (restored from persistence), show the bar but
    // do NOT auto-play — the user will explicitly press Play to resume.
  }, [
    showReadAloud,
    epubReadAloud.loadStatus,
    epubReadAloud.chunks.length,
    epubReadAloud.controls,
  ]);

  // Pause (not stop) when the Read Aloud bar is closed, so persisted state
  // is preserved for next time the document is opened.
  useEffect(() => {
    if (!showReadAloud && epubReadAloud.controls.status === "speaking") {
      epubReadAloud.controls.pause();
    }
  }, [showReadAloud]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load on mount ----
  useEffect(() => {
    if (!uri) {
      setError("No EPUB file specified");
      setLoading(false);
      return;
    }
    initialise();
  }, [uri]);

  /** Prepare everything we need before the WebView can render. */
  const initialise = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load saved settings
      const savedSettings = await loadReaderSettings();
      if (!isMountedRef.current) return;
      setSettings(savedSettings);

      // Normalise URI (copy SAF content:// to cache if needed)
      const normalized = await normalizeEpubUri(uri!);
      normalizedUriRef.current = normalized;

      // Read the EPUB file as base64
      const base64 = await readEpubAsBase64(normalized);
      base64DataRef.current = base64;

      // Load app settings (readAloud toggle, rememberLastPage, confirmBeforeClosing)
      const appSettings = await loadSettings();
      rememberLastPageRef.current = appSettings.rememberLastPage;
      confirmBeforeClosingRef.current = appSettings.confirmBeforeClosing;
      setReadAloudEnabled(appSettings.readAloud);

      // Load any previously-saved reading progress
      const prog = await loadReadingProgress(uri!);
      if (prog?.cfi && appSettings.rememberLastPage) savedCfiRef.current = prog.cfi;

      if (!isMountedRef.current) return;
      setDataReady(true);
      // Loading indicator will hide once epub.js sends the "ready" message.

      // Mark file as opened for recent files tracking
      if (uri && name) {
        markFileOpened(uri).catch((e) =>
          console.error("[EpubViewer] Failed to mark file as opened:", e),
        );
      }
    } catch (err) {
      console.error("[EpubViewer] Error initialising:", err);
      if (!isMountedRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load EPUB file. Please ensure it is a valid EPUB.",
      );
      setLoading(false);
    }
  };

  // ---- HTML template (epub.js + jszip bundled inline) ----
  const htmlContent = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <script>
    // Decode and execute bundled jszip
    (function(){var s=document.createElement('script');s.textContent=atob("${JSZIP_MIN_JS_B64}");document.head.appendChild(s);})();
  </script>
  <script>
    // Decode and execute bundled epub.js
    (function(){var s=document.createElement('script');s.textContent=atob("${EPUBJS_MIN_JS_B64}");document.head.appendChild(s);})();
  </script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{overflow:auto;background:#ffffff;-webkit-overflow-scrolling:touch}
    #area{width:100vw;min-height:100vh}
    .epub-container{background:#ffffff}
  </style>
</head>
<body>
  <div id="area"></div>
  <script>
    var book=null,rendition=null,currentCfi=null;

    function sendMsg(type,data){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:type,data:data||{}}));
    }

    function loadBook(base64Data,initialCfi,readerTheme,readerFontSize){
      try{
        book=ePub();
        book.open(base64Data,'base64').then(function(){
          var w=window.innerWidth;
          var h=window.innerHeight;
          rendition=book.renderTo("area",{
            width:w,
            flow:"scrolled-doc",spread:"none",manager:"continuous"
          });

          rendition.themes.register("light",{body:{background:"#ffffff",color:"#000000"}});
          rendition.themes.register("dark",{body:{background:"#1a1a1a",color:"#e0e0e0"}});
          rendition.themes.register("sepia",{body:{background:"#f5f1e8",color:"#5c4b37"}});
          var _t=readerTheme||'light';
          rendition.themes.select(_t);
          rendition.themes.fontSize((readerFontSize||100)+'%');
          document.body.style.background=_t==='dark'?'#1a1a1a':_t==='sepia'?'#f5f1e8':'#ffffff';

          // Resize handler
          window.addEventListener('resize',function(){
            if(rendition){
              rendition.resize(window.innerWidth);
            }
          });

          // Track scroll position for progress
          window.addEventListener('scroll',function(){
            var scrollTop=window.pageYOffset||document.documentElement.scrollTop;
            var docHeight=document.documentElement.scrollHeight-window.innerHeight;
            if(docHeight>0){
              var pct=Math.round(scrollTop/docHeight*100);
              sendMsg('location',{cfi:currentCfi||'',percentage:pct,chapter:0,total:0});
            }
          },{passive:true});

          // Track location changes
          rendition.on('relocated',function(location){
            if(!location||!location.start) return;
            currentCfi=location.start.cfi;
            var pct=0;
            try{pct=Math.round(book.locations?book.locations.percentageFromCfi(currentCfi)*100:location.start.percentage*100);}catch(e){pct=0;}
            sendMsg('location',{
              cfi:currentCfi,
              percentage:pct||0,
              chapter:location.start.displayed?location.start.displayed.page:0,
              total:location.start.displayed?location.start.displayed.total:0
            });
          });

          if(initialCfi){
            return rendition.display(initialCfi);
          }
          return rendition.display();
        }).then(function(){
          var meta=book.packaging?book.packaging.metadata:{};
          sendMsg('ready',{title:meta.title||'',author:meta.creator||''});
          if(book.navigation&&book.navigation.toc){
            sendMsg('toc',{toc:book.navigation.toc.map(function(t){return {label:t.label,href:t.href};})});
          }
        }).catch(function(e){
          sendMsg('error',{message:e.message||'Failed to load book'});
        });
      }catch(e){
        sendMsg('error',{message:e.message||'Unknown error'});
      }
    }

    function goToCfi(cfi){if(rendition)rendition.display(cfi);}
    function goToHref(href){if(rendition)rendition.display(href);}
    function changeTheme(t){if(rendition)rendition.themes.select(t);document.body.style.background=t==='dark'?'#1a1a1a':t==='sepia'?'#f5f1e8':'#ffffff';}
    function changeFontSize(s){if(rendition)rendition.themes.fontSize(s+"%");}

    // Poll for ReactNativeWebView bridge before signaling ready
    (function waitForBridge(){
      if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
        sendMsg('webview-ready');
      }else{
        setTimeout(waitForBridge,50);
      }
    })();

    // Global error handler for debugging
    window.onerror=function(msg){
      try{sendMsg('error',{message:'JS: '+msg});}catch(e){}
    };
  </script>
</body>
</html>`;
  }, []);

  // ---- Inject the base64 data once BOTH WebView and data are ready ----
  useEffect(() => {
    if (
      webViewReady &&
      dataReady &&
      base64DataRef.current &&
      webViewRef.current
    ) {
      const cfiArg = savedCfiRef.current
        ? `,"${savedCfiRef.current}"`
        : ",null";

      // Apply reader settings and load the book
      const thm = settings.theme;
      const fs = settings.fontSize;
      webViewRef.current.injectJavaScript(
        `loadBook("${base64DataRef.current}"${cfiArg},"${thm}",${fs});true;`,
      );
    }
  }, [webViewReady, dataReady]);

  // ---- WebView message handler ----
  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg: WVMessage = JSON.parse(event.nativeEvent.data);

        switch (msg.type) {
          case "webview-ready":
            setWebViewReady(true);
            break;

          case "ready":
            setLoading(false);
            setBookInfo((msg as WVReadyMsg).data);
            break;

          case "error":
            setLoading(false);
            setError((msg as WVErrorMsg).data.message);
            break;

          case "location": {
            const loc = (msg as WVLocationMsg).data;
            setProgress(loc.percentage);
            // Persist progress
            if (uri) {
              saveReadingProgress(uri, {
                cfi: loc.cfi,
                percentage: loc.percentage,
                lastRead: Date.now(),
              }).catch(console.error);
            }
            break;
          }

          case "toc":
            setToc((msg as WVTocMsg).data.toc);
            break;

          // informational – no action needed
          case "end-of-book":
          case "start-of-book":
            break;
        }
      } catch {
        // ignore
      }
    },
    [uri],
  );

  // ---- Actions ----
  const handleClose = useCallback(() => {
    if (confirmBeforeClosingRef.current) {
      Alert.alert(
        "Close Document",
        "Are you sure you want to close this document?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Close", style: "destructive", onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  }, []);

  const handleOpenWithSystem = useCallback(async () => {
    if (!uri) return;
    const result = await openWithSystemApp({
      uri,
      displayName,
      mimeType: "application/epub+zip",
    });
    if (!result.success) showOpenFailedAlert(displayName, result.error);
  }, [uri, displayName]);

  const handleTocSelect = useCallback((href: string) => {
    webViewRef.current?.injectJavaScript(`goToHref("${href}");true;`);
    setShowToc(false);
  }, []);

  const updateTheme = useCallback(
    (newTheme: EpubReaderSettings["theme"]) => {
      const updated = { ...settings, theme: newTheme };
      setSettings(updated);
      saveReaderSettings(updated).catch(console.error);
      webViewRef.current?.injectJavaScript(`changeTheme("${newTheme}");true;`);
    },
    [settings],
  );

  const updateFontSize = useCallback(
    (delta: number) => {
      const newSize = Math.max(60, Math.min(200, settings.fontSize + delta));
      const updated = { ...settings, fontSize: newSize };
      setSettings(updated);
      saveReaderSettings(updated).catch(console.error);
      webViewRef.current?.injectJavaScript(`changeFontSize(${newSize});true;`);
    },
    [settings],
  );

  // ============================================================================
  // RENDER – Error (before WebView loaded anything)
  // ============================================================================
  if (error && !webViewReady) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <Header
          title={displayName}
          theme={theme}
          onClose={handleClose}
          onOpenWithSystem={handleOpenWithSystem}
          showTocButton={false}
          onToggleToc={() => {}}
          onToggleSettings={() => {}}
        />
        <View style={styles.centerContent}>
          <MaterialIcons
            name="error-outline"
            size={64}
            color={Palette.error.main}
          />
          <Text style={[styles.errorTitle, { color: theme.text.primary }]}>
            Failed to load EPUB
          </Text>
          <Text style={[styles.errorMessage, { color: theme.text.secondary }]}>
            {error}
          </Text>
          <View style={styles.errorActions}>
            <Pressable
              style={[
                styles.retryButton,
                { backgroundColor: Palette.primary[500] },
              ]}
              onPress={initialise}
            >
              <MaterialIcons
                name="refresh"
                size={20}
                color={Palette.white}
                style={{ marginRight: Spacing.sm }}
              />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
            <Pressable
              style={[
                styles.externalButton,
                { borderColor: theme.border.default },
              ]}
              onPress={handleOpenWithSystem}
            >
              <MaterialIcons
                name="open-in-new"
                size={20}
                color={theme.text.primary}
                style={{ marginRight: Spacing.sm }}
              />
              <Text
                style={[
                  styles.externalButtonText,
                  { color: theme.text.primary },
                ]}
              >
                Open Externally
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================================================
  // RENDER – Main reader
  // ============================================================================
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background.primary }]}
      edges={["top"]}
    >
      <Header
        title={bookInfo.title || displayName}
        subtitle={bookInfo.author}
        theme={theme}
        onClose={handleClose}
        onOpenWithSystem={handleOpenWithSystem}
        showTocButton={toc.length > 0}
        onToggleToc={() => setShowToc(true)}
        onToggleSettings={() => setShowSettings(true)}
        onReadAloud={readAloudEnabled ? () => setShowReadAloud(true) : undefined}
        onChatWithDocument={() => {
          const docUri = normalizedUriRef.current || uri;
          if (!docUri) return;
          router.push({
            pathname: "/chat-with-document",
            params: {
              uri: docUri,
              name: name || "document.epub",
              mimeType: "application/epub+zip",
            },
          });
        }}
      />

      {/* Persistent loading overlay while epub.js parses */}
      {loading && (
        <View style={styles.chapterLoadingOverlay}>
          <ActivityIndicator size="small" color={Palette.primary[500]} />
          <Text style={[styles.overlayText, { color: theme.text.secondary }]}>
            Preparing book…
          </Text>
        </View>
      )}

      {/* WebView – always mounted so we can inject JS even while "loading" overlay is visible */}
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        style={styles.webview}
        onMessage={handleMessage}
        onError={() => {
          setError("WebView failed to load");
          setLoading(false);
        }}
        androidLayerType="hardware"
        cacheEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="always"
        allowFileAccess={true}
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom progress bar */}
      <BottomBar progress={progress} theme={theme} />

      {/* TOC Modal */}
      <TocModal
        visible={showToc}
        toc={toc}
        onSelect={handleTocSelect}
        onClose={() => setShowToc(false)}
        theme={theme}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        settings={settings}
        onThemeChange={updateTheme}
        onFontSizeChange={updateFontSize}
        onClose={() => setShowSettings(false)}
        theme={theme}
      />

      {/* Read Aloud */}
      <ReadAloudBar
        {...epubReadAloud.controls}
        stop={() => {
          epubReadAloud.controls.stop();
          setShowReadAloud(false);
        }}
        visible={
          showReadAloud &&
          !loading &&
          !error &&
          epubReadAloud.loadStatus === "ready" &&
          epubReadAloud.chunks.length > 0
        }
        colorScheme={colorScheme}
        onVoicePress={() => setShowVoicePicker(true)}
      />

      <VoicePicker
        visible={showVoicePicker}
        onClose={() => setShowVoicePicker(false)}
        colorScheme={colorScheme}
      />
    </SafeAreaView>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// ---- Header ----
interface HeaderProps {
  title: string;
  subtitle?: string;
  theme: typeof LightTheme;
  onClose: () => void;
  onOpenWithSystem: () => void;
  onToggleToc: () => void;
  onToggleSettings: () => void;
  showTocButton?: boolean;
  onReadAloud?: () => void;
  onChatWithDocument?: () => void;
}

function Header({
  title,
  subtitle,
  theme,
  onClose,
  onOpenWithSystem,
  onToggleToc,
  onToggleSettings,
  showTocButton = true,
  onReadAloud,
  onChatWithDocument,
}: HeaderProps) {
  const [showOverflow, setShowOverflow] = React.useState(false);

  return (
    <View>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface.primary,
            borderBottomColor: theme.border.light,
          },
        ]}
      >
        <Pressable onPress={onClose} style={styles.headerButton}>
          <MaterialIcons name="close" size={28} color={theme.text.primary} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, { color: theme.text.primary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.headerSubtitle, { color: theme.text.secondary }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.headerActions}>
          {showTocButton && (
            <Pressable onPress={onToggleToc} style={styles.headerButton}>
              <MaterialIcons
                name="menu-book"
                size={24}
                color={theme.text.primary}
              />
            </Pressable>
          )}
          <Pressable onPress={onToggleSettings} style={styles.headerButton}>
            <MaterialIcons
              name="text-format"
              size={24}
              color={theme.text.primary}
            />
          </Pressable>

          {/* 3-dots overflow */}
          <Pressable
            onPress={() => setShowOverflow((v) => !v)}
            style={styles.headerButton}
          >
            <MaterialIcons
              name="more-vert"
              size={22}
              color={theme.text.primary}
            />
          </Pressable>
        </View>
      </View>

      {/* Overflow dropdown */}
      {showOverflow && (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View
            style={[
              styles.overflowMenu,
              {
                backgroundColor: theme.surface.elevated,
                borderColor: theme.border.light,
              },
            ]}
          >
            {/* Read Aloud */}
            {onReadAloud && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onReadAloud();
                }}
              >
                <MaterialIcons
                  name="volume-up"
                  size={20}
                  color={theme.text.primary}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Read Aloud
                </Text>
              </Pressable>
            )}

            {/* Chat with File */}
            {onChatWithDocument && (
              <Pressable
                style={styles.overflowItem}
                onPress={() => {
                  setShowOverflow(false);
                  onChatWithDocument();
                }}
              >
                <MaterialIcons
                  name="chat"
                  size={20}
                  color={Palette.primary[500]}
                />
                <Text
                  style={[styles.overflowLabel, { color: theme.text.primary }]}
                >
                  Chat with File
                </Text>
              </Pressable>
            )}

            {/* Open externally */}
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                onOpenWithSystem();
              }}
            >
              <MaterialIcons
                name="open-in-new"
                size={20}
                color={theme.text.primary}
              />
              <Text
                style={[styles.overflowLabel, { color: theme.text.primary }]}
              >
                Open Externally
              </Text>
            </Pressable>
          </View>
        </Pressable>
      )}
    </View>
  );
}

// ---- Bottom bar (progress only) ----
interface BottomBarProps {
  progress: number;
  theme: typeof LightTheme;
}

function BottomBar({ progress, theme }: BottomBarProps) {
  return (
    <View
      style={[
        styles.bottomBar,
        {
          backgroundColor: theme.surface.primary,
          borderTopColor: theme.border.light,
        },
      ]}
    >
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(100, Math.max(0, progress))}%` },
            ]}
          />
        </View>
        <Text style={[styles.progressText, { color: theme.text.secondary }]}>
          {progress}%
        </Text>
      </View>
    </View>
  );
}

// ---- TOC Modal ----
interface TocModalProps {
  visible: boolean;
  toc: Array<{ label: string; href: string }>;
  onSelect: (href: string) => void;
  onClose: () => void;
  theme: typeof LightTheme;
}

function TocModal({ visible, toc, onSelect, onClose, theme }: TocModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[
          styles.modalContainer,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <View
          style={[
            styles.modalHeader,
            {
              backgroundColor: theme.surface.primary,
              borderBottomColor: theme.border.light,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.text.primary }]}>
            Table of Contents
          </Text>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <MaterialIcons name="close" size={28} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView style={styles.tocList}>
          {toc.map((item, index) => (
            <TouchableOpacity
              key={`${item.href}-${index}`}
              style={[
                styles.tocItem,
                { borderBottomColor: theme.border.light },
              ]}
              onPress={() => onSelect(item.href)}
            >
              <Text
                style={[styles.tocItemText, { color: theme.text.primary }]}
                numberOfLines={2}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
          {toc.length === 0 && (
            <Text style={[styles.tocEmpty, { color: theme.text.tertiary }]}>
              No table of contents available.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---- Settings Modal ----
interface SettingsModalProps {
  visible: boolean;
  settings: EpubReaderSettings;
  onThemeChange: (t: EpubReaderSettings["theme"]) => void;
  onFontSizeChange: (delta: number) => void;
  onClose: () => void;
  theme: typeof LightTheme;
}

function SettingsModal({
  visible,
  settings,
  onThemeChange,
  onFontSizeChange,
  onClose,
  theme,
}: SettingsModalProps) {
  const themes: Array<{
    key: EpubReaderSettings["theme"];
    label: string;
    bg: string;
    text: string;
  }> = [
    { key: "light", label: "Light", bg: "#ffffff", text: "#1a1a1a" },
    { key: "sepia", label: "Sepia", bg: "#f5f1e8", text: "#5c4b37" },
    { key: "dark", label: "Dark", bg: "#1a1a1a", text: "#e5e7eb" },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[
          styles.modalContainer,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <View
          style={[
            styles.modalHeader,
            {
              backgroundColor: theme.surface.primary,
              borderBottomColor: theme.border.light,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.text.primary }]}>
            Reader Settings
          </Text>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <MaterialIcons name="close" size={28} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView style={styles.settingsContent}>
          {/* Theme selection */}
          <Text
            style={[styles.settingsSectionTitle, { color: theme.text.primary }]}
          >
            Theme
          </Text>
          <View style={styles.themeOptions}>
            {themes.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: t.bg,
                    borderColor:
                      settings.theme === t.key
                        ? Palette.primary[500]
                        : theme.border.default,
                    borderWidth: settings.theme === t.key ? 2 : 1,
                  },
                ]}
                onPress={() => onThemeChange(t.key)}
              >
                <Text style={[styles.themeOptionText, { color: t.text }]}>
                  Aa
                </Text>
                <Text
                  style={[
                    styles.themeOptionLabel,
                    { color: theme.text.secondary },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Font size */}
          <Text
            style={[
              styles.settingsSectionTitle,
              { color: theme.text.primary, marginTop: Spacing.xl },
            ]}
          >
            Font Size
          </Text>
          <View style={styles.fontSizeControls}>
            <Pressable
              style={[
                styles.fontSizeButton,
                { backgroundColor: theme.surface.secondary },
              ]}
              onPress={() => onFontSizeChange(-10)}
            >
              <MaterialIcons
                name="remove"
                size={24}
                color={theme.text.primary}
              />
            </Pressable>

            <Text style={[styles.fontSizeValue, { color: theme.text.primary }]}>
              {settings.fontSize}%
            </Text>

            <Pressable
              style={[
                styles.fontSizeButton,
                { backgroundColor: theme.surface.secondary },
              ]}
              onPress={() => onFontSizeChange(10)}
            >
              <MaterialIcons name="add" size={24} color={theme.text.primary} />
            </Pressable>
          </View>

          {/* Preview */}
          <Text
            style={[
              styles.settingsSectionTitle,
              { color: theme.text.primary, marginTop: Spacing.xl },
            ]}
          >
            Preview
          </Text>
          <View
            style={[
              styles.previewBox,
              {
                backgroundColor:
                  themes.find((t) => t.key === settings.theme)?.bg || "#fff",
              },
            ]}
          >
            <Text
              style={{
                fontSize: (settings.fontSize / 100) * 16,
                lineHeight: (settings.fontSize / 100) * 16 * 1.6,
                color:
                  themes.find((t) => t.key === settings.theme)?.text || "#000",
              }}
            >
              The quick brown fox jumps over the lazy dog. This is a preview of
              your reading settings.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
  },
  headerSubtitle: { fontSize: Typography.size.xs, marginTop: 2 },
  headerActions: { flexDirection: "row" },
  // Overflow menu
  overflowBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  overflowMenu: {
    position: "absolute",
    top: 56,
    right: 8,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    zIndex: 51,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  } as any,
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  } as any,
  overflowLabel: {
    fontSize: 15,
    fontWeight: "500" as const,
  },
  // Centre content (loading/error)
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  loadingText: { fontSize: Typography.size.base, marginTop: Spacing.md },
  errorTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.semibold,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    fontSize: Typography.size.base,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  errorActions: { gap: Spacing.md },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
  },
  retryButtonText: {
    color: Palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  externalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
    borderWidth: 1,
  },
  externalButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  // WebView
  webview: { flex: 1 },
  chapterLoadingOverlay: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  overlayText: { fontSize: Typography.size.sm },
  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Palette.primary[500],
    borderRadius: 2,
  },
  progressText: {
    fontSize: Typography.size.xs,
    minWidth: 36,
    textAlign: "right",
  },
  // Modals
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  // TOC
  tocList: { flex: 1 },
  tocItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  tocItemText: { flex: 1, fontSize: Typography.size.base },
  tocEmpty: {
    textAlign: "center",
    marginTop: Spacing["2xl"],
    fontSize: Typography.size.base,
  },
  // Settings
  settingsContent: { flex: 1, padding: Spacing.lg },
  settingsSectionTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.md,
  },
  themeOptions: { flexDirection: "row", gap: Spacing.md },
  themeOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.lg,
    borderRadius: 12,
  },
  themeOptionText: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  themeOptionLabel: { fontSize: Typography.size.xs },
  fontSizeControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  fontSizeButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  fontSizeValue: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.semibold,
    minWidth: 80,
    textAlign: "center",
  },
  previewBox: {
    padding: Spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
});
