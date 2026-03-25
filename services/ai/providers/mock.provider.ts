// ============================================
// Mock AI Provider
// Deterministic, realistic responses with simulated latency.
// ============================================

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

/** Simulate network latency (600–1200 ms). */
function delay(ms?: number): Promise<void> {
  const duration = ms ?? 600 + Math.random() * 600;
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/** Truncate text for use in mock output previews. */
function preview(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class MockAIProvider implements AIProvider {
  // ── Chat ────────────────────────────────────────────────────────────────────
  async chat(req: AIChatRequest): Promise<AIResponse> {
    await delay();

    const msg = req.message.toLowerCase();
    const hasDoc = !!req.documentText;

    // Context-aware responses
    if (hasDoc) {
      if (msg.includes("summary") || msg.includes("summarize")) {
        return {
          content: `Based on "${req.documentName || "the document"}", here is a brief overview:\n\nThe document discusses several key topics including organizational structure, process improvements, and strategic planning. The main points revolve around efficiency optimization and stakeholder engagement. The document is well-structured with clear sections and supporting data.\n\nWould you like me to go deeper into any specific section?`,
        };
      }
      if (msg.includes("how many") || msg.includes("count")) {
        return {
          content: `Looking at "${req.documentName || "the document"}", I can identify the following counts:\n\n• Paragraphs: approximately ${Math.floor(5 + Math.random() * 20)}\n• Key sections: ${Math.floor(3 + Math.random() * 5)}\n• References/citations: ${Math.floor(2 + Math.random() * 10)}\n\nWould you like a more detailed breakdown?`,
        };
      }
      return {
        content: `Regarding your question about "${req.documentName || "the document"}":\n\nBased on my analysis of the document content, the text addresses your inquiry through several relevant passages. The document provides context around this topic in its main body and supporting sections.\n\nKey findings related to your question:\n1. The document contains relevant information in the introduction and methodology sections\n2. There are specific data points that support the main thesis\n3. The conclusion ties back to your area of interest\n\nWould you like me to elaborate on any of these points?`,
      };
    }

    // General chat (no document)
    if (msg.includes("hello") || msg.includes("hi") || msg.includes("hey")) {
      return {
        content:
          "Hello! I'm xumi, your assistant. I can help you with:\n\n• Summarizing documents\n• Translating text\n• Extracting data and tasks\n• Analyzing content\n• Filling forms\n• Answering questions about documents\n\nHow can I help you today?",
      };
    }
    if (msg.includes("help")) {
      return {
        content:
          "Here's what I can do for you:\n\n📄 **Summarize** – Get concise summaries of documents\n🌍 **Translate** – Convert text to 15+ languages\n📊 **Extract Data** – Pull structured information from documents\n🔍 **Analyze** – Deep analysis with sentiment and readability scores\n✅ **Tasks** – Find action items and to-dos\n📝 **Fill Form** – Auto-fill form fields using AI\n💬 **Chat with File** – Ask questions about any PDF, DOCX, or EPUB\n\nJust select a mode from the tabs above, or ask me anything here!",
      };
    }
    if (msg.includes("thank")) {
      return {
        content:
          "You're welcome! Let me know if there's anything else I can help with. 😊",
      };
    }

    return {
      content: `Great question! Here's my response:\n\nI understand you're asking about "${preview(req.message, 80)}". While I'm currently running in offline mock mode, in the full version I would:\n\n1. Process your query using advanced language models\n2. Provide detailed, contextual answers\n3. Reference relevant sources when available\n\nFor now, try attaching a document and I can demonstrate document-based features, or switch to a specific mode like Summarize or Translate for specialized results.`,
    };
  }

  // ── Summarize ───────────────────────────────────────────────────────────────
  async summarize(req: AISummarizeRequest): Promise<AIResponse> {
    await delay();

    const wordCount = req.text.split(/\s+/).length;
    const docLabel = req.documentName
      ? `"${req.documentName}"`
      : "the provided text";

    return {
      content: `📄 **Summary of ${docLabel}**\n\n**Overview:** This ${wordCount}-word document covers several important topics. The content is organized into distinct sections addressing key themes.\n\n**Key Points:**\n• The document opens with an introduction that establishes the main context and objectives\n• Core arguments are supported by data and references throughout the body\n• Several actionable recommendations are presented in the middle sections\n• The conclusion synthesizes findings and proposes next steps\n\n**Main Themes:**\n1. Strategic planning and resource allocation\n2. Process optimization and efficiency improvements\n3. Stakeholder engagement and communication\n\n**Statistics:**\n• Word count: ${wordCount}\n• Estimated reading time: ${Math.max(1, Math.round(wordCount / 200))} min\n• Complexity: ${wordCount > 500 ? "Moderate to High" : "Low to Moderate"}\n\n**Conclusion:** The document provides a comprehensive look at its subject matter with clear structure and well-supported arguments.`,
    };
  }

  // ── Translate ───────────────────────────────────────────────────────────────
  async translate(req: AITranslateRequest): Promise<AIResponse> {
    await delay();

    // Provide deterministic mock translations
    const mockTranslations: Record<string, string> = {
      es: `[Traducción al Español]\n\nEste documento ha sido traducido del inglés al español. El contenido original trata sobre temas importantes relacionados con la gestión y planificación estratégica.\n\n---\nTexto original (primeras líneas):\n"${preview(req.text, 200)}"\n\n---\nNota: Esta es una traducción simulada. La versión completa utilizará modelos de traducción avanzados para proporcionar traducciones precisas y naturales.`,
      fr: `[Traduction en Français]\n\nCe document a été traduit de l'anglais au français. Le contenu original traite de sujets importants liés à la gestion et à la planification stratégique.\n\n---\nTexte original (premières lignes):\n"${preview(req.text, 200)}"\n\n---\nNote: Ceci est une traduction simulée. La version complète utilisera des modèles de traduction avancés.`,
      de: `[Deutsche Übersetzung]\n\nDieses Dokument wurde aus dem Englischen ins Deutsche übersetzt. Der Originalinhalt behandelt wichtige Themen im Zusammenhang mit Management und strategischer Planung.\n\n---\nOriginaltext (erste Zeilen):\n"${preview(req.text, 200)}"\n\n---\nHinweis: Dies ist eine simulierte Übersetzung. Die Vollversion wird fortschrittliche Übersetzungsmodelle verwenden.`,
      ja: `[日本語翻訳]\n\nこの文書は英語から日本語に翻訳されました。原文は、管理と戦略的計画に関連する重要なトピックを扱っています。\n\n---\n原文（最初の行）：\n"${preview(req.text, 200)}"\n\n---\n注：これはシミュレートされた翻訳です。完全版では高度な翻訳モデルを使用します。`,
      zh: `[中文翻译]\n\n本文档已从英文翻译成中文。原始内容涉及与管理和战略规划相关的重要主题。\n\n---\n原文（前几行）：\n"${preview(req.text, 200)}"\n\n---\n注意：这是模拟翻译。完整版将使用高级翻译模型。`,
      ar: `[الترجمة العربية]\n\nتمت ترجمة هذا المستند من الإنجليزية إلى العربية. يتناول المحتوى الأصلي مواضيع مهمة تتعلق بالإدارة والتخطيط الاستراتيجي.\n\n---\nالنص الأصلي (الأسطر الأولى):\n"${preview(req.text, 200)}"\n\n---\nملاحظة: هذه ترجمة محاكاة. سيستخدم الإصدار الكامل نماذج ترجمة متقدمة.`,
      ko: `[한국어 번역]\n\n이 문서는 영어에서 한국어로 번역되었습니다. 원본 내용은 관리 및 전략 계획과 관련된 중요한 주제를 다룹니다.\n\n---\n원문 (첫 줄):\n"${preview(req.text, 200)}"\n\n---\n참고: 이것은 시뮬레이션된 번역입니다.`,
    };

    const langName =
      {
        es: "Spanish",
        fr: "French",
        de: "German",
        ja: "Japanese",
        zh: "Chinese",
        ar: "Arabic",
        ko: "Korean",
        it: "Italian",
        pt: "Portuguese",
        ru: "Russian",
        hi: "Hindi",
        tr: "Turkish",
        nl: "Dutch",
        pl: "Polish",
        sv: "Swedish",
      }[req.targetLanguage] || req.targetLanguage;

    const translated =
      mockTranslations[req.targetLanguage] ||
      `[Translation to ${langName}]\n\nThis document has been translated from English to ${langName}.\n\n---\nOriginal text preview:\n"${preview(req.text, 200)}"\n\n---\nNote: This is a simulated translation. The full version will use advanced translation models for accurate, natural translations.`;

    return { content: translated };
  }

  // ── Extract Data ────────────────────────────────────────────────────────────
  async extractData(req: AIExtractDataRequest): Promise<AIResponse> {
    await delay();

    const docLabel = req.documentName
      ? `"${req.documentName}"`
      : "the provided text";

    const structured = {
      documentName: req.documentName || "Untitled",
      extractionType: req.dataType || "all",
      entities: {
        persons: ["John Smith", "Sarah Johnson", "Mike Chen"],
        organizations: ["Acme Corp", "Global Industries", "TechStart Inc."],
        locations: ["New York", "San Francisco", "London"],
        dates: ["January 15, 2026", "March 3, 2026", "Q2 2026"],
      },
      keyValuePairs: [
        { key: "Project Name", value: "Digital Transformation Initiative" },
        { key: "Budget", value: "$2.4 million" },
        { key: "Timeline", value: "18 months" },
        { key: "Status", value: "In Progress" },
        { key: "Priority", value: "High" },
      ],
      tables: [
        {
          title: "Team Allocation",
          headers: ["Department", "Members", "Role"],
          rows: [
            ["Engineering", "12", "Development"],
            ["Design", "4", "UX/UI"],
            ["QA", "6", "Testing"],
            ["Management", "3", "Oversight"],
          ],
        },
      ],
      statistics: {
        wordCount: req.text.split(/\s+/).length,
        entitiesFound: 12,
        tablesDetected: 1,
        keyValuePairsFound: 5,
      },
    };

    const humanReadable = `📊 **Extracted Data from ${docLabel}**

**Entities Found:**
• People: John Smith, Sarah Johnson, Mike Chen
• Organizations: Acme Corp, Global Industries, TechStart Inc.
• Locations: New York, San Francisco, London
• Dates: January 15, 2026; March 3, 2026; Q2 2026

**Key-Value Pairs:**
| Key | Value |
|-----|-------|
| Project Name | Digital Transformation Initiative |
| Budget | $2.4 million |
| Timeline | 18 months |
| Status | In Progress |
| Priority | High |

**Table: Team Allocation**
| Department | Members | Role |
|-----------|---------|------|
| Engineering | 12 | Development |
| Design | 4 | UX/UI |
| QA | 6 | Testing |
| Management | 3 | Oversight |

**Extraction Statistics:**
• Words processed: ${req.text.split(/\s+/).length}
• Entities found: 12
• Tables detected: 1
• Key-value pairs: 5`;

    return {
      content: humanReadable,
      structuredData: structured as unknown as Record<string, unknown>,
    };
  }

  // ── Analyze ─────────────────────────────────────────────────────────────────
  async analyze(req: AIAnalyzeRequest): Promise<AIResponse> {
    await delay();

    const wordCount = req.text.split(/\s+/).length;
    const sentenceCount = req.text.split(/[.!?]+/).filter(Boolean).length;
    const avgWordsPerSentence =
      sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;
    const docLabel = req.documentName
      ? `"${req.documentName}"`
      : "the provided text";

    return {
      content: `🔍 **Document Analysis: ${docLabel}**

**📏 Document Statistics:**
• Word count: ${wordCount}
• Sentence count: ${sentenceCount}
• Average words per sentence: ${avgWordsPerSentence}
• Estimated reading time: ${Math.max(1, Math.round(wordCount / 200))} minutes
• Paragraph count: ${Math.max(1, Math.floor(wordCount / 80))}

**😊 Sentiment Analysis:**
• Overall tone: Professional / Neutral
• Confidence: 87%
• Emotional markers: Informative (45%), Persuasive (30%), Descriptive (25%)

**📖 Readability Scores:**
• Flesch Reading Ease: 62.3 (Standard / Fairly Easy)
• Flesch-Kincaid Grade: 8.2 (8th Grade Level)
• Gunning Fog Index: 10.1
• Recommendation: Suitable for general audience

**🏗️ Structure Analysis:**
• Document type: ${wordCount > 1000 ? "Long-form report" : wordCount > 300 ? "Article / Memo" : "Short note / Abstract"}
• Has introduction: Yes
• Has conclusion: ${wordCount > 200 ? "Yes" : "Not detected"}
• Section count: ${Math.max(1, Math.floor(wordCount / 150))}
• Lists/bullet points: ${Math.floor(Math.random() * 5) + 1} detected

**💡 Insights:**
1. The document is well-structured with clear topic progression
2. Language complexity is appropriate for the target audience
3. Key arguments are supported with data and examples
4. Consider adding more transitional phrases between sections
5. The conclusion could be strengthened with a stronger call to action`,
      structuredData: {
        wordCount,
        sentenceCount,
        avgWordsPerSentence,
        readingTimeMinutes: Math.max(1, Math.round(wordCount / 200)),
        sentiment: { overall: "neutral", confidence: 0.87 },
        readability: { fleschEase: 62.3, gradeLevel: 8.2 },
      },
    };
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────
  async extractTasks(req: AITasksRequest): Promise<AIResponse> {
    await delay();

    const docLabel = req.documentName
      ? `"${req.documentName}"`
      : "the provided text";

    const structured = {
      tasks: [
        {
          id: 1,
          title: "Review and approve project proposal",
          priority: "High",
          dueDate: "2026-02-20",
          assignee: "Team Lead",
          status: "pending",
        },
        {
          id: 2,
          title: "Schedule stakeholder meeting for Q1 review",
          priority: "High",
          dueDate: "2026-02-25",
          assignee: "Project Manager",
          status: "pending",
        },
        {
          id: 3,
          title: "Update documentation with latest changes",
          priority: "Medium",
          dueDate: "2026-03-01",
          assignee: "Technical Writer",
          status: "pending",
        },
        {
          id: 4,
          title: "Conduct user testing for new features",
          priority: "Medium",
          dueDate: "2026-03-05",
          assignee: "QA Team",
          status: "pending",
        },
        {
          id: 5,
          title: "Prepare monthly progress report",
          priority: "Low",
          dueDate: "2026-03-10",
          assignee: "Analyst",
          status: "pending",
        },
        {
          id: 6,
          title: "Follow up on vendor contracts",
          priority: "Medium",
          dueDate: "2026-03-15",
          assignee: "Procurement",
          status: "pending",
        },
      ],
    };

    return {
      content: `✅ **Tasks Extracted from ${docLabel}**

Found **6 action items**:

🔴 **High Priority:**
1. ☐ Review and approve project proposal
   → Assignee: Team Lead | Due: Feb 20, 2026
2. ☐ Schedule stakeholder meeting for Q1 review
   → Assignee: Project Manager | Due: Feb 25, 2026

🟡 **Medium Priority:**
3. ☐ Update documentation with latest changes
   → Assignee: Technical Writer | Due: Mar 1, 2026
4. ☐ Conduct user testing for new features
   → Assignee: QA Team | Due: Mar 5, 2026
5. ☐ Follow up on vendor contracts
   → Assignee: Procurement | Due: Mar 15, 2026

🟢 **Low Priority:**
6. ☐ Prepare monthly progress report
   → Assignee: Analyst | Due: Mar 10, 2026

**Summary:** 2 high, 3 medium, 1 low priority tasks identified.`,
      structuredData: structured as unknown as Record<string, unknown>,
    };
  }

  // ── Fill Form ───────────────────────────────────────────────────────────────
  async fillForm(req: AIFillFormRequest): Promise<AIResponse> {
    await delay();

    const docLabel = req.documentName
      ? `"${req.documentName}"`
      : "the provided form";

    const structured = {
      formFields: [
        { field: "Full Name", value: "John A. Smith", confidence: 0.95 },
        { field: "Email", value: "john.smith@example.com", confidence: 0.92 },
        { field: "Phone", value: "+1 (555) 123-4567", confidence: 0.88 },
        {
          field: "Address",
          value: "123 Main Street, Suite 400",
          confidence: 0.85,
        },
        { field: "City", value: "San Francisco", confidence: 0.9 },
        { field: "State", value: "California", confidence: 0.9 },
        { field: "ZIP Code", value: "94102", confidence: 0.87 },
        { field: "Date", value: "02/11/2026", confidence: 0.95 },
        { field: "Company", value: "Acme Corporation", confidence: 0.82 },
        { field: "Title/Position", value: "Senior Manager", confidence: 0.78 },
      ],
      overallConfidence: 0.88,
    };

    return {
      content: `📝 **Form Fill Results for ${docLabel}**

AI has identified and filled **10 form fields**:

| Field | Suggested Value | Confidence |
|-------|----------------|------------|
| Full Name | John A. Smith | 95% |
| Email | john.smith@example.com | 92% |
| Phone | +1 (555) 123-4567 | 88% |
| Address | 123 Main Street, Suite 400 | 85% |
| City | San Francisco | 90% |
| State | California | 90% |
| ZIP Code | 94102 | 87% |
| Date | 02/11/2026 | 95% |
| Company | Acme Corporation | 82% |
| Title/Position | Senior Manager | 78% |

**Overall Confidence: 88%**

⚠️ Fields with confidence below 85% should be reviewed manually.
✅ 7 of 10 fields have high confidence (≥85%).

_Note: In the full version, these values will be extracted from your source documents and applied directly to the PDF form fields._`,
      structuredData: structured as unknown as Record<string, unknown>,
    };
  }

  // ── Generate Content ──────────────────────────────────────────────────────
  async generateContent(req: AIGenerateContentRequest): Promise<AIResponse> {
    await delay();

    const typeLabel = req.contentType || "general";
    const promptPreview = preview(req.prompt, 80);

    const mockContent: Record<string, string> = {
      email: `**Subject: Follow-up on Our Recent Discussion**

Dear [Recipient],

I hope this message finds you well. I'm writing to follow up on our recent conversation regarding "${promptPreview}".

After careful consideration, I'd like to propose the following next steps:

1. Schedule a follow-up meeting to discuss key deliverables
2. Share the updated project timeline with all stakeholders
3. Finalize the budget allocation for Q2

Please let me know your availability this week so we can coordinate effectively.

Best regards,
[Your Name]`,
      blog: `# ${promptPreview}

## Introduction

In today's fast-paced world, understanding this topic has never been more important. This article explores the key aspects and provides actionable insights.

## Key Points

### 1. Understanding the Fundamentals
The foundation of this topic rests on several core principles that have been refined over the years...

### 2. Practical Applications
When applied in real-world scenarios, these concepts can transform how we approach common challenges...

### 3. Looking Ahead
The future holds exciting possibilities as technology and methodology continue to evolve...

## Conclusion

By embracing these principles, organizations and individuals alike can position themselves for success in an ever-changing landscape.

---
*Estimated reading time: 5 minutes*`,
      social: `Just discovered something amazing about "${promptPreview}" and I had to share!

Here are 3 takeaways:
1. It's more accessible than you think
2. The impact is real and measurable
3. Everyone can benefit from this

What are your thoughts? Drop a comment below!

#Innovation #Growth #Learning`,
      code: `// Generated code based on: "${promptPreview}"

/**
 * Implementation following best practices
 * with comprehensive error handling.
 */
function processData(input) {
  // Validate input
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: expected an object');
  }

  // Process and transform
  const result = Object.entries(input)
    .filter(([_, value]) => value != null)
    .map(([key, value]) => ({
      key,
      value: String(value).trim(),
      processed: true,
    }));

  return {
    data: result,
    count: result.length,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { processData };`,
    };

    const content =
      mockContent[typeLabel] ||
      `**Generated Content**

Based on your prompt: "${promptPreview}"

Here is the generated content:

${req.prompt}

---

This content has been generated based on your specifications. In the full version, advanced language models will create highly tailored content matching your exact requirements, tone, and style preferences.

*Content type: ${typeLabel}*`;

    return { content };
  }
}
