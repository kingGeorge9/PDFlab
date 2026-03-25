/**
 * Profile Screen — Auth scaffold (mock)
 */
import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { useTheme } from "@/services/ThemeProvider";
import { useSettings } from "@/services/settingsService";
import { useRouter } from "expo-router";
import { ArrowLeft, User } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { settings, updateAuth } = useSettings();
  const { auth } = settings;

  const [name, setName] = useState(auth.name);
  const [email, setEmail] = useState(auth.email);

  const handleSignIn = async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert("Required", "Please enter your name and email.");
      return;
    }
    await updateAuth({
      isSignedIn: true,
      name: name.trim(),
      email: email.trim(),
    });
    Alert.alert("Signed In", `Welcome, ${name.trim()}!`);
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await updateAuth({ isSignedIn: false, name: "", email: "" });
          setName("");
          setEmail("");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <AppHeaderContainer>
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
            Profile
          </Text>
          <View style={styles.headerRight} />
        </View>
      </AppHeaderContainer>

      <View style={styles.content}>
        {/* Avatar placeholder */}
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <User size={48} color={colors.textTertiary} />
        </View>

        {auth.isSignedIn ? (
          <>
            <Text style={[styles.name, { color: colors.text }]}>
              {auth.name}
            </Text>
            <Text style={[styles.email, { color: colors.textSecondary }]}>
              {auth.email}
            </Text>
            <View
              style={[
                styles.planBadge,
                {
                  backgroundColor:
                    auth.plan === "premium"
                      ? colors.primary
                      : colors.backgroundSecondary,
                },
              ]}
            >
              <Text
                style={[
                  styles.planText,
                  {
                    color:
                      auth.plan === "premium" ? "#fff" : colors.textSecondary,
                  },
                ]}
              >
                {auth.plan === "premium" ? "Premium" : "Free Plan"}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.error }]}
              onPress={handleSignOut}
            >
              <Text style={styles.btnText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.text }]}>Name</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={[styles.label, { color: colors.text }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={handleSignIn}
            >
              <Text style={styles.btnText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                {
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.primary,
                },
              ]}
              onPress={handleSignIn}
            >
              <Text style={[styles.btnText, { color: colors.primary }]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </>
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
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  name: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  email: { fontSize: 15, marginBottom: 12 },
  planBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 32,
  },
  planText: { fontSize: 13, fontWeight: "700" },
  label: {
    alignSelf: "flex-start",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  btn: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
