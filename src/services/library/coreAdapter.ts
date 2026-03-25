import { DownloadOption, SearchResult } from "@/src/types/library.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CORE_API = "https://api.core.ac.uk/v3";
const CORE_API_KEY_STORAGE = "core_api_key";

interface COREResult {
  id: string;
  title: string;
  authors?: Array<{ name: string }>;
  yearPublished?: number;
  downloadUrl?: string;
  fullText?: string;
  sourceFulltextUrls?: string[];
  doi?: string;
  links?: Array<{ type: string; url: string }>;
}

interface COREResponse {
  totalHits: number;
  results: COREResult[];
}

/**
 * CORE (COnnecting REpositories) adapter
 * Aggregates 276M+ open access research papers from 14K+ repositories worldwide
 */
class COREAdapter {
  private baseUrl = CORE_API;
  private apiKey: string | null = null;

  /**
   * Set API key for higher rate limits and reliable access.
   * Get a free key at https://core.ac.uk/services/api
   */
  async setApiKey(key: string): Promise<void> {
    this.apiKey = key;
    await AsyncStorage.setItem(CORE_API_KEY_STORAGE, key);
  }

  /**
   * Load a previously-stored API key from AsyncStorage.
   */
  async loadApiKey(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(CORE_API_KEY_STORAGE);
      if (stored) this.apiKey = stored;
    } catch {}
  }

  /**
   * Build headers, including the API key when available.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Search CORE for research papers
   */
  async search(query: string, limit: number = 20): Promise<SearchResult[]> {
    try {
      // Ensure API key is loaded on first use
      if (!this.apiKey) await this.loadApiKey();

      const searchQuery = encodeURIComponent(`title:(${query}) OR ${query}`);
      const url = `${this.baseUrl}/search/works?q=${searchQuery}&limit=${limit}`;

      const response = await fetch(url, { headers: this.getHeaders() });

      if (response.status === 429) {
        throw new Error(
          "CORE rate limit reached. Get a free API key at core.ac.uk/services/api for unlimited access, then enter it in App Settings → API Keys.",
        );
      }
      if (response.status === 403) {
        throw new Error(
          "CORE API key is invalid or expired. Please update it in App Settings → API Keys.",
        );
      }
      if (!response.ok) {
        throw new Error(`CORE API error: ${response.status}`);
      }

      const data: COREResponse = await response.json();

      if (!data.results) {
        return [];
      }

      return data.results
        .filter((article) => this.hasDownloadUrl(article))
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching CORE:", error);
      throw error;
    }
  }

  /**
   * Search by year range
   */
  async searchByYear(
    query: string,
    yearFrom: number,
    yearTo: number,
    limit: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(
        `${query} AND yearPublished>=${yearFrom} AND yearPublished<=${yearTo}`,
      );
      const url = `${this.baseUrl}/search/works?q=${searchQuery}&limit=${limit}`;

      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        throw new Error(`CORE API error: ${response.status}`);
      }

      const data: COREResponse = await response.json();

      if (!data.results) {
        return [];
      }

      return data.results
        .filter((article) => this.hasDownloadUrl(article))
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching by year:", error);
      throw error;
    }
  }

  /**
   * Check if article has download URL
   */
  private hasDownloadUrl(article: COREResult): boolean {
    return Boolean(
      article.downloadUrl ||
      (article.sourceFulltextUrls && article.sourceFulltextUrls.length > 0) ||
      article.links?.some((link) => link.type === "download"),
    );
  }

  /**
   * Extract PDF URL from article
   */
  private extractPdfUrl(article: COREResult): string | null {
    // Try downloadUrl first
    if (article.downloadUrl) {
      return article.downloadUrl;
    }

    // Try sourceFulltextUrls
    if (article.sourceFulltextUrls && article.sourceFulltextUrls.length > 0) {
      // Prefer PDF URLs
      const pdfUrl = article.sourceFulltextUrls.find((url) =>
        url.toLowerCase().includes(".pdf"),
      );
      return pdfUrl || article.sourceFulltextUrls[0];
    }

    // Try links
    if (article.links) {
      const downloadLink = article.links.find(
        (link) => link.type === "download",
      );
      if (downloadLink) {
        return downloadLink.url;
      }
    }

    return null;
  }

  /**
   * Map CORE article to SearchResult
   */
  private mapToSearchResult(article: COREResult): SearchResult | null {
    const pdfUrl = this.extractPdfUrl(article);

    if (!pdfUrl) {
      return null;
    }

    const downloadOptions: DownloadOption[] = [
      {
        type: "pdf",
        url: pdfUrl,
      },
    ];

    const authors = article.authors?.map((a) => a.name) || [];

    return {
      id: article.id.toString(),
      source: "core",
      title: article.title,
      authors,
      year: article.yearPublished?.toString(),
      downloadOptions,
      sourceUrl: `https://core.ac.uk/works/${article.id}`,
    };
  }

  /**
   * Get article by CORE ID
   */
  async getArticle(coreId: string): Promise<SearchResult | null> {
    try {
      const url = `${this.baseUrl}/works/${coreId}`;
      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        return null;
      }

      const article: COREResult = await response.json();
      return this.mapToSearchResult(article);
    } catch (error) {
      console.error("Error fetching article:", error);
      return null;
    }
  }
}

// Export singleton instance
export const coreAdapter = new COREAdapter();
