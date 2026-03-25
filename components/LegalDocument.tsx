/**
 * LegalDocument — Reusable component for rendering structured legal content.
 *
 * Supports headings, paragraphs, bullet lists, and nested subsections.
 * Respects the app's theme (light/dark mode).
 */
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  LegalSection,
  LegalSubsection,
} from "@/constants/legal/privacyPolicy";
import { useTheme } from "@/services/ThemeProvider";

// ─── Props ────────────────────────────────────────────────────────────────────

interface LegalDocumentProps {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  sections: LegalSection[];
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simple email/URL detection in text — makes them tappable. */
function renderTextWithLinks(
  text: string,
  style: object,
  linkColor: string,
  key: string,
) {
  // Match emails and URLs
  const regex =
    /(https?:\/\/[^\s]+|[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  const parts = text.split(regex);
  const matches = text.match(regex) || [];

  if (matches.length === 0) {
    return (
      <Text key={key} style={style}>
        {text}
      </Text>
    );
  }

  let matchIdx = 0;
  const elements: React.ReactNode[] = [];

  parts.forEach((part, i) => {
    if (matchIdx < matches.length && part === matches[matchIdx]) {
      const link = part;
      const href = link.includes("@") ? `mailto:${link}` : link;
      elements.push(
        <Text
          key={`${key}-link-${i}`}
          style={[style, { color: linkColor, textDecorationLine: "underline" }]}
          onPress={() => Linking.openURL(href).catch(() => {})}
        >
          {link}
        </Text>,
      );
      matchIdx++;
    } else if (part) {
      elements.push(
        <Text key={`${key}-text-${i}`} style={style}>
          {part}
        </Text>,
      );
    }
  });

  return (
    <Text key={key} style={style}>
      {elements}
    </Text>
  );
}

// ─── Sub-component: Section renderer ──────────────────────────────────────────

function SectionBlock({
  section,
  sectionKey,
  colors,
}: {
  section: LegalSection | LegalSubsection;
  sectionKey: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View key={sectionKey} style={styles.section}>
      {section.heading ? (
        <Text style={[styles.sectionHeading, { color: colors.text }]}>
          {section.heading}
        </Text>
      ) : null}

      {section.paragraphs?.map((p, pi) =>
        renderTextWithLinks(
          p,
          [styles.paragraph, { color: colors.textSecondary }],
          colors.primary,
          `${sectionKey}-p-${pi}`,
        ),
      )}

      {section.bullets?.map((b, bi) => (
        <View key={`${sectionKey}-b-${bi}`} style={styles.bulletRow}>
          <Text style={[styles.bulletDot, { color: colors.primary }]}>•</Text>
          {renderTextWithLinks(
            b,
            [styles.bulletText, { color: colors.textSecondary }],
            colors.primary,
            `${sectionKey}-bt-${bi}`,
          )}
        </View>
      ))}

      {"subsections" in section &&
        (section as LegalSection).subsections?.map((sub, si) => (
          <SectionBlock
            key={`${sectionKey}-sub-${si}`}
            section={sub}
            sectionKey={`${sectionKey}-sub-${si}`}
            colors={colors}
          />
        ))}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LegalDocument({
  title,
  subtitle,
  lastUpdated,
  sections,
  onBack,
}: LegalDocumentProps) {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {/* Spacer to balance the back button */}
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Document Title */}
        <Text style={[styles.docTitle, { color: colors.text }]}>{title}</Text>

        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
            {subtitle}
          </Text>
        ) : null}

        {lastUpdated ? (
          <View
            style={[
              styles.lastUpdatedBadge,
              { backgroundColor: colors.backgroundSecondary },
            ]}
          >
            <Text
              style={[styles.lastUpdatedText, { color: colors.textSecondary }]}
            >
              Last Updated: {lastUpdated}
            </Text>
          </View>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {sections.map((section, idx) => (
          <SectionBlock
            key={`section-${idx}`}
            section={section}
            sectionKey={`section-${idx}`}
            colors={colors}
          />
        ))}

        {/* Bottom padding */}
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  docTitle: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  lastUpdatedBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  lastUpdatedText: {
    fontSize: 13,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    paddingLeft: 8,
    marginBottom: 5,
  },
  bulletDot: {
    fontSize: 16,
    lineHeight: 23,
    marginRight: 10,
    fontWeight: "700",
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 23,
  },
});
