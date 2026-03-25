/**
 * PINGate & PINSetupModal
 * PIN interface with light/dark mode support.
 *
 * PINGate: wraps content behind a PIN screen when a screen is locked.
 * PINSetupModal: full-screen modal for create/verify/change PIN flows.
 */
import { GradientView } from "@/components/GradientView";
import { useTheme } from "@/services/ThemeProvider";
import {
  getLockoutRemaining,
  verifyPIN,
  type VerifyResult,
} from "@/services/pinLockService";
import {
  useSettings,
  type ScreenLockSettings,
} from "@/services/settingsService";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Delete as DeleteIcon,
  Lock,
  ShieldCheck,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_W } = Dimensions.get("window");
const MAX_PIN = 4;

// ── Key sizing — compact so it fits all devices ─────────────────────────────
const KEY_GAP = 8;
const KEY_SIZE = Math.min(Math.floor((SCREEN_W - 60 - KEY_GAP * 2) / 3), 54);

// ── Theme-aware colour palettes ─────────────────────────────────────────────

interface PinColors {
  bgPrimary: string;
  bgTertiary: string;
  accentPrimary: string;
  accentSecondary: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  success: string;
  error: string;
  errorBg: string;
  errorBorder: string;
}

function usePinColors(): PinColors {
  const { mode, colors } = useTheme();
  return useMemo(
    () =>
      mode === "dark"
        ? {
            bgPrimary: "#0a0e16",
            bgTertiary: "#1c2333",
            accentPrimary: "#3b82f6",
            accentSecondary: "#60a5fa",
            textPrimary: "#f8fafc",
            textSecondary: "#94a3b8",
            border: "#2d3748",
            success: "#10b981",
            error: "#ef4444",
            errorBg: "rgba(239,68,68,0.10)",
            errorBorder: "rgba(239,68,68,0.20)",
          }
        : {
            bgPrimary: colors.background,
            bgTertiary: colors.card,
            accentPrimary: "#3b82f6",
            accentSecondary: "#60a5fa",
            textPrimary: colors.text,
            textSecondary: colors.textSecondary,
            border: colors.border,
            success: colors.success,
            error: colors.error,
            errorBg: "rgba(239,68,68,0.08)",
            errorBorder: "rgba(239,68,68,0.18)",
          },
    [mode, colors],
  );
}

// ── Shared PIN pad renderer ───────────────────────────────────────────────────

interface PadProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  pin: string;
  error: string;
  statusType: "error" | "success" | "";
  onDigit: (d: string) => void;
  onDelete: () => void;
  onBack: () => void;
  shakeAnim: Animated.Value;
  colors: PinColors;
  bottomActions?: React.ReactNode;
}

function PINPad({
  icon,
  title,
  subtitle,
  pin,
  error,
  statusType,
  onDigit,
  onDelete,
  onBack,
  shakeAnim,
  colors: c,
  bottomActions,
}: PadProps) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <View style={s.padWrapper}>
      {/* ── Back button ── */}
      <TouchableOpacity
        style={[
          s.backBtn,
          { borderColor: c.border, backgroundColor: c.bgTertiary },
        ]}
        onPress={onBack}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ArrowLeft color={c.textSecondary} size={20} strokeWidth={2} />
      </TouchableOpacity>

      {/* ── Icon ── */}
      <View style={[s.iconBox, { shadowColor: c.accentPrimary }]}>
        <GradientView
          colors={[c.accentPrimary, c.accentSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.iconGradient}
        >
          {icon}
        </GradientView>
      </View>

      {/* ── Header ── */}
      <Text style={[s.title, { color: c.textPrimary }]}>{title}</Text>
      <Text style={[s.subtitle, { color: c.textSecondary }]}>{subtitle}</Text>

      {/* ── Dots ── */}
      <Animated.View
        style={[s.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
      >
        {Array.from({ length: MAX_PIN }).map((_, i) => {
          const filled = i < pin.length;
          const isError = statusType === "error" && pin.length === 0;
          const isSuccess = statusType === "success";
          return (
            <View
              key={i}
              style={[
                s.dot,
                { backgroundColor: c.bgTertiary, borderColor: c.border },
                filled && {
                  backgroundColor: c.accentPrimary,
                  borderColor: c.accentPrimary,
                  shadowColor: c.accentPrimary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 12,
                  elevation: 4,
                },
                isError && { backgroundColor: c.error, borderColor: c.error },
                isSuccess && {
                  backgroundColor: c.success,
                  borderColor: c.success,
                  shadowColor: c.success,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 12,
                  elevation: 4,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      {/* ── Keypad ── */}
      <View style={s.keypad}>
        {keys.map((k, idx) => {
          if (k === "") return <View key={idx} style={s.keyEmpty} />;
          if (k === "⌫") {
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  s.key,
                  {
                    backgroundColor: c.errorBg,
                    borderColor: c.errorBorder,
                  },
                ]}
                onPress={onDelete}
                activeOpacity={0.7}
              >
                <DeleteIcon color={c.error} size={20} strokeWidth={2} />
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={idx}
              style={[
                s.key,
                { backgroundColor: c.bgTertiary, borderColor: c.border },
              ]}
              onPress={() => onDigit(k)}
              activeOpacity={0.7}
            >
              <Text style={[s.keyText, { color: c.textPrimary }]}>{k}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Bottom actions ── */}
      {bottomActions}

      {/* ── Status message ── */}
      {error !== "" && (
        <Text
          style={[
            s.status,
            statusType === "error" && { color: c.error },
            statusType === "success" && { color: c.success },
          ]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

// ── Shake helper ──────────────────────────────────────────────────────────────

function triggerShake(anim: Animated.Value) {
  Animated.sequence([
    Animated.timing(anim, { toValue: -8, duration: 60, useNativeDriver: true }),
    Animated.timing(anim, { toValue: 8, duration: 60, useNativeDriver: true }),
    Animated.timing(anim, { toValue: -8, duration: 60, useNativeDriver: true }),
    Animated.timing(anim, { toValue: 0, duration: 60, useNativeDriver: true }),
  ]).start();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PINGate — wraps screen content behind a PIN wall
// PERF: Split into thin wrapper + heavy inner component so the common
// "not locked" path avoids initializing PIN pad state entirely.
// ═══════════════════════════════════════════════════════════════════════════════

interface PINGateProps {
  screen: keyof ScreenLockSettings;
  children: React.ReactNode;
}

export function PINGate({ screen, children }: PINGateProps) {
  const { settings } = useSettings();
  const isLocked =
    settings.appLock &&
    settings.pinHash.length > 0 &&
    settings.screenLocks[screen] === true;

  // Fast path: no PIN configured — render children immediately with zero overhead
  if (!isLocked) return <>{children}</>;

  return <PINGateInner>{children}</PINGateInner>;
}

/** Heavy inner component — only mounted when the screen is actually locked */
function PINGateInner({ children }: { children: React.ReactNode }) {
  const c = usePinColors();
  const router = useRouter();

  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [statusType, setStatusType] = useState<"error" | "success" | "">("");
  const [lockedOut, setLockedOut] = useState(false);
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Check for existing lockout on mount
  React.useEffect(() => {
    if (unlocked) return;
    getLockoutRemaining().then((secs) => {
      if (secs > 0) {
        setLockedOut(true);
        setStatusType("error");
        setError(`Too many attempts. Try again in ${secs}s`);
        startLockoutCountdown(secs);
      }
    });
    return () => {
      if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    };
  }, [unlocked]);

  const startLockoutCountdown = useCallback((secs: number) => {
    let remaining = secs;
    if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    lockoutTimer.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (lockoutTimer.current) clearInterval(lockoutTimer.current);
        setLockedOut(false);
        setError("");
        setStatusType("");
      } else {
        setError(`Too many attempts. Try again in ${remaining}s`);
      }
    }, 1000);
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= MAX_PIN || lockedOut) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = pin + digit;
      setPin(next);
      setError("");
      setStatusType("");

      if (next.length === MAX_PIN) {
        verifyPIN(next).then((result: VerifyResult) => {
          if (result.valid) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setStatusType("success");
            setError("PIN verified successfully!");
            setTimeout(() => setUnlocked(true), 400);
          } else if (result.locked) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            triggerShake(shakeAnim);
            setLockedOut(true);
            setStatusType("error");
            setError(
              `Too many attempts. Try again in ${result.secondsLeft ?? 30}s`,
            );
            startLockoutCountdown(result.secondsLeft ?? 30);
            setTimeout(() => setPin(""), 300);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            triggerShake(shakeAnim);
            setStatusType("error");
            setError(
              result.attemptsLeft === 1
                ? "Wrong PIN. 1 attempt left before lockout."
                : `Wrong PIN. ${result.attemptsLeft ?? "?"} attempts left.`,
            );
            setTimeout(() => setPin(""), 300);
          }
        });
      }
    },
    [pin, lockedOut, shakeAnim, startLockoutCountdown],
  );

  const handleDelete = useCallback(() => {
    if (pin.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setPin((p) => p.slice(0, -1));
    setError("");
    setStatusType("");
  }, [pin]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
  }, [router]);

  if (unlocked) return <>{children}</>;

  return (
    <View style={[s.fullScreen, { backgroundColor: c.bgPrimary }]}>
      <SafeAreaView style={[s.container, { backgroundColor: c.bgPrimary }]}>
        <PINPad
          icon={<Lock color="#fff" size={24} strokeWidth={2} />}
          title="Enter PIN"
          subtitle="Enter your 4-digit PIN to continue"
          pin={pin}
          error={error}
          statusType={statusType}
          onDigit={handleDigit}
          onDelete={handleDelete}
          onBack={handleBack}
          shakeAnim={shakeAnim}
          colors={c}
        />
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PINSetupModal — full-screen modal for create / verify / change PIN
// ═══════════════════════════════════════════════════════════════════════════════

interface PINSetupProps {
  visible: boolean;
  onComplete: (pin: string) => void;
  onCancel: () => void;
  mode: "setup" | "verify" | "change";
}

export function PINSetupModal({
  visible,
  onComplete,
  onCancel,
  mode,
}: PINSetupProps) {
  const c = usePinColors();
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [statusType, setStatusType] = useState<"error" | "success" | "">("");
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const title =
    mode === "setup"
      ? step === "enter"
        ? "Create PIN"
        : "Confirm PIN"
      : mode === "verify"
        ? "Enter PIN"
        : "Enter Current PIN";

  const subtitle =
    mode === "setup"
      ? step === "enter"
        ? "Enter a 4-digit PIN"
        : "Re-enter your PIN to confirm"
      : "Enter your PIN to continue";

  const resetState = useCallback(() => {
    setPin("");
    setFirstPin("");
    setStep("enter");
    setError("");
    setStatusType("");
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= MAX_PIN) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = pin + digit;
      setPin(next);
      setError("");
      setStatusType("");

      if (next.length === MAX_PIN) {
        if (mode === "verify" || (mode === "change" && step === "enter")) {
          verifyPIN(next).then((result: VerifyResult) => {
            if (result.valid) {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              setStatusType("success");
              setError("PIN verified successfully!");
              setTimeout(() => {
                onComplete(next);
                resetState();
              }, 400);
            } else if (result.locked) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              triggerShake(shakeAnim);
              setStatusType("error");
              setError(`Locked out. Try again in ${result.secondsLeft ?? 30}s`);
              setTimeout(() => setPin(""), 300);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              triggerShake(shakeAnim);
              setStatusType("error");
              setError(
                result.attemptsLeft === 1
                  ? "Wrong PIN. 1 attempt left."
                  : `Wrong PIN. ${result.attemptsLeft ?? "?"} attempts left.`,
              );
              setTimeout(() => setPin(""), 300);
            }
          });
        } else if (mode === "setup" && step === "confirm") {
          if (next === firstPin) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setStatusType("success");
            setError("PIN set successfully!");
            setTimeout(() => {
              onComplete(next);
              resetState();
            }, 400);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            triggerShake(shakeAnim);
            setStatusType("error");
            setError("PINs do not match. Try again.");
            setTimeout(() => setPin(""), 300);
          }
        }
      }
    },
    [pin, step, firstPin, mode, onComplete, resetState, shakeAnim],
  );

  const handleConfirm = useCallback(() => {
    if (pin.length < MAX_PIN) return;
    if (mode === "setup" && step === "enter") {
      setFirstPin(pin);
      setPin("");
      setStep("confirm");
      setError("");
      setStatusType("");
    }
  }, [pin, mode, step]);

  const handleDelete = useCallback(() => {
    if (pin.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setPin((p) => p.slice(0, -1));
    setError("");
    setStatusType("");
  }, [pin]);

  const handleCancel = useCallback(() => {
    resetState();
    onCancel();
  }, [resetState, onCancel]);

  if (!visible) return null;

  const showConfirmBtn = mode === "setup" && step === "enter";

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        s.modalOverlay,
        { backgroundColor: c.bgPrimary },
      ]}
    >
      <SafeAreaView style={[s.container, { backgroundColor: c.bgPrimary }]}>
        <PINPad
          icon={<ShieldCheck color="#fff" size={24} strokeWidth={2} />}
          title={title}
          subtitle={subtitle}
          pin={pin}
          error={error}
          statusType={statusType}
          onDigit={handleDigit}
          onDelete={handleDelete}
          onBack={handleCancel}
          shakeAnim={shakeAnim}
          colors={c}
          bottomActions={
            <View style={s.actions}>
              <TouchableOpacity
                style={[
                  s.actionBtn,
                  s.cancelBtn,
                  { backgroundColor: c.bgTertiary, borderColor: c.border },
                ]}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <Text style={[s.cancelBtnText, { color: c.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              {showConfirmBtn && (
                <TouchableOpacity
                  style={[
                    s.actionBtn,
                    pin.length < MAX_PIN ? s.confirmBtnDisabled : undefined,
                  ]}
                  onPress={handleConfirm}
                  activeOpacity={pin.length < MAX_PIN ? 1 : 0.7}
                  disabled={pin.length < MAX_PIN}
                >
                  <GradientView
                    colors={
                      pin.length < MAX_PIN
                        ? [c.bgTertiary, c.bgTertiary]
                        : [c.accentPrimary, c.accentSecondary]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.confirmGradient}
                  >
                    <Text
                      style={[
                        s.confirmBtnText,
                        pin.length < MAX_PIN && { opacity: 0.5 },
                      ]}
                    >
                      Confirm
                    </Text>
                  </GradientView>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Styles — layout only; colours applied inline via usePinColors()
// ═══════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  // ── Layout ──
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  container: {
    flex: 1,
  },
  modalOverlay: {
    zIndex: 999,
  },
  padWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  // ── Back button ──
  backBtn: {
    position: "absolute",
    top: 40,
    left: 25,
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  // ── Icon ──
  iconBox: {
    marginBottom: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  iconGradient: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Header ──
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 25,
    textAlign: "center",
  },

  // ── Dots ──
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
    justifyContent: "center",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },

  // ── Keypad ──
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: KEY_GAP,
    maxWidth: KEY_SIZE * 3 + KEY_GAP * 2,
    marginBottom: 12,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  keyEmpty: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  keyText: {
    fontSize: 22,
    fontWeight: "500",
    ...Platform.select({
      ios: { fontFamily: "Menlo" },
      android: { fontFamily: "monospace" },
    }),
  },

  // ── Bottom actions ──
  actions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    paddingHorizontal: 4,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  cancelBtn: {
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "500",
  },
  confirmGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#fff",
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },

  // ── Status ──
  status: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
});
