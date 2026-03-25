/**
 * Downloads Store - Persistent metadata storage for downloaded files
 * Uses AsyncStorage to persist download information across app sessions
 */

import { DownloadItem } from "@/src/types/library.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DOWNLOADS_KEY = "@pdf_library_downloads";

class DownloadsStore {
  /**
   * Get all downloads from storage
   */
  async getAll(): Promise<DownloadItem[]> {
    try {
      const data = await AsyncStorage.getItem(DOWNLOADS_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error("Error reading downloads from storage:", error);
      return [];
    }
  }

  /**
   * Get a single download by ID
   */
  async getById(id: string): Promise<DownloadItem | null> {
    const downloads = await this.getAll();
    return downloads.find((d) => d.id === id) || null;
  }

  /**
   * Add a new download to storage
   */
  async add(item: DownloadItem): Promise<void> {
    try {
      const downloads = await this.getAll();

      // Check if already exists (by ID)
      const existingIndex = downloads.findIndex((d) => d.id === item.id);

      if (existingIndex >= 0) {
        // Update existing
        downloads[existingIndex] = item;
      } else {
        // Add new
        downloads.push(item);
      }

      await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(downloads));
    } catch (error) {
      console.error("Error saving download to storage:", error);
      throw error;
    }
  }

  /**
   * Remove a download from storage
   */
  async remove(id: string): Promise<void> {
    try {
      const downloads = await this.getAll();
      const filtered = downloads.filter((d) => d.id !== id);
      await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("Error removing download from storage:", error);
      throw error;
    }
  }

  /**
   * Update a download in storage
   */
  async update(id: string, updates: Partial<DownloadItem>): Promise<void> {
    try {
      const downloads = await this.getAll();
      const index = downloads.findIndex((d) => d.id === id);

      if (index >= 0) {
        downloads[index] = { ...downloads[index], ...updates };
        await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(downloads));
      }
    } catch (error) {
      console.error("Error updating download in storage:", error);
      throw error;
    }
  }

  /**
   * Clear all downloads from storage
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(DOWNLOADS_KEY);
    } catch (error) {
      console.error("Error clearing downloads from storage:", error);
      throw error;
    }
  }

  /**
   * Get downloads filtered by source
   */
  async getBySource(source: DownloadItem["source"]): Promise<DownloadItem[]> {
    const downloads = await this.getAll();
    return downloads.filter((d) => d.source === source);
  }

  /**
   * Get downloads filtered by file type
   */
  async getByFileType(
    fileType: DownloadItem["fileType"],
  ): Promise<DownloadItem[]> {
    const downloads = await this.getAll();
    return downloads.filter((d) => d.fileType === fileType);
  }

  /**
   * Search downloads by title or author
   */
  async search(query: string): Promise<DownloadItem[]> {
    const downloads = await this.getAll();
    const lowerQuery = query.toLowerCase();

    return downloads.filter((d) => {
      const titleMatch = d.title.toLowerCase().includes(lowerQuery);
      const authorMatch = d.authors?.some((a) =>
        a.toLowerCase().includes(lowerQuery),
      );
      return titleMatch || authorMatch;
    });
  }

  /**
   * Get total storage used by downloads
   */
  async getTotalStorageUsed(): Promise<number> {
    const downloads = await this.getAll();
    return downloads.reduce((total, d) => total + (d.fileSize || 0), 0);
  }

  /**
   * Get downloads sorted by date (newest first)
   */
  async getSortedByDate(): Promise<DownloadItem[]> {
    const downloads = await this.getAll();
    return downloads.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Check if a download exists by ID
   */
  async exists(id: string): Promise<boolean> {
    const item = await this.getById(id);
    return item !== null;
  }
}

// Export singleton instance
export const downloadsStore = new DownloadsStore();
