import { DownloadOption, SearchResult } from "@/src/types/library.types";

const EUROPEPMC_API = "https://www.ebi.ac.uk/europepmc/webservices/rest";

interface EuropePMCResult {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  isOpenAccess?: string;
  inPMC?: string;
  hasPDF?: string;
  fullTextUrlList?: {
    fullTextUrl: Array<{
      availability: string;
      availabilityCode: string;
      documentStyle: string;
      site: string;
      url: string;
    }>;
  };
}

interface EuropePMCResponse {
  version: string;
  hitCount: number;
  resultList: {
    result: EuropePMCResult[];
  };
}

/**
 * Europe PMC adapter for biomedical and life sciences literature
 * Includes PubMed, PMC, preprints, patents, and clinical guidelines
 */
class EuropePMCAdapter {
  private baseUrl = EUROPEPMC_API;

  /**
   * Search Europe PMC for articles
   */
  async search(query: string, pageSize: number = 25): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(query);
      const url = `${this.baseUrl}/search?query=${searchQuery}&format=json&pageSize=${pageSize}&resultType=core`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Europe PMC API error: ${response.status}`);
      }

      const data: EuropePMCResponse = await response.json();

      if (!data.resultList || !data.resultList.result) {
        return [];
      }

      return data.resultList.result
        .filter((article) => this.hasFullTextAccess(article))
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching Europe PMC:", error);
      throw error;
    }
  }

  /**
   * Search by author
   */
  async searchByAuthor(
    author: string,
    pageSize: number = 25,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(`AUTH:"${author}"`);
      const url = `${this.baseUrl}/search?query=${searchQuery}&format=json&pageSize=${pageSize}&resultType=core`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Europe PMC API error: ${response.status}`);
      }

      const data: EuropePMCResponse = await response.json();

      if (!data.resultList || !data.resultList.result) {
        return [];
      }

      return data.resultList.result
        .filter((article) => this.hasFullTextAccess(article))
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching by author:", error);
      throw error;
    }
  }

  /**
   * Search open access only
   */
  async searchOpenAccess(
    query: string,
    pageSize: number = 25,
  ): Promise<SearchResult[]> {
    try {
      const searchQuery = encodeURIComponent(`${query} AND OPEN_ACCESS:Y`);
      const url = `${this.baseUrl}/search?query=${searchQuery}&format=json&pageSize=${pageSize}&resultType=core`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Europe PMC API error: ${response.status}`);
      }

      const data: EuropePMCResponse = await response.json();

      if (!data.resultList || !data.resultList.result) {
        return [];
      }

      return data.resultList.result
        .filter((article) => this.hasFullTextAccess(article))
        .map((article) => this.mapToSearchResult(article))
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      console.error("Error searching open access:", error);
      throw error;
    }
  }

  /**
   * Check if article has full-text access
   */
  private hasFullTextAccess(article: EuropePMCResult): boolean {
    return (
      article.isOpenAccess === "Y" ||
      article.inPMC === "Y" ||
      Boolean(
        article.fullTextUrlList?.fullTextUrl &&
        article.fullTextUrlList.fullTextUrl.length > 0,
      )
    );
  }

  /**
   * Extract PDF URL from article
   */
  private extractPdfUrl(article: EuropePMCResult): string | null {
    // Try PMC ID first (most reliable)
    if (article.pmcid) {
      return `https://www.ncbi.nlm.nih.gov/pmc/articles/${article.pmcid}/pdf/`;
    }

    // Try full-text URL list
    if (article.fullTextUrlList?.fullTextUrl) {
      const pdfUrl = article.fullTextUrlList.fullTextUrl.find(
        (url) =>
          url.documentStyle === "pdf" || url.url.toLowerCase().includes(".pdf"),
      );

      if (pdfUrl) {
        return pdfUrl.url;
      }

      // Try any available URL
      const anyUrl = article.fullTextUrlList.fullTextUrl[0];
      if (anyUrl) {
        return anyUrl.url;
      }
    }

    // Try DOI-based URL
    if (article.doi) {
      return `https://doi.org/${article.doi}`;
    }

    return null;
  }

  /**
   * Map Europe PMC article to SearchResult
   */
  private mapToSearchResult(article: EuropePMCResult): SearchResult | null {
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

    // Parse authors
    const authors = article.authorString
      ? article.authorString
          .split(",")
          .map((a) => a.trim())
          .slice(0, 5)
      : [];

    return {
      id: article.id,
      source: "europepmc",
      title: article.title,
      authors,
      year: article.pubYear,
      downloadOptions,
      sourceUrl: article.pmcid
        ? `https://europepmc.org/article/PMC/${article.pmcid}`
        : `https://europepmc.org/article/${article.source}/${article.id}`,
    };
  }

  /**
   * Get article by PMCID
   */
  async getArticle(pmcid: string): Promise<SearchResult | null> {
    try {
      const url = `${this.baseUrl}/search?query=PMCID:${pmcid}&format=json&resultType=core`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const data: EuropePMCResponse = await response.json();

      if (!data.resultList?.result || data.resultList.result.length === 0) {
        return null;
      }

      return this.mapToSearchResult(data.resultList.result[0]);
    } catch (error) {
      console.error("Error fetching article:", error);
      return null;
    }
  }
}

// Export singleton instance
export const europePMCAdapter = new EuropePMCAdapter();
