import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { GradientView } from "@/components/GradientView";
import { shadows } from "@/constants/theme";
import { ArrowLeft, Menu, Plus } from "lucide-react-native";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/* ── design tokens ─────────────────────────────────────────────────────────── */
const PAD_H = 16;
const TOUCH = 44; // minimum accessible tap target
const GAP = 4; // gap between right-side icons
const ICON = 20; // uniform icon glyph size

// Pill gradient colors (matches Home screen button gradient)
const PILL_GRADIENT: [string, string] = ["#4F46E5", "#7C3AED"];

// Official Home gradient colors
const GRADIENT: [string, string, string] = ["#4F46E5", "#7C3AED", "#EC4899"];

/* ── props ─────────────────────────────────────────────────────────────────── */
interface XumiHeaderProps {
  onBack: () => void;
  onNewChat: () => void;
  onToggleMenu: () => void;
  /** Whether the hamburger menu is currently open */
  menuOpen?: boolean;
}

/* ── component ─────────────────────────────────────────────────────────────── */
const XumiHeaderInner: React.FC<XumiHeaderProps> = ({
  onBack,
  onNewChat,
  onToggleMenu,
  menuOpen = false,
}) => (
  <AppHeaderContainer>
  <View style={shadows.small}>
    <GradientView
      colors={GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.gradient}
    >
      <View style={s.row}>
        {/* ── left: back arrow ── */}
        <TouchableOpacity
          onPress={onBack}
          style={s.tap}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          activeOpacity={0.6}
        >
          <ArrowLeft size={ICON} color="#fff" strokeWidth={2.2} />
        </TouchableOpacity>

        {/* ── title in pill ── */}
        <View style={s.titleArea}>
          <GradientView
            colors={PILL_GRADIENT}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.pill}
          >
            <Text style={s.title} numberOfLines={1} ellipsizeMode="tail">
              xumi AI
            </Text>
          </GradientView>
        </View>

        {/* ── right: new chat + hamburger ── */}
        <View style={s.right}>
          <TouchableOpacity
            onPress={onNewChat}
            style={s.tap}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="New chat"
            accessibilityRole="button"
            activeOpacity={0.6}
          >
            <Plus
              size={ICON}
              color="rgba(255,255,255,0.92)"
              strokeWidth={2.2}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onToggleMenu}
            style={[s.tap, menuOpen && s.menuOpenPill]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Toggle features menu"
            accessibilityRole="button"
            activeOpacity={0.6}
          >
            <Menu size={ICON} color="rgba(255,255,255,0.92)" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
    </GradientView>
  </View>
  </AppHeaderContainer>
);

export const XumiHeader = React.memo(XumiHeaderInner);
XumiHeader.displayName = "XumiHeader";

/* ── styles ────────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  gradient: {
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PAD_H,
    paddingTop: Platform.OS === "android" ? 14 : 12,
    paddingBottom: 12,
    minHeight: TOUCH + 12,
  },

  tap: {
    width: TOUCH,
    height: TOUCH,
    alignItems: "center",
    justifyContent: "center",
  },

  titleArea: {
    flex: 1,
    marginLeft: 4,
  },

  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: "hidden",
  },

  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },

  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: GAP,
  },

  menuOpenPill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
});

export default XumiHeader;
