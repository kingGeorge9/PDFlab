/**
 * GradientView Component
 * A wrapper around expo-linear-gradient that provides a fallback for when the native module isn't available
 */
import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

// Try to import LinearGradient, but handle if it fails
let LinearGradientComponent: React.ComponentType<any> | null = null;

try {
  const ExpoLinearGradient = require("expo-linear-gradient");
  LinearGradientComponent = ExpoLinearGradient.LinearGradient;
} catch (e) {
  console.log("expo-linear-gradient not available, using fallback");
}

interface GradientViewProps {
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function GradientView({
  colors,
  start,
  end,
  style,
  children,
}: GradientViewProps) {
  // If LinearGradient is available, use it
  if (LinearGradientComponent) {
    return (
      <LinearGradientComponent
        colors={colors}
        start={start}
        end={end}
        style={style}
      >
        {children}
      </LinearGradientComponent>
    );
  }

  // Fallback: Use a solid color from the first gradient color
  return (
    <View style={[style, { backgroundColor: colors[0] }]}>{children}</View>
  );
}

export default GradientView;
