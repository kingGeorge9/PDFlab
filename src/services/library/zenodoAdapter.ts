import { DownloadOption, SearchResult } from "@/src/types/library.types";

const ZENODO_API = "https://zenodo.org/api";

interface ZenodoFile {
  key: string;
  size: number;
  type: string;
  links: {
    self: string;
  };
}

interface ZenodoRecord {
  id: number;
  metadata: {
    title: string;
    creators: Array<{ name: string }>;
    publication_date: string;
    description?: string;
    resource_type?: {
      type: string;
      title: string;
    };
    access_right?: string;
  };
  files?: ZenodoFile[];
  links: {
    html: string;
  };
}

interface ZenodoResponse {
  hits: {
    total: number;
    hits: ZenodoRecord[];
  };
}

/**
 * Zenodo adapter - CERN's research repository
 * Contains research papers, datasets, presentations, and more
 */
class ZenodoAdapter {
  private baseUrl = ZENODO_API;

  /**
   * Search Zenodo for open access content
   */
  async search(query: string, size: number = 20): Promise<SearchResult[]> {
    try {
      // Prioritize title matches, sort by most-relevant first
      const searchQuery = encodeURIComponent(`title:"${query}" OR ${query}`);
      const url = `${this.baseUrl}/records?q=${searchQuery}&access_right=open&size=${size}&sort=mostrecent`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Zenodo API error: ${response.status}`);
      }

      const data: ZenodoResponse = await response.json();

      if (!data.hits || !data.hits.hits) {
        return [];
      }

      return data.hits.hits
        .filter((record) => this.hasPdfFile(record))
        .map((record) => this.mapToSearchResult(record))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching Zenodo:", error);
      throw error;
    }
  }

  /**
   * Search by resource type (publication, presentation, dataset, etc.)
   */
  async searchByType(
    query: string,
    type: string,
    size: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(query);
      const url = `${this.baseUrl}/records?q=${searchQuery}&type=${type}&access_right=open&size=${size}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Zenodo API error: ${response.status}`);
      }

      const data: ZenodoResponse = await response.json();

      if (!data.hits || !data.hits.hits) {
        return [];
      }

      return data.hits.hits
        .filter((record) => this.hasPdfFile(record))
        .map((record) => this.mapToSearchResult(record))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching by type:", error);
      throw error;
    }
  }

  /**
   * Search publications only
   */
  async searchPublications(
    query: string,
    size: number = 20,
  ): Promise<SearchResult[]> {
    return this.searchByType(query, "publication", size);
  }

  /**
   * Check if record has PDF files
   */
  private hasPdfFile(record: ZenodoRecord): boolean {
    if (!record.files || record.files.length === 0) {
      return false;
    }

    return record.files.some(
      (file) => file.type === "pdf" || file.key.toLowerCase().endsWith(".pdf"),
    );
  }

  /**
   * Extract PDF files from record
   */
  private extractPdfFiles(record: ZenodoRecord): DownloadOption[] {
    if (!record.files) {
      return [];
    }

    return record.files
      .filter(
        (file) =>
          file.type === "pdf" || file.key.toLowerCase().endsWith(".pdf"),
      )
      .map((file) => ({
        type: "pdf" as const,
        url: file.links.self,
        size: file.size,
      }));
  }

  /**
   * Map Zenodo record to SearchResult
   */
  private mapToSearchResult(record: ZenodoRecord): SearchResult | null {
    const downloadOptions = this.extractPdfFiles(record);

    if (downloadOptions.length === 0) {
      return null;
    }

    const authors = record.metadata.creators.map((c) => c.name);
    const year = record.metadata.publication_date.substring(0, 4);

    return {
      id: record.id.toString(),
      source: "zenodo",
      title: record.metadata.title,
      authors,
      year,
      downloadOptions,
      sourceUrl: record.links.html,
    };
  }

  /**
   * Get record by Zenodo ID
   */
  async getRecord(zenodoId: string): Promise<SearchResult | null> {
    try {
      const url = `${this.baseUrl}/records/${zenodoId}`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const record: ZenodoRecord = await response.json();
      return this.mapToSearchResult(record);
    } catch (error) {
      console.error("Error fetching record:", error);
      return null;
    }
  }
}

// Export singleton instance
export const zenodoAdapter = new ZenodoAdapter();
