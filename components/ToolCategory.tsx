import { useTheme } from "@/services/ThemeProvider";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit,
  FileSearch,
  FolderOpen,
  Grid,
  Lock,
  Minimize2,
  Zap,
} from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Tool {
  id: string;
  name: string;
  description: string;
  route?: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  tools: Tool[];
}

interface ToolCategoryProps {
  category: Category;
  expanded: boolean;
  onToggle: () => void;
  onToolPress: (toolId: string) => void;
}

const iconMap: Record<string, React.ComponentType<any>> = {
  organize: FolderOpen,
  optimize: Minimize2,
  "convert-to": ArrowRight,
  "convert-from": ArrowLeft,
  edit: Edit,
  security: Lock,
  metadata: FileSearch,
  forms: Grid,
  compare: FileSearch,
  advanced: Zap,
};

export const ToolCategory = React.memo(function ToolCategory({
  category,
  expanded,
  onToggle,
  onToolPress,
}: ToolCategoryProps) {
  const IconComponent = iconMap[category.id] || FolderOpen;
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.wrapper,
        expanded && {
          borderWidth: 1,
          borderColor: colors.separator,
          borderRadius: 14,
          overflow: "hidden",
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onToggle}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View
            style={[styles.iconContainer, { backgroundColor: category.color }]}
          >
            <IconComponent color="#FFFFFF" size={17} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {category.name}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={18} color={colors.textTertiary} />
        ) : (
          <ChevronDown size={18} color={colors.textTertiary} />
        )}
      </TouchableOpacity>
      {expanded && (
        <View style={styles.subGroupContainer}>
          <View style={styles.body}>
            {category.tools.map((tool: Tool, index: number) => (
              <TouchableOpacity
                key={tool.id}
                onPress={() => onToolPress(tool.id)}
                style={styles.toolRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toolName, { color: colors.text }]}>
                    {tool.name}
                  </Text>
                  <Text
                    style={[styles.toolDesc, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {tool.description}
                  </Text>
                </View>
                <ChevronRight color={colors.textTertiary} size={16} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  wrapper: {
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  subGroupContainer: {},
  body: {},
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 10,
  },
  toolName: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  toolDesc: {
    fontSize: 12,
  },
});
