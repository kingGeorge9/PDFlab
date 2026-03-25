/**
 * Terms of Service Screen
 */
import { useRouter } from "expo-router";
import React from "react";

import LegalDocument from "@/components/LegalDocument";
import {
  TERMS_OF_SERVICE_LAST_UPDATED,
  TERMS_OF_SERVICE_SECTIONS,
  TERMS_OF_SERVICE_SUBTITLE,
  TERMS_OF_SERVICE_TITLE,
} from "@/constants/legal/termsOfService";

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <LegalDocument
      title={TERMS_OF_SERVICE_TITLE}
      subtitle={TERMS_OF_SERVICE_SUBTITLE}
      lastUpdated={TERMS_OF_SERVICE_LAST_UPDATED}
      sections={TERMS_OF_SERVICE_SECTIONS}
      onBack={() => router.back()}
    />
  );
}
