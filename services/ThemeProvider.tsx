/**
 * ThemeProvider
 *
 * Wraps the app and provides dynamic theme tokens based on the user's
 * chosen theme mode (system / light / dark). Reads from settingsService.
 */
import { colors as brandColors } from "@/constants/theme";
import { useSettings } from "@/services/settingsService";
import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

// ─── Theme tokens ─────────────────────────────────────────────────────────────

export interface ThemeTokens {
  mode: "light" | "dark";
  colors: {
    // Core
    primary: string;
    primaryDark: string;
    primaryLight: string;
    secondary: string;
    accent: string;

    // Surfaces
    background: string;
    backgroundSecondary: string;
    card: string;
    surface: string;

    // Text
    text: string;
    textSecondary: string;
    textTertiary: string;
    textInverse: string;

    // Borders
    border: string;
    borderLight: string;

    // Status
    success: string;
    error: string;
    warning: string;
    info: string;

    // Tab / Nav
    tabBar: string;
    tabBarBorder: string;
    tabActive: string;
    tabInactive: string;

    // Settings-specific
    settingsBg: string;
    sectionHeader: string;
    rowBg: string;
    separator: string;
    comingSoonBadge: string;
    comingSoonText: string;
  };
}

const lightTheme: ThemeTokens = {
  mode: "light",
  colors: {
    primary: brandColors.primary,
    primaryDark: brandColors.primaryDark,
    primaryLight: brandColors.primaryLight,
    secondary: brandColors.secondary,
    accent: brandColors.accent,

    background: "#F8FAFC",
    backgroundSecondary: "#F1F5F9",
    card: "#FFFFFF",
    surface: "#FFFFFF",

    text: "#0F172A",
    textSecondary: "#64748B",
    textTertiary: "#94A3B8",
    textInverse: "#FFFFFF",

    border: "#E2E8F0",
    borderLight: "#F1F5F9",

    success: brandColors.success,
    error: brandColors.error,
    warning: brandColors.warning,
    info: brandColors.info,

    tabBar: "#FFFFFF",
    tabBarBorder: "#E2E8F0",
    tabActive: brandColors.primary,
    tabInactive: "#64748B",

    settingsBg: "#F1F5F9",
    sectionHeader: "#64748B",
    rowBg: "#FFFFFF",
    separator: "#E2E8F0",
    comingSoonBadge: "#EEF2FF",
    comingSoonText: "#6366F1",
  },
};

const darkTheme: ThemeTokens = {
  mode: "dark",
  colors: {
    primary: "#818CF8",
    primaryDark: "#6366F1",
    primaryLight: "#A5B4FC",
    secondary: "#A78BFA",
    accent: "#22D3EE",

    background: "#0F172A",
    backgroundSecondary: "#1E293B",
    card: "#1E293B",
    surface: "#1E293B",

    text: "#F1F5F9",
    textSecondary: "#94A3B8",
    textTertiary: "#64748B",
    textInverse: "#0F172A",

    border: "#334155",
    borderLight: "#1E293B",

    success: "#34D399",
    error: "#F87171",
    warning: "#FBBF24",
    info: "#60A5FA",

    tabBar: "#1E293B",
    tabBarBorder: "#334155",
    tabActive: "#818CF8",
    tabInactive: "#94A3B8",

    settingsBg: "#0F172A",
    sectionHeader: "#94A3B8",
    rowBg: "#1E293B",
    separator: "#334155",
    comingSoonBadge: "#1E1B4B",
    comingSoonText: "#A5B4FC",
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeTokens>(lightTheme);

export function useTheme(): ThemeTokens {
  return useContext(ThemeContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const systemScheme = useSystemColorScheme();

  const theme = useMemo(() => {
    let mode: "light" | "dark" = "light";
    if (settings.themeMode === "dark") {
      mode = "dark";
    } else if (settings.themeMode === "system") {
      mode = systemScheme === "dark" ? "dark" : "light";
    }
    return mode === "dark" ? darkTheme : lightTheme;
  }, [settings.themeMode, systemScheme]);

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}
