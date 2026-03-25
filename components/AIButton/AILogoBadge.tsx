/**
 * AILogoBadge
 *
 * Pure visual / presentational AI logo badge — the gradient-ringed "/x" icon
 * used on the FloatingAIButton. Clean design with gradient rings, inner
 * app-gradient mask, and AILogoIcon centre.
 *
 * Fully scalable via the `size` prop (base unit = 64 dp, matching the FAB).
 */

import { GradientView } from "@/components/GradientView";
import { colors as appColors } from "@/constants/theme";
import React from "react";
import { Platform, View } from "react-native";

import AILogoIcon from "./AILogoIcon";

// ─── Canonical tech colours (shared with FloatingAIButton) ──────────────────
const NEON_GREEN = "#4dff91";
const CYAN = "#00e5ff";
const ELECTRIC_BLUE = "#0080ff";
const MAGENTA = "#ff00ff";

// ─── Base dimensions (from FloatingAIButton, size = 64) ─────────────────────
const BASE = 64;
const BASE_BUTTON = 36;
const BASE_RING_INSET = 4;
const BASE_RING = BASE_BUTTON + BASE_RING_INSET * 2; // 44
const BASE_INNER = BASE_BUTTON - BASE_RING_INSET * 2; // 28
const BASE_ICON = 16;
interface AILogoBadgeProps {
  /** Overall badge size in dp (default 64, matching the FAB). */
  size?: number;
}

export default function AILogoBadge({ size = BASE }: AILogoBadgeProps) {
  const s = size / BASE; // scale factor

  const ringSize = BASE_RING * s;
  const innerSize = BASE_INNER * s;
  const iconSize = BASE_ICON * s;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* ── Ring A — primary gradient ────────────────────────────── */}
      <View style={ringBox(ringSize, 0.9, s)}>
        <GradientView
          colors={[NEON_GREEN, CYAN, ELECTRIC_BLUE, MAGENTA, NEON_GREEN]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: ringSize / 2 }}
        />
      </View>

      {/* ── Ring B — secondary gradient (softer) ─────────────────── */}
      <View style={ringBox(ringSize, 0.5, s)}>
        <GradientView
          colors={[CYAN, NEON_GREEN, ELECTRIC_BLUE, CYAN]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, borderRadius: ringSize / 2 }}
        />
      </View>

      {/* ── Inner mask (app header gradient) ──────────────────────── */}
      <View
        style={{
          position: "absolute",
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          overflow: "hidden",
        }}
      >
        <GradientView
          colors={[
            appColors.gradientStart,
            appColors.gradientMid,
            appColors.gradientEnd,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: innerSize / 2 }}
        />
      </View>

      {/* ── AILogoIcon centre ────────────────────────────────────── */}
      <AILogoIcon size={iconSize} color={NEON_GREEN} animated={false} />
    </View>
  );
}

/* ── Helper: ring container style ────────────────────────────────────────── */
function ringBox(ringSize: number, opacity: number, _s: number) {
  return {
    position: "absolute" as const,
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
    overflow: "hidden" as const,
    opacity,
    ...Platform.select({
      ios: {
        shadowColor: NEON_GREEN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35 * opacity,
        shadowRadius: 4 * _s,
      },
      android: {
        elevation: Math.round(6 * _s),
      },
    }),
  };
}
