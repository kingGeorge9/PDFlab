/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const colors = {
  // Primary Brand Colors
  primary: "#4F46E5",
  primaryDark: "#4338CA",
  primaryLight: "#818CF8",
  secondary: "#8B5CF6",
  secondaryDark: "#7C3AED",
  secondaryLight: "#A78BFA",

  // Accent Colors
  accent: "#06B6D4",
  accentDark: "#0891B2",
  accentLight: "#22D3EE",

  // Background Colors
  background: "#F8FAFC",
  backgroundLight: "#F1F5F9",
  backgroundTertiary: "#E2E8F0",
  backgroundDark: "#0F172A",
  cardBackground: "#FFFFFF",
  cardBackgroundDark: "#1E293B",

  // Text Colors
  text: "#0F172A",
  textSecondary: "#64748B",
  textTertiary: "#94A3B8",
  textLight: "#FFFFFF",

  // Border Colors
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderDark: "#CBD5E1",

  // Status Colors
  success: "#10B981",
  successLight: "#D1FAE5",
  error: "#EF4444",
  errorLight: "#FEE2E2",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  info: "#3B82F6",
  infoLight: "#DBEAFE",

  // File Type Colors (Professional)
  pdf: "#DC2626",
  word: "#2563EB",
  excel: "#059669",
  ppt: "#EA580C",
  image: "#8B5CF6",
  epub: "#7C3AED",

  // Gradient Colors
  gradientStart: "#4F46E5",
  gradientMid: "#7C3AED",
  gradientEnd: "#EC4899",
};

export const shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
