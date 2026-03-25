/**
 * Open Library Adapter
 * Only returns truly downloadable public domain books (not borrowable/lending-only)
 * Downloads come from Internet Archive
 * Per requirements: PDF only when direct downloadable PDF link is available
 */

import { DownloadOption, SearchResult } from "@/src/types/library.types";

const OPENLIBRARY_API = "https://openlibrary.org";

interface OpenLibraryWork {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  edition_count?: number;
  has_fulltext?: boolean;
  ia?: string[]; // Internet Archive IDs
  lending_edition_s?: string;
  public_scan_b?: boolean;
}

interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  docs: OpenLibraryWork[];
}

interface OpenLibraryEdition {
  key: string;
  title: string;
  authors?: Array<{ key: string; name?: string }>;
  publish_date?: string;
  ia_box_id?: string[];
  ocaid?: string; // Open Content Alliance ID (Internet Archive)
}

/**
 * Open Library adapter - only returns downloadable public domain books
 * Filters out lending/borrow-only items
 */
class OpenLibraryAdapter {
  private baseUrl = OPENLIBRARY_API;

  /**
   * Search for downloadable books in Open Library
   * Only returns books with full-text available for download
   */
  async search(query: string, page: number = 1): Promise<SearchResult[]> {
    try {
      const offset = (page - 1) * 20;
      // Only search for books that have full text available
      const url = `${this.baseUrl}/search.json?q=${encodeURIComponent(query)}&has_fulltext=true&page=${page}&offset=${offset}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Open Library API error: ${response.status}`);
      }

      const data: OpenLibrarySearchResponse = await response.json();

      // Filter and map results - only keep truly downloadable items
      const results = await Promise.all(
        data.docs
          .filter((work) => this.isDownloadable(work))
          .slice(0, 10) // Limit to 10 results per page
          .map((work) => this.mapToSearchResult(work)),
      );

      // Filter out null results and those without download options
      return results.filter(
        (r): r is SearchResult => r !== null && r.downloadOptions.length > 0,
      );
    } catch (error) {
      console.error("Error searching Open Library:", error);
      throw error;
    }
  }

  /**
   * Get a specific work by Open Library ID
   */
  async getWork(workId: string): Promise<SearchResult | null> {
    try {
      const url = `${this.baseUrl}/works/${workId}.json`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const work = await response.json();

      // Check if it has editions with downloads
      const editionsUrl = `${this.baseUrl}/works/${workId}/editions.json`;
      const editionsResponse = await fetch(editionsUrl);

      if (!editionsResponse.ok) {
        return null;
      }

      const editionsData = await editionsResponse.json();
      const downloadableEdition = editionsData.entries?.find(
        (e: OpenLibraryEdition) => e.ocaid,
      );

      if (!downloadableEdition) {
        return null;
      }

      return this.mapEditionToSearchResult(downloadableEdition, work.title);
    } catch (error) {
      console.error("Error fetching Open Library work:", error);
      return null;
    }
  }

  /**
   * Search by author
   */
  async searchByAuthor(author: string): Promise<SearchResult[]> {
    try {
      const url = `${this.baseUrl}/search.json?author=${encodeURIComponent(author)}&has_fulltext=true`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Open Library API error: ${response.status}`);
      }

      const data: OpenLibrarySearchResponse = await response.json();

      const results = await Promise.all(
        data.docs
          .filter((work) => this.isDownloadable(work))
          .slice(0, 10)
          .map((work) => this.mapToSearchResult(work)),
      );

      return results.filter(
        (r): r is SearchResult => r !== null && r.downloadOptions.length > 0,
      );
    } catch (error) {
      console.error("Error searching by author:", error);
      throw error;
    }
  }

  /**
   * Check if a work is truly downloadable (not just borrowable)
   */
  private isDownloadable(work: OpenLibraryWork): boolean {
    // Must have Internet Archive ID (ia field)
    // Must be public scan (not lending-only)
    return Boolean(
      work.has_fulltext &&
      work.ia &&
      work.ia.length > 0 &&
      work.public_scan_b !== false, // If public_scan_b is false, it's lending-only
    );
  }

  /**
   * Map Open Library work to SearchResult
   */
  private async mapToSearchResult(
    work: OpenLibraryWork,
  ): Promise<SearchResult | null> {
    if (!work.ia || work.ia.length === 0) {
      return null;
    }

    const iaId = work.ia[0]; // Use first Internet Archive ID
    const downloadOptions = await this.getDownloadOptions(iaId);

    if (downloadOptions.length === 0) {
      return null; // No downloadable formats available
    }

    return {
      id: work.key.replace("/works/", ""),
      source: "openlibrary",
      title: work.title,
      authors: work.author_name,
      year: work.first_publish_year?.toString(),
      downloadOptions,
      sourceUrl: `${this.baseUrl}${work.key}`,
      coverUrl: this.getCoverUrl(work.key),
    };
  }

  /**
   * Map Open Library edition to SearchResult
   */
  private mapEditionToSearchResult(
    edition: OpenLibraryEdition,
    title?: string,
  ): SearchResult | null {
    if (!edition.ocaid) {
      return null;
    }

    // For editions, we only provide PDF per requirements
    const downloadOptions: DownloadOption[] = [
      {
        type: "pdf",
        url: `https://archive.org/download/${edition.ocaid}/${edition.ocaid}.pdf`,
      },
    ];

    return {
      id: edition.key.replace("/books/", ""),
      source: "openlibrary",
      title: title || edition.title,
      authors: edition.authors?.map((a) => a.name || "Unknown"),
      year: edition.publish_date,
      downloadOptions,
      sourceUrl: `${this.baseUrl}${edition.key}`,
      coverUrl: this.getCoverUrl(edition.key),
    };
  }

  /**
   * Get download options from Internet Archive ID
   * Per requirements: Only PDF when direct downloadable PDF link is available
   */
  private async getDownloadOptions(iaId: string): Promise<DownloadOption[]> {
    const options: DownloadOption[] = [];

    // Per requirements: Open Library - PDF only when direct downloadable link available
    // Internet Archive provides PDFs at predictable URLs
    const pdfUrl = `https://archive.org/download/${iaId}/${iaId}.pdf`;

    try {
      // Verify the PDF exists with a HEAD request
      const response = await fetch(pdfUrl, { method: "HEAD" });
      if (response.ok) {
        options.push({
          type: "pdf",
          url: pdfUrl,
        });
      }
    } catch {
      // PDF not available, skip
    }

    return options;
  }

  /**
   * Get cover image URL
   */
  private getCoverUrl(key: string): string {
    const id = key.replace("/works/", "").replace("/books/", "");
    return `${this.baseUrl}/works/${id}-M.jpg`;
  }
}

// Export singleton instance
export const openLibraryAdapter = new OpenLibraryAdapter();
