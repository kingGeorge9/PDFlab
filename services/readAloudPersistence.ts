/**
 * readAloudPersistence.ts
 * Service for persisting Read Aloud state and document reading positions.
 *
 * Handles:
 * - Read Aloud progress (chunk index, status, rate, voice) per document
 * - Document scroll positions per document
 * - Automatic cleanup of old entries
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// Storage keys
const READ_ALOUD_STATE_KEY = "@pdfiq_read_aloud_state";
const DOCUMENT_POSITION_KEY = "@pdfiq_document_position";

// Types
export interface ReadAloudState {
  documentId: string;
  chunkIndex: number;
  status: "idle" | "speaking" | "paused" | "finished" | "error";
  rate: number;
  voiceId?: string;
  timestamp: number;
}

export interface DocumentPosition {
  documentId: string;
  scrollPosition: number; // For PDF/DOCX: page number, for EPUB: scroll offset
  timestamp: number;
}

// Read Aloud State Persistence
export class ReadAloudPersistence {
  private static instance: ReadAloudPersistence;
  private cache: Map<string, ReadAloudState> = new Map();

  static getInstance(): ReadAloudPersistence {
    if (!ReadAloudPersistence.instance) {
      ReadAloudPersistence.instance = new ReadAloudPersistence();
    }
    return ReadAloudPersistence.instance;
  }

  async saveState(state: ReadAloudState): Promise<void> {
    try {
      this.cache.set(state.documentId, state);
      const allStates = await this.getAllStates();
      allStates[state.documentId] = state;
      await AsyncStorage.setItem(
        READ_ALOUD_STATE_KEY,
        JSON.stringify(allStates),
      );

      // Clean up old entries (older than 30 days)
      await this.cleanupOldEntries();
    } catch (error) {
      console.warn("[ReadAloudPersistence] Failed to save state:", error);
    }
  }

  async getState(documentId: string): Promise<ReadAloudState | null> {
    try {
      if (this.cache.has(documentId)) {
        return this.cache.get(documentId)!;
      }

      const allStates = await this.getAllStates();
      const state = allStates[documentId];
      if (state) {
        this.cache.set(documentId, state);
        return state;
      }
      return null;
    } catch (error) {
      console.warn("[ReadAloudPersistence] Failed to get state:", error);
      return null;
    }
  }

  async clearState(documentId: string): Promise<void> {
    try {
      this.cache.delete(documentId);
      const allStates = await this.getAllStates();
      delete allStates[documentId];
      await AsyncStorage.setItem(
        READ_ALOUD_STATE_KEY,
        JSON.stringify(allStates),
      );
    } catch (error) {
      console.warn("[ReadAloudPersistence] Failed to clear state:", error);
    }
  }

  private async getAllStates(): Promise<Record<string, ReadAloudState>> {
    try {
      const stored = await AsyncStorage.getItem(READ_ALOUD_STATE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn("[ReadAloudPersistence] Failed to get all states:", error);
      return {};
    }
  }

  private async cleanupOldEntries(): Promise<void> {
    try {
      const allStates = await this.getAllStates();
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      let hasChanges = false;

      for (const [documentId, state] of Object.entries(allStates)) {
        if (now - state.timestamp > thirtyDaysMs) {
          delete allStates[documentId];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await AsyncStorage.setItem(
          READ_ALOUD_STATE_KEY,
          JSON.stringify(allStates),
        );
      }
    } catch (error) {
      console.warn(
        "[ReadAloudPersistence] Failed to cleanup old entries:",
        error,
      );
    }
  }
}

// Document Position Persistence
export class DocumentPositionPersistence {
  private static instance: DocumentPositionPersistence;
  private cache: Map<string, DocumentPosition> = new Map();

  static getInstance(): DocumentPositionPersistence {
    if (!DocumentPositionPersistence.instance) {
      DocumentPositionPersistence.instance = new DocumentPositionPersistence();
    }
    return DocumentPositionPersistence.instance;
  }

  async savePosition(position: DocumentPosition): Promise<void> {
    try {
      this.cache.set(position.documentId, position);
      const allPositions = await this.getAllPositions();
      allPositions[position.documentId] = position;
      await AsyncStorage.setItem(
        DOCUMENT_POSITION_KEY,
        JSON.stringify(allPositions),
      );

      // Clean up old entries (older than 30 days)
      await this.cleanupOldEntries();
    } catch (error) {
      console.warn(
        "[DocumentPositionPersistence] Failed to save position:",
        error,
      );
    }
  }

  async getPosition(documentId: string): Promise<DocumentPosition | null> {
    try {
      if (this.cache.has(documentId)) {
        return this.cache.get(documentId)!;
      }

      const allPositions = await this.getAllPositions();
      const position = allPositions[documentId];
      if (position) {
        this.cache.set(documentId, position);
        return position;
      }
      return null;
    } catch (error) {
      console.warn(
        "[DocumentPositionPersistence] Failed to get position:",
        error,
      );
      return null;
    }
  }

  private async getAllPositions(): Promise<Record<string, DocumentPosition>> {
    try {
      const stored = await AsyncStorage.getItem(DOCUMENT_POSITION_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn(
        "[DocumentPositionPersistence] Failed to get all positions:",
        error,
      );
      return {};
    }
  }

  private async cleanupOldEntries(): Promise<void> {
    try {
      const allPositions = await this.getAllPositions();
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      let hasChanges = false;

      for (const [documentId, position] of Object.entries(allPositions)) {
        if (now - position.timestamp > thirtyDaysMs) {
          delete allPositions[documentId];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await AsyncStorage.setItem(
          DOCUMENT_POSITION_KEY,
          JSON.stringify(allPositions),
        );
      }
    } catch (error) {
      console.warn(
        "[DocumentPositionPersistence] Failed to cleanup old entries:",
        error,
      );
    }
  }
}

// Export singleton instances
export const readAloudPersistence = ReadAloudPersistence.getInstance();
export const documentPositionPersistence =
  DocumentPositionPersistence.getInstance();
