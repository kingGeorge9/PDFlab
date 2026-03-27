/**
 * ToolResultRenderers.tsx
 * Professional result UI components for PDF tools.
 * Each renderer takes the raw jsonData and theme colors, and produces
 * a polished, structured output.
 */

import { colors as themeColors, spacing } from "@/constants/theme";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Info,
  Lock,
  Search,
  XCircle,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  Clipboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================================================
// TYPES
// ============================================================================

interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  background: string;
  backgroundSecondary: string;
  card: string;
  border: string;
}

interface ResultProps {
  data: any;
  t: ThemeColors;
  searchQuery?: string;
  fileNames?: [string, string];
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

const formatKey = (key: string): string =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (value > 1000000) return `${(value / 1048576).toFixed(2)} MB`;
    if (value > 1000) return value.toLocaleString();
    return String(value);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

const CopyButton = ({ value, t }: { value: string; t: ThemeColors }) => {
  const [copied, setCopied] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => {
        Clipboard.setString(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      hitSlop={8}
      style={{ padding: 4 }}
    >
      {copied ? (
        <Check color="#10B981" size={14} />
      ) : (
        <Copy color={t.textTertiary} size={14} />
      )}
    </TouchableOpacity>
  );
};

// ============================================================================
// SECTION CARD (used by Validate, Search, Default)
// ============================================================================

const SectionCard = ({
  title,
  icon,
  children,
  t,
  collapsible = false,
  defaultOpen = true,
  accentColor,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  t: ThemeColors;
  collapsible?: boolean;
  defaultOpen?: boolean;
  accentColor?: string;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <View
      style={[
        rs.sectionCard,
        {
          backgroundColor: t.backgroundSecondary,
          borderLeftColor: accentColor || t.primary,
        },
      ]}
    >
      <TouchableOpacity
        onPress={collapsible ? () => setIsOpen(!isOpen) : undefined}
        activeOpacity={collapsible ? 0.7 : 1}
        style={rs.sectionHeader}
      >
        {icon && <View style={{ marginRight: 8 }}>{icon}</View>}
        <Text style={[rs.sectionTitle, { color: t.text }]}>{title}</Text>
        {collapsible &&
          (isOpen ? (
            <ChevronUp color={t.textTertiary} size={18} />
          ) : (
            <ChevronDown color={t.textTertiary} size={18} />
          ))}
      </TouchableOpacity>
      {isOpen && <View style={{ marginTop: 8 }}>{children}</View>}
    </View>
  );
};

const KVRow = ({
  label,
  value,
  t,
  copyable = false,
  isLast = false,
  valueColor,
}: {
  label: string;
  value: any;
  t: ThemeColors;
  copyable?: boolean;
  isLast?: boolean;
  valueColor?: string;
}) => (
  <View
    style={[
      rs.kvRow,
      !isLast && {
        borderBottomWidth: 1,
        borderBottomColor: t.border + "30",
      },
    ]}
  >
    <Text style={[rs.kvLabel, { color: t.textSecondary }]}>
      {formatKey(label)}
    </Text>
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flex: 1.2,
        justifyContent: "flex-end",
      }}
    >
      <Text
        style={[rs.kvValue, { color: valueColor || t.text }]}
        selectable
        numberOfLines={3}
      >
        {formatValue(value)}
      </Text>
      {copyable && <CopyButton value={String(value ?? "")} t={t} />}
    </View>
  </View>
);

// ============================================================================
// 1. PDF INFO — Professional inspector panel / file intelligence dashboard
// ============================================================================

const InfoSection = ({
  title,
  entries,
  t,
  isSecurity = false,
}: {
  title: string;
  entries: [string, any][];
  t: ThemeColors;
  isSecurity?: boolean;
}) => (
  <View style={[infoS.section, { backgroundColor: t.card }]}>
    <View style={[infoS.sectionHeader, { borderBottomColor: t.border + "40" }]}>
      <Text style={[infoS.sectionTitle, { color: t.textSecondary }]}>
        {title}
      </Text>
    </View>
    {entries.map(([k, v], i) => (
      <View
        key={k}
        style={[
          infoS.row,
          i < entries.length - 1 && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: t.border + "30",
          },
        ]}
      >
        <Text style={[infoS.rowLabel, { color: t.textSecondary }]}>
          {formatKey(k)}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flex: 1.2,
            justifyContent: "flex-end",
          }}
        >
          <Text
            style={[
              infoS.rowValue,
              {
                color: isSecurity
                  ? k.toLowerCase().includes("ncrypt") && v
                    ? themeColors.error
                    : k.toLowerCase().includes("ncrypt") && !v
                      ? themeColors.success
                      : t.text
                  : t.text,
              },
            ]}
            selectable
            numberOfLines={3}
          >
            {formatValue(v)}
          </Text>
          <CopyButton value={String(v ?? "")} t={t} />
        </View>
      </View>
    ))}
  </View>
);

export const InfoResultUI = ({ data, t }: ResultProps) => {
  if (!data || typeof data !== "object") return null;

  const GENERAL_KEYS = [
    "pageCount",
    "fileSize",
    "version",
    "pdfVersion",
    "creator",
    "producer",
    "linearized",
  ];
  const META_KEYS = [
    "title",
    "author",
    "subject",
    "keywords",
    "creationDate",
    "modificationDate",
  ];
  const STRUCTURE_KEYS = [
    "paragraphs",
    "images",
    "imageCount",
    "forms",
    "hasForm",
    "formFieldCount",
    "hasEmbeddedFiles",
    "annotations",
    "annotationCount",
  ];
  const FONT_KEYS = ["fonts", "fontList", "fontCount", "fontNames"];
  const SECURITY_KEYS = [
    "encrypted",
    "isEncrypted",
    "permissions",
    "encryptionType",
    "keyLength",
  ];
  const PAGE_KEYS = ["pageWidth", "pageHeight", "pageRotation", "pageDimensions"];

  const allKnown = [
    ...GENERAL_KEYS,
    ...META_KEYS,
    ...STRUCTURE_KEYS,
    ...FONT_KEYS,
    ...SECURITY_KEYS,
    ...PAGE_KEYS,
  ];

  const general: [string, any][] = [];
  const meta: [string, any][] = [];
  const structure: [string, any][] = [];
  const fonts: [string, any][] = [];
  const security: [string, any][] = [];
  const pageDims: [string, any][] = [];
  const other: [string, any][] = [];

  for (const [k, v] of Object.entries(data)) {
    if (GENERAL_KEYS.includes(k)) general.push([k, v]);
    else if (META_KEYS.includes(k)) meta.push([k, v]);
    else if (STRUCTURE_KEYS.includes(k)) structure.push([k, v]);
    else if (FONT_KEYS.includes(k)) fonts.push([k, v]);
    else if (SECURITY_KEYS.includes(k)) security.push([k, v]);
    else if (PAGE_KEYS.includes(k)) pageDims.push([k, v]);
    else other.push([k, v]);
  }

  const pageCount = data.pageCount;
  const fileSize = data.fileSize;
  const pdfVersion = data.pdfVersion || data.version;
  const isEncrypted = data.encrypted || data.isEncrypted;

  return (
    <View style={{ gap: 14 }}>
      {/* Hero banner */}
      <View
        style={[
          infoS.hero,
          {
            backgroundColor: t.primary + "08",
            borderColor: t.primary + "20",
          },
        ]}
      >
        <View style={[infoS.heroIcon, { backgroundColor: t.primary + "15" }]}>
          <FileText color={t.primary} size={32} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[infoS.heroTitle, { color: t.text }]}
            numberOfLines={2}
          >
            {data.title || "PDF Document"}
          </Text>
          <Text style={[infoS.heroSub, { color: t.textSecondary }]}>
            {[
              pageCount
                ? `${pageCount} page${pageCount !== 1 ? "s" : ""}`
                : null,
              fileSize
                ? typeof fileSize === "number"
                  ? formatValue(fileSize)
                  : fileSize
                : null,
              pdfVersion ? `PDF ${pdfVersion}` : null,
            ]
              .filter(Boolean)
              .join(" \u00B7 ")}
          </Text>
        </View>
        {isEncrypted !== undefined && (
          <View
            style={[
              infoS.secBadge,
              {
                backgroundColor: isEncrypted
                  ? themeColors.error + "15"
                  : themeColors.success + "15",
              },
            ]}
          >
            <Lock
              color={isEncrypted ? themeColors.error : themeColors.success}
              size={14}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: isEncrypted ? themeColors.error : themeColors.success,
                marginLeft: 4,
              }}
            >
              {isEncrypted ? "Encrypted" : "Open"}
            </Text>
          </View>
        )}
      </View>

      {/* Stat cards row */}
      {(pageCount != null || fileSize != null || pdfVersion != null) && (
        <View style={infoS.statsRow}>
          {pageCount != null && (
            <View
              style={[
                infoS.statCard,
                { backgroundColor: t.backgroundSecondary },
              ]}
            >
              <Text style={[infoS.statValue, { color: t.primary }]}>
                {pageCount}
              </Text>
              <Text style={[infoS.statLabel, { color: t.textSecondary }]}>
                Pages
              </Text>
            </View>
          )}
          {fileSize != null && (
            <View
              style={[
                infoS.statCard,
                { backgroundColor: t.backgroundSecondary },
              ]}
            >
              <Text style={[infoS.statValue, { color: t.primary }]}>
                {typeof fileSize === "number"
                  ? formatValue(fileSize)
                  : fileSize}
              </Text>
              <Text style={[infoS.statLabel, { color: t.textSecondary }]}>
                Size
              </Text>
            </View>
          )}
          {pdfVersion != null && (
            <View
              style={[
                infoS.statCard,
                { backgroundColor: t.backgroundSecondary },
              ]}
            >
              <Text style={[infoS.statValue, { color: t.primary }]}>
                {pdfVersion}
              </Text>
              <Text style={[infoS.statLabel, { color: t.textSecondary }]}>
                Version
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Data sections */}
      {general.length > 0 && (
        <InfoSection title="GENERAL" entries={general} t={t} />
      )}
      {meta.length > 0 && (
        <InfoSection title="DOCUMENT METADATA" entries={meta} t={t} />
      )}
      {pageDims.length > 0 && (
        <InfoSection title="PAGE DIMENSIONS" entries={pageDims} t={t} />
      )}
      {fonts.length > 0 && (
        <InfoSection title="TYPOGRAPHY" entries={fonts} t={t} />
      )}
      {structure.length > 0 && (
        <InfoSection title="STRUCTURE" entries={structure} t={t} />
      )}
      {security.length > 0 && (
        <InfoSection
          title="SECURITY"
          entries={security}
          t={t}
          isSecurity
        />
      )}
      {other.length > 0 && (
        <InfoSection title="ADDITIONAL" entries={other} t={t} />
      )}
    </View>
  );
};

// ============================================================================
// 2. VALIDATE PDF RESULT
// ============================================================================

export const ValidateResultUI = ({ data, t }: ResultProps) => {
  if (!data || typeof data !== "object") return null;

  const isValid = data.isValid || data.valid;
  const statusColor = isValid ? themeColors.success : themeColors.error;
  const warningColor = themeColors.warning;

  const statusKeys = [
    "isValid",
    "valid",
    "pageCount",
    "fileSize",
    "version",
    "pdfVersion",
    "encrypted",
    "linearized",
  ];
  const issueKeys = ["issues", "errors", "warnings"];

  const statusProps = Object.entries(data).filter(([k]) =>
    statusKeys.includes(k),
  );
  const issueArrays = Object.entries(data).filter(([k]) =>
    issueKeys.includes(k),
  );
  const otherProps = Object.entries(data).filter(
    ([k]) => !statusKeys.includes(k) && !issueKeys.includes(k),
  );

  return (
    <View style={{ gap: 12 }}>
      <View
        style={[
          rs.statusBanner,
          {
            backgroundColor: statusColor + "12",
            borderColor: statusColor + "40",
          },
        ]}
      >
        <View
          style={[
            rs.statusIconCircle,
            { backgroundColor: statusColor + "20" },
          ]}
        >
          {isValid ? (
            <CheckCircle color={statusColor} size={28} />
          ) : (
            <XCircle color={statusColor} size={28} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[rs.statusTitle, { color: statusColor }]}>
            {isValid ? "PDF is Valid" : "Issues Found"}
          </Text>
          <Text style={[rs.statusSubtext, { color: t.textSecondary }]}>
            {isValid
              ? "No structural issues detected in this PDF."
              : "This PDF has structural or content issues."}
          </Text>
        </View>
      </View>

      {statusProps.length > 0 && (
        <SectionCard
          title="Document Properties"
          icon={<FileText color={t.primary} size={16} />}
          t={t}
          accentColor={t.primary}
        >
          {statusProps.map(([k, v], i) => (
            <KVRow
              key={k}
              label={k}
              value={
                k === "isValid" || k === "valid"
                  ? v
                    ? "Pass"
                    : "Fail"
                  : v
              }
              t={t}
              isLast={i === statusProps.length - 1}
              valueColor={
                k === "isValid" || k === "valid"
                  ? v
                    ? themeColors.success
                    : themeColors.error
                  : undefined
              }
            />
          ))}
        </SectionCard>
      )}

      {issueArrays.map(([key, arr]) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const isError = key === "errors" || key === "issues";
        const iconColor = isError ? themeColors.error : warningColor;
        return (
          <SectionCard
            key={key}
            title={formatKey(key)}
            icon={<AlertCircle color={iconColor} size={16} />}
            t={t}
            accentColor={iconColor}
          >
            {arr.map((item: any, i: number) => (
              <View
                key={i}
                style={[
                  rs.issueRow,
                  {
                    backgroundColor: iconColor + "08",
                    borderLeftColor: iconColor,
                  },
                ]}
              >
                <View
                  style={[rs.issueDot, { backgroundColor: iconColor }]}
                />
                <Text
                  style={[rs.issueText, { color: t.text }]}
                  selectable
                >
                  {typeof item === "string" ? item : JSON.stringify(item)}
                </Text>
              </View>
            ))}
          </SectionCard>
        );
      })}

      {otherProps.length > 0 && (
        <SectionCard
          title="Details"
          icon={<Info color={t.textSecondary} size={16} />}
          t={t}
          collapsible
          defaultOpen={false}
          accentColor={t.textTertiary}
        >
          {otherProps.map(([k, v], i) => (
            <KVRow
              key={k}
              label={k}
              value={v}
              t={t}
              isLast={i === otherProps.length - 1}
            />
          ))}
        </SectionCard>
      )}
    </View>
  );
};

// ============================================================================
// 3. DIFF / COMPARE — Unique visual identity with gauge + diff lines
// ============================================================================

export const DiffResultUI = ({ data, t, fileNames }: ResultProps) => {
  if (!data || typeof data !== "object") return null;

  const [activeTab, setActiveTab] = useState<"summary" | "differences">(
    "summary",
  );
  const hasSummary = data.summary && typeof data.summary === "object";
  const hasDiffs = data.differences && typeof data.differences === "object";

  const similarity = data.differences?.similarityScore || "N/A";
  const simNum =
    typeof similarity === "string"
      ? parseInt(similarity)
      : typeof similarity === "number"
        ? similarity
        : 0;
  const gaugeColor =
    simNum > 80
      ? themeColors.success
      : simNum > 50
        ? themeColors.warning
        : themeColors.error;

  return (
    <View style={{ gap: 12 }}>
      {/* Similarity gauge */}
      {similarity !== "N/A" && (
        <View
          style={[
            diffS.gauge,
            { backgroundColor: t.backgroundSecondary },
          ]}
        >
          <View style={diffS.gaugeHeader}>
            <Text style={[diffS.gaugeTitle, { color: t.text }]}>
              Similarity
            </Text>
            <Text style={[diffS.gaugeValue, { color: gaugeColor }]}>
              {similarity}
            </Text>
          </View>
          <View
            style={[diffS.gaugeTrack, { backgroundColor: t.border + "30" }]}
          >
            <View
              style={[
                diffS.gaugeFill,
                {
                  width: `${Math.min(100, Math.max(0, simNum))}%`,
                  backgroundColor: gaugeColor,
                },
              ]}
            />
          </View>
          <Text style={[diffS.gaugeDesc, { color: t.textSecondary }]}>
            {simNum > 80
              ? "Documents are very similar"
              : simNum > 50
                ? "Moderate differences found"
                : "Significant differences detected"}
          </Text>
        </View>
      )}

      {/* Toggle pills */}
      <View
        style={[diffS.pillBar, { backgroundColor: t.backgroundSecondary }]}
      >
        {(["summary", "differences"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              diffS.pill,
              activeTab === tab && [
                diffS.pillActive,
                { backgroundColor: t.card },
              ],
            ]}
          >
            <Text
              style={[
                diffS.pillText,
                {
                  color:
                    activeTab === tab ? t.text : t.textTertiary,
                },
              ]}
            >
              {tab === "summary" ? "Overview" : "Changes"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Overview tab */}
      {activeTab === "summary" && hasSummary && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {["pdf1", "pdf2"].map((key, idx) => {
            const label = fileNames?.[idx] || (idx === 0 ? "Original" : "Modified");
            const accent =
              idx === 0 ? themeColors.error : themeColors.success;
            return (
              <View
                key={key}
                style={[
                  diffS.docCard,
                  { backgroundColor: t.card, borderColor: t.border },
                ]}
              >
                <View
                  style={[
                    diffS.docHeader,
                    { backgroundColor: accent + "10" },
                  ]}
                >
                  <View
                    style={[diffS.docDot, { backgroundColor: accent }]}
                  />
                  <Text style={[diffS.docLabel, { color: accent }]}>
                    {label}
                  </Text>
                </View>
                {data.summary[key] &&
                  Object.entries(data.summary[key]).map(
                    ([k, v]: [string, any]) => (
                      <View key={k} style={diffS.docRow}>
                        <Text
                          style={[
                            diffS.docKey,
                            { color: t.textTertiary },
                          ]}
                        >
                          {formatKey(k)}
                        </Text>
                        <Text
                          style={[diffS.docVal, { color: t.text }]}
                        >
                          {formatValue(v)}
                        </Text>
                      </View>
                    ),
                  )}
              </View>
            );
          })}
        </View>
      )}

      {/* Changes tab */}
      {activeTab === "differences" && hasDiffs && (
        <View style={{ gap: 10 }}>
          {/* Removed */}
          {data.differences.onlyInPdf1?.length > 0 && (
            <View
              style={[
                diffS.changeBlock,
                { backgroundColor: themeColors.error + "06" },
              ]}
            >
              <View
                style={[
                  diffS.changeHeader,
                  { borderBottomColor: themeColors.error + "20" },
                ]}
              >
                <View
                  style={[
                    diffS.changeBadge,
                    { backgroundColor: themeColors.error + "15" },
                  ]}
                >
                  <Text
                    style={{
                      color: themeColors.error,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    − REMOVED
                  </Text>
                </View>
                <Text style={{ color: t.textSecondary, fontSize: 12 }}>
                  {data.differences.onlyInPdf1.length} item
                  {data.differences.onlyInPdf1.length > 1 ? "s" : ""}
                </Text>
              </View>
              <View style={diffS.changeContent}>
                {data.differences.onlyInPdf1.map(
                  (w: string, i: number) => (
                    <View
                      key={i}
                      style={[
                        diffS.changeLine,
                        { backgroundColor: themeColors.error + "10" },
                      ]}
                    >
                      <Text
                        style={[
                          diffS.changePrefix,
                          { color: themeColors.error },
                        ]}
                      >
                        −
                      </Text>
                      <Text
                        style={{
                          color: t.text,
                          fontSize: 13,
                          flex: 1,
                        }}
                      >
                        {w}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </View>
          )}

          {/* Added */}
          {data.differences.onlyInPdf2?.length > 0 && (
            <View
              style={[
                diffS.changeBlock,
                { backgroundColor: themeColors.success + "06" },
              ]}
            >
              <View
                style={[
                  diffS.changeHeader,
                  { borderBottomColor: themeColors.success + "20" },
                ]}
              >
                <View
                  style={[
                    diffS.changeBadge,
                    { backgroundColor: themeColors.success + "15" },
                  ]}
                >
                  <Text
                    style={{
                      color: themeColors.success,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    + ADDED
                  </Text>
                </View>
                <Text style={{ color: t.textSecondary, fontSize: 12 }}>
                  {data.differences.onlyInPdf2.length} item
                  {data.differences.onlyInPdf2.length > 1 ? "s" : ""}
                </Text>
              </View>
              <View style={diffS.changeContent}>
                {data.differences.onlyInPdf2.map(
                  (w: string, i: number) => (
                    <View
                      key={i}
                      style={[
                        diffS.changeLine,
                        { backgroundColor: themeColors.success + "10" },
                      ]}
                    >
                      <Text
                        style={[
                          diffS.changePrefix,
                          { color: themeColors.success },
                        ]}
                      >
                        +
                      </Text>
                      <Text
                        style={{
                          color: t.text,
                          fontSize: 13,
                          flex: 1,
                        }}
                      >
                        {w}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </View>
          )}

          {/* Stats */}
          <View
            style={[
              diffS.statsBlock,
              { backgroundColor: t.backgroundSecondary },
            ]}
          >
            {data.differences.commonWordsCount !== undefined && (
              <View style={diffS.statRow}>
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                  Common Words
                </Text>
                <Text
                  style={{ color: t.text, fontSize: 13, fontWeight: "700" }}
                >
                  {data.differences.commonWordsCount}
                </Text>
              </View>
            )}
            {data.differences.similarityScore && (
              <View style={diffS.statRow}>
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                  Similarity
                </Text>
                <Text
                  style={{
                    color: gaugeColor,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {data.differences.similarityScore}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// 4. SEARCH TEXT RESULT
// ============================================================================

export const SearchResultUI = ({ data, t, searchQuery }: ResultProps) => {
  if (!data) return null;

  const results = Array.isArray(data) ? data : [];
  const query = searchQuery || "";

  if (results.length === 0) {
    return (
      <View
        style={[rs.emptyState, { backgroundColor: t.backgroundSecondary }]}
      >
        <Search color={t.textTertiary} size={40} />
        <Text style={[rs.emptyTitle, { color: t.text }]}>
          No Matches Found
        </Text>
        <Text style={[rs.emptySubtext, { color: t.textSecondary }]}>
          No results found for "{query}". Try a different search term.
        </Text>
      </View>
    );
  }

  const renderHighlightedText = (text: string) => {
    if (!query)
      return (
        <Text style={{ color: t.text, fontSize: 13 }}>{text}</Text>
      );
    const parts: React.ReactNode[] = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let lastIndex = 0;

    let idx = lowerText.indexOf(lowerQuery, lastIndex);
    while (idx !== -1) {
      if (idx > lastIndex) {
        parts.push(
          <Text
            key={`t${lastIndex}`}
            style={{ color: t.text, fontSize: 13 }}
          >
            {text.slice(lastIndex, idx)}
          </Text>,
        );
      }
      parts.push(
        <Text
          key={`h${idx}`}
          style={{
            color: t.primary,
            fontWeight: "700",
            backgroundColor: t.primary + "18",
            borderRadius: 2,
            fontSize: 13,
          }}
        >
          {text.slice(idx, idx + query.length)}
        </Text>,
      );
      lastIndex = idx + query.length;
      idx = lowerText.indexOf(lowerQuery, lastIndex);
    }
    if (lastIndex < text.length) {
      parts.push(
        <Text
          key={`t${lastIndex}`}
          style={{ color: t.text, fontSize: 13 }}
        >
          {text.slice(lastIndex)}
        </Text>,
      );
    }
    return <Text>{parts}</Text>;
  };

  return (
    <View style={{ gap: 8 }}>
      <View
        style={[rs.searchHeader, { backgroundColor: t.primary + "10" }]}
      >
        <Search color={t.primary} size={18} />
        <Text style={[rs.searchCount, { color: t.text }]}>
          {results.length} match{results.length !== 1 ? "es" : ""} found
        </Text>
        {query ? (
          <View
            style={[rs.queryBadge, { backgroundColor: t.primary + "18" }]}
          >
            <Text
              style={{
                color: t.primary,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              "{query}"
            </Text>
          </View>
        ) : null}
      </View>

      {results.map((item: any, index: number) => (
        <View
          key={index}
          style={[
            rs.searchResult,
            { backgroundColor: t.backgroundSecondary },
          ]}
        >
          <View style={rs.searchResultHeader}>
            <View
              style={[
                rs.lineNumberBadge,
                { backgroundColor: t.primary + "15" },
              ]}
            >
              <Text style={[rs.lineNumber, { color: t.primary }]}>
                Line {item.lineNumber || index + 1}
              </Text>
            </View>
            {item.page && (
              <Text style={[rs.pageRef, { color: t.textTertiary }]}>
                Page {item.page}
              </Text>
            )}
          </View>
          <View style={rs.searchResultContent}>
            {renderHighlightedText(
              typeof item === "string"
                ? item
                : item.text || String(item),
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

// [CreateFormBuilder removed — tool purged per requirements]
// ============================================================================
// DEFAULT / FALLBACK RENDERER
// ============================================================================

export const DefaultResultUI = ({ data, t }: ResultProps) => {
  if (!data) return null;

  if (typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data);
    return (
      <SectionCard title="Results" t={t} accentColor={t.primary}>
        {entries.map(([k, v], i) => (
          <KVRow
            key={k}
            label={k}
            value={v}
            t={t}
            copyable
            isLast={i === entries.length - 1}
          />
        ))}
      </SectionCard>
    );
  }

  return (
    <View
      style={{
        backgroundColor: t.backgroundSecondary,
        borderRadius: 12,
        padding: spacing.md,
      }}
    >
      <Text
        style={{
          color: t.text,
          fontSize: 12,
          fontFamily: "monospace",
        }}
        selectable
      >
        {JSON.stringify(data, null, 2)}
      </Text>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

// Shared result styles (Validate, Search, Default)
const rs = StyleSheet.create({
  sectionCard: {
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 7,
  },
  kvLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  kvValue: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
    marginLeft: 8,
  },
  statusBanner: {
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  statusIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusSubtext: {
    fontSize: 13,
    marginTop: 2,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  issueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
    marginRight: 10,
  },
  issueText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  searchHeader: {
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchCount: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  queryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  searchResult: {
    borderRadius: 10,
    padding: 12,
  },
  searchResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  lineNumberBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lineNumber: {
    fontSize: 11,
    fontWeight: "700",
  },
  pageRef: {
    fontSize: 11,
    fontWeight: "500",
  },
  searchResultContent: {
    paddingLeft: 4,
  },
  emptyState: {
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: "center",
  },
});

// Info UI styles — unique inspector panel look
const infoS = StyleSheet.create({
  hero: {
    borderRadius: 14,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  heroSub: {
    fontSize: 13,
    marginTop: 3,
  },
  secBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  section: {
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
    marginLeft: 8,
  },
});

// Diff UI styles — unique comparison identity
const diffS = StyleSheet.create({
  gauge: {
    borderRadius: 14,
    padding: 16,
  },
  gaugeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  gaugeTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  gaugeValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  gaugeTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 4,
  },
  gaugeDesc: {
    fontSize: 12,
    marginTop: 8,
  },
  pillBar: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  pillActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  docCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  docDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  docLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  docRow: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  docKey: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  docVal: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 1,
  },
  changeBlock: {
    borderRadius: 12,
    overflow: "hidden",
  },
  changeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeContent: {
    padding: 8,
    gap: 4,
  },
  changeLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 8,
  },
  changePrefix: {
    fontSize: 14,
    fontWeight: "800",
    width: 16,
    textAlign: "center",
  },
  statsBlock: {
    borderRadius: 12,
    padding: 14,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
});

