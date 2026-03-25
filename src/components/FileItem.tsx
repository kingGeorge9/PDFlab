import { Download } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { FileMetadata } from "../types/folder.types";

interface FileItemProps {
  file: FileMetadata;
  onPress: (file: FileMetadata) => void;
  textColor?: string;
  primaryColor?: string;
  showImportHint?: boolean;
}

export const FileItem: React.FC<FileItemProps> = ({
  file,
  onPress,
  textColor = "#333",
  primaryColor = "#0066cc",
  showImportHint = false,
}) => {
  const formatSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return "Unknown";
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(file)}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{file.isDirectory ? "📁" : "📄"}</Text>
      </View>
      <View style={styles.infoContainer}>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
          {file.name || "Unnamed"}
        </Text>
        <Text style={[styles.details, { color: textColor + "99" }]}>
          {file.isDirectory ? "Folder" : formatSize(file.size)} •{" "}
          {formatDate(file.modificationTime)}
        </Text>
      </View>
      {showImportHint && !file.isDirectory && (
        <View style={styles.actionContainer}>
          <Download size={20} color={primaryColor} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.15)",
    backgroundColor: "transparent",
  },
  iconContainer: {
    width: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    fontSize: 24,
  },
  infoContainer: {
    flex: 1,
    justifyContent: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "500",
  },
  details: {
    fontSize: 12,
    marginTop: 4,
  },
  actionContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
});
