/**
 * arXiv Adapter
 * Scientific research papers covering: Computer Science, AI, Math, Physics, Engineering
 * All papers available as PDF
 */

import { DownloadOption, SearchResult } from "@/src/types/library.types";

const ARXIV_API = "https://export.arxiv.org/api/query";

interface ArxivEntry {
  id: string;
  title: string;
  authors: string[];
  published: string;
  summary: string;
  category: string;
  pdfUrl: string;
}

/**
 * arXiv adapter for scientific research papers
 * Covers: Computer Science, AI, Math, Physics, Engineering, etc.
 */
class ArxivAdapter {
  private baseUrl = ARXIV_API;

  /**
   * Search arXiv for papers
   */
  async search(
    query: string,
    maxResults: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(query);
      // Prioritize title matches, fall back to abstract for broader coverage
      const url = `${this.baseUrl}?search_query=ti:${searchQuery}+OR+abs:${searchQuery}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`arXiv API error: ${response.status}`);
      }

      const xmlText = await response.text();
      const entries = this.parseArxivXML(xmlText);

      return entries.map((entry) => this.mapToSearchResult(entry));
    } catch (error) {
      console.error("Error searching arXiv:", error);
      throw error;
    }
  }

  /**
   * Search by category (cs.AI, math.CO, physics.gen-ph, etc.)
   */
  async searchByCategory(
    category: string,
    maxResults: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const url = `${this.baseUrl}?search_query=cat:${category}&start=0&max_results=${maxResults}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`arXiv API error: ${response.status}`);
      }

      const xmlText = await response.text();
      const entries = this.parseArxivXML(xmlText);

      return entries.map((entry) => this.mapToSearchResult(entry));
    } catch (error) {
      console.error("Error searching arXiv by category:", error);
      throw error;
    }
  }

  /**
   * Search by author
   */
  async searchByAuthor(
    author: string,
    maxResults: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(author);
      const url = `${this.baseUrl}?search_query=au:${searchQuery}&start=0&max_results=${maxResults}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`arXiv API error: ${response.status}`);
      }

      const xmlText = await response.text();
      const entries = this.parseArxivXML(xmlText);

      return entries.map((entry) => this.mapToSearchResult(entry));
    } catch (error) {
      console.error("Error searching arXiv by author:", error);
      throw error;
    }
  }

  /**
   * Parse arXiv XML response (simple parser)
   */
  private parseArxivXML(xmlText: string): ArxivEntry[] {
    const entries: ArxivEntry[] = [];

    // Split by entry tags
    const entryMatches = xmlText.match(/<entry>([\s\S]*?)<\/entry>/g);

    if (!entryMatches) return entries;

    for (const entryXml of entryMatches) {
      try {
        // Extract ID
        const idMatch = entryXml.match(/<id>(.*?)<\/id>/);
        const id = idMatch ? idMatch[1].split("/abs/")[1] : "";

        // Extract title
        const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
        const title = titleMatch
          ? titleMatch[1].trim().replace(/\s+/g, " ")
          : "Untitled";

        // Extract authors
        const authorMatches = entryXml.match(
          /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g,
        );
        const authors: string[] = [];
        if (authorMatches) {
          for (const authorXml of authorMatches) {
            const nameMatch = authorXml.match(/<name>(.*?)<\/name>/);
            if (nameMatch) authors.push(nameMatch[1]);
          }
        }

        // Extract published date
        const publishedMatch = entryXml.match(/<published>(.*?)<\/published>/);
        const published = publishedMatch
          ? publishedMatch[1].substring(0, 10)
          : "";

        // Extract summary
        const summaryMatch = entryXml.match(/<summary>([\s\S]*?)<\/summary>/);
        const summary = summaryMatch ? summaryMatch[1].trim() : "";

        // Extract category
        const categoryMatch = entryXml.match(/<category term="(.*?)"/);
        const category = categoryMatch ? categoryMatch[1] : "";

        // Construct PDF URL
        const pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;

        entries.push({
          id,
          title,
          authors,
          published,
          summary,
          category,
          pdfUrl,
        });
      } catch (error) {
        console.error("Error parsing arXiv entry:", error);
      }
    }

    return entries;
  }

  /**
   * Map arXiv entry to SearchResult
   */
  private mapToSearchResult(entry: ArxivEntry): SearchResult {
    const downloadOptions: DownloadOption[] = [
      {
        type: "pdf",
        url: entry.pdfUrl,
      },
    ];

    return {
      id: entry.id,
      source: "arxiv",
      title: entry.title,
      authors: entry.authors,
      year: entry.published ? entry.published.substring(0, 4) : undefined,
      downloadOptions,
      sourceUrl: `https://arxiv.org/abs/${entry.id}`,
    };
  }

  /**
   * Get a specific paper by arXiv ID
   */
  async getPaper(arxivId: string): Promise<SearchResult | null> {
    try {
      const url = `${this.baseUrl}?id_list=${arxivId}`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const xmlText = await response.text();
      const entries = this.parseArxivXML(xmlText);

      if (entries.length === 0) {
        return null;
      }

      return this.mapToSearchResult(entries[0]);
    } catch (error) {
      console.error("Error fetching arXiv paper:", error);
      return null;
    }
  }
}

// Export singleton instance
export const arxivAdapter = new ArxivAdapter();
