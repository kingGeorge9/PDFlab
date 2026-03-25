/**
 * MediaModals.tsx
 *
 * Picture (Gallery), Camera, and Attachment modals for the editor.
 * Uses expo-image-picker for image selection and expo-document-picker
 * for attachments.
 */

import type { ImagePickerOptions, ImagePickerResult } from "expo-image-picker";
import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useDocument } from "../DocumentContext";

// ── Picture / Camera Modal ─────────────────────────────────────────────────

interface PictureModalProps {
  visible: boolean;
  onClose: () => void;
  mode?: "gallery" | "camera";
}

export function PictureModal({
  visible,
  onClose,
  mode = "gallery",
}: PictureModalProps) {
  const { sendScript } = useDocument();
  const hasLaunched = useRef(false);

  const pickImage = useCallback(async () => {
    try {
      // Dynamic import to avoid crashes if modules not yet available
      const ImagePicker = await import("expo-image-picker");

      const options: ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
        allowsEditing: false,
      };

      let result: ImagePickerResult;

      if (mode === "camera") {
        // Request camera permissions first
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Denied",
            "Camera access is required to take photos.",
          );
          onClose();
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Denied",
            "Photo library access is required to pick images.",
          );
          onClose();
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (result.canceled || !result.assets?.[0]) {
        onClose();
        return;
      }

      const asset = result.assets[0];
      const base64 = asset.base64;
      const mimeType = asset.mimeType || "image/jpeg";

      if (base64) {
        // Chunk the base64 string to avoid JS string limits in injectJavaScript.
        // IMPORTANT: use window.__imgChunks (global) because sendScript wraps
        // each call in an IIFE — a local `var` would be garbage-collected
        // between calls, breaking the chunked build.
        const chunkSize = 50000;
        if (base64.length > chunkSize) {
          sendScript(`window.__imgChunks = [];`);
          for (let i = 0; i < base64.length; i += chunkSize) {
            const chunk = base64.substring(i, i + chunkSize);
            sendScript(`window.__imgChunks.push('${chunk}');`);
          }
          sendScript(
            `insertImage(window.__imgChunks.join(''), '${mimeType}'); window.__imgChunks = null;`,
          );
        } else {
          sendScript(`insertImage('${base64}', '${mimeType}');`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Error", "Could not pick image: " + msg);
    }
    onClose();
  }, [mode, sendScript, onClose]);

  useEffect(() => {
    if (visible && !hasLaunched.current) {
      hasLaunched.current = true;
      pickImage();
    }
    if (!visible) {
      hasLaunched.current = false;
    }
  }, [visible, pickImage]);

  return null; // No UI — auto-launches picker
}

// ── Attachment Modal ───────────────────────────────────────────────────────

interface AttachmentModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AttachmentModal({ visible, onClose }: AttachmentModalProps) {
  const { sendScript } = useDocument();
  const hasLaunched = useRef(false);

  const pickAttachment = useCallback(async () => {
    try {
      const DocumentPicker = await import("expo-document-picker");

      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        onClose();
        return;
      }

      const asset = result.assets[0];
      const name = (asset.name || "attachment").replace(/'/g, "\\'");
      const uri = asset.uri;

      sendScript(`insertAttachment('${name}', '${uri}');`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancel")) {
        Alert.alert("Error", "Could not pick file: " + msg);
      }
    }
    onClose();
  }, [sendScript, onClose]);

  useEffect(() => {
    if (visible && !hasLaunched.current) {
      hasLaunched.current = true;
      pickAttachment();
    }
    if (!visible) {
      hasLaunched.current = false;
    }
  }, [visible, pickAttachment]);

  return null;
}
