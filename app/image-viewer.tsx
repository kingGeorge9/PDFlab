/**
 * Image Viewer Screen
 * Full-screen image viewer with zoom and share functionality
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DarkTheme,
  LightTheme,
  Palette,
  Spacing,
  Typography,
  openWithSystemApp,
  showOpenFailedAlert,
} from "@/services/document-manager";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// ============================================================================
// COMPONENT
// ============================================================================
export default function ImageViewerScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = colorScheme === "dark" ? DarkTheme : LightTheme;

  const { uri, name, type } = useLocalSearchParams<{
    uri: string;
    name: string;
    type: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleOpenWithSystem = useCallback(async () => {
    if (!uri) return;

    const result = await openWithSystemApp({
      uri: uri,
      displayName: name || "image",
      mimeType: type || "image/jpeg",
    });

    if (!result.success) {
      showOpenFailedAlert(name || "Image", result.error);
    }
  }, [uri, name, type]);

  const handleLoadStart = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setLoading(false);
    setError("Failed to load image");
  }, []);

  if (!uri) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: theme.background.primary },
        ]}
      >
        <Header
          name={name || "Image"}
          theme={theme}
          onClose={handleClose}
          onOpenWithSystem={handleOpenWithSystem}
        />
        <View style={styles.centerContent}>
          <MaterialIcons
            name="broken-image"
            size={64}
            color={Palette.error.main}
          />
          <Text style={[styles.errorText, { color: theme.text.secondary }]}>
            No image specified
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: "#000" }]}
      edges={["top"]}
    >
      <Header
        name={name || "Image"}
        theme={theme}
        onClose={handleClose}
        onOpenWithSystem={handleOpenWithSystem}
        dark
      />

      <View style={styles.imageContainer}>
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          onLoadStart={handleLoadStart}
          onLoad={handleLoad}
          onError={handleError}
          transition={200}
        />

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Palette.white} />
          </View>
        )}

        {error && (
          <View style={styles.errorOverlay}>
            <MaterialIcons
              name="broken-image"
              size={64}
              color={Palette.error.main}
            />
            <Text style={styles.errorOverlayText}>{error}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// HEADER COMPONENT
// ============================================================================
interface HeaderProps {
  name: string;
  theme: typeof LightTheme;
  onClose: () => void;
  onOpenWithSystem: () => void;
  dark?: boolean;
}

function Header({ name, theme, onClose, onOpenWithSystem, dark }: HeaderProps) {
  const textColor = dark ? Palette.white : theme.text.primary;
  const bgColor = dark ? "rgba(0, 0, 0, 0.7)" : theme.surface.primary;

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: bgColor,
        },
      ]}
    >
      <Pressable onPress={onClose} style={styles.headerButton}>
        <MaterialIcons name="close" size={28} color={textColor} />
      </Pressable>

      <View style={styles.headerCenter}>
        <Text
          style={[styles.headerTitle, { color: textColor }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {name}
        </Text>
      </View>

      <Pressable onPress={onOpenWithSystem} style={styles.headerButton}>
        <MaterialIcons name="open-in-new" size={24} color={textColor} />
      </Pressable>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: screenWidth,
    height: screenHeight - 100,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  errorOverlayText: {
    color: Palette.white,
    fontSize: Typography.size.base,
    marginTop: Spacing.md,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  errorText: {
    fontSize: Typography.size.base,
    marginTop: Spacing.md,
    textAlign: "center",
  },
});

// export default function ImageViewerScreen() {
//   return null;
// }
