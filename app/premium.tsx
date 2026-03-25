/**
 * Premium Screen — Placeholder / Paywall stub
 */
import { useTheme } from "@/services/ThemeProvider";
import { useSettings } from "@/services/settingsService";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, Crown } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FEATURES = [
  "Unlimited PDF tools",
  "AI-powered features",
  "OCR on scanned documents",
  "Priority processing",
  "Cloud sync (coming soon)",
  "Ad-free experience",
];

export default function PremiumScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { settings } = useSettings();
  const isPremium = settings.auth.plan === "premium";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Premium
        </Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        <View
          style={[
            styles.crownCircle,
            { backgroundColor: colors.primary + "20" },
          ]}
        >
          <Crown size={48} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          {isPremium ? "You're on Premium!" : "Upgrade to Premium"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {isPremium
            ? "You have access to all features."
            : "Unlock the full power of PDFlab."}
        </Text>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Check size={18} color={colors.success} />
              <Text style={[styles.featureText, { color: colors.text }]}>
                {f}
              </Text>
            </View>
          ))}
        </View>

        {!isPremium && (
          <TouchableOpacity
            style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
            onPress={() =>
              // Stub — in production this opens a paywall
              router.back()
            }
          >
            <Text style={styles.upgradeBtnText}>Coming Soon</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  headerRight: { width: 36 },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  crownCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: "center", marginBottom: 32 },
  features: { width: "100%", marginBottom: 32 },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  featureText: { fontSize: 15, fontWeight: "500" },
  upgradeBtn: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
