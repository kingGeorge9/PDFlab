/**
 * Sign Document Screen
 * Full signing workflow for PDFs with visual signature drawing.
 * Step 1: Draw or type signature + enter name/reason/date
 * Step 2: Place signature on REAL PDF preview (react-native-pdf)
 * Step 3: Review details and apply
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Pdf from "react-native-pdf";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import SignatureScreen, {
  type SignatureViewRef,
} from "react-native-signature-canvas";

import { useTheme } from "@/services/ThemeProvider";
import { upsertFileRecord } from "@/services/fileIndexService";
import { applyVisualSignature } from "@/services/signingService";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type Step = "draw" | "place" | "review";
type PenWeight = "light" | "medium" | "thick";

const PEN_WEIGHTS = {
  light: { min: 0.5, max: 1.5, dot: 1 },
  medium: { min: 1.5, max: 3.5, dot: 2 },
  thick: { min: 3, max: 6, dot: 4 },
} as const;

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;

const SIG_DEFAULT_W = 200;
const SIG_DEFAULT_H = 60;
const PAGE_GAP = 12;

// High-fidelity signature canvas CSS — optimised for smooth drawing
const SIGNATURE_WEB_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; width: 100%; height: 100%; }
  .m-signature-pad--body { border: none; width: 100%; height: 100%; }
  .m-signature-pad--footer { display: none; }
  body, html {
    width: 100%; height: 100%; margin: 0; padding: 0;
    overflow: hidden;
    touch-action: none;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  canvas {
    width: 100% !important; height: 100% !important;
    touch-action: none;
    -ms-touch-action: none;
    -webkit-touch-callout: none;
  }
`;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SignDocumentScreen() {
  const { fileUri, file, fileMimeType } = useLocalSearchParams<{
    fileUri: string;
    file: string;
    fileMimeType: string;
  }>();

  const { colors: t } = useTheme();
  const signatureRef = useRef<SignatureViewRef>(null);

  // Step state
  const [step, setStep] = useState<Step>("draw");

  // Signature data
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");

  // Signer details
  const [signerName, setSignerName] = useState("");
  const [reason, setReason] = useState("");
  const [showDate, setShowDate] = useState(true);

  // Visual placement state (PDF points, bottom-left origin)
  const [placementPage, setPlacementPage] = useState(0);
  const [placementX, setPlacementX] = useState(
    (PDF_PAGE_WIDTH - SIG_DEFAULT_W) / 2,
  );
  const [placementY, setPlacementY] = useState(80);
  const [placementW] = useState(SIG_DEFAULT_W);
  const [placementH] = useState(SIG_DEFAULT_H);

  // PDF page info
  const [pageCount, setPageCount] = useState(1);
  const [pageWidth, setPageWidth] = useState(PDF_PAGE_WIDTH);
  const [pageHeight, setPageHeight] = useState(PDF_PAGE_HEIGHT);

  // Preview container measurements
  const [previewContainerW, setPreviewContainerW] = useState(0);
  const [previewContainerH, setPreviewContainerH] = useState(0);

  // Drag state — using pageX/pageY delta tracking for smooth movement
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({
    pageX: 0,
    pageY: 0,
    startPdfX: 0,
    startPdfY: 0,
  });

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);

  // Pen weight
  const [penWeight, setPenWeight] = useState<PenWeight>("medium");

  // FlatList ref for Go To Page navigation
  const flatListRef = useRef<FlatList>(null);

  // Current visible page (from FlatList scroll)
  const [currentVisiblePage, setCurrentVisiblePage] = useState(0);

  // Go to page input text
  const [goToPageText, setGoToPageText] = useState("1");

  // Zoom state (pinch-to-zoom)
  const zoomScale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const [currentZoom, setCurrentZoom] = useState(1);
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;

  // ── Pinch-to-zoom gesture ───────────────────────────────────────────

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      zoomScale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    })
    .onEnd(() => {
      savedScale.value = zoomScale.value;
      // Snap to 1 if very close
      if (zoomScale.value < 1.05) {
        zoomScale.value = withTiming(1, { duration: 150 });
        savedScale.value = 1;
      }
    });

  const zoomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomScale.value }],
  }));

  // Sync currentZoom state for coordinate calculations (updated less frequently)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentZoom(zoomScale.value);
    }, 100);
    return () => clearInterval(interval);
  }, [zoomScale]);

  const handleZoomIn = useCallback(() => {
    const next = Math.min(MAX_ZOOM, savedScale.value + 0.5);
    zoomScale.value = withTiming(next, { duration: 200 });
    savedScale.value = next;
    setCurrentZoom(next);
  }, [zoomScale, savedScale]);

  const handleZoomOut = useCallback(() => {
    const next = Math.max(MIN_ZOOM, savedScale.value - 0.5);
    zoomScale.value = withTiming(next, { duration: 200 });
    savedScale.value = next;
    setCurrentZoom(next);
  }, [zoomScale, savedScale]);

  const handleZoomReset = useCallback(() => {
    zoomScale.value = withTiming(1, { duration: 200 });
    savedScale.value = 1;
    setCurrentZoom(1);
  }, [zoomScale, savedScale]);

  // ── PDF load complete — get real page count from the PDF itself ─────

  const handlePdfLoadComplete = useCallback(
    (
      numberOfPages: number,
      _path: string,
      dimensions?: { width: number; height: number },
    ) => {
      if (numberOfPages > 0) setPageCount(numberOfPages);
      if (dimensions?.width) setPageWidth(dimensions.width);
      if (dimensions?.height) setPageHeight(dimensions.height);
    },
    [],
  );

  // ── Computed preview dimensions (scrollable multi-page) ────────────

  const pageAspect = pageHeight / pageWidth;
  const scale = previewContainerW > 0 ? previewContainerW / pageWidth : 1;
  const pageRenderH = previewContainerW * pageAspect;
  const itemTotalH = pageRenderH + PAGE_GAP;

  // Convert PDF placement (bottom-left origin) to screen coords (top-left)
  const sigScreenX = placementX * scale;
  const sigScreenY = (pageHeight - placementY - placementH) * scale;
  const sigScreenW = placementW * scale;
  const sigScreenH = placementH * scale;

  // Page indices array for FlatList
  const pageIndices = React.useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i),
    [pageCount],
  );

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleSignatureEnd = useCallback(() => {
    signatureRef.current?.readSignature();
  }, []);

  const handleSignatureOK = useCallback((signature: string) => {
    if (signature) {
      setSignatureImage(signature);
    }
  }, []);

  const handleClearSignature = useCallback(() => {
    signatureRef.current?.clearSignature();
    setSignatureImage(null);
  }, []);

  const handleTypeSignature = useCallback(() => {
    if (!typedName.trim()) {
      setSignatureImage(null);
      return;
    }
    setSignatureImage(null);
    setSignerName(typedName.trim());
  }, [typedName]);

  const handleNextFromDraw = useCallback(() => {
    if (signatureMode === "draw" && !signatureImage) {
      Alert.alert("Signature Required", "Please draw your signature first.");
      return;
    }
    if (signatureMode === "type" && !typedName.trim()) {
      Alert.alert("Name Required", "Please type your name.");
      return;
    }
    if (signatureMode === "type") {
      handleTypeSignature();
    }
    setStep("place");
  }, [signatureMode, signatureImage, typedName, handleTypeSignature]);

  // ── Drag handlers using pageX/pageY delta tracking (no jitter) ──

  const handleDragStart = useCallback(
    (evt: GestureResponderEvent) => {
      setIsDragging(true);
      const { pageX, pageY } = evt.nativeEvent;
      dragStartRef.current = {
        pageX,
        pageY,
        startPdfX: placementX,
        startPdfY: placementY,
      };
    },
    [placementX, placementY],
  );

  const handleDragMove = useCallback(
    (evt: GestureResponderEvent) => {
      const { pageX, pageY } = evt.nativeEvent;
      const start = dragStartRef.current;

      // Delta in screen pixels — divide by zoom to account for zoomed container
      const deltaScreenX = pageX - start.pageX;
      const deltaScreenY = pageY - start.pageY;

      // Convert to PDF points — Y is inverted (PDF = bottom-up, screen = top-down)
      // Divide by currentZoom because the container is scaled
      const effectiveScale = scale * currentZoom;
      const deltaPdfX = deltaScreenX / effectiveScale;
      const deltaPdfY = -(deltaScreenY / effectiveScale);

      // Apply delta to the initial position captured at drag start
      let newX = start.startPdfX + deltaPdfX;
      let newY = start.startPdfY + deltaPdfY;

      // Clamp to page bounds
      newX = Math.max(0, Math.min(newX, pageWidth - placementW));
      newY = Math.max(0, Math.min(newY, pageHeight - placementH));

      setPlacementX(Math.round(newX));
      setPlacementY(Math.round(newY));
    },
    [scale, currentZoom, pageWidth, pageHeight, placementW, placementH],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handlePreviewLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPreviewContainerW(width);
    setPreviewContainerH(height);
  }, []);

  // ── FlatList helpers for scrollable multi-page PDF ──

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: itemTotalH,
      offset: itemTotalH * index,
      index,
    }),
    [itemTotalH],
  );

  const pageKeyExtractor = useCallback(
    (item: number) => `page-${item}`,
    [],
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentVisiblePage(viewableItems[0].index);
      }
    },
  ).current;

  const handleGoToPage = useCallback(() => {
    const target = parseInt(goToPageText, 10);
    if (isNaN(target) || target < 1 || target > pageCount) return;
    const pageIdx = target - 1;
    setPlacementPage(pageIdx);
    try {
      flatListRef.current?.scrollToIndex({
        index: pageIdx,
        animated: true,
        viewPosition: 0.3,
      });
    } catch {}
  }, [goToPageText, pageCount]);

  const handleJumpToSignaturePage = useCallback(() => {
    try {
      flatListRef.current?.scrollToIndex({
        index: placementPage,
        animated: true,
        viewPosition: 0.3,
      });
    } catch {}
  }, [placementPage]);

  // Sync goToPageText when placementPage changes
  useEffect(() => {
    setGoToPageText(String(placementPage + 1));
  }, [placementPage]);

  // Auto-scroll to signature page when entering placement step
  useEffect(() => {
    if (step === "place" && flatListRef.current && itemTotalH > 0) {
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: placementPage,
            animated: false,
            viewPosition: 0.3,
          });
        } catch {}
      }, 300);
    }
  }, [step, itemTotalH]);

  const renderPageItem = useCallback(
    ({ item: pageIndex }: { item: number }) => {
      const isSignaturePage = pageIndex === placementPage;
      return (
        <Pressable
          style={[
            styles.pageItemContainer,
            {
              width: previewContainerW,
              height: pageRenderH,
            },
          ]}
          onPress={() => {
            if (!isSignaturePage) {
              setPlacementPage(pageIndex);
            }
          }}
        >
          <Pdf
            source={{ uri: fileUri!, cache: true }}
            page={pageIndex + 1}
            enablePaging={true}
            fitPolicy={2}
            minScale={1}
            maxScale={1}
            scrollEnabled={false}
            style={styles.pdfPageFill}
            onError={(err: any) =>
              console.warn("PDF page render error:", err)
            }
            onLoadComplete={
              pageIndex === 0 ? handlePdfLoadComplete : undefined
            }
          />
          {/* Tap target overlay for non-signature pages */}
          {!isSignaturePage && (
            <View style={styles.pageTapTarget} pointerEvents="box-none">
              <View style={styles.pageTapHint}>
                <MaterialIcons name="touch-app" size={14} color="#fff" />
                <Text style={styles.pageTapHintText}>Tap to place here</Text>
              </View>
            </View>
          )}
          {isSignaturePage && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View
                style={[
                  styles.signatureOverlay,
                  {
                    left: sigScreenX,
                    top: sigScreenY,
                    width: sigScreenW,
                    height: sigScreenH,
                  },
                ]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={handleDragStart}
                onResponderMove={handleDragMove}
                onResponderRelease={handleDragEnd}
              >
                {signatureImage ? (
                  <Image
                    source={{ uri: signatureImage }}
                    style={styles.signaturePreviewImage}
                    contentFit="contain"
                  />
                ) : (
                  <Text style={styles.signatureOverlayText}>
                    {typedName || "Signature"}
                  </Text>
                )}

                {(signerName || typedName) && (
                  <Text style={styles.overlayNameText} numberOfLines={1}>
                    {signerName || typedName}
                  </Text>
                )}

                {showDate && (
                  <Text style={styles.overlayDateText} numberOfLines={1}>
                    {new Date().toLocaleDateString()}
                  </Text>
                )}

                <View style={styles.dragHandle}>
                  <MaterialIcons name="open-with" size={14} color="#fff" />
                </View>
              </View>
            </View>
          )}
          {/* Page number badge */}
          <View
            style={[
              styles.pageNumberBadge,
              isSignaturePage && styles.pageNumberBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.pageNumberText,
                isSignaturePage && styles.pageNumberTextActive,
              ]}
            >
              {pageIndex + 1}
            </Text>
          </View>
        </Pressable>
      );
    },
    [
      previewContainerW,
      pageRenderH,
      placementPage,
      sigScreenX,
      sigScreenY,
      sigScreenW,
      sigScreenH,
      fileUri,
      signatureImage,
      typedName,
      signerName,
      showDate,
      handleDragStart,
      handleDragMove,
      handleDragEnd,
      handlePdfLoadComplete,
    ],
  );

  // ── Apply Signature ───────────────────────────────────────────────

  const handleSign = useCallback(async () => {
    if (!fileUri) {
      Alert.alert("Error", "No file selected.");
      return;
    }

    setIsProcessing(true);

    try {
      const placement = {
        x: placementX,
        y: placementY,
        width: placementW,
        height: placementH,
        page: placementPage,
      };

      const result = await applyVisualSignature({
        fileUri,
        fileName: file || "document.pdf",
        signatureImage: signatureMode === "draw" ? signatureImage : null,
        placement,
        signerName: signerName || typedName || undefined,
        date: showDate ? new Date().toLocaleString() : undefined,
        reason: reason || undefined,
        showDate,
        showName: !!(signerName || typedName),
      });

      // Import signed file to library
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      await upsertFileRecord({
        uri: result.uri,
        name: result.fileName,
        mimeType: "application/pdf",
        extension: "pdf",
        size: fileInfo.exists ? (fileInfo as any).size || 0 : 0,
        source: "created",
        sourceTags: ["created"],
      });

      setResultUri(result.uri);
      setResultName(result.fileName);
      setIsDone(true);
    } catch (error) {
      console.error("Signing error:", error);
      Alert.alert(
        "Signing Failed",
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    fileUri,
    file,
    signatureImage,
    signatureMode,
    signerName,
    typedName,
    reason,
    showDate,
    placementX,
    placementY,
    placementW,
    placementH,
    placementPage,
  ]);

  const handleShare = useCallback(async () => {
    if (!resultUri) return;
    try {
      await Sharing.shareAsync(resultUri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Signed PDF",
      });
    } catch (e) {
      console.warn("Share failed:", e);
    }
  }, [resultUri]);

  const handleOpenFile = useCallback(() => {
    if (!resultUri || !resultName) return;
    router.push({
      pathname: "/pdf-viewer",
      params: { uri: resultUri, name: resultName },
    });
  }, [resultUri, resultName]);

  // ── Render ────────────────────────────────────────────────────────────

  // Done screen
  if (isDone && resultUri) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: t.background }]}
      >
        <View style={styles.doneContainer}>
          <View style={[styles.doneIcon, { backgroundColor: "#dcfce7" }]}>
            <MaterialIcons name="check-circle" size={56} color="#16a34a" />
          </View>
          <Text style={[styles.doneTitle, { color: t.text }]}>
            Signature Applied
          </Text>
          <Text style={[styles.doneSubtitle, { color: t.textSecondary }]}>
            Your signature has been embedded into the PDF successfully.
          </Text>

          <View style={styles.doneActions}>
            <Pressable
              style={[styles.doneButton, { backgroundColor: "#2563eb" }]}
              onPress={handleOpenFile}
            >
              <MaterialIcons name="visibility" size={20} color="#fff" />
              <Text style={styles.doneButtonText}>View Signed PDF</Text>
            </Pressable>

            <Pressable
              style={[styles.doneButton, { backgroundColor: "#10b981" }]}
              onPress={handleShare}
            >
              <MaterialIcons name="share" size={20} color="#fff" />
              <Text style={styles.doneButtonText}>Share</Text>
            </Pressable>

            <Pressable
              style={[styles.doneButton, { backgroundColor: "#6366F1" }]}
              onPress={() => router.back()}
            >
              <MaterialIcons name="check" size={20} color="#fff" />
              <Text style={styles.doneButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Processing screen
  if (isProcessing) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: t.background }]}
      >
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={[styles.processingText, { color: t.text }]}>
            Applying signature...
          </Text>
          <Text style={[styles.processingSubtext, { color: t.textSecondary }]}>
            This may take a moment
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: t.card, borderBottomColor: t.border },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <MaterialIcons name="arrow-back" size={24} color={t.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, { color: t.text }]}
            numberOfLines={1}
          >
            Sign Document
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: t.textSecondary }]}
            numberOfLines={1}
          >
            {file || "Select a file"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {step === "draw" && <StepBadge label="1/3" color="#2563eb" />}
          {step === "place" && <StepBadge label="2/3" color="#2563eb" />}
          {step === "review" && <StepBadge label="3/3" color="#16a34a" />}
        </View>
      </View>

      {/* ─── Step 1: Draw/Type Signature + Details ─── */}
      {step === "draw" && (
        <View style={styles.drawStepContainer}>
          {/* Toolbar: mode toggle + pen weight */}
          <View style={styles.drawToolbar}>
            <View
              style={[
                styles.modeRow,
                { backgroundColor: t.backgroundSecondary },
              ]}
            >
              <Pressable
                style={[
                  styles.modeButton,
                  signatureMode === "draw" && styles.modeButtonActive,
                ]}
                onPress={() => {
                  setSignatureMode("draw");
                  setSignatureImage(null);
                }}
              >
                <MaterialIcons
                  name="gesture"
                  size={16}
                  color={signatureMode === "draw" ? "#2563eb" : t.textSecondary}
                />
                <Text
                  style={[
                    styles.modeButtonText,
                    {
                      color:
                        signatureMode === "draw" ? "#2563eb" : t.textSecondary,
                    },
                  ]}
                >
                  Draw
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeButton,
                  signatureMode === "type" && styles.modeButtonActive,
                ]}
                onPress={() => {
                  setSignatureMode("type");
                  setSignatureImage(null);
                }}
              >
                <MaterialIcons
                  name="text-fields"
                  size={16}
                  color={signatureMode === "type" ? "#2563eb" : t.textSecondary}
                />
                <Text
                  style={[
                    styles.modeButtonText,
                    {
                      color:
                        signatureMode === "type" ? "#2563eb" : t.textSecondary,
                    },
                  ]}
                >
                  Type
                </Text>
              </Pressable>
            </View>

            {signatureMode === "draw" && (
              <View style={styles.penWeightRow}>
                {(["light", "medium", "thick"] as PenWeight[]).map((w) => (
                  <Pressable
                    key={w}
                    style={[
                      styles.penWeightChip,
                      { borderColor: penWeight === w ? "#2563eb" : t.border },
                      penWeight === w && styles.penWeightChipActive,
                    ]}
                    onPress={() => {
                      setPenWeight(w);
                      setSignatureImage(null);
                    }}
                  >
                    <View
                      style={[
                        styles.penWeightLine,
                        {
                          height: PEN_WEIGHTS[w].dot + 1,
                          backgroundColor:
                            penWeight === w ? "#2563eb" : t.textSecondary,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.penWeightLabel,
                        {
                          color: penWeight === w ? "#2563eb" : t.textSecondary,
                        },
                      ]}
                    >
                      {w.charAt(0).toUpperCase() + w.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Signature area */}
          {signatureMode === "draw" ? (
            <View
              style={[styles.signatureContainer, { borderColor: t.border }]}
            >
              <SignatureScreen
                key={penWeight}
                ref={signatureRef}
                onEnd={handleSignatureEnd}
                onOK={handleSignatureOK}
                onEmpty={() => setSignatureImage(null)}
                descriptionText=""
                clearText=""
                confirmText=""
                webStyle={SIGNATURE_WEB_STYLE}
                autoClear={false}
                imageType="image/png"
                backgroundColor="rgb(255,255,255)"
                penColor="rgb(26,26,46)"
                minWidth={PEN_WEIGHTS[penWeight].min}
                maxWidth={PEN_WEIGHTS[penWeight].max}
                dotSize={PEN_WEIGHTS[penWeight].dot}
                trimWhitespace={true}
                style={styles.signaturePad}
              />
              {/* Floating clear button */}
              <Pressable
                style={[
                  styles.clearButtonFloat,
                  { backgroundColor: t.card, borderColor: t.border },
                ]}
                onPress={handleClearSignature}
              >
                <MaterialIcons
                  name="refresh"
                  size={16}
                  color={t.textSecondary}
                />
              </Pressable>
              {!signatureImage && (
                <View style={styles.signHereOverlay} pointerEvents="none">
                  <Text
                    style={[styles.signHereHint, { color: t.textTertiary }]}
                  >
                    Sign here
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.typeArea, { borderColor: t.border }]}>
              <TextInput
                value={typedName}
                onChangeText={setTypedName}
                placeholder="Type your full name..."
                placeholderTextColor={t.textTertiary}
                style={[
                  styles.typeInput,
                  {
                    backgroundColor: t.backgroundSecondary,
                    color: t.text,
                    borderColor: t.border,
                  },
                ]}
                maxLength={100}
                autoCapitalize="words"
              />
              {typedName.trim() !== "" && (
                <View style={[styles.typePreview, { borderColor: t.border }]}>
                  <Text style={[styles.typePreviewText, { color: "#1a1a2e" }]}>
                    {typedName}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Signer details — in Step 1 */}
          <View
            style={[
              styles.detailsCard,
              { backgroundColor: t.card, borderColor: t.border },
            ]}
          >
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: t.textSecondary }]}>
                Name
              </Text>
              <TextInput
                value={signerName || typedName}
                onChangeText={setSignerName}
                placeholder="Your name"
                placeholderTextColor={t.textTertiary}
                style={[
                  styles.detailInput,
                  {
                    backgroundColor: t.backgroundSecondary,
                    color: t.text,
                    borderColor: t.border,
                  },
                ]}
                maxLength={100}
              />
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: t.textSecondary }]}>
                Reason
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Optional"
                placeholderTextColor={t.textTertiary}
                style={[
                  styles.detailInput,
                  {
                    backgroundColor: t.backgroundSecondary,
                    color: t.text,
                    borderColor: t.border,
                  },
                ]}
                maxLength={200}
              />
            </View>
            <Pressable
              style={styles.checkRow}
              onPress={() => setShowDate(!showDate)}
            >
              <MaterialIcons
                name={showDate ? "check-box" : "check-box-outline-blank"}
                size={20}
                color={showDate ? "#2563eb" : t.textSecondary}
              />
              <Text style={[styles.checkLabel, { color: t.text }]}>
                Include date ({new Date().toLocaleDateString()})
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ─── Step 2: Scrollable Multi-Page PDF with Signature Overlay ─── */}
      {step === "place" && (
        <View style={styles.placeStepContainer}>
          {/* Header */}
          <View style={styles.placeHeader}>
            <Text style={[styles.placeTitle, { color: t.text }]}>
              Place Your Signature
            </Text>
            <Text style={[styles.placeHint, { color: t.textSecondary }]}>
              Scroll to navigate pages. Drag the signature to reposition.
            </Text>
          </View>

          {/* Page navigation bar with Go To Page */}
          {pageCount > 1 && (
            <View
              style={[
                styles.pageNavBar,
                { backgroundColor: t.card, borderBottomColor: t.border },
              ]}
            >
              <Pressable
                onPress={() =>
                  setPlacementPage((p) => Math.max(0, p - 1))
                }
                style={[
                  styles.pageNavBtn,
                  { backgroundColor: t.backgroundSecondary },
                ]}
                disabled={placementPage === 0}
              >
                <MaterialIcons
                  name="chevron-left"
                  size={20}
                  color={placementPage === 0 ? t.textTertiary : t.text}
                />
              </Pressable>

              <View style={styles.goToPageRow}>
                <Text
                  style={[styles.goToLabel, { color: t.textSecondary }]}
                >
                  Page
                </Text>
                <TextInput
                  value={goToPageText}
                  onChangeText={setGoToPageText}
                  onSubmitEditing={handleGoToPage}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  style={[
                    styles.goToPageInput,
                    {
                      backgroundColor: t.backgroundSecondary,
                      color: t.text,
                      borderColor: t.border,
                    },
                  ]}
                  maxLength={4}
                />
                <Text
                  style={[styles.goToLabel, { color: t.textSecondary }]}
                >
                  of {pageCount}
                </Text>
                <Pressable
                  style={styles.goToBtn}
                  onPress={handleGoToPage}
                >
                  <Text style={styles.goToBtnText}>Go</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() =>
                  setPlacementPage((p) =>
                    Math.min(pageCount - 1, p + 1),
                  )
                }
                style={[
                  styles.pageNavBtn,
                  { backgroundColor: t.backgroundSecondary },
                ]}
                disabled={placementPage === pageCount - 1}
              >
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={
                    placementPage === pageCount - 1
                      ? t.textTertiary
                      : t.text
                  }
                />
              </Pressable>
            </View>
          )}

          {/* Scrollable PDF pages with pinch-to-zoom */}
          <View style={styles.previewArea} onLayout={handlePreviewLayout}>
            {previewContainerW > 0 && pageRenderH > 0 && (
              <GestureHandlerRootView style={{ flex: 1 }}>
                <GestureDetector gesture={pinchGesture}>
                  <Animated.View style={[{ flex: 1 }, zoomAnimatedStyle]}>
                    <FlatList
                      ref={flatListRef}
                      data={pageIndices}
                      keyExtractor={pageKeyExtractor}
                      renderItem={renderPageItem}
                      getItemLayout={getItemLayout}
                      scrollEnabled={!isDragging}
                      initialNumToRender={3}
                      windowSize={5}
                      maxToRenderPerBatch={2}
                      removeClippedSubviews={Platform.OS !== "web"}
                      onViewableItemsChanged={handleViewableItemsChanged}
                      viewabilityConfig={viewabilityConfig}
                      showsVerticalScrollIndicator
                      ItemSeparatorComponent={PageSeparator}
                      onScrollToIndexFailed={({ index }) => {
                        flatListRef.current?.scrollToOffset({
                          offset: index * itemTotalH,
                          animated: true,
                        });
                      }}
                      extraData={`${placementPage}-${placementX}-${placementY}`}
                    />
                  </Animated.View>
                </GestureDetector>
              </GestureHandlerRootView>
            )}

            {/* Zoom controls */}
            <View style={styles.zoomControls}>
              <Pressable
                style={[
                  styles.zoomBtn,
                  { backgroundColor: t.card, borderColor: t.border },
                ]}
                onPress={handleZoomIn}
                disabled={currentZoom >= MAX_ZOOM}
              >
                <MaterialIcons
                  name="add"
                  size={20}
                  color={currentZoom >= MAX_ZOOM ? t.textTertiary : t.text}
                />
              </Pressable>
              {currentZoom > 1.05 && (
                <Pressable
                  style={[
                    styles.zoomBtn,
                    styles.zoomResetBtn,
                  ]}
                  onPress={handleZoomReset}
                >
                  <Text style={styles.zoomResetText}>
                    {Math.round(currentZoom * 100)}%
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={[
                  styles.zoomBtn,
                  { backgroundColor: t.card, borderColor: t.border },
                ]}
                onPress={handleZoomOut}
                disabled={currentZoom <= MIN_ZOOM}
              >
                <MaterialIcons
                  name="remove"
                  size={20}
                  color={currentZoom <= MIN_ZOOM ? t.textTertiary : t.text}
                />
              </Pressable>
            </View>
          </View>

          {/* Jump to signature button (shown when scrolled away) */}
          {currentVisiblePage !== placementPage && (
            <Pressable
              style={styles.jumpToSigBtn}
              onPress={handleJumpToSignaturePage}
            >
              <MaterialIcons name="my-location" size={16} color="#fff" />
              <Text style={styles.jumpToSigText}>
                Jump to signature (p.{placementPage + 1})
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ─── Step 3: Review ─── */}
      {step === "review" && (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.sectionTitle, { color: t.text }]}>
            Review & Sign
          </Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            Confirm your signing details before applying.
          </Text>

          <View
            style={[
              styles.reviewCard,
              { backgroundColor: t.card, borderColor: t.border },
            ]}
          >
            {/* Review mini-page with real PDF */}
            <View
              style={[styles.reviewPreviewBox, { borderColor: t.border }]}
            >
              <Text
                style={[styles.reviewLabel, { color: t.textSecondary }]}
              >
                Placement Preview
              </Text>
              <View
                style={[
                  styles.reviewMiniPage,
                  {
                    aspectRatio: pageWidth / pageHeight,
                    backgroundColor: "#fff",
                    borderColor: t.border,
                  },
                ]}
              >
                {/* Mini signature indicator */}
                <View
                  style={[
                    styles.reviewMiniSig,
                    {
                      left: `${(placementX / pageWidth) * 100}%`,
                      bottom: `${(placementY / pageHeight) * 100}%`,
                      width: `${(placementW / pageWidth) * 100}%`,
                      height: `${(placementH / pageHeight) * 100}%`,
                    },
                  ]}
                >
                  {signatureImage ? (
                    <Image
                      source={{ uri: signatureImage }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="contain"
                    />
                  ) : (
                    <Text
                      style={styles.reviewMiniSigText}
                      numberOfLines={1}
                    >
                      {typedName || "Sig"}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {(signerName || typedName) && (
              <ReviewRow
                label="Signer"
                value={signerName || typedName}
                textColor={t.text}
                secondaryColor={t.textSecondary}
              />
            )}
            {reason ? (
              <ReviewRow
                label="Reason"
                value={reason}
                textColor={t.text}
                secondaryColor={t.textSecondary}
              />
            ) : null}
            <ReviewRow
              label="Page"
              value={`${placementPage + 1} of ${pageCount}`}
              textColor={t.text}
              secondaryColor={t.textSecondary}
            />
            <ReviewRow
              label="File"
              value={file || "document.pdf"}
              textColor={t.text}
              secondaryColor={t.textSecondary}
            />
            {showDate && (
              <ReviewRow
                label="Date"
                value={new Date().toLocaleString()}
                textColor={t.text}
                secondaryColor={t.textSecondary}
              />
            )}
          </View>
        </ScrollView>
      )}

      {/* Bottom navigation */}
      <View
        style={[
          styles.bottomNav,
          { backgroundColor: t.card, borderTopColor: t.border },
        ]}
      >
        <Pressable
          style={[
            styles.navButton,
            styles.navButtonBack,
            { borderColor: t.border },
          ]}
          onPress={() => {
            if (step === "draw") {
              router.back();
            } else if (step === "place") {
              setStep("draw");
            } else {
              setStep("place");
            }
          }}
        >
          <Text style={[styles.navButtonBackText, { color: t.text }]}>
            {step === "draw" ? "Cancel" : "\u2190 Back"}
          </Text>
        </Pressable>

        {step !== "review" ? (
          <Pressable
            style={[
              styles.navButton,
              styles.navButtonNext,
              { backgroundColor: "#2563eb" },
            ]}
            onPress={() => {
              if (step === "draw") {
                handleNextFromDraw();
              } else {
                setStep("review");
              }
            }}
          >
            <Text style={styles.navButtonNextText}>Next {"\u2192"}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.navButton,
              styles.navButtonNext,
              { backgroundColor: "#16a34a" },
            ]}
            onPress={handleSign}
          >
            <MaterialIcons name="draw" size={18} color="#fff" />
            <Text style={styles.navButtonNextText}>Apply Signature</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StepBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.stepBadge, { backgroundColor: color + "18" }]}>
      <Text style={[styles.stepBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ReviewRow({
  label,
  value,
  textColor,
  secondaryColor,
}: {
  label: string;
  value: string;
  textColor: string;
  secondaryColor: string;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={[styles.reviewRowLabel, { color: secondaryColor }]}>
        {label}
      </Text>
      <Text
        style={[styles.reviewRowValue, { color: textColor }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function PageSeparator() {
  return <View style={{ height: PAGE_GAP }} />;
}

// ── Styles ──────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerButton: { padding: 6 },
  headerCenter: { flex: 1, marginHorizontal: 12 },
  headerTitle: { fontSize: 16, fontWeight: "600" },
  headerSubtitle: { fontSize: 11, marginTop: 1 },
  headerRight: { paddingRight: 4 },

  // ── Draw step ──
  drawStepContainer: { flex: 1, padding: 12, paddingBottom: 0 },
  drawToolbar: { gap: 8, marginBottom: 10 },
  modeRow: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 6,
    gap: 5,
  },
  modeButtonActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeButtonText: { fontSize: 13, fontWeight: "600" },

  penWeightRow: {
    flexDirection: "row",
    gap: 8,
  },
  penWeightChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  penWeightChipActive: {
    backgroundColor: "#eff6ff",
  },
  penWeightLine: {
    width: 16,
    borderRadius: 2,
  },
  penWeightLabel: { fontSize: 12, fontWeight: "600" },

  signatureContainer: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
    position: "relative",
    minHeight: 160,
  },
  signaturePad: {
    flex: 1,
    width: "100%",
  },
  clearButtonFloat: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  signHereOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  signHereHint: {
    fontSize: 15,
    fontStyle: "italic",
  },

  typeArea: {
    flex: 1,
    paddingTop: 8,
    minHeight: 140,
  },
  typeInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  typePreview: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  typePreviewText: {
    fontSize: 28,
    fontStyle: "italic",
    fontWeight: "300",
  },

  // ── Signer details (in Step 1) ──
  detailsCard: {
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    width: 50,
  },
  detailInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkLabel: { fontSize: 13 },

  // ── Place step ──
  placeStepContainer: { flex: 1 },
  placeHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  placeTitle: { fontSize: 18, fontWeight: "700", marginBottom: 2 },
  placeHint: { fontSize: 13, lineHeight: 18 },

  pageNavBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  pageNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  goToPageRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  goToLabel: { fontSize: 13, fontWeight: "500" },
  goToPageInput: {
    width: 44,
    height: 32,
    borderWidth: 1,
    borderRadius: 6,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 0,
  },
  goToBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#2563eb",
  },
  goToBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  previewArea: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pageItemContainer: {
    position: "relative",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#fff",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pdfPageFill: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#fff",
  },
  pageNumberBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pageNumberBadgeActive: {
    backgroundColor: "#2563eb",
  },
  pageNumberText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  pageNumberTextActive: {
    color: "#fff",
  },
  jumpToSigBtn: {
    position: "absolute",
    bottom: 70,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  jumpToSigText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Zoom controls
  zoomControls: {
    position: "absolute",
    right: 12,
    bottom: 12,
    gap: 6,
    alignItems: "center",
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  zoomResetBtn: {
    width: "auto" as any,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    borderWidth: 0,
  },
  zoomResetText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  // Page tap target (tap to place signature)
  pageTapTarget: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pageTapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pageTapHintText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
  },

  signatureOverlay: {
    position: "absolute",
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    borderWidth: 2,
    borderColor: "#2563eb",
    borderStyle: "dashed",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingTop: 1,
    zIndex: 20,
  },
  signaturePreviewImage: {
    width: "90%",
    height: "60%",
  },
  signatureOverlayText: {
    fontSize: 10,
    color: "#2563eb",
    fontStyle: "italic",
    fontWeight: "500",
  },
  overlayNameText: {
    fontSize: 7,
    color: "#1e3a8a",
    fontWeight: "600",
    marginTop: 1,
  },
  overlayDateText: {
    fontSize: 6,
    color: "#6b7280",
    marginTop: 0,
  },
  dragHandle: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Review & scrollable steps ──
  scrollContent: { flex: 1 },
  scrollContentContainer: { padding: 16, paddingBottom: 40 },

  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  sectionHint: { fontSize: 13, marginBottom: 16 },

  reviewCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  reviewPreviewBox: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 12,
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  reviewMiniPage: {
    width: "100%",
    maxHeight: 180,
    borderWidth: 1,
    borderRadius: 4,
    position: "relative",
    overflow: "hidden",
  },
  reviewMiniSig: {
    position: "absolute",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    borderWidth: 1.5,
    borderColor: "#2563eb",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewMiniSigText: {
    fontSize: 6,
    color: "#2563eb",
    fontStyle: "italic",
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  reviewRowLabel: { fontSize: 13, width: 80 },
  reviewRowValue: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },

  // Bottom nav
  bottomNav: {
    flexDirection: "row",
    padding: 12,
    gap: 12,
    borderTopWidth: 1,
  },
  navButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    gap: 6,
  },
  navButtonBack: {
    borderWidth: 1,
  },
  navButtonBackText: { fontSize: 15, fontWeight: "600" },
  navButtonNext: {},
  navButtonNextText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Done screen
  doneContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  doneIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  doneTitle: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  doneSubtitle: { fontSize: 14, textAlign: "center", marginBottom: 32 },
  doneActions: { width: "100%", gap: 12 },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  doneButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Processing
  processingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  processingText: { fontSize: 17, fontWeight: "600" },
  processingSubtext: { fontSize: 13 },

  // Step badge
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepBadgeText: { fontSize: 12, fontWeight: "700" },
});
