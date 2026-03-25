/**
 * Privacy Policy Screen
 */
import { useRouter } from "expo-router";
import React from "react";

import LegalDocument from "@/components/LegalDocument";
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_SUBTITLE,
  PRIVACY_POLICY_TITLE,
} from "@/constants/legal/privacyPolicy";

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <LegalDocument
      title={PRIVACY_POLICY_TITLE}
      subtitle={PRIVACY_POLICY_SUBTITLE}
      lastUpdated={PRIVACY_POLICY_LAST_UPDATED}
      sections={PRIVACY_POLICY_SECTIONS}
      onBack={() => router.back()}
    />
  );
}
