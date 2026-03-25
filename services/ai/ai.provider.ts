// ============================================
// AI Provider Interface
// Abstracting the backend so we can swap mock ↔ real easily.
// ============================================

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
} from "./ai.types";

/**
 * Any AI backend must implement this interface.
 * The mock provider fulfils it locally; the real one will call the server.
 */
export interface AIProvider {
  /** Free-form chat (optionally with document context). */
  chat(req: AIChatRequest): Promise<AIResponse>;

  /** Summarize the given text / document. */
  summarize(req: AISummarizeRequest): Promise<AIResponse>;

  /** Translate text to a target language. */
  translate(req: AITranslateRequest): Promise<AIResponse>;

  /** Extract structured data from text. */
  extractData(req: AIExtractDataRequest): Promise<AIResponse>;

  /** Analyze text for sentiment, readability, etc. */
  analyze(req: AIAnalyzeRequest): Promise<AIResponse>;

  /** Extract action items / tasks from text. */
  extractTasks(req: AITasksRequest): Promise<AIResponse>;

  /** Auto-fill form fields from text. */
  fillForm(req: AIFillFormRequest): Promise<AIResponse>;

  /** Generate content (email, blog, social, code, etc.) from a prompt. */
  generateContent(req: AIGenerateContentRequest): Promise<AIResponse>;
}
