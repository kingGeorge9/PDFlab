// ============================================
// AI Empty State – shown when no messages exist yet
// ============================================

import AILogoBadge from "@/components/AIButton/AILogoBadge";
import { spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import type { AIAction } from "@/services/ai/ai.types";
import { AI_FEATURES } from "@/services/ai/ai.types";
import {
  BookOpen,
  Brain,
  FileSearch,
  FileSignature,
  FileText,
  Languages,
  ListChecks,
  MessageSquare,
  Sparkles,
  Wand2,
} from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  "message-square": MessageSquare,
  "book-open": BookOpen,
  languages: Languages,
  "file-search": FileSearch,
  brain: Brain,
  "list-checks": ListChecks,
  "file-signature": FileSignature,
  "file-text": FileText,
  "wand-2": Wand2,
};

interface Props {
  action: AIAction;
}

export const AIEmptyState = React.memo(function AIEmptyState({
  action,
}: Props) {
  const { colors: t, mode } = useTheme();
  const feature = AI_FEATURES.find((f) => f.id === action);
  const Icon = feature ? ICON_MAP[feature.icon] || Sparkles : Sparkles;
  const color = feature?.color || "#9333EA";

  const hints: Record<AIAction, string[]> = {
    chat: [
      "Ask me any question",
      'Try "Help me write an email"',
      "I can brainstorm ideas with you",
    ],
    summarize: [
      "Paste text or attach a document",
      "I'll extract the key points",
      "Works with PDF, DOCX, EPUB, and plain text",
    ],
    translate: [
      "Enter text and pick a target language",
      "Supports 15+ languages",
      "Attach a document for full translation",
    ],
    "extract-text": [
      "Attach a PDF document",
      "I'll extract all readable text page by page",
      "Copy the result to use anywhere",
    ],
    "extract-data": [
      "I'll find entities, tables, and key-value pairs",
      "Paste text or attach a document",
      "Returns structured data you can copy",
    ],
    analyze: [
      "Get sentiment, readability, and structure analysis",
      "Paste text or attach a document",
      "Detailed insights and recommendations",
    ],
    tasks: [
      "I'll find action items and to-dos",
      "Extracts assignees, priorities, and due dates",
      "Works with meeting notes, emails, and reports",
    ],
    "fill-form": [
      "Attach a PDF form",
      "Describe the data or paste source text",
      "AI will suggest field values",
    ],
    "generate-content": [
      "Describe the content you need",
      "Supports emails, blogs, social posts, and code",
      "Specify a tone or style for tailored results",
    ],
    "chat-with-document": [
      "Attach a document first",
      "Then ask questions about its content",
      "Works with PDF, DOCX, EPUB, and TXT files",
    ],
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: mode === "dark" ? `${color}22` : `${color}15`,
          },
        ]}
      >
        {action === "chat" ? (
          <AILogoBadge size={56} />
        ) : (
          <Icon color={color} size={44} strokeWidth={1.8} />
        )}
      </View>
      <Text style={[styles.title, { color: t.text }]}>
        {feature?.name || "xumi"}
      </Text>
      <Text style={[styles.subtitle, { color: t.textSecondary }]}>
        {feature?.description || "Select a mode to get started"}
      </Text>
      <View style={styles.hints}>
        {(hints[action] || []).map((hint, i) => (
          <View
            key={i}
            style={[
              styles.hintRow,
              {
                backgroundColor: mode === "dark" ? "#1E293B" : "#F8FAFC",
              },
            ]}
          >
            <Text style={[styles.hintBullet, { color }]}>•</Text>
            <Text style={[styles.hintText, { color: t.textSecondary }]}>
              {hint}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  hints: {
    alignSelf: "stretch",
    gap: spacing.xs + 2,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
  },
  hintBullet: {
    fontSize: 18,
    fontWeight: "700",
  },
  hintText: {
    fontSize: 13,
    flex: 1,
  },
});
