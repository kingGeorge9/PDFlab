/**
 * VoicePicker.tsx
 * Shows only the voices in the app's bundled registry.
 * Unavailable voices (not on this device) are shown greyed out — never hidden.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  setVoice as applyVoice,
  getResolvedVoices,
  getSavedVoiceId,
} from "@/services/ttsService";
import {
  ACCENT_FILTERS,
  type Accent,
  type ResolvedVoice,
} from "@/services/voiceRegistry";

// ---------------------------------------------------------------------------
// Gender filter type
// ---------------------------------------------------------------------------

type GenderFilter = "All" | "Female" | "Male";
const GENDER_FILTERS: GenderFilter[] = ["All", "Female", "Male"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface VoicePickerProps {
  visible: boolean;
  onClose: () => void;
  onVoiceSelected?: (voice: ResolvedVoice) => void;
  colorScheme?: "dark" | "light";
}

export const VoicePicker: React.FC<VoicePickerProps> = ({
  visible,
  onClose,
  onVoiceSelected,
  colorScheme = "dark",
}) => {
  const isDark = colorScheme === "dark";
  const [voices, setVoices] = useState<ResolvedVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accentFilter, setAccentFilter] = useState<Accent | "All">("All");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("All");

  // Theme colors
  const bg = isDark ? "#1C1C1E" : "#FFFFFF";
  const textPrimary = isDark ? "#EFEFEF" : "#0F172A";
  const textSecondary = isDark ? "#888" : "#64748B";
  const separator = isDark ? "#2C2C2E" : "#E5E7EB";
  const chipBg = isDark ? "#2C2C2E" : "#F1F5F9";
  const headerBorder = isDark ? "#333" : "#E5E7EB";

  // Resolve voices when the sheet opens
  useEffect(() => {
    if (!visible) return;

    // Restore saved selection
    const saved = getSavedVoiceId();
    if (saved) setSelectedId(saved);

    setLoading(true);
    getResolvedVoices()
      .then(setVoices)
      .finally(() => setLoading(false));
  }, [visible]);

  // Apply filters — unavailable voices always included (shown greyed)
  const filtered = useMemo(() => {
    return voices.filter((v) => {
      const accentOk = accentFilter === "All" || v.accent === accentFilter;
      const genderOk = genderFilter === "All" || v.gender === genderFilter;
      return accentOk && genderOk;
    });
  }, [voices, accentFilter, genderFilter]);

  const availableCount = filtered.filter((v) => v.available).length;

  const handleSelect = useCallback(
    (voice: ResolvedVoice) => {
      if (!voice.available || !voice.systemId) return;
      applyVoice(voice.systemId);
      setSelectedId(voice.systemId);
      onVoiceSelected?.(voice);
      onClose();
    },
    [onVoiceSelected, onClose],
  );

  // ---------------------------------------------------------------------------
  // Row renderer
  // ---------------------------------------------------------------------------

  const renderVoice = useCallback(
    ({ item }: { item: ResolvedVoice }) => {
      const isSelected = item.systemId != null && item.systemId === selectedId;
      const unavailable = !item.available;

      const genderColor = item.gender === "Female" ? "#F472B6" : "#60A5FA";
      const genderIcon = item.gender === "Female" ? "♀" : "♂";

      return (
        <Pressable
          onPress={() => handleSelect(item)}
          disabled={unavailable}
          style={[
            styles.voiceItem,
            { borderBottomColor: separator },
            isSelected && {
              backgroundColor: isDark ? "#1E293B" : "#EEF2FF",
              borderRadius: 12,
            },
            unavailable && styles.voiceItemUnavailable,
          ]}
          accessibilityLabel={`${item.displayName}, ${item.description}${
            unavailable ? ", not available on this device" : ""
          }`}
        >
          {/* Flag */}
          <Text style={[styles.flag, unavailable && styles.dimmed]}>
            {item.flag}
          </Text>

          {/* Info */}
          <View style={styles.voiceInfo}>
            <View style={styles.nameRow}>
              <Text
                style={[
                  styles.voiceName,
                  {
                    color: unavailable
                      ? isDark
                        ? "#555"
                        : "#A0AEC0"
                      : textPrimary,
                  },
                ]}
              >
                {item.displayName}
              </Text>
              {item.description.toLowerCase().includes("teen") && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Teen</Text>
                </View>
              )}
              {unavailable && (
                <View style={styles.unavailableBadge}>
                  <Text style={styles.unavailableText}>Not on device</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.voiceMeta,
                {
                  color: unavailable
                    ? isDark
                      ? "#555"
                      : "#A0AEC0"
                    : textSecondary,
                },
              ]}
            >
              {item.description}
            </Text>
          </View>

          {/* Gender */}
          <Text
            style={[
              styles.genderIcon,
              { color: unavailable ? "#444" : genderColor },
            ]}
          >
            {genderIcon}
          </Text>

          {/* Selected dot */}
          {isSelected && <View style={styles.checkDot} />}
        </Pressable>
      );
    },
    [selectedId, handleSelect, textPrimary, textSecondary, separator, isDark],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <SafeAreaView
        style={[styles.sheet, { backgroundColor: bg }]}
        edges={["bottom"]}
      >
        {/* Handle */}
        <View
          style={[
            styles.handle,
            { backgroundColor: isDark ? "#555" : "#D1D5DB" },
          ]}
        />

        {/* Title */}
        <Text
          style={[
            styles.title,
            { color: textPrimary, borderBottomColor: headerBorder },
          ]}
        >
          Choose a Voice
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={ACCENT} size="large" />
            <Text style={[styles.loadingText, { color: textSecondary }]}>
              Loading voices…
            </Text>
          </View>
        ) : (
          <>
            {/* ── Accent chips ── */}
            <Text style={[styles.filterLabel, { color: textSecondary }]}>
              Accent
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScrollView}
              contentContainerStyle={styles.chipRow}
            >
              {(["All", ...ACCENT_FILTERS] as (Accent | "All")[]).map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setAccentFilter(a)}
                  style={[
                    styles.chip,
                    { backgroundColor: chipBg },
                    accentFilter === a && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: textSecondary },
                      accentFilter === a && styles.chipTextActive,
                    ]}
                  >
                    {a}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* ── Gender chips ── */}
            <Text style={[styles.filterLabel, { color: textSecondary }]}>
              Gender
            </Text>
            <View style={styles.chipRow}>
              {GENDER_FILTERS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGenderFilter(g)}
                  style={[
                    styles.chip,
                    { backgroundColor: chipBg },
                    genderFilter === g && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: textSecondary },
                      genderFilter === g && styles.chipTextActive,
                    ]}
                  >
                    {g === "Female"
                      ? "♀ Female"
                      : g === "Male"
                        ? "♂ Male"
                        : "All"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Results summary */}
            <Text style={[styles.resultCount, { color: textSecondary }]}>
              {availableCount} of {filtered.length} voices available on this
              device
            </Text>

            {/* Voice list */}
            <FlatList
              data={filtered}
              keyExtractor={(v) => v.id}
              renderItem={renderVoice}
              contentContainerStyle={{ paddingBottom: 16 }}
            />

            {/* Footer — informational only, no download links */}
            <View style={[styles.footer, { borderTopColor: separator }]}>
              <Text style={[styles.footerText, { color: textSecondary }]}>
                Greyed-out voices are not installed on this device.
              </Text>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const ACCENT = "#4F6EF7";

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "78%",
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: { fontSize: 14 },
  filterLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  chipScrollView: { marginBottom: 14 },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { borderColor: ACCENT },
  chipText: { fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: ACCENT, fontWeight: "700" },
  resultCount: { fontSize: 12, marginBottom: 10 },
  voiceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  voiceItemUnavailable: { opacity: 0.45 },
  flag: { fontSize: 22 },
  dimmed: { opacity: 0.4 },
  voiceInfo: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  voiceName: { fontSize: 15, fontWeight: "600" },
  badge: {
    backgroundColor: "#7C3AED22",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "#7C3AED",
  },
  badgeText: { color: "#A78BFA", fontSize: 10, fontWeight: "700" },
  unavailableBadge: {
    backgroundColor: "#33333388",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  unavailableText: { color: "#666", fontSize: 10 },
  voiceMeta: { fontSize: 12, marginTop: 2 },
  genderIcon: {
    fontSize: 17,
    fontWeight: "700",
    width: 20,
    textAlign: "center",
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  footer: {
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { fontSize: 12, textAlign: "center" },
});
