/**
 * SignatureModal.tsx
 *
 * Full-screen modal with a signature canvas.
 * Uses react-native-signature-canvas (which itself uses a WebView).
 */

import React, { useCallback, useRef } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import SignatureCanvas from "react-native-signature-canvas";
import { useDocument } from "../DocumentContext";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SignatureModal({ visible, onClose }: Props) {
  const { sendScript } = useDocument();
  const signRef = useRef<any>(null);

  const handleSignature = useCallback(
    (signature: string) => {
      // signature comes as data:image/png;base64,...
      const base64 = signature.replace("data:image/png;base64,", "");
      sendScript(`insertSignature('${base64}');`);
      onClose();
    },
    [sendScript, onClose],
  );

  const handleClear = useCallback(() => {
    signRef.current?.clearSignature();
  }, []);

  const handleConfirm = useCallback(() => {
    signRef.current?.readSignature();
  }, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Signature</Text>
          <TouchableOpacity onPress={handleConfirm}>
            <Text style={styles.confirmText}>Insert</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Draw your signature below</Text>

        <View style={styles.signatureWrap}>
          <SignatureCanvas
            ref={signRef}
            onOK={handleSignature}
            onEmpty={() => {}}
            descriptionText=""
            clearText=""
            confirmText=""
            webStyle={`
              .m-signature-pad { box-shadow: none; border: none; }
              .m-signature-pad--footer { display: none; }
              .m-signature-pad--body { border: none; }
              body { margin: 0; }
              canvas { width: 100% !important; height: 260px !important; border: none; }
            `}
            style={styles.signature}
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingTop: 48,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#212121" },
  cancelText: { fontSize: 15, color: "#757575" },
  confirmText: { fontSize: 15, color: "#1976D2", fontWeight: "700" },
  hint: {
    textAlign: "center",
    color: "#9E9E9E",
    fontSize: 13,
    marginTop: 16,
  },
  signatureWrap: {
    flex: 1,
    margin: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FAFAFA",
  },
  signature: { flex: 1 },
  footer: { padding: 20, alignItems: "center" },
  clearBtn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
  },
  clearText: { color: "#555", fontSize: 15 },
});
