/**
 * ReadAloudBar.tsx
 * Floating playback control bar for the Read-Aloud feature.
 *
 * Design:
 *  - Slides up from the bottom with a spring animation
 *  - Progress bar, chunk counter, speed presets
 *  - Play/Pause, Page Skip, 10 s Skip, Stop controls
 *  - Toast overlay for skip feedback
 *  - Themed to match the app's primary color (Home header accent)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import type { ReadAloudControls } from "@/hooks/useReadAloud";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5, 2.0] as const;
type SpeedPreset = (typeof SPEED_PRESETS)[number];

const TOAST_DURATION_MS = 2500;

// ---------------------------------------------------------------------------
// Theme type — accent derived from app primary (home header) color
// ---------------------------------------------------------------------------

interface BarTheme {
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  trackBg: string;
  chipBg: string;
  chipActiveBg: string;
  chipText: string;
  chipActiveText: string;
  iconColor: string;
}

function buildBarTheme(
  colorScheme: "dark" | "light",
  accentOverride?: string,
): BarTheme {
  // Accent always matches the Home screen header gradient start color
  const accent = accentOverride ?? "#4F46E5";

  if (colorScheme === "dark") {
    return {
      surface: "#1C1C1E",
      text: "#EFEFEF",
      textSecondary: "#888",
      accent,
      trackBg: "#333",
      chipBg: "#2C2C2E",
      chipActiveBg: accent,
      chipText: "#888",
      chipActiveText: "#fff",
      iconColor: "#fff",
    };
  }
  return {
    surface: "#FFFFFF",
    text: "#0F172A",
    textSecondary: "#64748B",
    accent,
    trackBg: "#E5E7EB",
    chipBg: "#F3F4F6",
    chipActiveBg: accent,
    chipText: "#64748B",
    chipActiveText: "#fff",
    iconColor: "#fff",
  };
}

// ---------------------------------------------------------------------------
// Inline icon components (no external icon library dependency)
// ---------------------------------------------------------------------------

const IconPlay = ({ color }: { color: string }) => (
  <View
    style={{
      width: 0,
      height: 0,
      borderTopWidth: 9,
      borderBottomWidth: 9,
      borderLeftWidth: 16,
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
      borderLeftColor: color,
      marginLeft: 3,
    }}
  />
);

const IconPause = ({ color }: { color: string }) => (
  <View style={{ flexDirection: "row" }}>
    <View
      style={{
        width: 4,
        height: 18,
        backgroundColor: color,
        borderRadius: 2,
      }}
    />
    <View
      style={{
        width: 4,
        height: 18,
        backgroundColor: color,
        borderRadius: 2,
        marginLeft: 4,
      }}
    />
  </View>
);

const IconStop = ({ color }: { color: string }) => (
  <View
    style={{
      width: 16,
      height: 16,
      backgroundColor: color,
      borderRadius: 2,
    }}
  />
);

/** Page skip backward (bar + triangle pointing left) */
const IconPageBack = ({ color }: { color: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    <View
      style={{
        width: 3,
        height: 16,
        backgroundColor: color,
        borderRadius: 1,
      }}
    />
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 8,
        borderBottomWidth: 8,
        borderRightWidth: 14,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        borderRightColor: color,
        marginLeft: 2,
      }}
    />
  </View>
);

/** Page skip forward (triangle pointing right + bar) */
const IconPageForward = ({ color }: { color: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 8,
        borderBottomWidth: 8,
        borderLeftWidth: 14,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        borderLeftColor: color,
        marginLeft: 2,
      }}
    />
    <View
      style={{
        width: 3,
        height: 16,
        backgroundColor: color,
        borderRadius: 1,
        marginLeft: 2,
      }}
    />
  </View>
);

/** 10 s backward icon — "−10" text label (compact) */
const Icon10sBack = ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 11, fontWeight: "700" }}>−10s</Text>
);

/** 10 s forward icon — "+10" text label (compact) */
const Icon10sForward = ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 11, fontWeight: "700" }}>+10s</Text>
);

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

const Toast: React.FC<{ message: string | null }> = ({ message }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (message) {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(TOAST_DURATION_MS - 400),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
    }
  }, [message, opacity]);

  if (!message) return null;

  return (
    <Animated.View style={[toastStyles.container, { opacity }]}>
      <View style={toastStyles.pill}>
        <Text style={toastStyles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: {
    position: "absolute",
    top: -52,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 110,
  },
  pill: {
    backgroundColor: "rgba(0,0,0,0.78)",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
});

// ---------------------------------------------------------------------------
// ReadAloudBar
// ---------------------------------------------------------------------------

export interface ReadAloudBarProps extends ReadAloudControls {
  /** Whether the bar is visible. Animated in/out. */
  visible?: boolean;
  /** "dark" or "light" — matches the viewer's colorScheme */
  colorScheme?: "dark" | "light";
  /** Override accent color (pass the app's primary / home header color). */
  accentColor?: string;
  /** Additional container style */
  containerStyle?: ViewStyle;
  /** Callback when voice button is pressed */
  onVoicePress?: () => void;
}

export const ReadAloudBar: React.FC<ReadAloudBarProps> = ({
  visible = true,
  colorScheme = "dark",
  accentColor,
  status,
  currentChunkIndex,
  currentPageIndex,
  totalChunks,
  totalPages,
  rate,
  play,
  pause,
  stop,
  skipPageBack,
  skipPageForward,
  skipBack10s,
  skipForward10s,
  setRate,
  containerStyle,
  onVoicePress,
}) => {
  const t = buildBarTheme(colorScheme, accentColor);

  // ---------------------------------------------------------------------------
  // Slide animation
  // ---------------------------------------------------------------------------
  const slideY = useRef(new Animated.Value(140)).current;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: visible ? 0 : 140,
      useNativeDriver: true,
      tension: 60,
      friction: 12,
    }).start();
  }, [visible, slideY]);

  // ---------------------------------------------------------------------------
  // Speed picker toggle
  // ---------------------------------------------------------------------------
  const [showSpeeds, setShowSpeeds] = useState(false);

  const handleSpeedSelect = useCallback(
    (preset: SpeedPreset) => {
      setRate(preset);
      setShowSpeeds(false);
    },
    [setRate],
  );

  // ---------------------------------------------------------------------------
  // Toast state
  // ---------------------------------------------------------------------------
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), TOAST_DURATION_MS);
  }, []);

  // Cleanup toast timer
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Skip handlers with toast
  // ---------------------------------------------------------------------------
  const handlePageForward = useCallback(() => {
    const result = skipPageForward();
    showToast(result.message);
  }, [skipPageForward, showToast]);

  const handlePageBack = useCallback(() => {
    const result = skipPageBack();
    showToast(result.message);
  }, [skipPageBack, showToast]);

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------
  const progress = totalChunks > 0 ? (currentChunkIndex + 1) / totalChunks : 0;
  const isPlaying = status === "speaking";
  const isIdle = status === "idle" || status === "finished";

  // Page info label
  const pageLabel =
    totalPages > 1
      ? `Page ${currentPageIndex + 1}/${totalPages}  ·  ${currentChunkIndex + 1}/${totalChunks}`
      : totalChunks > 0
        ? `${currentChunkIndex + 1} / ${totalChunks}`
        : "No text available";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: t.surface,
          transform: [{ translateY: slideY }],
          shadowColor: colorScheme === "dark" ? "#000" : "#64748B",
        },
        containerStyle,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      {/* Toast (positioned above bar) */}
      <Toast message={toastMsg} />

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: t.trackBg }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress * 100}%`, backgroundColor: t.accent },
          ]}
        />
      </View>

      {/* Chunk / page counter */}
      <Text style={[styles.counter, { color: t.textSecondary }]}>
        {pageLabel}
      </Text>

      {/* Speed presets row */}
      {showSpeeds && (
        <View style={styles.speedRow}>
          {SPEED_PRESETS.map((preset) => {
            const active = Math.abs(rate - preset) < 0.01;
            return (
              <Pressable
                key={preset}
                onPress={() => handleSpeedSelect(preset)}
                style={[
                  styles.speedChip,
                  {
                    backgroundColor: active ? t.chipActiveBg : t.chipBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.speedChipText,
                    { color: active ? t.chipActiveText : t.chipText },
                  ]}
                >
                  {preset === 1.0 ? "1×" : `${preset}×`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── Page skip row (top row) ─────────────────────────────── */}
      {totalPages >= 1 && (
        <View style={styles.pageSkipRow}>
          <Pressable
            onPress={handlePageBack}
            style={styles.pageSkipBtn}
            accessibilityLabel="Previous page"
          >
            <IconPageBack color={t.text} />
            <Text style={[styles.pageSkipLabel, { color: t.textSecondary }]}>
              Prev page
            </Text>
          </Pressable>
          <Pressable
            onPress={handlePageForward}
            style={styles.pageSkipBtn}
            accessibilityLabel="Next page"
          >
            <Text style={[styles.pageSkipLabel, { color: t.textSecondary }]}>
              Next page
            </Text>
            <IconPageForward color={t.text} />
          </Pressable>
        </View>
      )}

      {/* ── Main controls row ──────────────────────────────────── */}
      <View style={styles.controls}>
        {/* Speed toggle */}
        <Pressable
          onPress={() => setShowSpeeds((s) => !s)}
          style={[styles.speedButton, { borderColor: t.accent }]}
          accessibilityLabel="Change playback speed"
        >
          <Text style={[styles.speedLabel, { color: t.accent }]}>{rate}×</Text>
        </Pressable>

        {/* −10 s */}
        <Pressable
          onPress={skipBack10s}
          style={styles.controlBtn}
          accessibilityLabel="Skip back 10 seconds"
        >
          <Icon10sBack color={t.text} />
        </Pressable>

        {/* Play / Pause */}
        <Pressable
          onPress={isPlaying ? pause : () => play()}
          style={[styles.playBtn, { backgroundColor: t.accent }]}
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <IconPause color={t.iconColor} />
          ) : (
            <IconPlay color={t.iconColor} />
          )}
        </Pressable>

        {/* +10 s */}
        <Pressable
          onPress={skipForward10s}
          style={styles.controlBtn}
          accessibilityLabel="Skip forward 10 seconds"
        >
          <Icon10sForward color={t.text} />
        </Pressable>

        {/* Stop */}
        <Pressable
          onPress={stop}
          style={[styles.controlBtn, isIdle && styles.controlBtnDisabled]}
          disabled={isIdle}
          accessibilityLabel="Stop reading"
        >
          <IconStop color={t.text} />
        </Pressable>
      </View>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 12,
    zIndex: 100,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginBottom: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  counter: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 6,
  },
  pageSkipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  pageSkipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  pageSkipLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnDisabled: {
    opacity: 0.3,
  },
  speedButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  speedLabel: {
    fontWeight: "600",
    fontSize: 13,
  },
  speedRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginBottom: 10,
  },
  speedChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  speedChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
