/**
 * Page Management Screen
 * Allows users to delete, rotate, and reorder PDF pages
 */

import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type PageAction = "delete" | "rotate" | "extract";

interface PageState {
  selected: boolean;
  rotation: number; // 0, 90, 180, 270
}

export default function ManagePagesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    uri?: string;
    fileName?: string;
    totalPages?: string;
  }>();
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "tint");
  const secondaryBg = useThemeColor(
    { light: "#f5f5f5", dark: "#1f1f1f" },
    "background",
  );

  const totalPages = parseInt(params.totalPages || "0", 10);
  const [pageStates, setPageStates] = useState<Map<number, PageState>>(
    new Map(
      Array.from({ length: totalPages }, (_, i) => [
        i + 1,
        { selected: false, rotation: 0 },
      ]),
    ),
  );
  const [selectedAction, setSelectedAction] = useState<PageAction>("delete");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);

  const selectedPages = Array.from(pageStates.entries())
    .filter(([_, state]) => state.selected)
    .map(([page]) => page);

  const togglePageSelection = useCallback((pageNumber: number) => {
    setPageStates((prev) => {
      const newMap = new Map(prev);
      const currentState = newMap.get(pageNumber);
      if (currentState) {
        newMap.set(pageNumber, {
          ...currentState,
          selected: !currentState.selected,
        });
      }
      return newMap;
    });
  }, []);

  const selectAllPages = useCallback(() => {
    setPageStates((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((state, page) => {
        newMap.set(page, { ...state, selected: true });
      });
      return newMap;
    });
  }, []);

  const deselectAllPages = useCallback(() => {
    setPageStates((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((state, page) => {
        newMap.set(page, { ...state, selected: false });
      });
      return newMap;
    });
  }, []);

  const rotatePage = useCallback((pageNumber: number, degrees: number) => {
    setPageStates((prev) => {
      const newMap = new Map(prev);
      const currentState = newMap.get(pageNumber);
      if (currentState) {
        newMap.set(pageNumber, {
          ...currentState,
          rotation: (currentState.rotation + degrees) % 360,
        });
      }
      return newMap;
    });
  }, []);

  const rotateSelectedPages = useCallback(
    (degrees: number) => {
      setPageStates((prev) => {
        const newMap = new Map(prev);
        selectedPages.forEach((page) => {
          const currentState = newMap.get(page);
          if (currentState) {
            newMap.set(page, {
              ...currentState,
              rotation: (currentState.rotation + degrees) % 360,
            });
          }
        });
        return newMap;
      });
      setShowRotateModal(false);
    },
    [selectedPages],
  );

  const handleDeletePages = useCallback(async () => {
    if (selectedPages.length === 0) {
      Alert.alert("No Pages Selected", "Please select pages to delete");
      return;
    }

    if (selectedPages.length === totalPages) {
      Alert.alert("Error", "Cannot delete all pages");
      return;
    }

    Alert.alert(
      "Delete Pages",
      `Delete ${selectedPages.length} page${selectedPages.length > 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setShowSaveOptions(true);
          },
        },
      ],
    );
  }, [selectedPages, totalPages]);

  const handleRotatePages = useCallback(async () => {
    if (selectedPages.length === 0) {
      Alert.alert("No Pages Selected", "Please select pages to rotate");
      return;
    }

    setShowRotateModal(true);
  }, [selectedPages]);

  const handleExtractPages = useCallback(async () => {
    if (selectedPages.length === 0) {
      Alert.alert("No Pages Selected", "Please select pages to extract");
      return;
    }

    setShowSaveOptions(true);
  }, [selectedPages]);

  const executeAction = useCallback(
    async (saveAsNew: boolean) => {
      if (!params.uri) {
        Alert.alert("Error", "No PDF source provided");
        return;
      }

      try {
        setIsProcessing(true);
        setShowSaveOptions(false);
        setProcessingStatus("Preparing PDF...");

        // PDF page management functionality has been removed
        Alert.alert(
          "Unavailable",
          "PDF page management is not available in this version.",
        );
        setIsProcessing(false);
        setProcessingStatus("");
      } catch {
        Alert.alert("Error", "An unexpected error occurred");
      } finally {
        setIsProcessing(false);
        setProcessingStatus("");
      }
    },
    [params, router],
  );

  const actions = [
    {
      id: "delete" as PageAction,
      icon: "trash-outline" as const,
      label: "Delete Pages",
      color: "#ef4444",
      onPress: handleDeletePages,
    },
    {
      id: "rotate" as PageAction,
      icon: "reload-outline" as const,
      label: "Rotate Pages",
      color: "#3b82f6",
      onPress: handleRotatePages,
    },
    {
      id: "extract" as PageAction,
      icon: "copy-outline" as const,
      label: "Extract Pages",
      color: "#10b981",
      onPress: handleExtractPages,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Manage Pages</Text>
          <Text style={styles.headerSubtitle}>
            {selectedPages.length} of {totalPages} selected
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={selectedPages.length > 0 ? deselectAllPages : selectAllPages}
        >
          <Ionicons
            name={selectedPages.length > 0 ? "close" : "checkbox-outline"}
            size={24}
            color="white"
          />
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={[styles.actionsBar, { backgroundColor: secondaryBg }]}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={[
              styles.actionButton,
              selectedAction === action.id && {
                backgroundColor: `${action.color}20`,
                borderColor: action.color,
              },
            ]}
            onPress={() => {
              setSelectedAction(action.id);
              action.onPress();
            }}
          >
            <Ionicons name={action.icon} size={24} color={action.color} />
            <Text style={[styles.actionLabel, { color: textColor }]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Page Grid */}
      <ScrollView contentContainerStyle={styles.pageGrid}>
        {Array.from({ length: totalPages }, (_, i) => {
          const pageNumber = i + 1;
          const state = pageStates.get(pageNumber);
          const isSelected = state?.selected || false;
          const rotation = state?.rotation || 0;

          return (
            <TouchableOpacity
              key={pageNumber}
              style={[
                styles.pageCard,
                { backgroundColor: secondaryBg },
                isSelected && {
                  borderColor: primaryColor,
                  borderWidth: 3,
                },
              ]}
              onPress={() => togglePageSelection(pageNumber)}
            >
              {/* Page Preview (Placeholder) */}
              <View
                style={[
                  styles.pagePreview,
                  { transform: [{ rotate: `${rotation}deg` }] },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={48}
                  color={textColor}
                  style={{ opacity: 0.3 }}
                />
                {rotation !== 0 && (
                  <View
                    style={[
                      styles.rotationBadge,
                      { backgroundColor: primaryColor },
                    ]}
                  >
                    <Text style={styles.rotationText}>{rotation}°</Text>
                  </View>
                )}
              </View>

              {/* Page Number */}
              <Text
                style={[
                  styles.pageNumber,
                  { color: textColor },
                  isSelected && { color: primaryColor, fontWeight: "700" },
                ]}
              >
                Page {pageNumber}
              </Text>

              {/* Selection Indicator */}
              {isSelected && (
                <View
                  style={[styles.checkmark, { backgroundColor: primaryColor }]}
                >
                  <Ionicons name="checkmark" size={16} color="white" />
                </View>
              )}

              {/* Quick Rotate */}
              <TouchableOpacity
                style={[styles.quickRotate, { backgroundColor: secondaryBg }]}
                onPress={(e) => {
                  e.stopPropagation();
                  rotatePage(pageNumber, 90);
                }}
              >
                <Ionicons
                  name="reload-outline"
                  size={16}
                  color={primaryColor}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View
            style={[styles.processingCard, { backgroundColor: secondaryBg }]}
          >
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={[styles.processingText, { color: textColor }]}>
              {processingStatus || "Processing..."}
            </Text>
          </View>
        </View>
      )}

      {/* Rotate Modal */}
      <Modal
        visible={showRotateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRotateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.rotateModal, { backgroundColor }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>
              Rotate {selectedPages.length} Page
              {selectedPages.length > 1 ? "s" : ""}
            </Text>
            <View style={styles.rotateOptions}>
              {[90, 180, 270].map((degrees) => (
                <TouchableOpacity
                  key={degrees}
                  style={[
                    styles.rotateOption,
                    { backgroundColor: secondaryBg },
                  ]}
                  onPress={() => rotateSelectedPages(degrees)}
                >
                  <Ionicons
                    name="reload-outline"
                    size={32}
                    color={primaryColor}
                  />
                  <Text style={[styles.rotateOptionText, { color: textColor }]}>
                    {degrees}°
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: secondaryBg }]}
              onPress={() => setShowRotateModal(false)}
            >
              <Text style={[styles.cancelButtonText, { color: textColor }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Save Options Modal */}
      <Modal
        visible={showSaveOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSaveOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.saveModal, { backgroundColor }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>
              Save Changes
            </Text>
            <TouchableOpacity
              style={[styles.saveOption, { backgroundColor: secondaryBg }]}
              onPress={() => executeAction(false)}
            >
              <Ionicons name="save-outline" size={24} color={primaryColor} />
              <View style={styles.saveOptionText}>
                <Text style={[styles.saveOptionTitle, { color: textColor }]}>
                  Save
                </Text>
                <Text
                  style={[
                    styles.saveOptionDesc,
                    { color: textColor, opacity: 0.6 },
                  ]}
                >
                  Overwrite original file
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveOption, { backgroundColor: secondaryBg }]}
              onPress={() => executeAction(true)}
            >
              <Ionicons
                name="duplicate-outline"
                size={24}
                color={primaryColor}
              />
              <View style={styles.saveOptionText}>
                <Text style={[styles.saveOptionTitle, { color: textColor }]}>
                  Save As
                </Text>
                <Text
                  style={[
                    styles.saveOptionDesc,
                    { color: textColor, opacity: 0.6 },
                  ]}
                >
                  Create a new copy
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: secondaryBg }]}
              onPress={() => setShowSaveOptions(false)}
            >
              <Text style={[styles.cancelButtonText, { color: textColor }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 2,
  },
  actionsBar: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  pageGrid: {
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  pageCard: {
    width: "47%",
    aspectRatio: 0.7,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 12,
    position: "relative",
  },
  pagePreview: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pageNumber: {
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  quickRotate: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  rotationBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rotationText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  processingCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 16,
  },
  processingText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  rotateModal: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  rotateOptions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  rotateOption: {
    flex: 1,
    alignItems: "center",
    padding: 20,
    borderRadius: 12,
    gap: 8,
  },
  rotateOptionText: {
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  saveModal: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  saveOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  saveOptionText: {
    flex: 1,
  },
  saveOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  saveOptionDesc: {
    fontSize: 13,
  },
});
