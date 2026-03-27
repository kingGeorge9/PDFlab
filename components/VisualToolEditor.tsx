/**
 * VisualToolEditor + VisualCropEditor
 * Reusable visual editing overlays for PDF tools.
 * - VisualToolEditor: tap-to-place, drag-to-reposition for text, stamps, etc.
 * - VisualCropEditor: drag-to-resize crop frame for the Crop tool.
 */

import { colors as themeColors } from "@/constants/theme";
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  GripVertical,
  Minus,
  Move,
  Plus,
  RotateCcw,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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

// ============================================================================
// TYPES
// ============================================================================

interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  background: string;
  backgroundSecondary: string;
  card: string;
  border: string;
}

export type VisualToolType =
  | "add-text"
  | "annotate"
  | "redact"
  | "add-stamps"
  | "watermark"
  | "hyperlinks";

export interface PlacementResult {
  pageNumber: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  toolType: VisualToolType;
  fileUri: string;
  fileName: string;
  pageCount?: number;
  pageWidth?: number;
  pageHeight?: number;
  placement: PlacementResult;
  onPlacementChange: (placement: PlacementResult) => void;
  previewLabel?: string;
  onScrollLock?: (locked: boolean) => void;
  t: ThemeColors;
}

interface CropProps {
  fileUri: string;
  fileName: string;
  pageWidth?: number;
  pageHeight?: number;
  pageCount?: number;
  cropMargins: CropMargins;
  onCropChange: (margins: CropMargins) => void;
  onScrollLock?: (locked: boolean) => void;
  requestedPage?: number;
  t: ThemeColors;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PDF_WIDTH = 612;
const DEFAULT_PDF_HEIGHT = 792;
const PAGE_GAP = 12;

const ELEMENT_SIZES: Record<VisualToolType, { w: number; h: number }> = {
  "add-text": { w: 200, h: 30 },
  annotate: { w: 180, h: 30 },
  redact: { w: 200, h: 40 },
  "add-stamps": { w: 160, h: 60 },
  watermark: { w: 300, h: 80 },
  hyperlinks: { w: 160, h: 24 },
};

const TOOL_LABELS: Record<VisualToolType, string> = {
  "add-text": "Tap to place text",
  annotate: "Tap to place annotation",
  redact: "Tap to place redaction area",
  "add-stamps": "Tap to place stamp",
  watermark: "Tap to place watermark",
  hyperlinks: "Tap to place hyperlink",
};

const ELEMENT_COLORS: Record<VisualToolType, string> = {
  "add-text": themeColors.primary,
  annotate: themeColors.warning,
  redact: "#1a1a2e",
  "add-stamps": themeColors.success,
  watermark: themeColors.secondary,
  hyperlinks: themeColors.info,
};

// ============================================================================
// VISUAL TOOL EDITOR — Tap-to-place + drag-to-reposition
// ============================================================================

export const VisualToolEditor: React.FC<Props> = ({
  toolType,
  fileUri,
  fileName,
  pageCount: propPageCount,
  pageWidth: propPageWidth,
  pageHeight: propPageHeight,
  placement,
  onPlacementChange,
  previewLabel,
  onScrollLock,
  t,
}) => {
  const pdfW = propPageWidth || DEFAULT_PDF_WIDTH;
  const pdfH = propPageHeight || DEFAULT_PDF_HEIGHT;
  const totalPages = propPageCount || 1;
  const elementSize = ELEMENT_SIZES[toolType];
  const color = ELEMENT_COLORS[toolType];

  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({
    pageX: 0,
    pageY: 0,
    startPdfX: 0,
    startPdfY: 0,
  });

  // ScrollView state
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentVisiblePage, setCurrentVisiblePage] = useState(0);
  const [goToPageText, setGoToPageText] = useState(
    String(placement.pageNumber + 1),
  );

  // Zoom state
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;
  const zoomScale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const [currentZoom, setCurrentZoom] = useState(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      zoomScale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    })
    .onEnd(() => {
      savedScale.value = zoomScale.value;
      if (zoomScale.value < 1.05) {
        zoomScale.value = withTiming(1, { duration: 150 });
        savedScale.value = 1;
      }
    });

  const zoomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomScale.value }],
  }));

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

  // Compute preview dimensions (scrollable, no height clamping)
  const pageAspect = pdfH / pdfW;
  const scale = containerW > 0 ? containerW / pdfW : 1;
  const pageRenderH = containerW * pageAspect;
  const itemTotalH = pageRenderH + PAGE_GAP;

  // Element screen position (PDF bottom-left → screen top-left)
  const elW = (placement.width || elementSize.w) * scale;
  const elH = (placement.height || elementSize.h) * scale;
  const elScreenX = placement.x * scale;
  const elScreenY =
    (pdfH - placement.y - (placement.height || elementSize.h)) * scale;

  // Page indices
  const pageIndices = React.useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i),
    [totalPages],
  );

  // ── Handlers ──────────────────────────────────────────────────────

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerW(e.nativeEvent.layout.width);
    setContainerH(e.nativeEvent.layout.height);
  }, []);

  // Drag uses absolute pageX/pageY for smooth, jitter-free tracking
  const handleDragStart = useCallback(
    (evt: GestureResponderEvent) => {
      setIsDragging(true);
      onScrollLock?.(true);
      const { pageX, pageY } = evt.nativeEvent;
      dragStartRef.current = {
        pageX,
        pageY,
        startPdfX: placement.x,
        startPdfY: placement.y,
      };
    },
    [placement.x, placement.y, onScrollLock],
  );

  const handleDragMove = useCallback(
    (evt: GestureResponderEvent) => {
      if (!isDragging) return;
      const { pageX, pageY } = evt.nativeEvent;
      const effectiveScale = scale * currentZoom;
      const deltaPdfX = (pageX - dragStartRef.current.pageX) / effectiveScale;
      const deltaPdfY = -((pageY - dragStartRef.current.pageY) / effectiveScale);

      const newPdfX = Math.max(
        0,
        Math.min(
          dragStartRef.current.startPdfX + deltaPdfX,
          pdfW - (placement.width || elementSize.w),
        ),
      );
      const newPdfY = Math.max(
        0,
        Math.min(
          dragStartRef.current.startPdfY + deltaPdfY,
          pdfH - (placement.height || elementSize.h),
        ),
      );

      onPlacementChange({
        ...placement,
        x: Math.round(newPdfX),
        y: Math.round(newPdfY),
      });
    },
    [isDragging, scale, currentZoom, pdfW, pdfH, placement, elementSize, onPlacementChange],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onScrollLock?.(false);
  }, [onScrollLock]);

  const handlePageChange = (delta: number) => {
    const newPage = Math.max(
      0,
      Math.min(placement.pageNumber + delta, totalPages - 1),
    );
    onPlacementChange({ ...placement, pageNumber: newPage });
  };

  const handleReset = () => {
    onPlacementChange({
      pageNumber: placement.pageNumber,
      x: Math.round((pdfW - elementSize.w) / 2),
      y: 80,
      width: elementSize.w,
      height: elementSize.h,
    });
  };

  // ScrollView helpers
  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (itemTotalH > 0) {
        const page = Math.round(e.nativeEvent.contentOffset.y / itemTotalH);
        setCurrentVisiblePage(Math.max(0, Math.min(page, totalPages - 1)));
      }
    },
    [itemTotalH, totalPages],
  );

  const handleGoToPage = useCallback(() => {
    const target = parseInt(goToPageText, 10);
    if (isNaN(target) || target < 1 || target > totalPages) return;
    const pageIdx = target - 1;
    onPlacementChange({ ...placement, pageNumber: pageIdx });
    scrollViewRef.current?.scrollTo({ y: pageIdx * itemTotalH, animated: true });
  }, [goToPageText, totalPages, placement, onPlacementChange, itemTotalH]);

  const handleJumpToElementPage = useCallback(() => {
    scrollViewRef.current?.scrollTo({
      y: placement.pageNumber * itemTotalH,
      animated: true,
    });
  }, [placement.pageNumber, itemTotalH]);

  // Sync goToPageText when placement page changes
  useEffect(() => {
    setGoToPageText(String(placement.pageNumber + 1));
  }, [placement.pageNumber]);

  // Auto-scroll to element page on first mount
  useEffect(() => {
    if (itemTotalH > 0 && placement.pageNumber > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: placement.pageNumber * itemTotalH,
          animated: false,
        });
      }, 300);
    }
  }, [itemTotalH]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={vs.container}>
      <View style={[vs.instructionBar, { backgroundColor: color + "12" }]}>
        <Move color={color} size={16} />
        <Text style={[vs.instructionText, { color }]}>
          Scroll to navigate. Drag the element to reposition.
        </Text>
      </View>

      {/* Page navigation bar with Go To Page */}
      {totalPages > 1 && (
        <View
          style={[
            vs.pageNavBar,
            { backgroundColor: t.card, borderBottomColor: t.border },
          ]}
        >
          <TouchableOpacity
            onPress={() => handlePageChange(-1)}
            disabled={placement.pageNumber === 0}
            style={[
              vs.pageNavBtn,
              { backgroundColor: t.backgroundSecondary },
              placement.pageNumber === 0 && { opacity: 0.4 },
            ]}
          >
            <ChevronLeft color={t.text} size={18} />
          </TouchableOpacity>

          <View style={vs.goToPageRow}>
            <Text style={[vs.goToLabel, { color: t.textSecondary }]}>
              Page
            </Text>
            <TextInput
              value={goToPageText}
              onChangeText={setGoToPageText}
              onSubmitEditing={handleGoToPage}
              keyboardType="number-pad"
              selectTextOnFocus
              style={[
                vs.goToPageInput,
                {
                  backgroundColor: t.backgroundSecondary,
                  color: t.text,
                  borderColor: t.border,
                },
              ]}
              maxLength={4}
            />
            <Text style={[vs.goToLabel, { color: t.textSecondary }]}>
              of {totalPages}
            </Text>
            <Pressable style={vs.goToBtn} onPress={handleGoToPage}>
              <Text style={vs.goToBtnText}>Go</Text>
            </Pressable>
          </View>

          <TouchableOpacity
            onPress={() => handlePageChange(1)}
            disabled={placement.pageNumber === totalPages - 1}
            style={[
              vs.pageNavBtn,
              { backgroundColor: t.backgroundSecondary },
              placement.pageNumber === totalPages - 1 && { opacity: 0.4 },
            ]}
          >
            <ChevronRight color={t.text} size={18} />
          </TouchableOpacity>
        </View>
      )}

      {/* Scrollable PDF pages with pinch-to-zoom */}
      <View style={vs.previewArea} onLayout={handleContainerLayout}>
        {containerW > 0 && pageRenderH > 0 && (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <GestureDetector gesture={pinchGesture}>
              <Animated.View style={[{ flex: 1 }, zoomAnimatedStyle]}>
                <ScrollView
                  ref={scrollViewRef}
                  scrollEnabled={!isDragging}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  onScroll={handleScroll}
                  scrollEventThrottle={100}
                >
                  {pageIndices.map((pageIndex) => {
                    const isElementPage = pageIndex === placement.pageNumber;
                    return (
                      <React.Fragment key={`vte-page-${pageIndex}`}>
                        <Pressable
                          style={[
                            vs.pageItemContainer,
                            {
                              width: containerW,
                              height: pageRenderH,
                              borderColor: isElementPage ? color : "transparent",
                            },
                          ]}
                          onPress={() => {
                            if (!isElementPage) {
                              onPlacementChange({ ...placement, pageNumber: pageIndex });
                            }
                          }}
                        >
                          <Pdf
                            source={{ uri: fileUri, cache: true }}
                            page={pageIndex + 1}
                            enablePaging={true}
                            fitPolicy={2}
                            minScale={1}
                            maxScale={1}
                            style={vs.pdfPageFill}
                            onError={(err: any) =>
                              console.warn("PDF page render error:", err)
                            }
                          />
                          {!isElementPage && (
                            <View style={vs.pageTapTarget} pointerEvents="box-none">
                              <View style={[vs.pageTapHint, { backgroundColor: color + "80" }]}>
                                <Text style={vs.pageTapHintText}>Tap to place here</Text>
                              </View>
                            </View>
                          )}
                          {isElementPage && (
                            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                              <View
                                style={[
                                  vs.placedElement,
                                  {
                                    left: elScreenX,
                                    top: elScreenY,
                                    width: elW,
                                    height: elH,
                                    backgroundColor:
                                      toolType === "redact" ? color : color + "20",
                                    borderColor: color,
                                    borderWidth: toolType === "redact" ? 0 : 2,
                                    borderStyle: "dashed",
                                  },
                                ]}
                                onStartShouldSetResponder={() => true}
                                onMoveShouldSetResponder={() => true}
                                onResponderTerminationRequest={() => false}
                                onResponderGrant={handleDragStart}
                                onResponderMove={handleDragMove}
                                onResponderRelease={handleDragEnd}
                              >
                                {toolType !== "redact" && (
                                  <Text
                                    style={[vs.elementLabel, { color }]}
                                    numberOfLines={1}
                                  >
                                    {previewLabel || toolType.replace("-", " ")}
                                  </Text>
                                )}
                                <View
                                  style={[vs.dragHandle, { backgroundColor: color + "30" }]}
                                >
                                  <GripVertical color={color} size={14} />
                                </View>
                              </View>
                            </View>
                          )}
                          {/* Page number badge */}
                          <View
                            style={[
                              vs.pageNumberBadge,
                              isElementPage && { backgroundColor: color },
                            ]}
                          >
                            <Text style={vs.pageNumberText}>{pageIndex + 1}</Text>
                          </View>
                        </Pressable>
                        {pageIndex < totalPages - 1 && <VTEPageSeparator />}
                      </React.Fragment>
                    );
                  })}
                </ScrollView>
              </Animated.View>
            </GestureDetector>
          </GestureHandlerRootView>
        )}

        {/* Zoom controls */}
        <View style={vs.zoomControls}>
          <TouchableOpacity
            style={[vs.zoomBtn, { backgroundColor: t.card, borderColor: t.border }]}
            onPress={handleZoomIn}
            disabled={currentZoom >= MAX_ZOOM}
          >
            <Plus size={18} color={currentZoom >= MAX_ZOOM ? t.textTertiary : t.text} />
          </TouchableOpacity>
          {currentZoom > 1.05 && (
            <TouchableOpacity
              style={[vs.zoomBtn, vs.zoomResetBtn]}
              onPress={handleZoomReset}
            >
              <Text style={vs.zoomResetText}>
                {Math.round(currentZoom * 100)}%
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[vs.zoomBtn, { backgroundColor: t.card, borderColor: t.border }]}
            onPress={handleZoomOut}
            disabled={currentZoom <= MIN_ZOOM}
          >
            <Minus size={18} color={currentZoom <= MIN_ZOOM ? t.textTertiary : t.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Jump to element page button (when scrolled away) */}
      {currentVisiblePage !== placement.pageNumber && (
        <Pressable
          style={[vs.jumpToElementBtn, { backgroundColor: color }]}
          onPress={handleJumpToElementPage}
        >
          <Text style={vs.jumpToElementText}>
            Jump to element (p.{placement.pageNumber + 1})
          </Text>
        </Pressable>
      )}

      {/* Bottom controls */}
      <View
        style={[
          vs.controls,
          { backgroundColor: t.card, borderTopColor: t.border },
        ]}
      >
        <View style={vs.coordRow}>
          <View
            style={[
              vs.coordChip,
              { backgroundColor: t.backgroundSecondary },
            ]}
          >
            <Text style={{ fontSize: 11, color: t.textSecondary }}>
              X: {placement.x}
            </Text>
          </View>
          <View
            style={[
              vs.coordChip,
              { backgroundColor: t.backgroundSecondary },
            ]}
          >
            <Text style={{ fontSize: 11, color: t.textSecondary }}>
              Y: {placement.y}
            </Text>
          </View>
          {toolType === "redact" && (
            <>
              <View
                style={[
                  vs.coordChip,
                  { backgroundColor: t.backgroundSecondary },
                ]}
              >
                <Text style={{ fontSize: 11, color: t.textSecondary }}>
                  W: {placement.width || elementSize.w}
                </Text>
              </View>
              <View
                style={[
                  vs.coordChip,
                  { backgroundColor: t.backgroundSecondary },
                ]}
              >
                <Text style={{ fontSize: 11, color: t.textSecondary }}>
                  H: {placement.height || elementSize.h}
                </Text>
              </View>
            </>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={handleReset}
            style={[
              vs.resetBtn,
              { backgroundColor: t.backgroundSecondary },
            ]}
          >
            <RotateCcw color={t.textSecondary} size={14} />
            <Text
              style={{
                fontSize: 11,
                color: t.textSecondary,
                marginLeft: 4,
              }}
            >
              Reset
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

function VTEPageSeparator() {
  return <View style={{ height: PAGE_GAP }} />;
}

// ============================================================================
// VISUAL CROP EDITOR — Real PDF preview + drag edges/corners + numeric inputs
// ============================================================================

const MIN_CROP = 50; // Min crop dimension in PDF points

export const VisualCropEditor: React.FC<CropProps> = ({
  fileUri,
  pageWidth: propPageWidth,
  pageHeight: propPageHeight,
  pageCount = 1,
  cropMargins,
  onCropChange,
  onScrollLock,
  requestedPage,
  t,
}) => {
  const pdfW = propPageWidth || DEFAULT_PDF_WIDTH;
  const pdfH = propPageHeight || DEFAULT_PDF_HEIGHT;

  const [containerW, setContainerW] = useState(0);
  const [previewPage, setPreviewPage] = useState(1); // 1-indexed

  // Sync preview page when parent requests a specific page
  useEffect(() => {
    if (requestedPage && requestedPage >= 1 && requestedPage <= pageCount) {
      setPreviewPage(requestedPage);
    }
  }, [requestedPage, pageCount]);
  const [showInputs, setShowInputs] = useState(false);
  const [marginInputs, setMarginInputs] = useState({
    top: "0",
    bottom: "0",
    left: "0",
    right: "0",
  });

  // Keep numeric inputs in sync when margins change externally (drag)
  useEffect(() => {
    setMarginInputs({
      top: String(Math.round(cropMargins.top)),
      bottom: String(Math.round(cropMargins.bottom)),
      left: String(Math.round(cropMargins.left)),
      right: String(Math.round(cropMargins.right)),
    });
  }, [cropMargins.top, cropMargins.bottom, cropMargins.left, cropMargins.right]);

  const pageAspect = pdfH / pdfW;
  const previewW = Math.max(0, containerW - 16);
  const previewH = previewW > 0 ? previewW * pageAspect : 0;
  const scale = previewW > 0 ? previewW / pdfW : 1;

  // Crop frame in screen coords
  const cL = cropMargins.left * scale;
  const cT = cropMargins.top * scale;
  const cR = (pdfW - cropMargins.right) * scale;
  const cB = (pdfH - cropMargins.bottom) * scale;
  const cW = Math.max(0, cR - cL);
  const cH = Math.max(0, cB - cT);
  const dimW = Math.round(pdfW - cropMargins.left - cropMargins.right);
  const dimH = Math.round(pdfH - cropMargins.top - cropMargins.bottom);

  // Gesture state — edges + move only (no corner handles)
  const activeEdgeRef = useRef<
    "top" | "bottom" | "left" | "right" | "move" | null
  >(null);
  const dragStartRef = useRef({
    pageX: 0,
    pageY: 0,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  const EDGE_HIT = 28; // px from edge line to register an edge touch

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerW(e.nativeEvent.layout.width);
  }, []);

  const handleGrant = useCallback(
    (evt: GestureResponderEvent) => {
      const { locationX: lx, locationY: ly, pageX, pageY } = evt.nativeEvent;

      // Edge detection
      const dT = Math.abs(ly - cT);
      const dB = Math.abs(ly - cB);
      const dL = Math.abs(lx - cL);
      const dR = Math.abs(lx - cR);
      const inH = lx > cL - EDGE_HIT && lx < cR + EDGE_HIT;
      const inV = ly > cT - EDGE_HIT && ly < cB + EDGE_HIT;
      const candidates = [
        { name: "top" as const, dist: dT, ok: dT < EDGE_HIT && inH },
        { name: "bottom" as const, dist: dB, ok: dB < EDGE_HIT && inH },
        { name: "left" as const, dist: dL, ok: dL < EDGE_HIT && inV },
        { name: "right" as const, dist: dR, ok: dR < EDGE_HIT && inV },
      ]
        .filter((e) => e.ok)
        .sort((a, b) => a.dist - b.dist);

      let active: typeof activeEdgeRef.current = null;
      if (candidates.length > 0) {
        active = candidates[0].name;
      } else if (lx > cL && lx < cR && ly > cT && ly < cB) {
        active = "move";
      }

      activeEdgeRef.current = active;
      if (active) {
        dragStartRef.current = { pageX, pageY, margins: { ...cropMargins } };
        onScrollLock?.(true);
      }
    },
    [cL, cT, cR, cB, cropMargins, onScrollLock],
  );

  const handleMove = useCallback(
    (evt: GestureResponderEvent) => {
      if (!activeEdgeRef.current) return;
      const { pageX, pageY } = evt.nativeEvent;
      const { margins } = dragStartRef.current;
      const dx = (pageX - dragStartRef.current.pageX) / scale;
      const dy = (pageY - dragStartRef.current.pageY) / scale;
      const n = { ...margins };

      switch (activeEdgeRef.current) {
        case "top":
          n.top = Math.max(0, Math.min(margins.top + dy, pdfH - margins.bottom - MIN_CROP));
          break;
        case "bottom":
          n.bottom = Math.max(0, Math.min(margins.bottom - dy, pdfH - margins.top - MIN_CROP));
          break;
        case "left":
          n.left = Math.max(0, Math.min(margins.left + dx, pdfW - margins.right - MIN_CROP));
          break;
        case "right":
          n.right = Math.max(0, Math.min(margins.right - dx, pdfW - margins.left - MIN_CROP));
          break;
        case "move": {
          const w = pdfW - margins.left - margins.right;
          const h = pdfH - margins.top - margins.bottom;
          n.left = Math.max(0, Math.min(margins.left + dx, pdfW - w));
          n.right = pdfW - w - n.left;
          n.top = Math.max(0, Math.min(margins.top + dy, pdfH - h));
          n.bottom = pdfH - h - n.top;
          break;
        }
      }

      onCropChange({
        top: Math.round(n.top),
        right: Math.round(n.right),
        bottom: Math.round(n.bottom),
        left: Math.round(n.left),
      });
    },
    [scale, pdfW, pdfH, onCropChange],
  );

  const handleRelease = useCallback(() => {
    activeEdgeRef.current = null;
    onScrollLock?.(false);
  }, [onScrollLock]);

  const handleReset = () => onCropChange({ top: 0, right: 0, bottom: 0, left: 0 });

  const applyMarginInput = (field: keyof CropMargins, val: string) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    const updated = { ...cropMargins, [field]: n };
    if (pdfW - updated.left - updated.right < MIN_CROP) return;
    if (pdfH - updated.top - updated.bottom < MIN_CROP) return;
    onCropChange(updated);
  };

  const CCOLOR = themeColors.info;

  return (
    <View style={vs.container}>
      {/* Instruction bar */}
      <View style={[vs.instructionBar, { backgroundColor: CCOLOR + "12" }]}>
        <Crop color={CCOLOR} size={16} />
        <Text style={[vs.instructionText, { color: CCOLOR }]}>
          Drag corners or edges to define crop area
        </Text>
      </View>

      {/* Page navigation for multi-page PDFs */}
      {pageCount > 1 && (
        <View style={[vs.pageNavBar, { backgroundColor: t.card, borderBottomColor: t.border }]}>
          <TouchableOpacity
            onPress={() => setPreviewPage((p) => Math.max(1, p - 1))}
            disabled={previewPage <= 1}
            style={[vs.pageNavBtn, { backgroundColor: t.backgroundSecondary }, previewPage <= 1 && { opacity: 0.4 }]}
          >
            <ChevronLeft color={t.text} size={18} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: "500", color: t.textSecondary }}>
            Preview page {previewPage} of {pageCount}
          </Text>
          <TouchableOpacity
            onPress={() => setPreviewPage((p) => Math.min(pageCount, p + 1))}
            disabled={previewPage >= pageCount}
            style={[vs.pageNavBtn, { backgroundColor: t.backgroundSecondary }, previewPage >= pageCount && { opacity: 0.4 }]}
          >
            <ChevronRight color={t.text} size={18} />
          </TouchableOpacity>
        </View>
      )}

      {/* PDF preview with crop overlay */}
      <View style={[vs.previewArea, { alignItems: "center" }]} onLayout={handleContainerLayout}>
        {containerW > 0 && previewW > 0 && previewH > 0 && (
          <View
            style={[cropS.pdfContainer, { width: previewW, height: previewH, borderColor: t.border }]}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={handleGrant}
            onResponderMove={handleMove}
            onResponderRelease={handleRelease}
            onResponderTerminate={handleRelease}
          >
            {/* Actual PDF page — non-interactive so touches pass to parent */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Pdf
                source={{ uri: fileUri, cache: true }}
                page={previewPage}
                enablePaging={true}
                fitPolicy={2}
                minScale={1}
                maxScale={1}
                style={{ flex: 1, backgroundColor: "#fff" }}
                onError={(err: any) => console.warn("Crop PDF render error:", err)}
              />
            </View>

            {/* Dark overlays over cropped-out regions */}
            {cT > 0 && (
              <View style={[cropS.overlay, { top: 0, left: 0, right: 0, height: cT }]} pointerEvents="none" />
            )}
            {previewH - cB > 0 && (
              <View style={[cropS.overlay, { bottom: 0, left: 0, right: 0, height: Math.max(0, previewH - cB) }]} pointerEvents="none" />
            )}
            {cL > 0 && (
              <View style={[cropS.overlay, { top: cT, left: 0, width: cL, height: cH }]} pointerEvents="none" />
            )}
            {previewW - cR > 0 && (
              <View style={[cropS.overlay, { top: cT, right: 0, width: Math.max(0, previewW - cR), height: cH }]} pointerEvents="none" />
            )}

            {/* Crop frame border */}
            <View
              style={{ position: "absolute", left: cL, top: cT, width: cW, height: cH, borderWidth: 2, borderColor: "#fff", borderRadius: 2 }}
              pointerEvents="none"
            />

            {/* Rule-of-thirds grid inside crop */}
            {cW > 0 && cH > 0 && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={{ position: "absolute", left: cL + cW / 3, top: cT, width: 1, height: cH, backgroundColor: "rgba(255,255,255,0.3)" }} />
                <View style={{ position: "absolute", left: cL + (cW * 2) / 3, top: cT, width: 1, height: cH, backgroundColor: "rgba(255,255,255,0.3)" }} />
                <View style={{ position: "absolute", left: cL, top: cT + cH / 3, width: cW, height: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />
                <View style={{ position: "absolute", left: cL, top: cT + (cH * 2) / 3, width: cW, height: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />
              </View>
            )}

            {/* Dimension label inside crop area */}
            {cW > 90 && cH > 30 && (
              <View style={[cropS.dimLabel, { left: cL + cW / 2 - 40, top: cT + cH / 2 - 14 }]} pointerEvents="none">
                <Text style={cropS.dimText}>{dimW} × {dimH}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Bottom controls — centered Edit values + Reset */}
      <View style={[vs.controls, { backgroundColor: t.card, borderTopColor: t.border }]}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => setShowInputs((v) => !v)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: t.backgroundSecondary,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: t.text }}>
              {showInputs ? "Hide values" : "Edit values"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleReset}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: t.backgroundSecondary,
            }}
          >
            <RotateCcw color={t.textSecondary} size={14} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: t.textSecondary }}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Numeric margin inputs (collapsible) */}
        {showInputs && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {(["top", "bottom", "left", "right"] as const).map((field) => (
              <View key={field} style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: t.textSecondary, marginBottom: 4, textAlign: "center" }}>
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </Text>
                <TextInput
                  value={marginInputs[field]}
                  onChangeText={(v) => setMarginInputs((prev) => ({ ...prev, [field]: v }))}
                  onEndEditing={() => applyMarginInput(field, marginInputs[field])}
                  onSubmitEditing={() => applyMarginInput(field, marginInputs[field])}
                  keyboardType="number-pad"
                  style={{
                    height: 38,
                    backgroundColor: t.backgroundSecondary,
                    color: t.text,
                    borderRadius: 8,
                    textAlign: "center",
                    fontSize: 14,
                    fontWeight: "600",
                    borderWidth: 1,
                    borderColor: t.border,
                  }}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const vs = StyleSheet.create({
  container: {
    flex: 1,
  },
  instructionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  pageNavBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
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
    backgroundColor: themeColors.primary,
  },
  goToBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  previewArea: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 300,
  },
  pageItemContainer: {
    position: "relative",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#fff",
    alignSelf: "center",
    borderWidth: 2,
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
  pageNumberText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  jumpToElementBtn: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  jumpToElementText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  placedElement: {
    position: "absolute",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 30,
    minHeight: 16,
  },
  elementLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dragHandle: {
    position: "absolute",
    right: -4,
    top: "50%",
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  pageNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  coordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  coordChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
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
    backgroundColor: themeColors.primary,
    borderWidth: 0,
  },
  zoomResetText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  // Page tap target
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pageTapHintText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
  },
});

const cropS = StyleSheet.create({
  overlay: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  pdfContainer: {
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  dimLabel: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    width: 80,
    alignItems: "center",
  },
  dimText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});
