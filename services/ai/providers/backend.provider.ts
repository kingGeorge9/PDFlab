// ============================================
// Backend AI Provider
// Routes requests through the Express backend,
// which in turn calls the configured provider
// (e.g. Gemini, Claude, OpenAI).
// ============================================

import { API_ENDPOINTS } from "@/config/api";
import type { AIProvider } from "../ai.provider";
import type {
    AIAnalyzeRequest,
    AIChatRequest,
    AIExtractDataRequest,
    AIFillFormRequest,
    AIGenerateContentRequest,
    AIResponse,
    AISummarizeRequest,
    AITasksRequest,
    AITranslateRequest,
} from "../ai.types";

/**
 * Calls the backend Express server's AI endpoints.
 * The backend decides which LLM provider to use (Gemini, Claude, etc.)
 * based on its own AI_PROVIDER env var.
 */
export class BackendAIProvider implements AIProvider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Strip the "/ai/*" part – we build per-endpoint URLs ourselves
    this.baseUrl = baseUrl || API_ENDPOINTS.AI.CHAT.replace("/chat", "");
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async chat(req: AIChatRequest): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      message: req.message,
      history: req.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    if (req.documentText) body.documentText = req.documentText;
    if (req.documentName) body.documentName = req.documentName;

    const res = await this.post("/chat", body);
    return { content: res.response || res.data?.text || "" };
  }

  // ── Summarize ─────────────────────────────────────────────────────────────
  async summarize(req: AISummarizeRequest): Promise<AIResponse> {
    const res = await this.post("/summarize", { text: req.text });
    return { content: res.summary || res.data?.text || "" };
  }

  // ── Translate ─────────────────────────────────────────────────────────────
  async translate(req: AITranslateRequest): Promise<AIResponse> {
    const res = await this.post("/translate", {
      text: req.text,
      targetLanguage: req.targetLanguage,
    });
    return { content: res.translatedText || res.data?.text || "" };
  }

  // ── Extract Data ──────────────────────────────────────────────────────────
  async extractData(req: AIExtractDataRequest): Promise<AIResponse> {
    const res = await this.post("/extract-data", {
      text: req.text,
      dataType: req.dataType,
    });
    return {
      content: res.extractedData || res.data?.text || "",
      structuredData: res.data,
    };
  }

  // ── Analyze ───────────────────────────────────────────────────────────────
  async analyze(req: AIAnalyzeRequest): Promise<AIResponse> {
    const res = await this.post("/analyze", {
      text: req.text,
      analysisType: req.analysisType,
    });
    return { content: res.analysis || res.data?.text || "" };
  }

  // ── Extract Tasks ─────────────────────────────────────────────────────────
  async extractTasks(req: AITasksRequest): Promise<AIResponse> {
    const res = await this.post("/extract-tasks", {
      text: req.text,
    });
    const tasks = res.tasks || res.data?.tasks || res.data?.text || "";
    return {
      content:
        typeof tasks === "string" ? tasks : JSON.stringify(tasks, null, 2),
    };
  }

  // ── Fill Form ─────────────────────────────────────────────────────────────
  async fillForm(req: AIFillFormRequest): Promise<AIResponse> {
    const res = await this.post("/fill-form", {
      text: req.text,
      formFields: req.formFields,
    });
    return {
      content: res.filledFormUrl || res.data?.text || "",
      structuredData: res.data,
    };
  }

  // ── Generate Content ────────────────────────────────────────────────────
  async generateContent(req: AIGenerateContentRequest): Promise<AIResponse> {
    const res = await this.post("/generate-content", {
      prompt: req.prompt,
      contentType: req.contentType,
    });
    return { content: res.content || res.data?.text || "" };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `Backend AI error (${response.status}): ${errorBody || response.statusText}`,
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
