/**
 * Document Chat Service
 * Manages the Chat With Document feature on the frontend.
 * Handles document upload, extraction, and conversational Q&A via the backend RAG pipeline.
 */

import { API_ENDPOINTS, wakeUpBackend } from "@/config/api";
import type { AIChatMessage, AIDocumentRef } from "@/services/ai/ai.types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DocumentChatSession {
  docId: string;
  filename: string;
  fileType: string;
  totalPages: number;
  chunkCount: number;
  embeddingProvider: string;
  preview: string;
  suggestedPrompts: string[];
}

export interface DocumentChatResponse {
  answer: string;
  citations: Array<{ page: number; quote: string }>;
  found: boolean;
  retrievedChunks?: Array<{
    chunkId: number;
    pages: number[];
    score: number;
    preview: string;
  }>;
}

// ─── In-memory cache for extracted documents ────────────────────────────────

const _extractionCache = new Map<
  string,
  { session: DocumentChatSession; timestamp: number }
>();
const CACHE_EXPIRY_MS = 90 * 60 * 1000; // 90 minutes (less than backend's 2 hours)

function getCacheKey(uri: string, name: string): string {
  return `${uri}::${name}`;
}

function getCachedSession(doc: AIDocumentRef): DocumentChatSession | null {
  const key = getCacheKey(doc.uri, doc.name);
  const cached = _extractionCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    return cached.session;
  }
  if (cached) {
    _extractionCache.delete(key); // Expired
  }
  return null;
}

function cacheSession(doc: AIDocumentRef, session: DocumentChatSession): void {
  const key = getCacheKey(doc.uri, doc.name);
  _extractionCache.set(key, { session, timestamp: Date.now() });

  // Evict old entries if cache grows too large
  if (_extractionCache.size > 20) {
    const oldest = [..._extractionCache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    )[0];
    if (oldest) _extractionCache.delete(oldest[0]);
  }
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * Upload and extract a document for chat. Returns a session ID and metadata.
 * Uses caching to avoid re-processing the same document.
 */
export async function extractDocumentForChat(
  doc: AIDocumentRef,
): Promise<DocumentChatSession> {
  // Check cache first
  const cached = getCachedSession(doc);
  if (cached) {
    console.log(
      `[DocChat] Using cached extraction for "${doc.name}" (docId=${cached.docId})`,
    );
    return cached;
  }

  await wakeUpBackend();

  const formData = new FormData();
  formData.append("document", {
    uri: doc.uri,
    type: doc.mimeType || "application/octet-stream",
    name: doc.name || "document",
  } as any);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min for large docs

  try {
    const response = await fetch(API_ENDPOINTS.AI.EXTRACT_DOCUMENT, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(
        (errBody as any)?.error ||
          `Document extraction failed (${response.status})`,
      );
    }

    const result = await response.json();

    const session: DocumentChatSession = {
      docId: result.docId,
      filename: result.filename,
      fileType: result.fileType || "pdf",
      totalPages: result.totalPages,
      chunkCount: result.chunkCount,
      embeddingProvider: result.embeddingProvider || "none",
      preview: result.preview || "",
      suggestedPrompts: result.suggestedPrompts || [],
    };

    // Cache the session
    cacheSession(doc, session);

    return session;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a question about a previously extracted document.
 * Supports conversation history for multi-turn Q&A.
 */
export async function askDocumentQuestion(
  docId: string,
  question: string,
  history?: AIChatMessage[],
): Promise<DocumentChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(API_ENDPOINTS.AI.CHAT_DOCUMENT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docId,
        question,
        history: (history || []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));

      if (response.status === 404) {
        // Document expired — clear from cache
        throw new Error(
          "DOCUMENT_EXPIRED: Document session has expired. Please re-upload the document.",
        );
      }

      throw new Error(
        (errBody as any)?.error || `Chat failed (${response.status})`,
      );
    }

    const data = await response.json();

    return {
      answer: data.answer,
      citations: data.citations || [],
      found: data.found !== false,
      retrievedChunks: data.retrievedChunks || [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Clear the extraction cache for a specific document.
 */
export function clearDocumentCache(doc: AIDocumentRef): void {
  const key = getCacheKey(doc.uri, doc.name);
  _extractionCache.delete(key);
}

/**
 * Clear all cached extractions.
 */
export function clearAllDocumentCache(): void {
  _extractionCache.clear();
}
