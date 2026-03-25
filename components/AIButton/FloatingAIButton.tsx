/**
 * FloatingAIButton
 *
 * A global floating action button for quick xumi access, using the techy "/x"
 * logo. Features a static multi-tone tech-color aura ring around the logo.
 *
 * No animations — clean, static, polished look.
 *
 * Appears on all bottom-tab screens **except** the Home screen.
 * Position: bottom-right, fixed and consistent across screens.
 */

import { GradientView } from "@/components/GradientView";
import { colors as appColors } from "@/constants/theme";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";

import AILogoIcon from "./AILogoIcon";

// ─── Layout constants ───────────────────────────────────────────────────────
const BUTTON_SIZE = 36;
const RING_INSET = 4;
const RING_SIZE = BUTTON_SIZE + RING_INSET * 2; // 44
const INNER_SIZE = BUTTON_SIZE - RING_INSET * 2; // 28
const GLOW_SIZE = BUTTON_SIZE + 28; // 64

// ─── Static Tech Colors ────────────────────────────────────────────────────
const NEON_GREEN = "#4dff91";
const CYAN = "#00e5ff";
const ELECTRIC_BLUE = "#0080ff";
const MAGENTA = "#ff00ff";

// ─── Main component ─────────────────────────────────────────────────────────
export default function FloatingAIButton() {
  const router = useRouter();
  const pathname = usePathname();

  // ── Visibility: all tab screens except Home ────────────────────────────
  const allowedPaths = ["/tools", "/library", "/download"];
  const isVisible = allowedPaths.some(
    (p) => pathname === p || pathname === `/(tabs)${p}`,
  );

  // PERF: Early return when not visible — avoids rendering the entire
  // gradient/aura tree on every screen where the button is hidden
  if (!isVisible) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* ── Ring A: primary static gradient ───────────────────────── */}
      <View style={styles.ringOuter}>
        <GradientView
          colors={[NEON_GREEN, CYAN, ELECTRIC_BLUE, MAGENTA, NEON_GREEN]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ringGradient}
        />
      </View>

      {/* ── Ring B: secondary static gradient (slightly transparent) ─ */}
      <View style={[styles.ringOuter, { opacity: 0.5 }]}>
        <GradientView
          colors={[CYAN, NEON_GREEN, ELECTRIC_BLUE, CYAN]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.ringGradient}
        />
      </View>

      {/* ── Inner mask (app header gradient) ─────────────────────── */}
      <View style={styles.innerMask} pointerEvents="none">
        <GradientView
          colors={[
            appColors.gradientStart,
            appColors.gradientMid,
            appColors.gradientEnd,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.innerMaskGradient}
        />
      </View>

      {/* ── Tappable button with static /x icon ──────────────────── */}
      <TouchableOpacity
        style={styles.hitArea}
        activeOpacity={0.8}
        onPress={() => router.push("/ai")}
        accessibilityLabel="Open xumi"
        accessibilityRole="button"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <AILogoIcon size={16} color={NEON_GREEN} animated={false} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    right: 18,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 20,
  },

  ringOuter: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    overflow: "hidden",
    opacity: 0.9,
    ...Platform.select({
      ios: {
        shadowColor: NEON_GREEN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },

  ringGradient: {
    flex: 1,
    borderRadius: RING_SIZE / 2,
  },

  innerMask: {
    position: "absolute",
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    overflow: "hidden",
  },

  innerMaskGradient: {
    flex: 1,
    borderRadius: INNER_SIZE / 2,
  },

  hitArea: {
    position: "absolute",
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
