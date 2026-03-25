import { DownloadOption, SearchResult } from "@/src/types/library.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COURTLISTENER_API = "https://www.courtlistener.com/api/rest/v3";
const COURTLISTENER_TOKEN_KEY = "courtlistener_api_token";

interface CourtListenerOpinion {
  id: number;
  case_name: string;
  case_name_short: string;
  date_filed: string;
  court: string;
  download_url?: string;
  local_path?: string;
  author_str?: string;
  joined_by_str?: string;
  absolute_url: string;
}

interface CourtListenerResponse {
  count: number;
  results: CourtListenerOpinion[];
}

/**
 * CourtListener adapter - US court cases and legal documents
 * Run by Free Law Project - all public domain
 */
class CourtListenerAdapter {
  private baseUrl = COURTLISTENER_API;
  private apiToken: string | null = null;

  /**
   * Set API token (obtain a free token at https://www.courtlistener.com/sign-in/)
   */
  async setApiToken(token: string): Promise<void> {
    this.apiToken = token;
    await AsyncStorage.setItem(COURTLISTENER_TOKEN_KEY, token);
  }

  /**
   * Load a previously-stored token from AsyncStorage.
   */
  async loadApiToken(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(COURTLISTENER_TOKEN_KEY);
      if (stored) this.apiToken = stored;
    } catch {}
  }

  /**
   * Build request headers, including the API token when available.
   * CourtListener uses HTTPTokenAuthentication: "Authorization: Token <value>"
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiToken) {
      headers["Authorization"] = `Token ${this.apiToken}`;
    }
    return headers;
  }

  /**
   * Resolve a 403 response into an actionable error message.
   */
  private handle403(): never {
    if (!this.apiToken) {
      throw new Error(
        "CourtListener requires a free API token. Sign up at courtlistener.com/sign-in, then enter your token in App Settings → API Keys.",
      );
    }
    throw new Error(
      "CourtListener API token is invalid or expired. Please update it in App Settings → API Keys.",
    );
  }

  /**
   * Search court opinions
   */
  async search(query: string, pageSize: number = 20): Promise<SearchResult[]> {
    try {
      if (!this.apiToken) await this.loadApiToken();

      const searchQuery = encodeURIComponent(query);
      const url = `${this.baseUrl}/search/?q=${searchQuery}&type=o&order_by=score desc&page_size=${pageSize}`;

      const response = await fetch(url, { headers: this.getHeaders() });

      if (response.status === 403) this.handle403();
      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }

      const data: CourtListenerResponse = await response.json();

      if (!data.results) {
        return [];
      }

      return data.results
        .filter((opinion) => this.hasDownloadUrl(opinion))
        .map((opinion) => this.mapToSearchResult(opinion))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching CourtListener:", error);
      throw error;
    }
  }

  /**
   * Search by court
   */
  async searchByCourt(
    query: string,
    court: string,
    pageSize: number = 20,
  ): Promise<SearchResult[]> {
    try {
      if (!this.apiToken) await this.loadApiToken();

      const searchQuery = encodeURIComponent(query);
      const url = `${this.baseUrl}/search/?q=${searchQuery}&type=o&court=${court}&order_by=score desc&page_size=${pageSize}`;

      const response = await fetch(url, { headers: this.getHeaders() });

      if (response.status === 403) this.handle403();
      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }

      const data: CourtListenerResponse = await response.json();

      if (!data.results) {
        return [];
      }

      return data.results
        .filter((opinion) => this.hasDownloadUrl(opinion))
        .map((opinion) => this.mapToSearchResult(opinion))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching by court:", error);
      throw error;
    }
  }

  /**
   * Search by date range
   */
  async searchByDateRange(
    query: string,
    dateFrom: string,
    dateTo: string,
    pageSize: number = 20,
  ): Promise<SearchResult[]> {
    try {
      if (!this.apiToken) await this.loadApiToken();

      const searchQuery = encodeURIComponent(query);
      const url = `${this.baseUrl}/search/?q=${searchQuery}&type=o&filed_after=${dateFrom}&filed_before=${dateTo}&order_by=score desc&page_size=${pageSize}`;

      const response = await fetch(url, { headers: this.getHeaders() });

      if (response.status === 403) this.handle403();
      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }

      const data: CourtListenerResponse = await response.json();

      if (!data.results) {
        return [];
      }

      return data.results
        .filter((opinion) => this.hasDownloadUrl(opinion))
        .map((opinion) => this.mapToSearchResult(opinion))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching by date range:", error);
      throw error;
    }
  }

  /**
   * Check if opinion has download URL
   */
  private hasDownloadUrl(opinion: CourtListenerOpinion): boolean {
    return Boolean(opinion.download_url || opinion.local_path);
  }

  /**
   * Extract PDF URL from opinion
   */
  private extractPdfUrl(opinion: CourtListenerOpinion): string | null {
    if (opinion.download_url) {
      return opinion.download_url;
    }

    if (opinion.local_path) {
      return `https://www.courtlistener.com${opinion.local_path}`;
    }

    return null;
  }

  /**
   * Map CourtListener opinion to SearchResult
   */
  private mapToSearchResult(
    opinion: CourtListenerOpinion,
  ): SearchResult | null {
    const pdfUrl = this.extractPdfUrl(opinion);

    if (!pdfUrl) {
      return null;
    }

    const downloadOptions: DownloadOption[] = [
      {
        type: "pdf",
        url: pdfUrl,
      },
    ];

    // Extract authors (judges)
    const authors: string[] = [];
    if (opinion.author_str) {
      authors.push(opinion.author_str);
    }
    if (opinion.joined_by_str) {
      authors.push(...opinion.joined_by_str.split(",").map((s) => s.trim()));
    }

    const year = opinion.date_filed
      ? opinion.date_filed.substring(0, 4)
      : undefined;

    return {
      id: opinion.id.toString(),
      source: "courtlistener",
      title: opinion.case_name,
      authors: authors.length > 0 ? authors : undefined,
      year,
      downloadOptions,
      sourceUrl: `https://www.courtlistener.com${opinion.absolute_url}`,
    };
  }

  /**
   * Get opinion by ID
   */
  async getOpinion(opinionId: string): Promise<SearchResult | null> {
    try {
      if (!this.apiToken) await this.loadApiToken();

      const url = `${this.baseUrl}/opinions/${opinionId}/`;
      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        return null;
      }

      const opinion: CourtListenerOpinion = await response.json();
      return this.mapToSearchResult(opinion);
    } catch (error) {
      console.error("Error fetching opinion:", error);
      return null;
    }
  }
}

// Export singleton instance
export const courtListenerAdapter = new CourtListenerAdapter();
