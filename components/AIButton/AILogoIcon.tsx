/**
 * AILogoIcon
 *
 * Techy "/x" letterform rendered as SVG — adapted from the ai_logo design.
 * Features PCB-style tick marks, corner pads, and a cyan mid-intersection
 * diamond node. Static by default (no animation).
 */

import React from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Rect } from "react-native-svg";

interface AILogoIconProps {
  /** Render size in dp (maps to 32×32 viewBox internally) */
  size?: number;
  /** Primary stroke/fill colour — default matches ai_logo neon green */
  color?: string;
  /** Whether to show the spark dot (static) */
  animated?: boolean;
}

export default function AILogoIcon({
  size = 22,
  color = "#4dff91",
  animated = false,
}: AILogoIconProps) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        {/* ── PCB tick marks ──────────────────────────────────────────── */}
        <Line
          x1="1.5"
          y1="27"
          x2="7.5"
          y2="27"
          stroke={color}
          strokeWidth="1"
          opacity={0.45}
          strokeLinecap="square"
        />
        <Line
          x1="8.5"
          y1="5"
          x2="14.5"
          y2="5"
          stroke={color}
          strokeWidth="1"
          opacity={0.45}
          strokeLinecap="square"
        />
        <Line
          x1="24"
          y1="5"
          x2="30"
          y2="5"
          stroke={color}
          strokeWidth="1"
          opacity={0.45}
          strokeLinecap="square"
        />
        <Line
          x1="24"
          y1="27"
          x2="30"
          y2="27"
          stroke={color}
          strokeWidth="1"
          opacity={0.45}
          strokeLinecap="square"
        />

        {/* ── "/" forward slash ───────────────────────────────────────── */}
        <Line
          x1="4"
          y1="26"
          x2="12"
          y2="6"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="square"
        />

        {/* ── "x" crossing diagonals ─────────────────────────────────── */}
        <Line
          x1="17"
          y1="8"
          x2="29"
          y2="24"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="square"
        />
        <Line
          x1="17"
          y1="24"
          x2="29"
          y2="8"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="square"
        />

        {/* ── Corner pad nodes ───────────────────────────────────────── */}
        <Rect x="2.75" y="24.75" width="2.5" height="2.5" fill={color} />
        <Rect x="10.75" y="4.75" width="2.5" height="2.5" fill={color} />
        <Rect x="15.75" y="6.75" width="2.5" height="2.5" fill={color} />
        <Rect x="27.75" y="6.75" width="2.5" height="2.5" fill={color} />
        <Rect x="15.75" y="22.75" width="2.5" height="2.5" fill={color} />
        <Rect x="27.75" y="22.75" width="2.5" height="2.5" fill={color} />

        {/* ── Mid-intersection diamond node (cyan accent) ────────────── */}
        <G transform="rotate(45 23 16)">
          <Rect x="21.5" y="14.5" width="3" height="3" fill="#00e5ff" />
        </G>

        {/* ── Static spark dot ────────────────────────────────────────── */}
        <Circle cx="23" cy="16" r="1.2" fill="#ffffff" opacity={0.6} />
      </Svg>
    </View>
  );
}
