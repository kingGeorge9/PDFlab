/**
 * DOAJ (Directory of Open Access Journals) Adapter
 * Open access articles covering ALL academic disciplines
 * Humanities, Sciences, Social Sciences, and more
 */

import { DownloadOption, SearchResult } from "@/src/types/library.types";

const DOAJ_API = "https://doaj.org/api/search/articles";

interface DOAJArticle {
  id: string;
  bibjson: {
    title: string;
    author?: Array<{ name: string }>;
    year?: string;
    journal?: { title: string };
    link?: Array<{ type: string; url: string }>;
    subject?: Array<{ term: string }>;
  };
}

interface DOAJResponse {
  total: number;
  results: DOAJArticle[];
}

/**
 * DOAJ (Directory of Open Access Journals) adapter
 * Covers: All academic disciplines - humanities, sciences, social sciences, etc.
 */
class DOAJAdapter {
  private baseUrl = DOAJ_API;

  /**
   * Search DOAJ for open access articles
   */
  async search(query: string, pageSize: number = 20): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(query);
      const url = `${this.baseUrl}/${searchQuery}?page=1&pageSize=${pageSize}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`DOAJ API error: ${response.status}`);
      }

      const data: DOAJResponse = await response.json();

      return data.results
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching DOAJ:", error);
      throw error;
    }
  }

  /**
   * Search by subject/field
   */
  async searchBySubject(
    subject: string,
    pageSize: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(`subject:"${subject}"`);
      const url = `${this.baseUrl}/${searchQuery}?page=1&pageSize=${pageSize}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`DOAJ API error: ${response.status}`);
      }

      const data: DOAJResponse = await response.json();

      return data.results
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching DOAJ by subject:", error);
      throw error;
    }
  }

  /**
   * Search by journal
   */
  async searchByJournal(
    journal: string,
    pageSize: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(
        `bibjson.journal.title:"${journal}"`,
      );
      const url = `${this.baseUrl}/${searchQuery}?page=1&pageSize=${pageSize}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`DOAJ API error: ${response.status}`);
      }

      const data: DOAJResponse = await response.json();

      return data.results
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching DOAJ by journal:", error);
      throw error;
    }
  }

  /**
   * Map DOAJ article to SearchResult
   */
  private mapToSearchResult(article: DOAJArticle): SearchResult | null {
    const bibjson = article.bibjson;

    // Extract PDF link if available
    const pdfLink = bibjson.link?.find(
      (link) =>
        link.type === "fulltext" || link.url.toLowerCase().includes(".pdf"),
    );

    // If no PDF available, skip this article
    if (!pdfLink) {
      return null;
    }

    const downloadOptions: DownloadOption[] = [
      {
        type: "pdf",
        url: pdfLink.url,
      },
    ];

    const authors = bibjson.author?.map((a) => a.name) || [];

    return {
      id: article.id,
      source: "doaj",
      title: bibjson.title,
      authors,
      year: bibjson.year,
      downloadOptions,
      sourceUrl: pdfLink.url,
    };
  }

  /**
   * Get article by ID
   */
  async getArticle(doajId: string): Promise<SearchResult | null> {
    try {
      const url = `https://doaj.org/api/articles/${doajId}`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const article: DOAJArticle = await response.json();
      return this.mapToSearchResult(article);
    } catch (error) {
      console.error("Error fetching DOAJ article:", error);
      return null;
    }
  }
}

// Export singleton instance
export const doajAdapter = new DOAJAdapter();
