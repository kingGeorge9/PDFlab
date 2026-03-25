import { GLOBAL_CONTAINER_HEADERS } from "@/constants/featureFlags";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

interface AppHeaderContainerProps {
  children: React.ReactNode;
  /**
   * Additional style applied to the outer card (e.g. a custom marginTop for
   * screens that need different vertical spacing).
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * AppHeaderContainer
 *
 * A thin wrapper that lifts any screen header into a floating card,
 * providing rounded corners, horizontal inset, and top spacing — without
 * a visible border. Separation from the screen background comes from the
 * header's own background color contrasting against the app background.
 *
 * Controlled by GLOBAL_CONTAINER_HEADERS in constants/featureFlags.ts.
 * Set that flag to `false` to restore every screen's original flush header
 * simultaneously — no per-screen changes needed.
 *
 * Usage:
 *   <AppHeaderContainer>
 *     <GradientView style={styles.header}>...</GradientView>
 *   </AppHeaderContainer>
 */
export function AppHeaderContainer({
  children,
  style,
}: AppHeaderContainerProps) {
  if (!GLOBAL_CONTAINER_HEADERS) {
    // Flag off — render children unchanged, zero visual impact.
    return <>{children}</>;
  }

  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Horizontal inset matches the bento / section container spacing.
    marginHorizontal: 10,
    marginTop: 8,
    // Rounded clip — content is clipped to these corners, no border drawn.
    borderRadius: 18,
    overflow: "hidden",
  },
});
