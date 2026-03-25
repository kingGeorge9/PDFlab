// ============================================
// AI Screen State – in-memory persistence for
// unfinished work across navigation events.
//
// This is a plain module singleton – state lives
// in memory for the current app session only.
// ============================================

import type { AIAction, AIDocumentRef, AISession } from "./ai.types";

/** Snapshot of the AI screen's working state. */
export interface AIScreenSnapshot {
  activeAction: AIAction;
  session: AISession;
  inputText: string;
  attachedDoc?: AIDocumentRef;
  docText?: string;
  extractionStatus: "none" | "extracted" | "partial";
  targetLang: string;
  attachmentExpanded: boolean;
}

// ─── Module-level state ─────────────────────────────────────────────────────

let _snapshot: AIScreenSnapshot | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/** Save a snapshot of the AI screen state. */
export function saveAIScreenState(snapshot: AIScreenSnapshot): void {
  _snapshot = snapshot;
}

/** Retrieve the saved snapshot (or null if none / cleared). */
export function getAIScreenState(): AIScreenSnapshot | null {
  return _snapshot;
}

/** Clear the snapshot (called on explicit "New session" / "Clear"). */
export function clearAIScreenState(): void {
  _snapshot = null;
}

/**
 * Returns true when the given snapshot represents unfinished work
 * in a non-default feature, meaning the user should be returned
 * to that feature on re-entry.
 *
 * "Chat" is the default — completed chat conversations are NOT
 * considered unfinished work. Only non-chat features with pending
 * input, attached documents, or in-progress messages qualify.
 */
export function hasUnfinishedWork(s: AIScreenSnapshot | null): boolean {
  if (!s) return false;

  const hasInput = s.inputText.trim().length > 0;
  const hasDoc = !!s.attachedDoc;
  const hasMessages = s.session.messages.length > 0;

  // Default "chat" feature — only unfinished if user typed something
  // they haven't sent yet or has an attached doc ready to process.
  // Completed conversations (messages only) are not unfinished work.
  if (s.activeAction === "chat") {
    return hasInput || hasDoc;
  }

  // Any other feature with any work signals is unfinished
  return hasInput || hasDoc || hasMessages;
}
