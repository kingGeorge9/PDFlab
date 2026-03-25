/**
 * Reusable Settings UI components
 */
import { useTheme } from "@/services/ThemeProvider";
import { ChevronRight } from "lucide-react-native";
import React from "react";
import {
  Platform,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Section Header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
}

export function SectionHeader({ title }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={[s.sectionHeader, { backgroundColor: colors.settingsBg }]}>
      <Text style={[s.sectionHeaderText, { color: colors.sectionHeader }]}>
        {title}
      </Text>
    </View>
  );
}

// ─── Setting Row ──────────────────────────────────────────────────────────────

interface SettingRowProps {
  title: string;
  subtitle?: string;
  /** Right-side value text (e.g. "Light", "Home") */
  value?: string;
  /** Shows a toggle switch */
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  /** Shows a chevron and makes the row pressable */
  onPress?: () => void;
  /** "Coming soon" badge */
  comingSoon?: boolean;
  /** Destructive row (red text) */
  destructive?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Custom right-side component */
  rightComponent?: React.ReactNode;
  /** Hide bottom separator */
  hideSeparator?: boolean;
}

export function SettingRow({
  title,
  subtitle,
  value,
  toggle,
  toggleValue,
  onToggle,
  onPress,
  comingSoon,
  destructive,
  disabled,
  rightComponent,
  hideSeparator,
}: SettingRowProps) {
  const theme = useTheme();
  const { colors } = theme;
  const isDisabled = disabled ?? false;

  const content = (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <Text
          style={[
            s.rowTitle,
            { color: destructive ? colors.error : colors.text },
            isDisabled && { opacity: 0.5 },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[s.rowSubtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={s.rowRight}>
        {comingSoon ? (
          <View
            style={[
              s.comingSoonBadge,
              { backgroundColor: colors.comingSoonBadge },
            ]}
          >
            <Text style={[s.comingSoonText, { color: colors.comingSoonText }]}>
              Coming soon
            </Text>
          </View>
        ) : null}

        {value ? (
          <Text style={[s.rowValue, { color: colors.textSecondary }]}>
            {value}
          </Text>
        ) : null}

        {rightComponent ?? null}

        {toggle ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            disabled={isDisabled}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={Platform.OS === "android" ? "#fff" : undefined}
          />
        ) : null}

        {onPress && !toggle ? (
          <ChevronRight size={18} color={colors.textTertiary} />
        ) : null}
      </View>
    </View>
  );

  if (onPress && !toggle) {
    return (
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={onPress}
        disabled={isDisabled}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// ─── Segmented Control ────────────────────────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  options: { label: string; value: T }[];
  selected: T;
  onChange: (v: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  selected,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        s.segmented,
        { backgroundColor: colors.settingsBg, borderColor: colors.border },
      ]}
    >
      {options.map((opt) => {
        const isActive = opt.value === selected;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.7}
            onPress={() => onChange(opt.value)}
            style={[
              s.segmentedItem,
              isActive && {
                backgroundColor: colors.primary,
                borderRadius: 8,
              },
            ]}
          >
            <Text
              style={[
                s.segmentedLabel,
                {
                  color: isActive ? "#FFFFFF" : colors.textSecondary,
                  fontWeight: isActive ? "700" : "500",
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  separator: {
    position: "absolute",
    bottom: 0,
    left: 20,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  comingSoonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: "700",
  },
  segmented: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentedLabel: {
    fontSize: 14,
  },
});
