import { AILogoBadge } from "@/components/AIButton";
import FileTypeOptionsDialog from "@/components/FileTypeOptionsDialog";
import { GradientView } from "@/components/GradientView";
import { PINGate } from "@/components/PINGate";
import { aiFeatures } from "@/constants/ai-features";
import { colors } from "@/constants/theme";
import { useFileIndex } from "@/hooks/useFileIndex";
import {
  createDocxFromCamera,
  createDocxFromImages,
  createPdfFromCamera,
  createPdfFromImages,
  CreationMethod,
  FileType,
  saveFile,
  shareFile as shareCreatedFile,
} from "@/services/fileCreationService";
import {
  FileInfo,
  formatDate,
  formatFileSize,
  getRecentlyOpenedFiles,
  markFileAsCreated,
  markFileAsOpened,
  shareFile,
} from "@/services/fileService";
import { useSettings } from "@/services/settingsService";
import { useTheme } from "@/services/ThemeProvider";
import { perfMark } from "@/utils/perfLogger";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ChevronRight,
  Crown,
  Download,
  File,
  FilePlus,
  FileText,
  Filter,
  FolderOpen,
  Presentation,
  Search,
  Settings,
  Sheet,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Easing,
  Modal,
  Platform,
  Animated as RNAnimated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { GLOBAL_CONTAINER_HEADERS } from "@/constants/featureFlags";

// Combined file type for display - allows both FileInfo and UnifiedFileRecord
interface DisplayFile {
  id: string;
  name: string;
  uri: string;
  size: number;
  type: string;
  mimeType: string;
  lastModified: number;
  dateAdded: number;
  dateModified: number;
  lastOpened?: number;
  source?: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors: t, mode } = useTheme();
  const { settings } = useSettings();
  const primaryColor = t.primary;
  const backgroundColor = t.background;
  const textColor = t.text;
  const iconColor = "#000000";
  // Theme-aware container outline: light in dark mode, darker in light mode
  const containerBorderColor =
    mode === "dark" ? "rgba(255,255,255,0.18)" : "#B0B0B0";

  // Use unified file index for recent files
  const {
    files: allFiles,
    getRecentFiles,
    updateLastOpened: updateFileOpened,
    refresh: refreshIndex,
  } = useFileIndex();

  const [recentFiles, setRecentFiles] = useState<DisplayFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "pdf" | "word" | "epub" | "ppt" | "excel"
  >("all");

  // File type options dialog state
  const [showFileTypeOptions, setShowFileTypeOptions] = useState(false);
  const [fileTypeOptionsFile, setFileTypeOptionsFile] =
    useState<DisplayFile | null>(null);

  // Create file dialog state
  const [showCreateFileDialog, setShowCreateFileDialog] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<FileType | null>(
    null,
  );
  const [showMethodDialog, setShowMethodDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Bento box shrink/dim animation when searching
  const bentoScale = useRef(new RNAnimated.Value(1)).current;
  const bentoOpacity = useRef(new RNAnimated.Value(1)).current;
  const isSearching = searchQuery.trim().length > 0;

  // AI feature text animation — slide in from right, hold, fade out, next slides in
  const aiFeatureIndex = useRef(0);
  const aiSlideAnim = useRef(new RNAnimated.Value(40)).current;
  const aiOpacityAnim = useRef(new RNAnimated.Value(0)).current;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentAIFeature, setCurrentAIFeature] = useState(aiFeatures[0].name);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;

    const runCycle = () => {
      if (cancelled) return;

      const idx = aiFeatureIndex.current % aiFeatures.length;

      // 1. Reset to off-screen + invisible BEFORE touching text
      aiSlideAnim.setValue(40);
      aiOpacityAnim.setValue(0);

      // 2. Swap text while fully invisible
      setCurrentAIFeature(aiFeatures[idx].name);

      // 3. Wait two frames so the native driver commits opacity=0
      //    and React paints the new text before animation begins.
      //    This eliminates the blink/flash before slide-in.
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          if (cancelled) return;

          // 4. Slide in + fade in together
          RNAnimated.parallel([
            RNAnimated.timing(aiSlideAnim, {
              toValue: 0,
              duration: 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            RNAnimated.timing(aiOpacityAnim, {
              toValue: 1,
              duration: 400,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start(({ finished }) => {
            if (!finished || cancelled) return;

            // 5. Hold for 1700ms, then fade out cleanly
            const holdTimer = setTimeout(() => {
              if (cancelled) return;

              RNAnimated.timing(aiOpacityAnim, {
                toValue: 0,
                duration: 400,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }).start(({ finished: fadeDone }) => {
                if (!fadeDone || cancelled) return;
                aiFeatureIndex.current = idx + 1;
                runCycle();
              });
            }, 1700);

            // 6. Store ref so it can be cancelled on unmount
            holdTimerRef.current = holdTimer;
          });
        });
      });
    };

    runCycle();
    return () => {
      cancelled = true;
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Animate bento box shrink + dim when user is searching
  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(bentoScale, {
        toValue: isSearching ? 0.95 : 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      RNAnimated.timing(bentoOpacity, {
        toValue: isSearching ? 0.35 : 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isSearching]);

  // Throttle focus-refresh to avoid spamming AsyncStorage on rapid tab switches
  const lastRefreshRef = useRef(0);
  const REFRESH_THROTTLE_MS = 2000;

  const loadRecentFiles = useCallback(async () => {
    try {
      setLoading(true);
      // Get recent files from unified index (limit 7)
      const recentFromIndex = getRecentFiles(7);

      // Convert UnifiedFileRecord to DisplayFile for display
      const convertedFiles: DisplayFile[] = recentFromIndex.map((f) => ({
        id: f.id,
        name: f.name,
        uri: f.uri,
        size: f.size || 0,
        type: mapFileType(f.type),
        mimeType: f.mimeType || "application/octet-stream",
        lastModified: f.lastOpenedAt,
        dateAdded: f.createdAt,
        dateModified: f.lastOpenedAt,
        lastOpened: f.lastOpenedAt,
        source: f.source,
      }));

      setRecentFiles(convertedFiles);
    } catch (error) {
      console.error("Error loading recent files:", error);
      // Fallback to legacy method if unified index fails
      try {
        const recent = await getRecentlyOpenedFiles(10);
        // Convert FileInfo to DisplayFile
        const convertedLegacy: DisplayFile[] = recent.map((f) => ({
          id: f.id,
          name: f.name,
          uri: f.uri,
          size: f.size,
          type: f.type,
          mimeType: f.mimeType,
          lastModified: f.lastModified,
          dateAdded: f.dateAdded,
          dateModified: f.dateModified,
          lastOpened: f.lastOpened,
          source: f.source,
        }));
        setRecentFiles(convertedLegacy);
      } catch {
        Alert.alert("Error", "Failed to load recent files");
      }
    } finally {
      setLoading(false);
    }
  }, [getRecentFiles]);

  // Load on focus (throttled) and when allFiles changes
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
      lastRefreshRef.current = now;

      const endFocus = perfMark("HomeScreen.focusRefresh");
      refreshIndex().then(() => {
        loadRecentFiles();
        endFocus();
      });
    }, [refreshIndex, loadRecentFiles]),
  );

  // Also update when allFiles changes (e.g., after refresh completes)
  useEffect(() => {
    if (allFiles.length > 0) {
      loadRecentFiles();
    }
  }, [allFiles, loadRecentFiles]);

  // Helper to map unified file type to legacy type
  const mapFileType = (type: string): string => {
    switch (type) {
      case "pdf":
        return "pdf";
      case "docx":
        return "word";
      case "epub":
        return "epub";
      case "ppt":
        return "ppt";
      case "excel":
        return "excel";
      case "image":
        return "image";
      default:
        return "document";
    }
  };

  // Derive filtered files via useMemo — avoids an extra render cycle vs useEffect+setState
  const filteredFiles = useMemo(() => {
    let filtered = recentFiles;

    // Apply file type filter
    if (selectedFilter !== "all") {
      filtered = filtered.filter((file) => file.type === selectedFilter);
    }

    // Apply search query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (file) =>
          file.name.toLowerCase().includes(query) ||
          file.type.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [searchQuery, recentFiles, selectedFilter]);

  // Step 1: User selects file type (PDF or DOCX)
  const handleFileTypeSelection = (fileType: FileType) => {
    setSelectedFileType(fileType);
    setShowCreateFileDialog(false);
    setShowMethodDialog(true);
  };

  // Step 2: User selects creation method
  const handleMethodSelection = async (method: CreationMethod) => {
    setShowMethodDialog(false);
    setIsCreating(true);

    try {
      let result;

      // Execute the appropriate creation function based on file type and method
      if (selectedFileType === "pdf") {
        if (method === "blank") {
          // For blank, we need to show an editor
          router.push("/create-blank-pdf");
          return;
        } else if (method === "image") {
          result = await createPdfFromImages();
        } else if (method === "camera") {
          result = await createPdfFromCamera();
        }
      } else if (selectedFileType === "docx") {
        if (method === "blank") {
          // For blank, we need to show an editor
          router.push("/create-blank-docx");
          return;
        } else if (method === "image") {
          result = await createDocxFromImages();
        } else if (method === "camera") {
          result = await createDocxFromCamera();
        }
      }

      if (result) {
        if (result.success && result.uri) {
          // File created successfully
          Alert.alert("Success", "File created successfully!", [
            {
              text: "Save",
              onPress: async () => {
                await saveFile(selectedFileType!, result.uri!, result.fileName);
                // Track the file as recently created
                await markFileAsCreated(
                  result.uri!,
                  result.fileName || `Document_${Date.now()}`,
                  selectedFileType!,
                );
                await loadRecentFiles();
              },
            },
            {
              text: "Share",
              onPress: async () => {
                await shareCreatedFile(
                  selectedFileType!,
                  result.uri!,
                  result.fileName,
                );
                // Track the file as recently created/shared
                await markFileAsCreated(
                  result.uri!,
                  result.fileName || `Document_${Date.now()}`,
                  selectedFileType!,
                );
                await loadRecentFiles();
              },
            },
            {
              text: "Close",
              style: "cancel",
              onPress: () => loadRecentFiles(),
            },
          ]);
        } else if (result.error) {
          Alert.alert("Error", result.error);
        }
      }
    } catch (error) {
      console.error("File creation error:", error);
      Alert.alert(
        "Error",
        `Failed to create file: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsCreating(false);
      setSelectedFileType(null);
    }
  };

  const handleFilePress = async (file: DisplayFile) => {
    // Update both legacy and unified index
    await markFileAsOpened(file.id);
    await updateFileOpened(file.id);

    // Navigate to appropriate viewer based on file type
    if (file.type === "pdf") {
      router.push({
        pathname: "/pdf-viewer",
        params: {
          uri: file.uri,
          name: file.name,
        },
      });
    } else if (file.type === "word") {
      // Navigate to in-app DOCX viewer
      (router as any).push({
        pathname: "/docx-viewer",
        params: {
          uri: file.uri,
          name: file.name,
        },
      });
    } else if (file.type === "epub") {
      // Navigate to in-app EPUB viewer
      router.push({
        pathname: "/epub-viewer",
        params: {
          uri: file.uri,
          name: file.name,
        },
      });
    } else if (
      ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(
        file.mimeType?.split("/")[1] || "",
      ) ||
      file.type === "image"
    ) {
      router.push({
        pathname: "/image-viewer",
        params: {
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        },
      });
    } else {
      // For other file types, show the file type options dialog
      setFileTypeOptionsFile(file);
      setShowFileTypeOptions(true);
    }
  };

  // Handle quick preview for non-PDF files
  const handleQuickPreview = (file: DisplayFile) => {
    setShowFileTypeOptions(false);
    // Navigate to file details for preview
    router.push({
      pathname: "/file-details",
      params: {
        fileId: file.id,
        fileName: file.name,
        fileUri: file.uri,
        fileSize: String(file.size),
        fileType: file.type,
        fileMimeType: file.mimeType,
        dateAdded: String(file.dateAdded),
        dateModified: String(file.dateModified),
        lastModified: String(file.lastModified),
        lastOpened: file.lastOpened ? String(file.lastOpened) : undefined,
        source: file.source,
      },
    });
  };

  // Handle open in another app
  const handleOpenInOtherApp = async (file: DisplayFile) => {
    setShowFileTypeOptions(false);
    try {
      // Convert to FileInfo format for shareFile function
      const fileInfo: FileInfo = {
        id: file.id,
        name: file.name,
        uri: file.uri,
        size: file.size,
        type: file.type,
        mimeType: file.mimeType,
        lastModified: file.lastModified,
        dateAdded: file.dateAdded,
        dateModified: file.dateModified,
      };
      await shareFile(fileInfo);
    } catch {
      Alert.alert("Error", "Failed to open file in another app");
    }
  };

  // Handle convert to PDF
  const handleConvertToPdf = (file: DisplayFile) => {
    setShowFileTypeOptions(false);
    router.push({
      pathname: "/tool-processor",
      params: {
        tool: "convert",
        fileId: file.id,
        fileName: file.name,
        fileUri: file.uri,
        fileType: file.type,
      },
    });
  };

  const getFileIcon = useCallback((type: string) => {
    switch (type) {
      case "pdf":
        return { Icon: File, color: colors.pdf, bgColor: "#FEE2E2" };
      case "word":
        return { Icon: FileText, color: colors.word, bgColor: "#DBEAFE" };
      case "ppt":
        return { Icon: Presentation, color: colors.ppt, bgColor: "#FFEDD5" };
      case "excel":
        return { Icon: Sheet, color: colors.excel, bgColor: "#D1FAE5" };
      case "epub":
        return { Icon: FileText, color: "#7C3AED", bgColor: "#EDE9FE" };
      default:
        return { Icon: FileText, color: colors.primary, bgColor: "#EEF2FF" };
    }
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      {/* Modern Header with Gradient Effect */}
      <AppHeaderContainer>
        <GradientView
          colors={[
            colors.gradientStart,
            colors.gradientMid,
            colors.gradientEnd,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, GLOBAL_CONTAINER_HEADERS && styles.headerEnhanced]}
        >
          <View style={styles.headerTop}>
            <View
              style={[
                styles.greetingSection,
                GLOBAL_CONTAINER_HEADERS && styles.greetingSectionEnhanced,
              ]}
            >
              <Text style={styles.greetingName}>PDF lab</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/settings" as any)}
              activeOpacity={0.8}
              style={{ marginRight: 6, alignSelf: "flex-start", marginTop: -4 }}
            >
              <Settings color="white" size={30} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Modern Search Bar */}
          <View style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: t.card }]}>
              <Search color={t.primary} size={20} strokeWidth={2.5} />
              <TextInput
                placeholder="Search documents..."
                placeholderTextColor={colors.textTertiary}
                style={[styles.searchInput, { color: t.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              )}
            </View>
            {selectedFilter !== "all" && (
              <View style={styles.filterBadge}>
                <TouchableOpacity
                  onPress={() => setSelectedFilter("all")}
                  style={styles.filterBadgeClose}
                >
                  <Ionicons name="close" size={16} color={colors.error} />
                </TouchableOpacity>
                <View style={styles.filterBadgeIcon}>
                  <Filter color="white" size={14} strokeWidth={2.5} />
                </View>
                <Text style={styles.filterBadgeText}>
                  {selectedFilter === "pdf"
                    ? "PDF Files"
                    : selectedFilter === "word"
                      ? "Word Docs"
                      : selectedFilter === "epub"
                        ? "EPUB Books"
                        : selectedFilter === "excel"
                          ? "Spreadsheets"
                          : selectedFilter === "ppt"
                            ? "Presentations"
                            : selectedFilter}
                </Text>
              </View>
            )}
          </View>
        </GradientView>
      </AppHeaderContainer>

      {/* Content */}
      <PINGate screen="recentFiles">
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Bento Box Quick Actions */}
          <RNAnimated.View
            style={[
              styles.bentoSectionContainer,
              {
                transform: [{ scale: bentoScale }],
                opacity: bentoOpacity,
              },
            ]}
            pointerEvents={isSearching ? "none" : "auto"}
          >
            {/* Bento Grid Layout */}
            <View
              style={[
                styles.bentoBorderContainer,
                { borderColor: containerBorderColor },
              ]}
            >
              <View style={styles.bentoContainer}>
                {/* Row 1: Large Create + Stacked AI/Share */}
                <View style={styles.bentoRow}>
                  {/* Large Create Card - spans 2 rows height */}
                  <TouchableOpacity
                    style={styles.bentoCardLarge}
                    onPress={() => setShowCreateFileDialog(true)}
                    activeOpacity={0.85}
                  >
                    <GradientView
                      colors={[
                        "rgba(70,229,213,1.0)",
                        "rgba(58,213,237,1.0)",
                        "rgba(15,97,130,1.0)",
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.bentoCardLargeGradient}
                    >
                      <View style={styles.bentoLargeIconContainer}>
                        <FilePlus
                          color={iconColor}
                          size={32}
                          strokeWidth={1.8}
                        />
                      </View>
                      <View style={styles.bentoLargeContent}>
                        <Text style={styles.bentoLargeTitle}>Create</Text>
                        {/* <Text style={styles.bentoLargeSubtitle}>
                      New PDF or DOCX
                    </Text> */}
                      </View>
                      <View style={styles.bentoLargeDecor}>
                        <View style={styles.bentoDecorCircle1} />
                        <View style={styles.bentoDecorCircle2} />
                      </View>
                    </GradientView>
                  </TouchableOpacity>

                  {/* Stacked Cards */}
                  <View style={styles.bentoStackedColumn}>
                    {/* AI Card */}
                    <TouchableOpacity
                      style={styles.bentoCardMedium}
                      onPress={() => router.push("/ai")}
                      activeOpacity={0.85}
                    >
                      <GradientView
                        colors={[
                          "rgba(204,165,243,1.0)",
                          "rgba(146,57,229,1.0)",
                          "rgba(27,37,168,1.0)",
                        ]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.bentoCardMediumGradient}
                      >
                        <View style={styles.aiTopRow}>
                          <AILogoBadge size={30} />
                          <Text style={styles.bentoMediumTitle}>xumi AI</Text>
                        </View>
                        <View style={styles.aiFeatureTextArea}>
                          <RNAnimated.Text
                            style={[
                              styles.aiFeatureLabel,
                              {
                                opacity: aiOpacityAnim,
                                transform: [{ translateX: aiSlideAnim }],
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {currentAIFeature}
                          </RNAnimated.Text>
                        </View>
                        <View style={styles.bentoMediumDecor} />
                      </GradientView>
                    </TouchableOpacity>

                    {/* Folders Card */}
                    <TouchableOpacity
                      style={styles.bentoCardMedium}
                      onPress={() => router.push("/folders")}
                      activeOpacity={0.85}
                    >
                      <GradientView
                        colors={["rgba(160,120,80,1.0)", "rgba(120,90,60,1.0)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.bentoCardMediumGradient}
                      >
                        <View style={styles.bentoMediumIconBg}>
                          <FolderOpen
                            color={iconColor}
                            size={18}
                            strokeWidth={2.5}
                          />
                        </View>
                        <Text style={styles.bentoMediumTitle}>Folders</Text>
                        <View style={styles.bentoMediumDecorAlt} />
                      </GradientView>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Row 2: Downloads (wide) + Settings */}
                <View style={styles.bentoRowTwo}>
                  {/* Downloads Card - Wide */}
                  <TouchableOpacity
                    style={styles.bentoCardWide}
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/library",
                        params: { sourceFilter: "downloaded" },
                      })
                    }
                    activeOpacity={0.85}
                  >
                    <GradientView
                      colors={["rgba(10,117,56,1.0)", "rgba(142,244,156,1.0)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.bentoCardWideGradient}
                    >
                      <View style={styles.bentoWideIconRow}>
                        <View
                          style={[
                            styles.bentoWideIconBg,
                            { backgroundColor: "rgba(255,255,255,0.95)" },
                          ]}
                        >
                          <Download
                            color={iconColor}
                            size={18}
                            strokeWidth={2.5}
                          />
                        </View>
                        <View style={styles.bentoWideTextContainer}>
                          <Text style={styles.bentoWideTitle}>Downloads</Text>
                          {/* <Text style={styles.bentoWideSubtitle}>Browse files</Text> */}
                        </View>
                      </View>
                      <View style={styles.bentoWideDecor} />
                    </GradientView>
                  </TouchableOpacity>

                  {/* Premium Card */}
                  <TouchableOpacity
                    style={styles.bentoCardSmall}
                    onPress={() => router.push("/premium" as any)}
                    activeOpacity={0.85}
                  >
                    <GradientView
                      colors={["rgba(255,215,0,1.0)", "rgba(218,165,32,1.0)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.bentoCardSmallGradient}
                    >
                      <View style={styles.bentoSmallIconBg}>
                        <Crown color={iconColor} size={18} strokeWidth={2.5} />
                      </View>
                      <Text style={styles.bentoSmallTitle}>Premium</Text>
                    </GradientView>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </RNAnimated.View>

          {/* Recent Files Section */}
          {!settings.hideRecentFiles && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                  {isSearching ? "Search Results" : "Recent Files"}
                </Text>
              </View>

              {loading ? (
                <View
                  style={[
                    styles.contentBorderContainer,
                    { borderColor: containerBorderColor },
                  ]}
                >
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <Text style={[styles.loadingText, { color: textColor }]}>
                      Loading files...
                    </Text>
                  </View>
                </View>
              ) : filteredFiles.length > 0 ? (
                <View
                  style={[
                    styles.contentBorderContainer,
                    { borderColor: containerBorderColor },
                  ]}
                >
                  <View style={styles.filesContainer}>
                    {filteredFiles.map((file) => (
                      <FileCard
                        key={file.id}
                        file={file}
                        theme={t}
                        textColor={textColor}
                        onPress={handleFilePress}
                        getFileIcon={getFileIcon}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.contentBorderContainer,
                    styles.emptyState,
                    {
                      borderColor: containerBorderColor,
                      backgroundColor: t.card,
                    },
                  ]}
                >
                  <GradientView
                    colors={["#EEF2FF", "#F8FAFC"]}
                    style={styles.emptyIconBox}
                  >
                    <File color={colors.primary} size={48} strokeWidth={1.5} />
                  </GradientView>
                  <Text style={[styles.emptyTitle, { color: textColor }]}>
                    {searchQuery || selectedFilter !== "all"
                      ? "No files found"
                      : "No recent files"}
                  </Text>
                  <Text
                    style={[styles.emptySubtitle, { color: t.textSecondary }]}
                  >
                    {searchQuery || selectedFilter !== "all"
                      ? "Try adjusting your search or filter"
                      : "Create or import documents to get started"}
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={() => router.push("/library")}
                  >
                    <GradientView
                      colors={[colors.gradientStart, colors.gradientMid]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.emptyButtonGradient}
                    >
                      <FolderOpen color="white" size={20} strokeWidth={2} />
                      <Text style={styles.emptyButtonText}>Your Library</Text>
                    </GradientView>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </PINGate>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.filterModal, { backgroundColor: t.card }]}>
            <View
              style={[styles.modalHandle, { backgroundColor: t.textTertiary }]}
            />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                Filter by Type
              </Text>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: t.backgroundSecondary },
                ]}
              >
                <Ionicons name="close" size={24} color={textColor} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterOptions}>
              {[
                {
                  key: "all",
                  label: "All Files",
                  icon: "document",
                  color: t.textSecondary,
                },
                {
                  key: "pdf",
                  label: "PDF Files",
                  icon: "document-text",
                  color: colors.pdf,
                },
                {
                  key: "word",
                  label: "Word Documents",
                  icon: "document",
                  color: colors.word,
                },
                {
                  key: "epub",
                  label: "EPUB Books",
                  icon: "book",
                  color: colors.epub,
                },
                {
                  key: "ppt",
                  label: "Presentations",
                  icon: "easel",
                  color: colors.ppt,
                },
                {
                  key: "excel",
                  label: "Spreadsheets",
                  icon: "grid",
                  color: colors.excel,
                },
              ].map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  style={[
                    styles.filterOption,
                    { backgroundColor: t.backgroundSecondary },
                    selectedFilter === filter.key && {
                      backgroundColor: colors.primaryLight + "15",
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => {
                    setSelectedFilter(filter.key as any);
                    setShowFilterModal(false);
                  }}
                >
                  <View
                    style={[
                      styles.filterIcon,
                      { backgroundColor: `${filter.color}20` },
                    ]}
                  >
                    <Ionicons
                      name={filter.icon as any}
                      size={24}
                      color={filter.color}
                    />
                  </View>
                  <Text style={[styles.filterLabel, { color: textColor }]}>
                    {filter.label}
                  </Text>
                  {selectedFilter === filter.key && (
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* File Type Options Dialog */}
      <FileTypeOptionsDialog
        visible={showFileTypeOptions}
        file={fileTypeOptionsFile as FileInfo | null}
        onClose={() => {
          setShowFileTypeOptions(false);
          setFileTypeOptionsFile(null);
        }}
        onQuickPreview={(f) => handleQuickPreview(f as DisplayFile)}
        onOpenInOtherApp={(f) => handleOpenInOtherApp(f as DisplayFile)}
        onConvertToPdf={(f) => handleConvertToPdf(f as DisplayFile)}
      />

      {/* Step 1: Create File Type Selection Dialog */}
      <Modal
        visible={showCreateFileDialog}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateFileDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.filterModal, { backgroundColor: t.card }]}>
            <View
              style={[styles.modalHandle, { backgroundColor: t.textTertiary }]}
            />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                Create New File
              </Text>
              <TouchableOpacity
                onPress={() => setShowCreateFileDialog(false)}
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: t.backgroundSecondary },
                ]}
              >
                <Ionicons name="close" size={24} color={textColor} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: t.textSecondary }]}>
              Choose the type of file you want to create
            </Text>

            <View style={styles.filterOptions}>
              {[
                {
                  key: "pdf",
                  label: "PDF Document",
                  description: "Create a portable document",
                  icon: "document-text",
                  color: colors.pdf,
                },
                {
                  key: "docx",
                  label: "Word Document",
                  description: "Create an editable document",
                  icon: "document",
                  color: colors.word,
                },
              ].map((fileType) => (
                <TouchableOpacity
                  key={fileType.key}
                  style={[
                    styles.filterOption,
                    { backgroundColor: t.backgroundSecondary },
                  ]}
                  onPress={() =>
                    handleFileTypeSelection(fileType.key as FileType)
                  }
                >
                  <View
                    style={[
                      styles.filterIcon,
                      { backgroundColor: `${fileType.color}20` },
                    ]}
                  >
                    <Ionicons
                      name={fileType.icon as any}
                      size={24}
                      color={fileType.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filterLabel, { color: textColor }]}>
                      {fileType.label}
                    </Text>
                    <Text
                      style={[
                        styles.filterDescription,
                        { color: t.textSecondary },
                      ]}
                    >
                      {fileType.description}
                    </Text>
                  </View>
                  <ChevronRight
                    color={colors.textTertiary}
                    size={20}
                    strokeWidth={2.5}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Step 2: Creation Method Selection Dialog */}
      <Modal
        visible={showMethodDialog}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMethodDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.filterModal, { backgroundColor: t.card }]}>
            <View
              style={[styles.modalHandle, { backgroundColor: t.textTertiary }]}
            />
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowMethodDialog(false);
                  setShowCreateFileDialog(true);
                }}
                style={[
                  styles.modalBackButton,
                  { backgroundColor: t.backgroundSecondary },
                ]}
              >
                <Ionicons name="arrow-back" size={24} color={textColor} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: textColor, flex: 1 }]}>
                Choose Method
              </Text>
              <TouchableOpacity
                onPress={() => setShowMethodDialog(false)}
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: t.backgroundSecondary },
                ]}
              >
                <Ionicons name="close" size={24} color={textColor} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: t.textSecondary }]}>
              How do you want to create your{" "}
              {selectedFileType === "pdf" ? "PDF" : "document"}?
            </Text>

            <View style={styles.filterOptions}>
              {[
                {
                  key: "blank",
                  label: "From Blank",
                  description: "Start with an empty document",
                  icon: "document-outline",
                  color: colors.primary,
                },
                {
                  key: "image",
                  label: "From Images",
                  description: "Select images from your gallery",
                  icon: "images-outline",
                  color: colors.secondary,
                },
                {
                  key: "camera",
                  label: "From Camera",
                  description: "Capture with your camera",
                  icon: "camera-outline",
                  color: "#EC4899",
                },
              ].map((method) => (
                <TouchableOpacity
                  key={method.key}
                  style={[
                    styles.filterOption,
                    { backgroundColor: t.backgroundSecondary },
                  ]}
                  onPress={() =>
                    handleMethodSelection(method.key as CreationMethod)
                  }
                  disabled={isCreating}
                >
                  <View
                    style={[
                      styles.filterIcon,
                      { backgroundColor: `${method.color}20` },
                    ]}
                  >
                    <Ionicons
                      name={method.icon as any}
                      size={24}
                      color={method.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filterLabel, { color: textColor }]}>
                      {method.label}
                    </Text>
                    <Text
                      style={[
                        styles.filterDescription,
                        { color: t.textSecondary },
                      ]}
                    >
                      {method.description}
                    </Text>
                  </View>
                  <ChevronRight
                    color={colors.textTertiary}
                    size={20}
                    strokeWidth={2.5}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}
      {isCreating && (
        <Modal visible transparent animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={[styles.loadingCard, { backgroundColor: t.card }]}>
              <ActivityIndicator size="large" color={t.primary} />
              <Text style={[styles.loadingCardText, { color: t.text }]}>
                Creating file...
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// MEMOIZED FILE CARD (avoids re-rendering all cards on list change)
// ============================================================================
interface FileCardProps {
  file: DisplayFile;
  theme: any;
  textColor: string;
  onPress: (file: DisplayFile) => void;
  getFileIcon: (type: string) => {
    Icon: any;
    color: string;
    bgColor: string;
  };
}

const FileCard = React.memo(function FileCard({
  file,
  theme,
  textColor,
  onPress,
  getFileIcon,
}: FileCardProps) {
  const { Icon, color, bgColor } = getFileIcon(file.type);
  const handlePress = useCallback(() => onPress(file), [file, onPress]);

  return (
    <TouchableOpacity
      style={[
        styles.modernFileCard,
        { backgroundColor: theme.card, borderColor: theme.borderLight },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.fileIconBox, { backgroundColor: bgColor }]}>
        <Icon color={color} size={22} strokeWidth={2} />
      </View>
      <View style={styles.fileContent}>
        <Text
          style={[styles.modernFileName, { color: textColor }]}
          numberOfLines={1}
        >
          {file.name}
        </Text>
        <View style={styles.fileMetaRow}>
          <Text style={[styles.modernFileMeta, { color: theme.textSecondary }]}>
            {formatFileSize(file.size)}
          </Text>
          <View style={styles.metaDot} />
          <Text style={[styles.modernFileMeta, { color: theme.textSecondary }]}>
            {formatDate(file.lastOpened || file.dateAdded)}
          </Text>
        </View>
      </View>
      <View style={styles.fileArrow}>
        <ChevronRight color={theme.textTertiary} size={18} strokeWidth={2.5} />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Modern Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  // Extra top breathing room + symmetric corners when GLOBAL_CONTAINER_HEADERS is on.
  headerEnhanced: {
    paddingTop: 28,
  },
  // Subtle right-shift for "PDF Lab" title inside the card.
  greetingSectionEnhanced: {
    paddingLeft: 6,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  greetingSection: {
    flex: 1,
  },
  greetingText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  greetingName: {
    fontSize: 29,
    lineHeight: 34,
    fontFamily: Platform.select({
      ios: "Century Gothic",
      android: "Montserrat_400Regular",
      default: "Century Gothic",
    }),
    fontWeight: "800",
    color: "white",
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  premiumHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.5)",
  },
  premiumHeaderBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFD700",
    letterSpacing: 0.2,
  },

  // Modern Search
  searchContainer: {
    gap: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  filterBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  filterBadgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  filterBadgeText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  filterBadgeClose: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Section
  sectionContainer: {
    marginTop: 18,
    paddingHorizontal: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginLeft: 15,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 3,
    fontWeight: "500",
  },
  sectionLink: {
    fontSize: 15,
    fontWeight: "700",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  // Bento Section wrapper (wider than default sectionContainer)
  bentoSectionContainer: {
    marginTop: 18,
    paddingHorizontal: 10,
  },

  // Bento Box Layout
  bentoBorderContainer: {
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 18,
    padding: 10,
    marginBottom: 15,
  },
  bentoContainer: {
    gap: 9,
  },
  bentoRow: {
    flexDirection: "row",
    gap: 9,
    height: 142,
  },
  bentoRowTwo: {
    flexDirection: "row",
    gap: 9,
    height: 66,
  },
  bentoRowThree: {
    flexDirection: "row",
    gap: 9,
    height: 76,
  },
  bentoStackedColumn: {
    flex: 1.3,
    gap: 9,
  },

  // Large Card (Create)
  bentoCardLarge: {
    flex: 0.9,
    borderRadius: 15,
    overflow: "hidden",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  bentoCardLargeGradient: {
    flex: 1,
    padding: 20,
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
  },
  bentoLargeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  bentoLargeContent: {
    gap: 4,
  },
  bentoLargeTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "white",
    letterSpacing: -0.5,
  },
  bentoLargeSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  bentoLargeDecor: {
    position: "absolute",
    right: -30,
    top: -30,
  },
  bentoDecorCircle1: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
    position: "absolute",
  },
  bentoDecorCircle2: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
    position: "absolute",
    top: 50,
    left: 50,
  },

  // Medium Cards (Library, Share)
  bentoCardMedium: {
    flex: 1,
    borderRadius: 13,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  bentoCardMediumGradient: {
    flex: 1,
    padding: 10,
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
  },
  bentoMediumTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
    marginTop: 4,
  },
  aiTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aiFeatureTextArea: {
    height: 20,
    overflow: "hidden",
    justifyContent: "center",
    marginTop: 2,
  },
  aiFeatureLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.2,
  },
  bentoMediumIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  bentoMediumDecor: {
    position: "absolute",
    left: 40,
    bottom: -10,
    width: 60,
    height: 60,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  bentoMediumDecorAlt: {
    position: "absolute",
    right: -5,
    top: 5,
    width: 45,
    height: 45,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  // Small Cards (Downloads, Settings)
  bentoCardSmall: {
    flex: 0.8,
    borderRadius: 15,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  bentoCardSmallGradient: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  bentoSmallTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "white",
  },
  bentoSmallIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  bentoCardSettingsInner: {
    flex: 1,
    borderRadius: 18,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
  },

  // Wide Card (Downloads)
  bentoCardWide: {
    flex: 2.0,
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  bentoCardWideGradient: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
  },
  bentoWideIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bentoWideIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  bentoWideTextContainer: {
    gap: 2,
  },
  bentoWideTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "white",
  },
  bentoWideSubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  bentoWideDecor: {
    position: "absolute",
    right: -40,
    bottom: -50,
    width: 100,
    height: 100,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  // Legacy Quick Actions (kept for compatibility)
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  modernActionCard: {
    flex: 1,
    minWidth: "46%",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  modernActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  modernActionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  modernActionSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },

  // Files Container
  contentBorderContainer: {
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 10,
    overflow: "hidden",
  },
  filesContainer: {
    gap: 8,
  },
  modernFileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  fileContent: {
    flex: 1,
    marginLeft: 12,
  },
  modernFileName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 3,
  },
  fileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  modernFileMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.borderDark,
    marginHorizontal: 6,
  },
  fileArrow: {
    marginLeft: 6,
  },

  // Empty State
  loadingContainer: {
    paddingVertical: 64,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: "600",
  },
  emptyState: {
    borderRadius: 24,
    padding: 48,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyIconBox: {
    width: 88,
    height: 88,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  emptyButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 16,
    gap: 10,
  },
  emptyButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "flex-end",
  },
  filterModal: {
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderDark,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
    marginTop: -8,
    lineHeight: 20,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  filterOptions: {
    gap: 10,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    gap: 14,
  },
  filterIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  filterLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  filterDescription: {
    fontSize: 13,
    marginTop: 3,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    borderRadius: 24,
    padding: 40,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  loadingCardText: {
    marginTop: 20,
    fontSize: 17,
    fontWeight: "700",
  },
});
