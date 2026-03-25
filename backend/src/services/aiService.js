// ============================================
// FILE: services/aiService.js
// Unified AI Service — single entry point for all AI features.
// Routes prompt construction, provider dispatch, and response
// normalization through one clean interface.
// ============================================
const aiProvider = require("./aiProvider");
const documentProcessor = require("./documentProcessor");
const aiConfig = require("../config/aiConfig");
const logger = require("../utils/logger");

// ============================================
// Prompt templates per task type
// ============================================
const PROMPT_TEMPLATES = {
  summarize: {
    system:
      "You are a professional document analyst. Create clear, accurate, and " +
      "comprehensive summaries that capture key points, main arguments, " +
      "conclusions, and important details.",
    userPrompt: (text) =>
      `Provide a comprehensive summary of the following document:\n\n${text}`,
  },

  translate: {
    system: (lang) =>
      `You are an expert translator. Translate the following text to ${lang}. ` +
      "Maintain the original meaning, tone, style, and formatting exactly. " +
      "Provide only the translation with no commentary.",
    userPrompt: (text) => text,
  },

  "extract-data": {
    system: (dataType) => {
      const typePrompts = {
        contact:
          "Extract all contact information (names, emails, phone numbers, addresses) from the text.",
        dates:
          "Extract all dates, deadlines, and time references from the text.",
        amounts:
          "Extract all monetary amounts, financial figures, and numeric data from the text.",
        tasks: "Extract all action items, tasks, and to-dos from the text.",
        entities:
          "Extract all named entities (people, organizations, locations) from the text.",
      };
      return (
        (typePrompts[dataType] ||
          `Extract ${dataType || "all key structured data (names, dates, amounts, entities, etc.)"} from the text.`) +
        " Return in a clear, organized format. Use JSON when appropriate."
      );
    },
    userPrompt: (text) => text,
  },

  analyze: {
    system: (analysisType) =>
      `You are an expert document analyst. Provide a ${analysisType || "comprehensive"} ` +
      "analysis of the document including: main topics and themes, sentiment, " +
      "key findings, strengths, weaknesses, and actionable recommendations.",
    userPrompt: (text) => text,
  },

  tasks: {
    system:
      "You are a task extraction specialist. Extract ALL tasks, action items, " +
      "deadlines, and to-dos from the text. Return them as a clearly numbered " +
      "list. Include associated deadlines, priorities, or responsible parties if mentioned.",
    userPrompt: (text) =>
      `Extract all tasks and action items from the following text:\n\n${text}`,
  },

  "fill-form": {
    system:
      "You are a form-filling assistant. Given a form structure and optional " +
      "data source, extract relevant information and map it to the form fields. " +
      "Return the result as valid JSON with field names as keys and values filled in.",
    userPrompt: (formText, dataText) =>
      `Fill this form using the provided data.\n\nForm structure:\n${formText}\n\n` +
      (dataText
        ? `Data source:\n${dataText}`
        : "No additional data source provided — infer reasonable values from the form context."),
  },

  chat: {
    system: (docContext) =>
      docContext
        ? "You are xumi, a helpful document assistant. Answer questions about the " +
          "document below precisely and clearly. Reference specific parts of " +
          `the document when relevant.\n\nDocument:\n${docContext}`
        : "You are xumi, a helpful assistant. Provide clear, accurate, and well-structured answers.",
    userPrompt: (message) => message,
  },

  "generate-content": {
    system: (contentType) => {
      const types = {
        email:
          "You are a professional email writer. Create clear, well-structured, and professional emails.",
        blog: "You are a skilled content writer. Create engaging, informative, well-structured blog posts.",
        social:
          "You are a social media expert. Create engaging, concise social media content.",
        code: "You are an expert programmer. Write clean, well-documented, production-quality code.",
        general:
          "You are a versatile content creator. Generate high-quality content based on the user's request.",
      };
      return types[contentType] || types.general;
    },
    userPrompt: (prompt) => prompt,
  },
};

// ============================================
// AI Service
// ============================================
class AIService {
  /**
   * Run an AI task with standardized input/output.
   * This is the SINGLE entry point for all AI features.
   *
   * @param {string} task  One of: summarize, translate, extract-data, analyze,
   *                       tasks, extract-tasks, fill-form, chat, generate-content
   * @param {object} params
   *   text           - pre-extracted document text
   *   prompt         - user prompt / message
   *   file           - express-fileupload file object
   *   formFile       - form file (fill-form)
   *   dataSourceFile - data source file (fill-form)
   *   targetLanguage - target language (translate)
   *   dataType       - extraction type (extract-data)
   *   analysisType   - analysis focus (analyze)
   *   contentType    - content genre (generate-content)
   *   history        - conversation history [{role, content}]
   *   options        - { temperature, maxTokens, timeoutMs }
   *
   * @returns {Promise<object>}  Standardized response
   */
  async run(task, params = {}) {
    const {
      text,
      prompt,
      file,
      formFile,
      dataSourceFile,
      targetLanguage,
      dataType,
      analysisType,
      contentType,
      history,
      options = {},
    } = params;

    // Ensure providers are ready
    aiProvider.initialize();

    const startTime = Date.now();

    try {
      let result;

      switch (task) {
        case "summarize":
          result = await this._summarize(text, file, options);
          break;
        case "translate":
          result = await this._translate(text, file, targetLanguage, options);
          break;
        case "extract-data":
          result = await this._extractData(text, file, dataType, options);
          break;
        case "analyze":
          result = await this._analyze(text, file, analysisType, options);
          break;
        case "tasks":
        case "extract-tasks":
          result = await this._extractTasks(text, file, options);
          break;
        case "fill-form":
          result = await this._fillForm(
            formFile,
            dataSourceFile,
            text,
            options,
          );
          break;
        case "chat":
          result = await this._chat(text, file, prompt, history, options);
          break;
        case "generate-content":
          result = await this._generateContent(prompt, contentType, options);
          break;
        default: {
          const err = new Error(`Unknown AI task: "${task}"`);
          err.code = "VALIDATION_ERROR";
          throw err;
        }
      }

      const elapsed = Date.now() - startTime;
      logger.info(
        `AI task "${task}" completed in ${elapsed}ms via ${result.provider}`,
      );

      return this._formatSuccess(task, result);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      logger.error(`AI task "${task}" failed after ${elapsed}ms`, {
        error: err.message,
        code: err.code,
      });
      throw err;
    }
  }

  // ─── Individual task implementations ───────────────────────────

  async _summarize(text, file, options) {
    const docText = await this._resolveDocumentText(text, file);
    const { text: safeText } = documentProcessor.truncate(
      docText,
      aiConfig.maxDocumentLength,
    );

    const messages = [
      { role: "system", content: PROMPT_TEMPLATES.summarize.system },
      {
        role: "user",
        content: PROMPT_TEMPLATES.summarize.userPrompt(safeText),
      },
    ];

    return aiProvider.chat(messages, options);
  }

  async _translate(text, file, targetLanguage, options) {
    if (!targetLanguage) {
      const err = new Error("Target language is required for translation");
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    const docText = await this._resolveDocumentText(text, file);
    const { text: safeText } = documentProcessor.truncate(
      docText,
      aiConfig.maxDocumentLength,
    );

    const systemContent =
      typeof PROMPT_TEMPLATES.translate.system === "function"
        ? PROMPT_TEMPLATES.translate.system(targetLanguage)
        : PROMPT_TEMPLATES.translate.system;

    const messages = [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: PROMPT_TEMPLATES.translate.userPrompt(safeText),
      },
    ];

    return aiProvider.chat(messages, options);
  }

  async _extractData(text, file, dataType, options) {
    const docText = await this._resolveDocumentText(text, file);
    const { text: safeText } = documentProcessor.truncate(
      docText,
      aiConfig.maxDocumentLength,
    );

    const messages = [
      {
        role: "system",
        content: PROMPT_TEMPLATES["extract-data"].system(dataType),
      },
      {
        role: "user",
        content: PROMPT_TEMPLATES["extract-data"].userPrompt(safeText),
      },
    ];

    return aiProvider.chat(messages, options);
  }

  async _analyze(text, file, analysisType, options) {
    const docText = await this._resolveDocumentText(text, file);
    const { text: safeText } = documentProcessor.truncate(
      docText,
      aiConfig.maxDocumentLength,
    );

    const messages = [
      {
        role: "system",
        content: PROMPT_TEMPLATES.analyze.system(analysisType),
      },
      { role: "user", content: PROMPT_TEMPLATES.analyze.userPrompt(safeText) },
    ];

    return aiProvider.chat(messages, options);
  }

  async _extractTasks(text, file, options) {
    const docText = await this._resolveDocumentText(text, file);
    const { text: safeText } = documentProcessor.truncate(
      docText,
      aiConfig.maxDocumentLength,
    );

    const messages = [
      { role: "system", content: PROMPT_TEMPLATES.tasks.system },
      { role: "user", content: PROMPT_TEMPLATES.tasks.userPrompt(safeText) },
    ];

    const result = await aiProvider.chat(messages, options);

    // Parse tasks into a structured array
    const tasks = result.content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) =>
        line
          .replace(/^\d+[.)]\s*/, "")
          .replace(/^[-*•]\s*/, "")
          .trim(),
      )
      .filter((line) => line.length > 0);

    result.tasks = tasks;
    return result;
  }

  async _fillForm(formFile, dataSourceFile, text, options) {
    let formText = "";
    let dataText = text || "";

    if (formFile) {
      formText = await documentProcessor.extractText(formFile);
    }
    if (dataSourceFile) {
      dataText = await documentProcessor.extractText(dataSourceFile);
    }

    if (!formText && !dataText) {
      const err = new Error("Form file or data text is required");
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    const half = Math.floor(aiConfig.maxDocumentLength / 2);
    const { text: safeForm } = documentProcessor.truncate(formText, half);
    const { text: safeData } = documentProcessor.truncate(dataText, half);

    const messages = [
      { role: "system", content: PROMPT_TEMPLATES["fill-form"].system },
      {
        role: "user",
        content: PROMPT_TEMPLATES["fill-form"].userPrompt(safeForm, safeData),
      },
    ];

    const result = await aiProvider.chat(messages, options);

    // Attempt to parse JSON from the response
    try {
      const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        result.json = JSON.parse(jsonMatch[1].trim());
      } else {
        result.json = JSON.parse(result.content);
      }
    } catch {
      // Response isn't valid JSON — text output is still useful
    }

    return result;
  }

  async _chat(text, file, prompt, history, options) {
    if (!prompt) {
      const err = new Error("Message/prompt is required for chat");
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    let documentContext = text || "";
    if (file) {
      documentContext = await documentProcessor.extractText(file);
    }

    const { text: safeDoc } = documentProcessor.truncate(
      documentContext,
      aiConfig.maxDocumentLength,
    );

    const systemContent = PROMPT_TEMPLATES.chat.system(safeDoc || null);
    const messages = [{ role: "system", content: systemContent }];

    // Add conversation history
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        if (msg.role && msg.content) {
          messages.push({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          });
        }
      }
    }

    // Add current user message
    messages.push({ role: "user", content: prompt });

    return aiProvider.chat(messages, options);
  }

  async _generateContent(prompt, contentType, options) {
    if (!prompt) {
      const err = new Error("Prompt is required for content generation");
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    const messages = [
      {
        role: "system",
        content: PROMPT_TEMPLATES["generate-content"].system(contentType),
      },
      {
        role: "user",
        content: PROMPT_TEMPLATES["generate-content"].userPrompt(prompt),
      },
    ];

    return aiProvider.chat(messages, options);
  }

  // ─── Helpers ───────────────────────────────────────────────────

  /**
   * Resolve document text from either raw text or a file upload.
   */
  async _resolveDocumentText(text, file) {
    if (text && text.length > 0) return text;
    if (file) return documentProcessor.extractText(file);
    const err = new Error("No document text or file provided");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  /**
   * Format a successful AI result into the stable response shape.
   */
  _formatSuccess(task, result) {
    return {
      success: true,
      provider: result.provider || aiProvider.currentProvider,
      task,
      data: {
        text: result.content,
        json: result.json || null,
        tasks: result.tasks || null,
        usage: result.usage || null,
      },
    };
  }
}

module.exports = new AIService();
