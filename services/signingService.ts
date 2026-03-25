/**
 * Signing API Service
 * Frontend service layer for all signing API calls.
 * Adapted for React Native (uses fetch + FormData).
 */

import { API_ENDPOINTS } from "@/config/api";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Apply a visual (non-cryptographic) signature to a PDF.
 * @returns URI of the signed PDF file
 */
export async function applyVisualSignature(params: {
  fileUri: string;
  fileName: string;
  signatureImage: string | null;
  placement: {
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
  };
  signerName?: string;
  date?: string;
  reason?: string;
  showDate?: boolean;
  showName?: boolean;
}): Promise<{ uri: string; fileName: string }> {
  const {
    fileUri,
    fileName,
    signatureImage,
    placement,
    signerName,
    date,
    reason,
    showDate = true,
    showName = false,
  } = params;

  const form = new FormData();

  // Append PDF file
  form.append("pdf", {
    uri: fileUri,
    name: fileName || "document.pdf",
    type: "application/pdf",
  } as any);

  form.append("placement", JSON.stringify(placement));
  if (signatureImage) form.append("signatureImage", signatureImage);
  if (signerName) form.append("signerName", signerName);
  if (date) form.append("date", date);
  if (reason) form.append("reason", reason);
  form.append("showDate", String(showDate));
  form.append("showName", String(showName));

  const response = await fetch(API_ENDPOINTS.SIGNING.VISUAL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: "Visual signing failed." }));
    throw new Error(err.error || "Visual signing failed.");
  }

  // Save the response blob to a file
  const blob = await response.blob();
  const outputName = `signed_${fileName || "document.pdf"}`;
  const outputUri = `${FileSystem.cacheDirectory}${outputName}`;

  const reader = new FileReader();
  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  await FileSystem.writeAsStringAsync(outputUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri: outputUri, fileName: outputName };
}

/**
 * Apply a cryptographic digital signature to a PDF.
 * @returns URI of the signed PDF file
 */
export async function applyDigitalSignature(params: {
  fileUri: string;
  fileName: string;
  certificateUri: string;
  certificateName: string;
  password: string;
  visible?: boolean;
  placement?: {
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
  };
  signerName?: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
  signatureImage?: string | null;
}): Promise<{ uri: string; fileName: string }> {
  const {
    fileUri,
    fileName,
    certificateUri,
    certificateName,
    password,
    visible = true,
    placement,
    signerName,
    reason,
    location,
    contactInfo,
    signatureImage,
  } = params;

  const form = new FormData();

  form.append("pdf", {
    uri: fileUri,
    name: fileName || "document.pdf",
    type: "application/pdf",
  } as any);

  form.append("certificate", {
    uri: certificateUri,
    name: certificateName || "cert.p12",
    type: "application/x-pkcs12",
  } as any);

  form.append("password", password);
  form.append("visible", String(visible));

  if (visible && placement) form.append("placement", JSON.stringify(placement));
  if (signerName) form.append("signerName", signerName);
  if (reason) form.append("reason", reason);
  if (location) form.append("location", location);
  if (contactInfo) form.append("contactInfo", contactInfo);
  if (signatureImage) form.append("signatureImage", signatureImage);

  const response = await fetch(API_ENDPOINTS.SIGNING.DIGITAL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: "Digital signing failed." }));
    const error = new Error(err.error || "Digital signing failed.");
    (error as any).code = err.code;
    throw error;
  }

  const blob = await response.blob();
  const outputName = `digitally_signed_${fileName || "document.pdf"}`;
  const outputUri = `${FileSystem.cacheDirectory}${outputName}`;

  const reader = new FileReader();
  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  await FileSystem.writeAsStringAsync(outputUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri: outputUri, fileName: outputName };
}

/**
 * Verify digital signatures in a PDF.
 */
export async function verifySignatures(fileUri: string, fileName: string) {
  const form = new FormData();
  form.append("pdf", {
    uri: fileUri,
    name: fileName || "document.pdf",
    type: "application/pdf",
  } as any);

  const response = await fetch(API_ENDPOINTS.SIGNING.VERIFY, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: "Verification failed." }));
    throw new Error(err.error || "Verification failed.");
  }

  return response.json();
}
