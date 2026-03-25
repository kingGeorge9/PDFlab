/**
 * PDF Research & Study Library Downloads Screen
 * Search and download books from Project Gutenberg, Open Library, and PubMed Central
 */
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Library,
  Link,
  Search,
  Share2,
  Trash2,
  X,
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
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeaderContainer } from "@/components/AppHeaderContainer";
import { GradientView } from "@/components/GradientView";
import { PINGate } from "@/components/PINGate";
import { colors, shadows } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import { upsertFileRecord } from "@/services/fileIndexService";
import { notifyDownloadComplete } from "@/services/notificationService";

import {
  arxivAdapter,
  classifyOptions,
  DownloadItem,
  downloadManager,
  DownloadProgress,
  downloadsStore,
  filterByRelevance,
  filterFailedResults,
  gutenbergAdapter,
  LibrarySource,
  openLibraryAdapter,
  pmcAdapter,
  recordFailure,
  SearchResult,
  warmFailureCache,
  zenodoAdapter,
} from "@/src/services/library";

// ============================================================================
// CONSTANTS
// ============================================================================
const DEBOUNCE_DELAY = 500;

type TabType = "search" | "downloads";

// Helper function to extract domain from URL for error messages
function extractDomainFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

const SOURCE_INFO: Record<
  LibrarySource,
  { label: string; icon: React.ReactNode; description: string }
> = {
  gutenberg: {
    label: "Gutenberg",
    icon: <BookOpen size={16} color={colors.primary} />,
    description: "60,000+ available classic ebooks",
  },
  openlibrary: {
    label: "Open Library",
    icon: <Library size={16} color={colors.secondary} />,
    description: "Public domain books (PDF only)",
  },
  arxiv: {
    label: "arXiv",
    icon: <FileText size={16} color={colors.primary} />,
    description: "2M+ papers in CS, AI, Math, Physics, Engineering",
  },
  core: {
    label: "CORE",
    icon: <FileText size={16} color={colors.primary} />,
    description: "276M+ research papers from 14K+ repositories",
  },
  zenodo: {
    label: "Zenodo",
    icon: <Library size={16} color={colors.secondary} />,
    description: "Research from CERN - papers, datasets, presentations",
  },
  courtlistener: {
    label: "CourtListener",
    icon: <BookOpen size={16} color={colors.primary} />,
    description: "US court cases - requires free API token (courtlistener.com)",
  },
  pmc: {
    label: "PubMed Central",
    icon: <GraduationCap size={16} color={colors.accent} />,
    description: "8M+ medical research papers (PDF only)",
  },
  doaj: {
    label: "DOAJ",
    icon: <FileText size={16} color={colors.primary} />,
    description: "Directory of Open Access Journals",
  },
  europepmc: {
    label: "Europe PMC",
    icon: <GraduationCap size={16} color={colors.accent} />,
    description: "40M+ life science papers and patents",
  },
};

/**
 * Sources whose PDFs are hosted on the source's own servers (direct download).
 * Others link to third-party repositories / publishers (external link).
 */
const DIRECT_DOWNLOAD_SOURCES: ReadonlySet<LibrarySource> = new Set([
  "gutenberg",
  "arxiv",
  "zenodo",
  "pmc",
]);

// ============================================================================
// Hoisted key extractors (stable references)
// ============================================================================
const searchKeyExtractor = (item: SearchResult) => `${item.source}_${item.id}`;
const downloadKeyExtractor = (item: DownloadItem) => item.id;

// ============================================================================
// COMPONENT
// ============================================================================
export default function DownloadsScreen() {
  const { colors: t } = useTheme();
  const backgroundColor = t.background;
  const { tab } = useLocalSearchParams<{ tab?: string }>();

  // State
  const [query, setQuery] = useState("");
  const [selectedSource, setSelectedSource] =
    useState<LibrarySource>("gutenberg");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(
    tab === "downloads" ? "downloads" : "search",
  );
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(
    new Map(),
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  // Refs
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update active tab when navigating with tab param
  useEffect(() => {
    if (tab === "downloads") {
      setActiveTab("downloads");
    }
  }, [tab]);

  // Load downloads on mount and update downloaded IDs
  useEffect(() => {
    loadDownloads();
    warmFailureCache(); // Pre-warm the URL failure cache
  }, []);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Update downloaded IDs whenever downloads change
  useEffect(() => {
    const ids = new Set(downloads.map((d) => d.id));
    setDownloadedIds(ids);
  }, [downloads]);

  // ============================================================================
  // DATA LOADING
  // ============================================================================
  const loadDownloads = useCallback(async () => {
    try {
      const items = await downloadsStore.getSortedByDate();
      setDownloads(items);
    } catch (error) {
      console.error("Error loading downloads:", error);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadDownloads();
    setIsRefreshing(false);
  }, [loadDownloads]);

  // ============================================================================
  // SEARCH
  // ============================================================================
  const handleSearch = useCallback(async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      let results: SearchResult[] = [];

      switch (selectedSource) {
        case "gutenberg":
          results = await gutenbergAdapter.search(trimmedQuery);
          break;
        case "openlibrary":
          results = await openLibraryAdapter.search(trimmedQuery);
          break;
        case "arxiv":
          results = await arxivAdapter.search(trimmedQuery);
          break;
        case "zenodo":
          results = await zenodoAdapter.search(trimmedQuery);
          break;
        case "pmc":
          results = await pmcAdapter.search(trimmedQuery);
          break;
      }

      // Filter out URLs that recently failed
      results = filterFailedResults(results);

      // Rank by relevance and drop low-quality matches
      results = filterByRelevance(trimmedQuery, results);

      setSearchResults(results);

      if (results.length === 0) {
        setSearchError(
          "No downloadable materials found. Try a different search term.",
        );
      }
    } catch (error) {
      console.error("Search error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      // Surface actionable messages from adapters; fall back to generic text
      if (
        msg.includes("requires a free API token") ||
        msg.includes("API token is invalid") ||
        msg.includes("rate limit") ||
        msg.includes("API key")
      ) {
        setSearchError(msg);
      } else {
        setSearchError(
          "Search failed. Please check your connection and try again.",
        );
      }
    } finally {
      setIsSearching(false);
    }
  }, [query, selectedSource]);

  // Debounced search on query change
  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (text.trim().length >= 3) {
        searchTimeoutRef.current = setTimeout(() => {
          handleSearch();
        }, DEBOUNCE_DELAY);
      } else {
        setSearchResults([]);
        setSearchError(null);
      }
    },
    [handleSearch],
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setQuery("");
    setSearchResults([]);
    setSearchError(null);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  }, []);

  // ============================================================================
  // DOWNLOADS
  // ============================================================================
  const handleDownload = useCallback(
    async (result: SearchResult, optionIndex: number) => {
      const option = result.downloadOptions[optionIndex];
      const downloadId = `${result.source}_${result.id}`;

      // Check if already downloading
      if (downloadingIds.has(downloadId)) {
        return;
      }

      // Check if already downloaded
      if (downloadedIds.has(downloadId)) {
        Alert.alert(
          "Already Downloaded",
          "This item is already in your downloads.",
        );
        return;
      }

      // Mark as downloading
      setDownloadingIds((prev) => new Set(prev).add(downloadId));

      try {
        const downloadItem = await downloadManager.download(
          result,
          option,
          (progress: DownloadProgress) => {
            setDownloadProgress((prev) =>
              new Map(prev).set(downloadId, progress.progress),
            );
          },
        );

        // Save to store
        await downloadsStore.add(downloadItem);

        // Register with unified file index so it appears in Library's "downloaded" category
        await upsertFileRecord({
          uri: downloadItem.localUri,
          name: `${downloadItem.title}.${downloadItem.fileType}`,
          extension: downloadItem.fileType,
          mimeType:
            downloadItem.fileType === "pdf"
              ? "application/pdf"
              : "application/epub+zip",
          size: downloadItem.fileSize,
          sourceTags: ["downloaded"],
          source: "downloaded",
        });

        // Update downloads list
        await loadDownloads();

        // Clear progress
        setDownloadProgress((prev) => {
          const newMap = new Map(prev);
          newMap.delete(downloadId);
          return newMap;
        });

        notifyDownloadComplete(downloadItem.title);
        Alert.alert("Success", "Downloaded successfully!");
      } catch (error) {
        console.error("Download error:", error);

        // Parse error message to check if user cancelled
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("cancelled by user")) {
          // User cancelled - no need to show error
          return;
        }

        // ── Determine failure reason & record in cache ───────────
        const sourceUrl = result.sourceUrl || option.url;
        const domain = extractDomainFromUrl(option.url);

        const openInBrowser = {
          text: "Open in Browser",
          onPress: () => Linking.openURL(sourceUrl),
        };

        if (errorMsg.includes("webpage") || errorMsg.includes("HTML page")) {
          await recordFailure(option.url, "not_pdf");
          Alert.alert(
            "Not a Downloadable File",
            `This link is a webpage, not a downloadable file.${domain ? `\n\nYou can view it on ${domain}.` : ""}`,
            [{ text: "Cancel", style: "cancel" }, openInBrowser],
          );
        } else if (
          errorMsg.includes("not available") ||
          errorMsg.includes("failed to connect") ||
          errorMsg.includes("network")
        ) {
          await recordFailure(option.url, "network");
          Alert.alert(
            "Download Not Available",
            `This file isn't available for direct download right now.${domain ? `\n\nTry opening it on ${domain} instead.` : "\n\nPlease check your connection."}`,
            [{ text: "Cancel", style: "cancel" }, openInBrowser],
          );
        } else if (errorMsg.includes("paywall") || errorMsg.includes("login")) {
          await recordFailure(option.url, "paywall");
          Alert.alert(
            "Access Required",
            `This file requires login or is behind a paywall.${domain ? `\n\nVisit ${domain} to access it directly.` : ""}`,
            [{ text: "Cancel", style: "cancel" }, openInBrowser],
          );
        } else {
          await recordFailure(option.url, "unavailable");
          Alert.alert(
            "Download Failed",
            "Could not download the file. You can try opening the source page in your browser.",
            [{ text: "Cancel", style: "cancel" }, openInBrowser],
          );
        }
      } finally {
        setDownloadingIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(downloadId);
          return newSet;
        });
        setDownloadProgress((prev) => {
          const newMap = new Map(prev);
          newMap.delete(downloadId);
          return newMap;
        });
      }
    },
    [downloadingIds, downloadedIds, loadDownloads],
  );

  const handleCancelDownload = useCallback(async (downloadId: string) => {
    try {
      await downloadManager.cancelDownload(downloadId);

      // Clear the download state
      setDownloadingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(downloadId);
        return newSet;
      });
      setDownloadProgress((prev) => {
        const newMap = new Map(prev);
        newMap.delete(downloadId);
        return newMap;
      });
    } catch (error) {
      console.error("Cancel download error:", error);
    }
  }, []);

  const handleDelete = useCallback(
    (item: DownloadItem) => {
      Alert.alert(
        "Delete Download",
        `Are you sure you want to delete "${item.title}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await downloadManager.deleteDownload(item);
                await downloadsStore.remove(item.id);
                await loadDownloads();
              } catch (error) {
                console.error("Delete error:", error);
                Alert.alert("Error", "Failed to delete the file.");
              }
            },
          },
        ],
      );
    },
    [loadDownloads],
  );

  const handleShare = useCallback(async (item: DownloadItem) => {
    try {
      await downloadManager.shareFile(item);
    } catch (error) {
      console.error("Share error:", error);
      Alert.alert("Error", "Sharing is not available.");
    }
  }, []);

  const handleOpen = useCallback(
    (item: DownloadItem) => {
      if (item.fileType === "pdf") {
        router.push({
          pathname: "/pdf-viewer",
          params: {
            uri: item.localUri,
            name: item.title,
          },
        });
      } else if (item.fileType === "epub") {
        // Open EPUB in internal viewer — same as Library and Recent
        router.push({
          pathname: "/epub-viewer",
          params: {
            uri: item.localUri,
            name: item.title,
          },
        });
      } else {
        // Unknown type — offer share
        Alert.alert(
          "Open File",
          "This file type is not directly supported. You can share it to open with another app.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Share", onPress: () => handleShare(item) },
          ],
        );
      }
    },
    [handleShare],
  );

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  const renderSourceButton = useCallback(
    (source: LibrarySource) => {
      const info = SOURCE_INFO[source];
      const isActive = selectedSource === source;

      return (
        <Pressable
          key={source}
          style={[
            styles.sourceButton,
            { backgroundColor: t.backgroundSecondary },
            isActive && [styles.sourceButtonActive, { borderColor: t.primary }],
          ]}
          onPress={() => {
            setSelectedSource(source);
            setSearchResults([]);
            setSearchError(null);
            if (query.trim().length >= 3) {
              handleSearch();
            }
          }}
        >
          <Text
            style={[
              styles.sourceButtonText,
              { color: t.textSecondary },
              isActive && { color: t.primary, fontWeight: "700" },
            ]}
          >
            {info.label}
          </Text>
        </Pressable>
      );
    },
    [selectedSource, query, handleSearch],
  );

  const renderSearchResult = useCallback(
    ({ item }: { item: SearchResult }) => {
      const downloadId = `${item.source}_${item.id}`;
      const isDownloading = downloadingIds.has(downloadId);
      const isDownloaded = downloadedIds.has(downloadId);
      const progress = downloadProgress.get(downloadId) || 0;
      const isDirect = DIRECT_DOWNLOAD_SOURCES.has(item.source);
      const classified = classifyOptions(item.downloadOptions, item.source);

      return (
        <View style={[styles.resultCard, { backgroundColor: t.card }]}>
          <View style={styles.resultHeader}>
            <View style={styles.resultHeaderLeft}>
              <View
                style={[
                  styles.sourceTag,
                  { backgroundColor: t.backgroundSecondary },
                ]}
              >
                {SOURCE_INFO[item.source].icon}
                <Text
                  style={[styles.sourceTagText, { color: t.textSecondary }]}
                >
                  {SOURCE_INFO[item.source].label}
                </Text>
              </View>
              <View
                style={[
                  styles.linkTypeBadge,
                  {
                    backgroundColor: isDirect
                      ? colors.success + "18"
                      : colors.warning + "18",
                  },
                ]}
              >
                {isDirect ? (
                  <Link size={10} color={colors.success} strokeWidth={2.5} />
                ) : (
                  <Globe size={10} color={colors.warning} strokeWidth={2.5} />
                )}
                <Text
                  style={[
                    styles.linkTypeBadgeText,
                    { color: isDirect ? colors.success : colors.warning },
                  ]}
                >
                  {isDirect ? "Direct" : "External"}
                </Text>
              </View>
            </View>
            {item.year && (
              <Text style={[styles.resultYear, { color: t.textTertiary }]}>
                {item.year}
              </Text>
            )}
          </View>

          <Text
            style={[styles.resultTitle, { color: t.text }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          {item.authors && item.authors.length > 0 && (
            <Text
              style={[styles.resultAuthors, { color: t.textSecondary }]}
              numberOfLines={1}
            >
              {item.authors.slice(0, 3).join(", ")}
              {item.authors.length > 3 ? ", et al." : ""}
            </Text>
          )}

          <View style={styles.downloadOptions}>
            {/* Already-downloaded → green "Open" */}
            {isDownloaded && (
              <TouchableOpacity
                style={[styles.downloadButton, styles.openButton]}
                onPress={() => {
                  const existingDownload = downloads.find(
                    (d) => d.id === downloadId,
                  );
                  if (existingDownload) {
                    handleOpen(existingDownload);
                  }
                }}
                activeOpacity={0.7}
              >
                <ExternalLink size={16} color="#fff" />
                <Text style={styles.downloadButtonText}>Open</Text>
              </TouchableOpacity>
            )}

            {/* Not yet downloaded → render per classified kind */}
            {!isDownloaded &&
              classified.map((co) => {
                // ── "Site" button: external link, not a direct file ──
                if (co.kind === "site") {
                  const siteUrl = item.sourceUrl || co.option.url;
                  return (
                    <TouchableOpacity
                      key={co.index}
                      style={[styles.downloadButton, styles.siteButton]}
                      onPress={() => {
                        if (siteUrl) {
                          Linking.openURL(siteUrl).catch(() =>
                            Alert.alert(
                              "Cannot Open",
                              "Unable to open this link. The URL may be invalid.",
                            ),
                          );
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Globe size={16} color="#fff" />
                      <Text style={styles.downloadButtonText}>Visit Site</Text>
                    </TouchableOpacity>
                  );
                }

                // ── Downloading in progress ──────────────────────────
                if (isDownloading) {
                  return (
                    <TouchableOpacity
                      key={co.index}
                      style={[
                        styles.downloadButton,
                        styles.downloadButtonDisabled,
                      ]}
                      onPress={() => handleCancelDownload(downloadId)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.downloadingContainer}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.downloadButtonText}>
                          {Math.round(progress * 100)}%
                        </Text>
                        <X size={14} color="#fff" strokeWidth={2.5} />
                      </View>
                    </TouchableOpacity>
                  );
                }

                // ── PDF / EPUB download button ───────────────────────
                return (
                  <TouchableOpacity
                    key={co.index}
                    style={[styles.downloadButton]}
                    onPress={() => handleDownload(item, co.index)}
                    activeOpacity={0.7}
                  >
                    <Download size={16} color="#fff" />
                    <Text style={styles.downloadButtonText}>
                      {co.kind.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        </View>
      );
    },
    [
      downloadingIds,
      downloadedIds,
      downloadProgress,
      downloads,
      handleDownload,
      handleOpen,
    ],
  );

  const renderDownloadItem = useCallback(
    ({ item }: { item: DownloadItem }) => (
      <TouchableOpacity
        style={[styles.downloadCard, { backgroundColor: t.card }]}
        onPress={() => handleOpen(item)}
        activeOpacity={0.7}
      >
        <View style={styles.downloadInfo}>
          <View style={styles.downloadHeader}>
            <View
              style={[
                styles.fileTypeBadge,
                item.fileType === "pdf" ? styles.pdfBadge : styles.epubBadge,
              ]}
            >
              <FileText size={12} color="#fff" />
              <Text style={styles.fileTypeBadgeText}>
                {item.fileType.toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.downloadSource, { color: t.textTertiary }]}>
              {SOURCE_INFO[item.source].label}
            </Text>
          </View>

          <Text
            style={[styles.downloadTitle, { color: t.text }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          {item.authors && item.authors.length > 0 && (
            <Text
              style={[styles.downloadAuthors, { color: t.textSecondary }]}
              numberOfLines={1}
            >
              {item.authors.join(", ")}
            </Text>
          )}

          <Text style={[styles.downloadMeta, { color: t.textTertiary }]}>
            {item.fileSize
              ? downloadManager.formatFileSize(item.fileSize)
              : "Unknown size"}
            {" • "}
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.downloadActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: t.backgroundSecondary },
            ]}
            onPress={(e) => {
              e.stopPropagation();
              handleShare(item);
            }}
            activeOpacity={0.7}
          >
            <Share2 size={20} color={t.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: t.backgroundSecondary },
            ]}
            onPress={(e) => {
              e.stopPropagation();
              handleDelete(item);
            }}
            activeOpacity={0.7}
          >
            <Trash2 size={20} color={t.error} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    ),
    [handleOpen, handleShare, handleDelete],
  );

  // Memoized total storage
  const totalStorage = useMemo(() => {
    const total = downloads.reduce((sum, d) => sum + (d.fileSize || 0), 0);
    return downloadManager.formatFileSize(total);
  }, [downloads]);

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <PINGate screen="downloads">
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor }]}
        edges={["top"]}
      >
        {/* Header */}
        <AppHeaderContainer>
          <View style={styles.headerContainer}>
            <GradientView
              colors={[
                colors.gradientStart,
                colors.gradientMid,
                colors.gradientEnd,
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}
            >
              <View style={styles.headerContent}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={12}
                  style={styles.backBtn}
                >
                  <ArrowLeft size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.headerTitleSection}>
                  <Text style={styles.headerTitle}>Explore</Text>
                  <Text style={styles.headerSubtitle}>
                    Find open sourced materials to read offline
                  </Text>
                </View>
              </View>
            </GradientView>
          </View>
        </AppHeaderContainer>

        {/* Tab Bar */}
        <View
          style={[
            styles.tabBar,
            { backgroundColor: t.card, borderBottomColor: t.border },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "search" && [
                styles.activeTab,
                { borderBottomColor: t.primary },
              ],
            ]}
            onPress={() => setActiveTab("search")}
            activeOpacity={0.7}
          >
            <Search
              size={18}
              color={activeTab === "search" ? t.primary : t.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "search" ? t.primary : t.textSecondary },
              ]}
            >
              Search Library
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "downloads" && [
                styles.activeTab,
                { borderBottomColor: t.primary },
              ],
            ]}
            onPress={() => {
              setActiveTab("downloads");
              loadDownloads();
            }}
            activeOpacity={0.7}
          >
            <Download
              size={18}
              color={activeTab === "downloads" ? t.primary : t.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "downloads" ? t.primary : t.textSecondary,
                },
              ]}
            >
              Downloads ({downloads.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Tab */}
        {activeTab === "search" && (
          <View style={styles.searchContainer}>
            {/* Source Selector - Hidden when search results are present */}
            {searchResults.length === 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[
                  styles.sourceSelector,
                  { backgroundColor: t.card, borderBottomColor: t.border },
                ]}
                contentContainerStyle={styles.sourceSelectorContent}
              >
                {(
                  [
                    "gutenberg",
                    "openlibrary",
                    "arxiv",
                    "zenodo",
                    "pmc",
                  ] as LibrarySource[]
                ).map(renderSourceButton)}
              </ScrollView>
            )}

            {/* Search Bar */}
            <View style={[styles.searchBar, { backgroundColor: t.card }]}>
              <View
                style={[
                  styles.searchInputContainer,
                  {
                    backgroundColor: t.backgroundSecondary,
                    borderColor: t.border,
                  },
                ]}
              >
                <Search size={20} color={t.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: t.text }]}
                  placeholder={`Search ${SOURCE_INFO[selectedSource].label}...`}
                  placeholderTextColor={t.textTertiary}
                  value={query}
                  onChangeText={handleQueryChange}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={clearSearch} activeOpacity={0.7}>
                    <X size={20} color={t.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[
                  styles.searchButton,
                  isSearching && styles.searchButtonDisabled,
                ]}
                onPress={handleSearch}
                disabled={isSearching || !query.trim()}
                activeOpacity={0.7}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Search size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {/* Source Description */}
            <View
              style={[
                styles.sourceDescription,
                { backgroundColor: t.card, borderBottomColor: t.border },
              ]}
            >
              <Text
                style={[
                  styles.sourceDescriptionText,
                  { color: t.textSecondary },
                ]}
              >
                {SOURCE_INFO[selectedSource].description}
              </Text>
            </View>

            {/* Search Results */}
            <FlatList
              data={searchResults}
              renderItem={renderSearchResult}
              keyExtractor={searchKeyExtractor}
              contentContainerStyle={styles.resultsList}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
              updateCellsBatchingPeriod={50}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  {isSearching ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={t.primary} />
                      <Text
                        style={[styles.loadingText, { color: t.textSecondary }]}
                      >
                        Searching...
                      </Text>
                    </View>
                  ) : searchError ? (
                    <View
                      style={[
                        styles.errorContainer,
                        { backgroundColor: t.error + "18" },
                      ]}
                    >
                      <Text style={[styles.errorText, { color: t.error }]}>
                        {searchError}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.placeholderContainer}>
                      <Search size={48} color={t.textTertiary} />
                      <Text
                        style={[styles.placeholderTitle, { color: t.text }]}
                      >
                        Search for Books
                      </Text>
                    </View>
                  )}
                </View>
              }
            />
          </View>
        )}

        {/* Downloads Tab */}
        {activeTab === "downloads" && (
          <View style={styles.downloadsContainer}>
            {downloads.length > 0 && (
              <View
                style={[
                  styles.storageInfo,
                  {
                    backgroundColor: t.backgroundSecondary,
                    borderBottomColor: t.border,
                  },
                ]}
              >
                <Text style={[styles.storageText, { color: t.textSecondary }]}>
                  {downloads.length} files • {totalStorage} used
                </Text>
              </View>
            )}

            <FlatList
              data={downloads}
              renderItem={renderDownloadItem}
              keyExtractor={downloadKeyExtractor}
              contentContainerStyle={styles.downloadsList}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
              updateCellsBatchingPeriod={50}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Download size={48} color={t.textTertiary} />
                  <Text style={[styles.placeholderTitle, { color: t.text }]}>
                    No Downloads Yet
                  </Text>
                  <Text
                    style={[styles.placeholderText, { color: t.textSecondary }]}
                  >
                    From open sourced sites for offline reading
                  </Text>
                  <TouchableOpacity
                    style={styles.browseButton}
                    onPress={() => setActiveTab("search")}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.browseButtonText}>Search</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        )}
      </SafeAreaView>
    </PINGate>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  headerContainer: {
    ...shadows.large,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 14,
    // borderBottomLeftRadius: 4,
    // borderBottomRightRadius: 4,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "white",
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "500",
    marginTop: 2,
  },
  backBtn: {
    width: 35,
    height: 35,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },

  // Tab Bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: 1,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  activeTabText: {},

  // Search Container
  searchContainer: {
    flex: 1,
  },

  // Source Selector
  sourceSelector: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceSelectorContent: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    alignItems: "center",
  },
  sourceButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  sourceButtonActive: {
    borderWidth: 1,
  },
  sourceButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Search Bar
  searchBar: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: colors.cardBackground,
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: colors.text,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },

  // Source Description
  sourceDescription: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sourceDescriptionText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: "italic",
  },

  // Results List
  resultsList: {
    padding: 16,
    paddingBottom: 32,
  },
  resultCard: {
    backgroundColor: colors.cardBackground,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    ...shadows.medium,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  resultHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  sourceTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  sourceTagText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  linkTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  linkTypeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  resultYear: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: "500",
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
    lineHeight: 22,
  },
  resultAuthors: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  downloadOptions: {
    flexDirection: "row",
    gap: 10,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  openButton: {
    backgroundColor: colors.success,
  },
  siteButton: {
    backgroundColor: colors.textSecondary,
  },
  downloadButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  downloadButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  downloadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  // Downloads Container
  downloadsContainer: {
    flex: 1,
  },
  storageInfo: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  storageText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  downloadsList: {
    padding: 16,
    paddingBottom: 32,
  },
  downloadCard: {
    flexDirection: "row",
    backgroundColor: colors.cardBackground,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    ...shadows.medium,
  },
  downloadInfo: {
    flex: 1,
  },
  downloadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  fileTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  pdfBadge: {
    backgroundColor: colors.pdf,
  },
  epubBadge: {
    backgroundColor: colors.secondary,
  },
  fileTypeBadgeText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "700",
  },
  downloadSource: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: "500",
  },
  downloadTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
    lineHeight: 20,
  },
  downloadAuthors: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  downloadMeta: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  downloadActions: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 8,
    marginLeft: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
  },

  // Empty States
  emptyContainer: {
    flex: 1,
    paddingTop: 60,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingContainer: {
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  errorContainer: {
    alignItems: "center",
    padding: 20,
    backgroundColor: colors.errorLight,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: "center",
  },
  placeholderContainer: {
    alignItems: "center",
    gap: 12,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  browseButton: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
