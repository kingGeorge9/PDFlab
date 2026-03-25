/**
 * PDF Recovery Screen
 * ─────────────────────────────────────────────────────────────────────
 * Shown when a PDF cannot be rendered. Provides:
 *   • Error explanation
 *   • Retry download
 *   • Repair via backend
 *   • Open externally (last resort)
 *   • Report issue
 *
 * This component is PDF-specific and does NOT affect EPUB, DOCX or
 * other file types.
 * ─────────────────────────────────────────────────────────────────────
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Palette,
  Spacing,
  Typography,
  openWithSystemApp,
  showOpenFailedAlert,
} from "@/services/document-manager";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface PdfRecoveryAction {
  type: "retry" | "repair" | "external" | "report";
}

interface PdfRecoveryScreenProps {
  /** The error message to display. */
  error: string;
  /** Additional diagnostic details (optional). */
  details?: string;
  /** URI of the (possibly broken) local file. */
  fileUri?: string;
  /** Display name of the file. */
  fileName?: string;
  /** Theme object. */
  theme: any;
  /** Called when user chooses an action. */
  onAction: (action: PdfRecoveryAction) => void;
  /** Whether a repair is in progress. */
  repairing?: boolean;
  /** Whether a retry is in progress. */
  retrying?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

export function PdfRecoveryScreen({
  error,
  details,
  fileUri,
  fileName,
  theme,
  onAction,
  repairing = false,
  retrying = false,
}: PdfRecoveryScreenProps) {
  const isWorking = repairing || retrying;

  const handleOpenExternally = async () => {
    if (!fileUri) {
      Alert.alert("Error", "No file available to open.");
      return;
    }

    const result = await openWithSystemApp({
      uri: fileUri,
      displayName: fileName || "document.pdf",
      mimeType: "application/pdf",
    });

    if (!result.success) {
      showOpenFailedAlert(fileName || "PDF", result.error);
    }
  };

  const handleReport = () => {
    const subject = encodeURIComponent("PDFlab – PDF rendering issue");
    const body = encodeURIComponent(
      `Hi,\n\nI encountered an issue opening a PDF.\n\n` +
        `Error: ${error}\n` +
        `${details ? `Details: ${details}\n` : ""}` +
        `File: ${fileName || "Unknown"}\n\n` +
        `Please advise.\n`,
    );
    // Open default mail client
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`).catch(() => {
      Alert.alert(
        "Report Issue",
        `Error: ${error}\n\n${details ?? ""}\n\nPlease share this with support.`,
      );
    });
  };

  return (
    <View style={styles.container}>
      {/* ── Icon ──────────────────────────────────────────────── */}
      <MaterialIcons
        name="picture-as-pdf"
        size={64}
        color={Palette.error.main}
      />

      {/* ── Title ─────────────────────────────────────────────── */}
      <Text style={[styles.title, { color: theme.text.primary }]}>
        Unable to Open PDF
      </Text>

      {/* ── Error message ─────────────────────────────────────── */}
      <Text style={[styles.message, { color: theme.text.secondary }]}>
        {error}
      </Text>

      {details ? (
        <Text
          style={[
            styles.details,
            { color: theme.text.tertiary ?? theme.text.secondary },
          ]}
        >
          {details}
        </Text>
      ) : null}

      {/* ── Working indicator ─────────────────────────────────── */}
      {isWorking && (
        <View style={styles.workingRow}>
          <ActivityIndicator size="small" color={Palette.primary[500]} />
          <Text style={[styles.workingText, { color: theme.text.secondary }]}>
            {repairing ? "Repairing PDF…" : "Retrying download…"}
          </Text>
        </View>
      )}

      {/* ── Actions ───────────────────────────────────────────── */}
      <View style={styles.actions}>
        {/* Retry */}
        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: Palette.primary[500] },
            isWorking && styles.disabledButton,
          ]}
          disabled={isWorking}
          onPress={() => onAction({ type: "retry" })}
        >
          <MaterialIcons
            name="refresh"
            size={20}
            color={Palette.white}
            style={styles.buttonIcon}
          />
          <Text style={styles.primaryButtonText}>
            {retrying ? "Retrying…" : "Retry Download"}
          </Text>
        </Pressable>

        {/* Repair */}
        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: Palette.primary[700] ?? "#1a56db" },
            isWorking && styles.disabledButton,
          ]}
          disabled={isWorking}
          onPress={() => onAction({ type: "repair" })}
        >
          <MaterialIcons
            name="build"
            size={20}
            color={Palette.white}
            style={styles.buttonIcon}
          />
          <Text style={styles.primaryButtonText}>
            {repairing ? "Repairing…" : "Repair PDF"}
          </Text>
        </Pressable>

        {/* Open Externally */}
        <Pressable
          style={[styles.outlineButton, { borderColor: theme.border.default }]}
          onPress={() => {
            handleOpenExternally();
            onAction({ type: "external" });
          }}
        >
          <MaterialIcons
            name="open-in-new"
            size={20}
            color={theme.text.primary}
            style={styles.buttonIcon}
          />
          <Text
            style={[styles.outlineButtonText, { color: theme.text.primary }]}
          >
            Open Externally
          </Text>
        </Pressable>

        {/* Report */}
        <Pressable
          style={styles.textButton}
          onPress={() => {
            handleReport();
            onAction({ type: "report" });
          }}
        >
          <MaterialIcons
            name="flag"
            size={18}
            color={theme.text.secondary}
            style={styles.buttonIcon}
          />
          <Text
            style={[styles.textButtonLabel, { color: theme.text.secondary }]}
          >
            Report Issue
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  title: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.semibold as any,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  message: {
    fontSize: Typography.size.base,
    textAlign: "center",
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  details: {
    fontSize: Typography.size.sm,
    textAlign: "center",
    marginBottom: Spacing.lg,
    fontStyle: "italic",
    opacity: 0.7,
  },
  workingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  workingText: {
    fontSize: Typography.size.sm,
  },
  actions: {
    width: "100%",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: Palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold as any,
  },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
    borderWidth: 1,
  },
  outlineButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium as any,
  },
  textButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
  },
  textButtonLabel: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium as any,
  },
  buttonIcon: {
    marginRight: Spacing.sm,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
