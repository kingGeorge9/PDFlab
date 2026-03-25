// ============================================
// FILE: components/AIFeatureCard.tsx
// ============================================
import { spacing } from "@/constants/theme";
import { useTheme } from "@/services/ThemeProvider";
import {
  BookOpen,
  Brain,
  FileSearch,
  FileSignature,
  FileText,
  Languages,
  ListChecks,
  MessageSquare,
  Wand2,
} from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";

interface AIFeature {
  id: string;
  name: string;
  description: string;
  color: string;
}

interface AIFeatureCardProps {
  feature: AIFeature;
  onPress: () => void;
}

const iconMap: Record<string, React.ComponentType<any>> = {
  summarize: BookOpen,
  translate: Languages,
  "extract-data": FileSearch,
  "generate-content": Wand2,
  chat: MessageSquare,
  analyze: Brain,
  tasks: ListChecks,
  "fill-form": FileSignature,
  "chat-with-document": FileText,
};

export function AIFeatureCard({ feature, onPress }: AIFeatureCardProps) {
  const IconComponent = iconMap[feature.id] || BookOpen;
  const { colors: t } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: "48%",
        backgroundColor: t.card,
        borderRadius: 12,
        padding: spacing.md,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <View
        style={{
          padding: spacing.sm,
          backgroundColor: feature.color,
          borderRadius: 10,
          alignSelf: "flex-start",
          marginBottom: spacing.sm,
        }}
      >
        <IconComponent color="white" size={20} />
      </View>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: t.text,
          marginBottom: 4,
        }}
      >
        {feature.name}
      </Text>
      <Text style={{ fontSize: 12, color: t.textSecondary }}>
        {feature.description}
      </Text>
    </TouchableOpacity>
  );
}
