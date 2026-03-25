// ============================================
// AI Chat Bubble – renders a single message
// ============================================

import { spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import { copyToClipboard } from "@/services/ai/ai.service";
import type { AIChatMessage } from "@/services/ai/ai.types";
import { Check, Copy } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  message: AIChatMessage;
}

export const AIChatBubble = React.memo(function AIChatBubble({
  message,
}: Props) {
  const { colors: t, mode } = useTheme();
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(message.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [message.content]);

  return (
    <View
      style={[styles.row, { alignItems: isUser ? "flex-end" : "flex-start" }]}
    >
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: "#9333EA", borderBottomRightRadius: 4 }
            : {
                backgroundColor: mode === "dark" ? "#1E293B" : "#F1F5F9",
                borderBottomLeftRadius: 4,
              },
        ]}
      >
        <Text
          style={[styles.text, { color: isUser ? "#FFFFFF" : t.text }]}
          selectable
        >
          {message.content}
        </Text>

        {/* Timestamp + copy for assistant messages */}
        <View style={styles.meta}>
          <Text
            style={[
              styles.time,
              { color: isUser ? "rgba(255,255,255,0.6)" : t.textTertiary },
            ]}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {!isUser && (
            <TouchableOpacity
              onPress={handleCopy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.copyBtn}
            >
              {copied ? (
                <Check size={14} color={t.success} />
              ) : (
                <Copy size={14} color={t.textTertiary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    marginBottom: spacing.sm,
  },
  bubble: {
    maxWidth: "85%",
    padding: spacing.sm + 2,
    borderRadius: 16,
  },
  text: {
    fontSize: 14,
    lineHeight: 21,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 8,
  },
  time: {
    fontSize: 11,
  },
  copyBtn: {
    padding: 2,
  },
});
