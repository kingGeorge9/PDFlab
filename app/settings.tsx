/**
 * Settings Screen — Collapsible category layout
 */
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Info,
  Lock,
  Palette,
  Settings,
  User,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { GradientView } from "@/components/GradientView";
import { PINSetupModal } from "@/components/PINGate";
import { SegmentedControl, SettingRow } from "@/components/SettingsUI";
import { VoicePicker } from "@/components/VoicePicker";
import { useTheme } from "@/services/ThemeProvider";
import { clearRecentFiles } from "@/services/fileService";
import { initNotifications } from "@/services/notificationService";
import { removePIN, setupPIN, verifyPIN } from "@/services/pinLockService";
import {
  ImportRetentionDays,
  PageRangeFormat,
  ReadingVoice,
  StartScreen,
  StorageLocation,
  ThemeMode,
  loadSettings,
  useSettings,
} from "@/services/settingsService";
import { getResolvedVoices, getSavedVoiceId, setAutoDetectLanguage, setRate } from "@/services/ttsService";
import type { ResolvedVoice } from "@/services/voiceRegistry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const START_SCREEN_OPTIONS: StartScreen[] = [
  "home",
  "ai",
  "library",
  "tools",
  "downloads",
  "folders",
];

const START_SCREEN_LABELS: Record<StartScreen, string> = {
  home: "Home",
  ai: "AI",
  library: "Library",
  tools: "Tools",
  downloads: "Downloads",
  folders: "Folders",
};

const IMPORT_RETENTION_OPTIONS: ImportRetentionDays[] = [10, 20, 30];

const LABELS = {
  pageFormat: { comma: "1,2,3", dash: "1-3" } as Record<PageRangeFormat, string>,
  voice: {
    system: "System default",
    voice_a: "Voice A",
    voice_b: "Voice B",
  } as Record<ReadingVoice, string>,
  storage: { internal: "App internal", external: "External storage" } as Record<
    StorageLocation,
    string
  >,
};

function cycle<T>(current: T, options: T[]): T {
  return options[(options.indexOf(current) + 1) % options.length];
}

// ─── Collapsible Section Component ────────────────────────────────────────────

interface CategoryProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Category({ title, icon, expanded, onToggle, children }: CategoryProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        catStyles.wrapper,
        expanded && {
          borderWidth: 1,
          borderColor: colors.separator,
          borderRadius: 14,
          overflow: "hidden",
        },
      ]}
    >
      <TouchableOpacity activeOpacity={0.7} onPress={onToggle} style={catStyles.header}>
        <View style={catStyles.headerLeft}>
          {icon}
          <Text style={[catStyles.headerTitle, { color: colors.text }]}>{title}</Text>
        </View>
        {expanded ? (
          <ChevronUp size={18} color={colors.textTertiary} />
        ) : (
          <ChevronDown size={18} color={colors.textTertiary} />
        )}
      </TouchableOpacity>
      {expanded && (
        <View style={catStyles.subGroupContainer}>
          <View style={catStyles.body}>{children}</View>
        </View>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { settings, updateSetting } = useSettings();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const [showPINSetup, setShowPINSetup] = useState(false);
  const [pinMode, setPinMode] = useState<"setup" | "verify" | "change">("setup");
  const pendingScreenLock = useRef<{
    screen: keyof typeof settings.screenLocks;
    value: boolean;
  } | null>(null);
  const [verifyingUnlock, setVerifyingUnlock] = useState(false);

  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [voiceSummary, setVoiceSummary] = useState<string>("System default");

  useEffect(() => {
    (async () => {
      const savedId = getSavedVoiceId();
      if (!savedId) return;
      try {
        const resolved = await getResolvedVoices();
        const match = resolved.find((v) => v.systemId === savedId || v.id === savedId);
        if (match) setVoiceSummary(`${match.displayName} · ${match.accent}`);
      } catch {}
    })();
  }, []);

  const handleVoiceSelected = useCallback((voice: ResolvedVoice) => {
    const parts = [voice.displayName];
    if (voice.accent) parts.push(voice.accent);
    if (voice.gender) parts.push(voice.gender);
    setVoiceSummary(parts.join(" · "));
  }, []);

  const handleEnableAppLock = useCallback(() => {
    if (settings.appLock && settings.pinHash) {
      pendingScreenLock.current = null;
      setPinMode("verify");
      setShowPINSetup(true);
    } else {
      pendingScreenLock.current = null;
      setPinMode("setup");
      setShowPINSetup(true);
    }
  }, [settings.appLock, settings.pinHash]);

  const handleScreenLockToggle = useCallback(
    (screen: keyof typeof settings.screenLocks, value: boolean) => {
      if (!settings.appLock || !settings.pinHash) {
        pendingScreenLock.current = { screen, value };
        setPinMode("setup");
        setShowPINSetup(true);
        return;
      }
      if (value === false) {
        pendingScreenLock.current = { screen, value };
        setVerifyingUnlock(true);
        setPinMode("verify");
        setShowPINSetup(true);
        return;
      }
      updateSetting("screenLocks", { ...settings.screenLocks, [screen]: value });
    },
    [settings, updateSetting],
  );

  const handlePINComplete = useCallback(
    async (pin: string) => {
      setShowPINSetup(false);

      if (pinMode === "setup") {
        const success = await setupPIN(pin);
        if (success) {
          const fresh = await loadSettings();
          updateSetting("appLock", fresh.appLock);
          updateSetting("pinHash", fresh.pinHash);
          if (pendingScreenLock.current) {
            const { screen, value } = pendingScreenLock.current;
            pendingScreenLock.current = null;
            updateSetting("screenLocks", { ...settings.screenLocks, [screen]: value });
          }
          Alert.alert("PIN Set", "App lock has been enabled.");
        } else {
          Alert.alert("Error", "PIN must be 4-6 digits.");
        }
      } else if (pinMode === "verify") {
        if (verifyingUnlock) {
          const result = await verifyPIN(pin);
          if (result.valid) {
            if (pendingScreenLock.current) {
              const { screen, value } = pendingScreenLock.current;
              pendingScreenLock.current = null;
              updateSetting("screenLocks", { ...settings.screenLocks, [screen]: value });
              Alert.alert("Unlocked", "Screen lock has been disabled.");
            }
            setVerifyingUnlock(false);
          } else {
            if (result.locked) {
              Alert.alert(
                "Too Many Attempts",
                `Please try again in ${result.secondsLeft} seconds.`,
              );
            } else {
              Alert.alert(
                "Incorrect PIN",
                `The PIN you entered is incorrect.\n\n${result.attemptsLeft} attempts remaining.`,
              );
            }
            pendingScreenLock.current = null;
            setVerifyingUnlock(false);
          }
        } else {
          await removePIN(pin);
          const fresh = await loadSettings();
          updateSetting("appLock", fresh.appLock);
          updateSetting("pinHash", fresh.pinHash);
          updateSetting("screenLocks", fresh.screenLocks);
          Alert.alert("Disabled", "App lock has been turned off.");
        }
      }
    },
    [pinMode, updateSetting, settings.screenLocks, verifyingUnlock],
  );

  const handleNotificationToggle = useCallback(
    (
      key:
        | "notifyProcessingComplete"
        | "notifyDownloadsComplete"
        | "notifyAIComplete"
        | "notifyReadAloudPlaying"
        | "notifyReadAloudStopped"
        | "notifyReadAloudEndOfFile",
      value: boolean,
    ) => {
      if (value) {
        initNotifications().catch(() => {});
      }
      updateSetting(key, value);
    },
    [updateSetting],
  );

  const handleClearCache = useCallback(() => {
    Alert.alert(
      "Clear Cache",
      "Remove temporary and preview files? Your documents will NOT be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const dir = FileSystem.cacheDirectory;
              if (dir) {
                const items = await FileSystem.readDirectoryAsync(dir);
                for (const item of items)
                  await FileSystem.deleteAsync(dir + item, { idempotent: true });
              }
              Alert.alert("Done", "Cache cleared.");
            } catch {
              Alert.alert("Error", "Failed to clear cache.");
            }
          },
        },
      ],
    );
  }, []);

  const handleClearRecent = useCallback(() => {
    Alert.alert(
      "Clear Recent History",
      "Clear the recently opened list? Files will NOT be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearRecentFiles();
              Alert.alert("Done", "Recent history cleared.");
            } catch {
              Alert.alert("Error", "Failed to clear history.");
            }
          },
        },
      ],
    );
  }, []);

  const handleImportRetentionCycle = useCallback(() => {
    updateSetting(
      "importRetentionDays",
      cycle(settings.importRetentionDays, IMPORT_RETENTION_OPTIONS),
    );
  }, [settings.importRetentionDays, updateSetting]);

  const speedLabel = `${settings.readingSpeed.toFixed(1)}x`;
  const iconSize = 20;
  const iconColor = colors.primary;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.settingsBg }]}>
      {/* Header */}
      <AppHeaderContainer>
        <GradientView
          colors={["#4F46E5", "#7C3AED", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backBtn}
          >
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleArea}>
            <GradientView
              colors={["#4F46E5", "#7C3AED"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.headerPill}
            >
              <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Settings</Text>
            </GradientView>
          </View>
          <View style={styles.headerRight} />
        </GradientView>
      </AppHeaderContainer>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>

        {/* ── 1. Account ── */}
        <Category
          title="Account"
          icon={<User size={iconSize} color={iconColor} />}
          expanded={!!expanded.account}
          onToggle={() => toggle("account")}
        >
          {/* Profile — visible but non-functional (no navigation, no action) */}
          <SettingRow
            title="Profile"
            subtitle={
              settings.auth.isSignedIn
                ? `${settings.auth.name} · ${settings.auth.email}`
                : "Sign in / Create account"
            }
            hideSeparator
          />
          <SettingRow
            title="Premium"
            value={settings.auth.plan === "premium" ? "Premium" : "Free"}
            onPress={() => router.push("/premium" as any)}
            hideSeparator
          />
        </Category>

        {/* ── 2. Appearance ── */}
        <Category
          title="Appearance"
          icon={<Palette size={iconSize} color={iconColor} />}
          expanded={!!expanded.appearance}
          onToggle={() => toggle("appearance")}
        >
          <View style={[rowStyles.themeRow, { backgroundColor: colors.rowBg }]}>
            <Text style={[rowStyles.label, { color: colors.text }]}>Theme</Text>
            <SegmentedControl
              options={THEME_OPTIONS}
              selected={settings.themeMode}
              onChange={(v) => updateSetting("themeMode", v)}
            />
          </View>
        </Category>

        {/* ── 3. General ── */}
        <Category
          title="General"
          icon={<Settings size={iconSize} color={iconColor} />}
          expanded={!!expanded.general}
          onToggle={() => toggle("general")}
        >
          <SettingRow
            title="Confirm before closing file"
            toggle
            toggleValue={settings.confirmBeforeClosing}
            onToggle={(v) => updateSetting("confirmBeforeClosing", v)}
            hideSeparator
          />
          <SettingRow
            title="Auto save changes"
            toggle
            toggleValue={settings.autoSave}
            onToggle={(v) => updateSetting("autoSave", v)}
            hideSeparator
          />
          <SettingRow
            title="Default start screen"
            value={START_SCREEN_LABELS[settings.defaultStartScreen]}
            onPress={() =>
              updateSetting(
                "defaultStartScreen",
                cycle(settings.defaultStartScreen, START_SCREEN_OPTIONS),
              )
            }
            hideSeparator
          />
        </Category>

        {/* ── 4. File & Storage ── */}
        <Category
          title="File & Storage"
          icon={<Database size={iconSize} color={iconColor} />}
          expanded={!!expanded.fileStorage}
          onToggle={() => toggle("fileStorage")}
        >
          <SettingRow
            title="Storage location"
            value={LABELS.storage[settings.storageLocation]}
            subtitle={Platform.OS !== "android" ? "External storage is Android-only" : undefined}
            onPress={() => {
              if (Platform.OS !== "android") {
                Alert.alert("Not Available", "External storage is only available on Android.");
                return;
              }
              updateSetting(
                "storageLocation",
                cycle(settings.storageLocation, ["internal", "external"]),
              );
            }}
            hideSeparator
          />
          <SettingRow
            title="Keep imported files permanently"
            toggle
            toggleValue={settings.keepImportedFiles}
            onToggle={(v) => updateSetting("keepImportedFiles", v)}
            hideSeparator
          />
          {/* Duration picker — only shown when keepImportedFiles is OFF */}
          {!settings.keepImportedFiles && (
            <SettingRow
              title="Auto-delete imported files after"
              value={`${settings.importRetentionDays} days`}
              subtitle="Files will be permanently deleted (not recycled)"
              onPress={handleImportRetentionCycle}
              hideSeparator
            />
          )}
          <SettingRow
            title="Delete behavior"
            subtitle={
              settings.deleteBehavior === "device"
                ? "Delete from device"
                : "Remove from app only"
            }
            value={settings.deleteBehavior === "device" ? "Device" : "App only"}
            onPress={() =>
              updateSetting(
                "deleteBehavior",
                cycle(settings.deleteBehavior, ["app_only", "device"]),
              )
            }
            hideSeparator
          />
          <SettingRow
            title="Clear cache / temp files"
            subtitle="Removes previews and temp artifacts"
            destructive
            onPress={handleClearCache}
            hideSeparator
          />
          <SettingRow
            title="Show file size before processing"
            toggle
            toggleValue={settings.showFileSizeBeforeProcessing}
            onToggle={(v) => updateSetting("showFileSizeBeforeProcessing", v)}
            hideSeparator
          />
          <SettingRow
            title="Recycle Bin"
            subtitle="View deleted files (kept 15 days)"
            onPress={() => router.push("/recycle" as any)}
            hideSeparator
          />
        </Category>

        {/* ── 5. Document Behavior ── */}
        <Category
          title="Document Behavior"
          icon={<FileText size={iconSize} color={iconColor} />}
          expanded={!!expanded.pdfTools}
          onToggle={() => toggle("pdfTools")}
        >
          <SettingRow
            title="Default page range format"
            value={LABELS.pageFormat[settings.defaultPageRangeFormat]}
            onPress={() =>
              updateSetting(
                "defaultPageRangeFormat",
                cycle(settings.defaultPageRangeFormat, ["comma", "dash"]),
              )
            }
            hideSeparator
          />
          <SettingRow
            title="Remember last page"
            subtitle="Reopen files from where you left off"
            toggle
            toggleValue={settings.rememberLastPage}
            onToggle={(v) => updateSetting("rememberLastPage", v)}
            hideSeparator
          />
        </Category>

        {/* ── 6. Accessibility & Reading ── */}
        <Category
          title="Accessibility & Reading"
          icon={<BookOpen size={iconSize} color={iconColor} />}
          expanded={!!expanded.accessibility}
          onToggle={() => toggle("accessibility")}
        >
          <SettingRow
            title="Read aloud (Text-to-speech)"
            toggle
            toggleValue={settings.readAloud}
            onToggle={(v) => updateSetting("readAloud", v)}
            hideSeparator
          />
          <SettingRow
            title="Auto detect language"
            toggle
            toggleValue={settings.autoDetectLanguage}
            onToggle={(v) => {
              updateSetting("autoDetectLanguage", v);
              setAutoDetectLanguage(v);
            }}
            hideSeparator
          />
          <SettingRow
            title="Reading voice"
            subtitle={voiceSummary}
            onPress={() => setShowVoicePicker(true)}
            hideSeparator
          />
          {/* Speed stepper */}
          <View style={[rowStyles.sliderRow, { backgroundColor: colors.rowBg }]}>
            <View style={rowStyles.sliderHeader}>
              <Text style={[rowStyles.label, { color: colors.text }]}>Reading speed</Text>
              <Text style={[rowStyles.speedValue, { color: colors.textSecondary }]}>
                {speedLabel}
              </Text>
            </View>
            <View style={rowStyles.speedStepper}>
              <TouchableOpacity
                style={[
                  rowStyles.stepperBtn,
                  { backgroundColor: colors.settingsBg, borderColor: colors.border },
                ]}
                onPress={() => {
                  const v = Math.max(0.5, Math.round((settings.readingSpeed - 0.1) * 10) / 10);
                  updateSetting("readingSpeed", v);
                  setRate(v);
                }}
              >
                <Text style={[rowStyles.stepperBtnText, { color: colors.text }]}>−</Text>
              </TouchableOpacity>
              <View style={[rowStyles.speedTrack, { backgroundColor: colors.settingsBg }]}>
                <View
                  style={[
                    rowStyles.speedFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${((settings.readingSpeed - 0.5) / 1.5) * 100}%`,
                    },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={[
                  rowStyles.stepperBtn,
                  { backgroundColor: colors.settingsBg, borderColor: colors.border },
                ]}
                onPress={() => {
                  const v = Math.min(2.0, Math.round((settings.readingSpeed + 0.1) * 10) / 10);
                  updateSetting("readingSpeed", v);
                  setRate(v);
                }}
              >
                <Text style={[rowStyles.stepperBtnText, { color: colors.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Category>

        {/* ── 7. Notifications ── */}
        <Category
          title="Notifications"
          icon={<Bell size={iconSize} color={iconColor} />}
          expanded={!!expanded.notifications}
          onToggle={() => toggle("notifications")}
        >
          <SettingRow
            title="Notify when processing completes"
            toggle
            toggleValue={settings.notifyProcessingComplete}
            onToggle={(v) => handleNotificationToggle("notifyProcessingComplete", v)}
            hideSeparator
          />
          <SettingRow
            title="Notify when downloads complete"
            toggle
            toggleValue={settings.notifyDownloadsComplete}
            onToggle={(v) => handleNotificationToggle("notifyDownloadsComplete", v)}
            hideSeparator
          />
          <SettingRow
            title="Notify when AI task completes"
            toggle
            toggleValue={settings.notifyAIComplete}
            onToggle={(v) => handleNotificationToggle("notifyAIComplete", v)}
            hideSeparator
          />
          <SettingRow
            title="Notify when Read Aloud starts playing"
            toggle
            toggleValue={settings.notifyReadAloudPlaying}
            onToggle={(v) => handleNotificationToggle("notifyReadAloudPlaying", v)}
            hideSeparator
          />
          <SettingRow
            title="Notify when Read Aloud is stopped"
            toggle
            toggleValue={settings.notifyReadAloudStopped}
            onToggle={(v) => handleNotificationToggle("notifyReadAloudStopped", v)}
            hideSeparator
          />
          <SettingRow
            title="Notify when Read Aloud reaches end of file"
            toggle
            toggleValue={settings.notifyReadAloudEndOfFile}
            onToggle={(v) => handleNotificationToggle("notifyReadAloudEndOfFile", v)}
            hideSeparator
          />
        </Category>

        {/* ── 8. Security & Privacy ── */}
        <Category
          title="Security & Privacy"
          icon={<Lock size={iconSize} color={iconColor} />}
          expanded={!!expanded.security}
          onToggle={() => toggle("security")}
        >
          <SettingRow
            title="PIN Lock"
            subtitle={settings.appLock ? "Enabled" : "Disabled"}
            value={settings.appLock ? "On" : "Off"}
            onPress={handleEnableAppLock}
            hideSeparator
          />
          {settings.appLock && settings.pinHash.length > 0 && (
            <>
              <SettingRow
                title="Lock Recent Files"
                subtitle="Require PIN to view recent files"
                toggle
                toggleValue={settings.screenLocks.recentFiles}
                onToggle={(v) => handleScreenLockToggle("recentFiles", v)}
                hideSeparator
              />
              <SettingRow
                title="Lock Library"
                subtitle="Require PIN to access Library"
                toggle
                toggleValue={settings.screenLocks.library}
                onToggle={(v) => handleScreenLockToggle("library", v)}
                hideSeparator
              />
              <SettingRow
                title="Lock Download"
                subtitle="Require PIN to access Downloads"
                toggle
                toggleValue={settings.screenLocks.downloads}
                onToggle={(v) => handleScreenLockToggle("downloads", v)}
                hideSeparator
              />
              <SettingRow
                title="Lock Create Files"
                subtitle="Require PIN to create files"
                toggle
                toggleValue={settings.screenLocks.createFiles}
                onToggle={(v) => handleScreenLockToggle("createFiles", v)}
                hideSeparator
              />
              <SettingRow
                title="Lock Share Files"
                subtitle="Require PIN to access Share screen"
                toggle
                toggleValue={settings.screenLocks.shareFiles}
                onToggle={(v) => handleScreenLockToggle("shareFiles", v)}
                hideSeparator
              />
            </>
          )}
          <SettingRow
            title="Hide recent files on home screen"
            toggle
            toggleValue={settings.hideRecentFiles}
            onToggle={(v) => updateSetting("hideRecentFiles", v)}
            hideSeparator
          />
          <SettingRow
            title="Clear recent history"
            subtitle="Clears recently opened list, not your files"
            destructive
            onPress={handleClearRecent}
            hideSeparator
          />
        </Category>

        {/* ── 9. About & Support ── */}
        <Category
          title="About & Support"
          icon={<Info size={iconSize} color={iconColor} />}
          expanded={!!expanded.about}
          onToggle={() => toggle("about")}
        >
          <SettingRow
            title="App version"
            value={Constants.expoConfig?.version ?? "1.0.0"}
            hideSeparator
          />
          <SettingRow
            title="Privacy policy"
            onPress={() => router.push("/privacy-policy")}
            hideSeparator
          />
          <SettingRow
            title="Terms of service"
            onPress={() => router.push("/terms-of-service")}
            hideSeparator
          />
          <SettingRow
            title="Contact support"
            subtitle="support@pdflab.app"
            onPress={() =>
              Linking.openURL("mailto:support@pdflab.app").catch(() =>
                Alert.alert("Cannot open email client"),
              )
            }
          />
          <SettingRow
            title="Rate app"
            onPress={() => Alert.alert("Rate App", "Store link coming soon.")}
            comingSoon
            hideSeparator
          />
        </Category>
      </ScrollView>

      <PINSetupModal
        visible={showPINSetup}
        onComplete={handlePINComplete}
        onCancel={() => {
          setShowPINSetup(false);
          setVerifyingUnlock(false);
          pendingScreenLock.current = null;
        }}
        mode={pinMode}
      />

      <VoicePicker
        visible={showVoicePicker}
        onClose={() => setShowVoicePicker(false)}
        onVoiceSelected={handleVoiceSelected}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    marginRight: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerTitleArea: { flex: 1 },
  headerPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: "hidden",
  },
  headerRight: { width: 36 },
  listContent: { paddingBottom: 40, paddingHorizontal: 12, paddingTop: 12 },
});

const catStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  wrapper: { marginBottom: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { fontSize: 15, fontWeight: "600" },
  subGroupContainer: {},
  body: {},
});

const rowStyles = StyleSheet.create({
  themeRow: { paddingHorizontal: 20, paddingVertical: 14 },
  label: { fontSize: 16, fontWeight: "500", marginBottom: 10 },
  sliderRow: { paddingHorizontal: 20, paddingVertical: 14 },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  speedValue: { fontSize: 14, fontWeight: "600" },
  speedStepper: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 10,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnText: { fontSize: 20, fontWeight: "600", lineHeight: 22 },
  speedTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  speedFill: { height: "100%", borderRadius: 4 },
});
