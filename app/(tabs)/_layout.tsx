import { GradientView } from "@/components/GradientView";
import { colors as brandColors } from "@/constants/theme";
import { useSettings } from "@/services/settingsService";
import { useTheme } from "@/services/ThemeProvider";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Download, Home, Library, Wrench } from "lucide-react-native";

// ─── Tab metadata ────────────────────────────────────────────────────────────
const TAB_META: Record<string, { title: string; Icon: typeof Home }> = {
  index: { title: "Home", Icon: Home },
  tools: { title: "Tools", Icon: Wrench },
  library: { title: "Library", Icon: Library },
  download: { title: "Download", Icon: Download },
};

const TAB_ORDER = ["index", "tools", "library", "download"] as const;

// ─── Animated Tab Item ───────────────────────────────────────────────────────
function TabItem({
  route,
  focused,
  descriptor,
  onPress,
  onLongPress,
}: {
  route: any;
  focused: boolean;
  descriptor: any;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors: t } = useTheme();
  const scaleAnim = useRef(new Animated.Value(focused ? 1 : 0.88)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1 : 0.88,
      useNativeDriver: true,
      tension: 160,
      friction: 9,
    }).start();
  }, [focused]);

  const meta = TAB_META[route.name];
  if (!meta) return null;

  const { Icon, title } = meta;
  const iconSize = 22;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={descriptor.options.tabBarAccessibilityLabel ?? title}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: t.tabActive + "20", borderless: true }}
      style={styles.tabSlot}
    >
      <Animated.View
        style={[styles.tabContent, { transform: [{ scale: scaleAnim }] }]}
      >
        {/* ── Icon pill (only the icon lives inside the pill) ── */}
        {focused ? (
          <GradientView
            colors={[brandColors.gradientStart, brandColors.gradientMid]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.activePill}
          >
            <Icon color="#FFFFFF" size={iconSize} strokeWidth={2.8} />
          </GradientView>
        ) : (
          <View style={styles.inactivePill}>
            <Icon color={t.tabInactive} size={iconSize} strokeWidth={1.8} />
          </View>
        )}

        {/* ── Label sits BELOW the pill, outside it ── */}
        <Text
          style={[
            styles.tabLabel,
            focused
              ? { color: t.tabActive, fontWeight: "700" }
              : { color: t.tabInactive, fontWeight: "400" },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Custom Tab Bar ──────────────────────────────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors: t } = useTheme();
  const insets = useSafeAreaInsets();

  // Bottom padding: respect safe area on notch devices, minimum 8px
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 8);

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: t.tabBar,
          borderTopColor: t.tabBarBorder,
          paddingBottom: bottomPad,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const descriptor = descriptors[route.key];

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <TabItem
            key={route.key}
            route={route}
            focused={focused}
            descriptor={descriptor}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
}

// ─── Tab Layout ──────────────────────────────────────────────────────────────
export default function TabLayout() {
  const { colors: t } = useTheme();
  const { settings, isLoading } = useSettings();
  const router = useRouter();
  const hasNavigatedRef = useRef(false);

  // Handle default start screen on first load
  useEffect(() => {
    if (isLoading || hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;

    const startScreen = settings.defaultStartScreen;
    if (startScreen === "home") return;

    const handle = InteractionManager.runAfterInteractions(() => {
      try {
        switch (startScreen) {
          case "library":
            router.push("/library");
            break;
          case "downloads":
            router.push("/(tabs)/download");
            break;
          case "ai":
            router.push("/ai");
            break;
          case "tools":
            router.push("/(tabs)/tools");
            break;
          case "folders":
            router.push("/folders");
            break;
          default:
            break;
        }
      } catch {
        // Fall back to home silently
      }
    });

    return () => handle.cancel();
  }, [isLoading, settings.defaultStartScreen]);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {TAB_ORDER.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{ title: TAB_META[name].title }}
        />
      ))}
    </Tabs>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  /* ── Tab bar container ── */
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    // paddingBottom set dynamically via safe area
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },

  /* ── Each tab slot ── */
  tabSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },

  /* ── Inner column: pill + label ── */
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  /* ── Active: gradient pill, icon only ── */
  activePill: {
    width: 60,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Inactive: transparent same-size container for layout stability ── */
  inactivePill: {
    width: 60,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Label below the pill ── */
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
});
