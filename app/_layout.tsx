import { LogBox } from "react-native";
import { enableScreens } from "react-native-screens";

// Enable native screens for better performance (must be called before any navigation)
enableScreens(true);

// Ignore non-critical warnings in development
if (__DEV__) {
  LogBox.ignoreLogs([
    "Non-serializable values were found in the navigation state",
  ]);

  // Surface unhandled promise rejections in Metro terminal (dev only).
  // This makes errors like ExpoAsset.downloadAsync failures visible.
  const globalAny = global as any;
  if (!globalAny.__unhandledRejectionSetup) {
    globalAny.__unhandledRejectionSetup = true;
    const tracking = require("promise/setimmediate/rejection-tracking");
    tracking.enable({
      allRejections: true,
      onUnhandled: (id: number, error: unknown) => {
        const msg =
          error instanceof Error
            ? `${error.message}\n${error.stack}`
            : String(error);
        console.warn(`[UnhandledPromiseRejection id:${id}]`, msg);
      },
      onHandled: () => {},
    });
  }
}

import { FloatingAIButton } from "@/components/AIButton";
import { loadNativeFonts } from "@/services/editorFontService";
import { runImportedFileRetentionCheck } from "@/services/fileRetentionService";
import { purgeExpired } from "@/services/recycleBinService";
import { loadSettings } from "@/services/settingsService";
import { ThemeProvider } from "@/services/ThemeProvider";
import { setAutoDetectLanguage, setRate } from "@/services/ttsService";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import "react-native-reanimated";

// Prevent the splash screen from hiding until fonts are loaded.
SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    // Run background startup tasks in parallel with font loading
    Promise.all([
      loadNativeFonts(),
      // Purge expired recycle bin entries (15-day retention)
      purgeExpired().catch(console.error),
      // Auto-delete imported files past their retention period (if enabled)
      runImportedFileRetentionCheck().catch(console.error),
      // Initialise TTS rate and language detection from saved settings
      loadSettings().then((s) => {
        setRate(s.readingSpeed);
        setAutoDetectLanguage(s.autoDetectLanguage);
      }).catch(console.error),
    ])
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true)); // show app even if tasks fail
  }, []);

  const onLayoutReady = useCallback(async () => {
    if (fontsReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return null; // splash screen stays visible
  }

  return (
    <ThemeProvider>
      <View style={styles.container} onLayout={onLayoutReady}>
        <Stack
          screenOptions={{
            headerShown: false,
            // PERF: Freeze inactive screens to prevent background re-renders
            freezeOnBlur: true,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="ai" />
          <Stack.Screen name="manage-pages" />
          <Stack.Screen name="file-details" />
          <Stack.Screen name="browse-files" />
          <Stack.Screen name="tool-processor" />
          <Stack.Screen name="library" />
          <Stack.Screen name="share" />
          <Stack.Screen name="folders" />
          <Stack.Screen name="pdf-viewer" />
          <Stack.Screen name="docx-viewer" />
          <Stack.Screen name="epub-viewer" />
          <Stack.Screen name="image-viewer" />
          {/* PERF: Use fast 'none' animation for editor screens — avoids
              layout animation overhead so the screen appears instantly */}
          <Stack.Screen
            name="create-blank-pdf"
            options={{ animation: "none" }}
          />
          <Stack.Screen
            name="create-blank-docx"
            options={{ animation: "none" }}
          />
          <Stack.Screen name="settings" />
          <Stack.Screen name="privacy-policy" />
          <Stack.Screen name="terms-of-service" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="premium" />
          <Stack.Screen name="recycle" />
          <Stack.Screen name="chat-with-document" />
          <Stack.Screen name="extract-images" />
          <Stack.Screen name="batch-compress" />
          <Stack.Screen name="find-replace" />
          <Stack.Screen name="true-redact" />
          <Stack.Screen name="qr-code" />
          <Stack.Screen name="lock-document" />
          <Stack.Screen name="highlight-export" />
          <Stack.Screen name="citation-extractor" />
        </Stack>
        <FloatingAIButton />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
