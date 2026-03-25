import { API_ENDPOINTS, uploadFile, wakeUpBackend } from "@/config/api";
import * as DocumentPicker from "expo-document-picker";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

export interface AIFeatureRequest {
  fileUri?: string;
  fileName?: string;
  text?: string;
  targetLanguage?: string;
  prompt?: string;
}

export class AIService {
  static async summarizeDocument(file: any): Promise<string> {
    try {
      await wakeUpBackend();

      const response = await uploadFile(
        API_ENDPOINTS.AI.SUMMARIZE,
        file,
        "document",
      );

      const result = await response.json();
      return result.summary || "Summary generated successfully!";
    } catch (error) {
      console.error("Summarize error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to summarize document: ${errorMessage}`);
    }
  }

  static async translateDocument(
    file: any,
    targetLanguage: string,
  ): Promise<{ translatedText: string; fileUrl?: string }> {
    try {
      await wakeUpBackend();

      const response = await uploadFile(
        API_ENDPOINTS.AI.TRANSLATE,
        file,
        "document",
        { targetLanguage },
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Translate error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to translate document: ${errorMessage}`);
    }
  }

  static async extractData(
    file: any,
    dataType?: string,
  ): Promise<{ extractedData: any }> {
    try {
      await wakeUpBackend();

      const response = await uploadFile(
        API_ENDPOINTS.AI.EXTRACT_DATA,
        file,
        "document",
        dataType ? { dataType } : undefined,
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Extract data error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to extract data: ${errorMessage}`);
    }
  }

  static async generateContent(
    prompt: string,
    contentType?: string,
  ): Promise<{ content: string }> {
    try {
      await wakeUpBackend();

      const response = await fetch(API_ENDPOINTS.AI.GENERATE_CONTENT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          contentType: contentType || "general",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate content");
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Generate content error:", error);
      throw new Error(
        "Failed to generate content. Please check your backend connection.",
      );
    }
  }

  static async chatWithDocument(
    file: any | null,
    message: string,
    conversationHistory?: ChatMessage[],
  ): Promise<string> {
    try {
      await wakeUpBackend();

      const formData = new FormData();

      if (file) {
        formData.append("document", {
          uri: file.uri,
          type: file.type || file.mimeType,
          name: file.name || "document",
        } as any);
      }

      formData.append("message", message);

      if (conversationHistory && conversationHistory.length > 0) {
        formData.append("history", JSON.stringify(conversationHistory));
      }

      const response = await fetch(API_ENDPOINTS.AI.CHAT, {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type manually — fetch auto-generates it with the correct boundary
      });

      if (!response.ok) {
        throw new Error("Failed to chat with document");
      }

      const result = await response.json();
      return result.response || result.message || "No response received";
    } catch (error) {
      console.error("Chat error:", error);

      // Fallback response for development/testing
      return `I understand you're asking: "${message}". However, I'm unable to connect to the AI backend at the moment. Please ensure your backend is running at the configured URL.`;
    }
  }

  static async analyzeDocument(
    file: any,
    analysisType?: string,
  ): Promise<{ analysis: any }> {
    try {
      await wakeUpBackend();

      const response = await uploadFile(
        API_ENDPOINTS.AI.ANALYZE,
        file,
        "document",
        analysisType ? { analysisType } : undefined,
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Analyze error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to analyze document: ${errorMessage}`);
    }
  }

  static async extractTasks(file: any): Promise<{ tasks: string[] }> {
    try {
      await wakeUpBackend();

      const response = await uploadFile(
        API_ENDPOINTS.AI.EXTRACT_TASKS,
        file,
        "document",
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Extract tasks error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to extract tasks: ${errorMessage}`);
    }
  }

  static async fillForm(
    formFile: any,
    dataSource?: any,
  ): Promise<{ filledFormUrl: string }> {
    try {
      await wakeUpBackend();

      const formData = new FormData();

      formData.append("form", {
        uri: formFile.uri,
        type: formFile.type || formFile.mimeType,
        name: formFile.name || "form.pdf",
      } as any);

      if (dataSource) {
        formData.append("dataSource", {
          uri: dataSource.uri,
          type: dataSource.type || dataSource.mimeType,
          name: dataSource.name || "data",
        } as any);
      }

      const response = await fetch(API_ENDPOINTS.AI.FILL_FORM, {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type manually — fetch auto-generates it with the correct boundary
      });

      if (!response.ok) {
        throw new Error("Failed to fill form");
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Fill form error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to fill form: ${errorMessage}`);
    }
  }

  static async pickDocument(): Promise<any> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0];
    } catch (error) {
      console.error("Pick document error:", error);
      throw new Error("Failed to pick document");
    }
  }
}
