/**
 * PDF Viewer Component – WPS Office-style Native Rendering
 *
 * Key behaviour (matching WPS Office mobile):
 *   • fitPolicy 0 (FIT_WIDTH) makes the native renderer scale each page so
 *     its width equals the view's width.  No horizontal scroll at default zoom.
 *   • minScale 1.0 prevents zooming out below the fitted size.
 *   • Pinch-zoom beyond 1× enables horizontal panning automatically.
 *   • Continuous vertical scroll (no page-snap) with no inter-page gap.
 *
 * Important implementation notes:
 *   – The <Pdf> component receives a `key` that includes `fitPolicy` so
 *     toggling the fit mode forces the native view to re-initialise with
 *     the correct base scale.  Without this, Android's pageFitPolicy is
 *     only applied once at first render.
 *   – Width uses useWindowDimensions() (reactive, pixel-accurate) instead
 *     of a percentage string, because the native view needs an explicit
 *     pixel width to compute the correct fit scale.
 *   – scale is NOT set explicitly; the library default (1.0) is used so
 *     the fitPolicy calculation is the sole authority for the initial zoom.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Pdf from "react-native-pdf";

import { Palette, Spacing, Typography } from "../constants/design-system";

// ============================================================================
// TYPES
// ============================================================================
export interface PdfViewerProps {
  /** URI to the PDF file */
  uri: string;
  /** Password to decrypt an encrypted PDF (empty = no password) */
  password?: string;
  /** Callback when PDF is loaded successfully */
  onLoadComplete?: (numberOfPages: number) => void;
  /** Callback when page changes */
  onPageChanged?: (page: number, numberOfPages: number) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Color scheme for styling */
  colorScheme?: "light" | "dark";
  /** Fit policy: 0 = WIDTH, 1 = HEIGHT, 2 = BOTH (default 0) */
  fitPolicy?: 0 | 1 | 2;
  /** Enable page-by-page snapping (default false for WPS-style smooth scroll) */
  enablePaging?: boolean;
  /** Horizontal scroll direction (default false = vertical) */
  horizontal?: boolean;
  /** Spacing between pages in px (default 0) */
  spacing?: number;
  /** Jump to this page number (1-based). Update the value to navigate. */
  page?: number;
  /** Minimum scale (default 1.0 = fitted size is the floor) */
  minScale?: number;
  /** Maximum scale (default 5.0) */
  maxScale?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================
function PdfViewerComponent({
  uri,
  password,
  onLoadComplete,
  onPageChanged,
  onError,
  colorScheme = "light",
  fitPolicy = 0,
  enablePaging = false,
  horizontal = false,
  spacing = 0,
  page,
  minScale = 1.0,
  maxScale = 5.0,
}: PdfViewerProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const isDark = colorScheme === "dark";

  // Track component mount status to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Stable callbacks (avoid re-renders of the native view) ──────────
  const handleLoadComplete = useCallback(
    (numberOfPages: number) => {
      if (!isMountedRef.current) return;
      setLoading(false);
      setError(null);
      onLoadComplete?.(numberOfPages);
    },
    [onLoadComplete],
  );

  const handlePageChanged = useCallback(
    (pg: number, numberOfPages: number) => {
      if (!isMountedRef.current) return;
      onPageChanged?.(pg, numberOfPages);
    },
    [onPageChanged],
  );

  const handleError = useCallback(
    (err: { message?: string }) => {
      if (!isMountedRef.current) return;
      const msg = err?.message || "Failed to load PDF";
      setLoading(false);
      setError(msg);
      onError?.(msg);
    },
    [onError],
  );

  // Error state
  if (error) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: isDark ? Palette.gray[900] : Palette.gray[100] },
        ]}
      >
        <Text
          style={[
            styles.errorText,
            { color: isDark ? Palette.error.light : Palette.error.dark },
          ]}
        >
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? Palette.gray[800] : "#525659" },
      ]}
    >
      {/*
       * key includes fitPolicy so the native view re-initialises when the
       * user toggles between fit-width and fit-both.  On Android the
       * underlying AndroidPdfViewer only applies pageFitPolicy during the
       * initial configurator build, so a prop-only change has no effect.
       *
       * Note: We add the URI hash to ensure each PDF gets a unique instance
       * and prevent "Already closed" crashes during rapid remounting.
       */}
      <Pdf
        key={`pdf-${uri.substring(0, 50)}-${fitPolicy}-${horizontal}-${enablePaging}-${password || ""}`}
        source={{ uri, cache: true }}
        style={[styles.pdf, { width: screenWidth }]}
        trustAllCerts={false}
        password={password || ""}
        page={page}
        // ── WPS-style fit ─────────────────────────────────────────
        fitPolicy={fitPolicy}
        minScale={minScale}
        maxScale={maxScale}
        // DO NOT pass `scale` — let the library's default (1.0) apply so
        // the fitPolicy calculation is the sole authority for initial zoom.
        // ── Scroll behaviour (configurable for reading modes) ─────
        enablePaging={enablePaging}
        horizontal={horizontal}
        spacing={spacing}
        // ── Zoom & interaction ────────────────────────────────────
        enableDoubleTapZoom={true}
        enableAntialiasing={true}
        // ── Callbacks ─────────────────────────────────────────────
        onLoadComplete={handleLoadComplete}
        onPageChanged={handlePageChanged}
        onError={handleError}
        onPressLink={(linkUri) => {
          if (!isMountedRef.current) return;
          console.log(`[PdfViewer] Link pressed: ${linkUri}`);
        }}
        renderActivityIndicator={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Palette.primary[500]} />
            <Text style={styles.loadingText}>Loading PDF...</Text>
          </View>
        )}
      />
    </View>
  );
}

export const PdfViewer = memo(PdfViewerComponent);

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  pdf: {
    flex: 1,
    // width is set inline via useWindowDimensions for pixel accuracy
  },
  loadingOverlay: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: Palette.white,
    fontSize: Typography.size.base,
    marginTop: Spacing.md,
  },
  errorText: {
    fontSize: Typography.size.base,
    textAlign: "center",
  },
});
