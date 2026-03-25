/**
 * PubMed Central (PMC) Adapter
 * Uses NCBI E-utilities API to search and fetch open-access scientific research papers
 * Per requirements: PDF-only downloads from PMC
 */

import { DownloadOption, SearchResult } from "@/src/types/library.types";

const NCBI_EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PMC_BASE = "https://www.ncbi.nlm.nih.gov/pmc";

interface PMCArticle {
  id: string;
  title: string;
  authors: string[];
  journal?: string;
  year?: string;
  pmcid: string;
  doi?: string;
  hasPdf: boolean;
}

interface ESearchResult {
  esearchresult: {
    count: string;
    idlist: string[];
  };
}

interface ESummaryResult {
  result: {
    uids: string[];
    [key: string]: any;
  };
}

/**
 * PubMed Central (PMC) adapter for scientific research papers
 * Only returns articles with free full-text PDFs available
 */
class PMCAdapter {
  private esearchUrl = `${NCBI_EUTILS_BASE}/esearch.fcgi`;
  private esummaryUrl = `${NCBI_EUTILS_BASE}/esummary.fcgi`;

  /**
   * Search PMC for free full-text articles
   */
  async search(
    query: string,
    maxResults: number = 20,
  ): Promise<SearchResult[]> {
    try {
      // Step 1: Search PMC for article IDs
      // Restrict to Title/Abstract so results are topically relevant,
      // and require open-access availability for downloadable PDFs.
      const searchParams = new URLSearchParams({
        db: "pmc",
        term: `${query}[Title/Abstract] AND open access[filter]`,
        retmax: maxResults.toString(),
        retmode: "json",
      });

      const searchResponse = await fetch(`${this.esearchUrl}?${searchParams}`);

      if (!searchResponse.ok) {
        throw new Error(`PMC search error: ${searchResponse.status}`);
      }

      const searchData: ESearchResult = await searchResponse.json();
      const ids = searchData.esearchresult.idlist;

      if (ids.length === 0) {
        return [];
      }

      // Step 2: Get article details
      const articles = await this.getArticleDetails(ids);

      // Step 3: Convert to SearchResults (only those with PDFs)
      return articles
        .filter((article) => article.hasPdf)
        .map((article) => this.mapToSearchResult(article));
    } catch (error) {
      console.error("Error searching PMC:", error);
      throw error;
    }
  }

  /**
   * Search by author
   */
  async searchByAuthor(author: string): Promise<SearchResult[]> {
    return this.search(`${author}[Author]`);
  }

  /**
   * Search by journal
   */
  async searchByJournal(journal: string): Promise<SearchResult[]> {
    return this.search(`${journal}[Journal]`);
  }

  /**
   * Search by year
   */
  async searchByYear(year: number): Promise<SearchResult[]> {
    return this.search(`${year}[pdat]`);
  }

  /**
   * Search with advanced filters
   */
  async advancedSearch(params: {
    query: string;
    author?: string;
    journal?: string;
    yearFrom?: number;
    yearTo?: number;
  }): Promise<SearchResult[]> {
    let searchQuery = params.query;

    if (params.author) {
      searchQuery += ` AND ${params.author}[Author]`;
    }

    if (params.journal) {
      searchQuery += ` AND ${params.journal}[Journal]`;
    }

    if (params.yearFrom && params.yearTo) {
      searchQuery += ` AND ${params.yearFrom}:${params.yearTo}[pdat]`;
    } else if (params.yearFrom) {
      searchQuery += ` AND ${params.yearFrom}:3000[pdat]`;
    } else if (params.yearTo) {
      searchQuery += ` AND 1800:${params.yearTo}[pdat]`;
    }

    return this.search(searchQuery);
  }

  /**
   * Get article details from PMC IDs
   */
  private async getArticleDetails(ids: string[]): Promise<PMCArticle[]> {
    try {
      const summaryParams = new URLSearchParams({
        db: "pmc",
        id: ids.join(","),
        retmode: "json",
      });

      const response = await fetch(`${this.esummaryUrl}?${summaryParams}`);

      if (!response.ok) {
        throw new Error(`PMC summary error: ${response.status}`);
      }

      const data: ESummaryResult = await response.json();
      const articles: PMCArticle[] = [];

      for (const id of ids) {
        const article = data.result[id];

        if (!article) continue;

        // Extract PMCID (needed for download URL)
        const pmcid =
          article.articleids?.find((aid: any) => aid.idtype === "pmcid")
            ?.value || "";

        if (!pmcid) continue;

        articles.push({
          id,
          title: article.title || "Untitled",
          authors: this.extractAuthors(article),
          journal: article.fulljournalname || article.source,
          year: article.pubdate ? this.extractYear(article.pubdate) : undefined,
          pmcid,
          doi: article.articleids?.find((aid: any) => aid.idtype === "doi")
            ?.value,
          hasPdf: true, // PMC articles in open access generally have PDFs
        });
      }

      return articles;
    } catch (error) {
      console.error("Error fetching article details:", error);
      return [];
    }
  }

  /**
   * Extract authors from article data
   */
  private extractAuthors(article: any): string[] {
    if (!article.authors) return [];

    return article.authors
      .slice(0, 5) // Limit to first 5 authors
      .map((author: any) => author.name || "Unknown")
      .filter(Boolean);
  }

  /**
   * Extract year from publication date
   */
  private extractYear(pubdate: string): string {
    const match = pubdate.match(/\d{4}/);
    return match ? match[0] : "";
  }

  /**
   * Map PMC article to SearchResult
   */
  private mapToSearchResult(article: PMCArticle): SearchResult {
    // Use Europe PMC render endpoint — serves the actual PDF binary
    // (the NCBI /pdf/ trailing-slash URL returns an HTML listing page)
    const pdfUrl = `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${article.pmcid}&blobtype=pdf`;

    const downloadOptions: DownloadOption[] = [
      {
        type: "pdf",
        url: pdfUrl,
      },
    ];

    return {
      id: article.pmcid,
      source: "pmc",
      title: article.title,
      authors: article.authors,
      year: article.year,
      downloadOptions,
      sourceUrl: `${PMC_BASE}/articles/${article.pmcid}/`,
    };
  }

  /**
   * Get a specific article by PMCID
   */
  async getArticle(pmcid: string): Promise<SearchResult | null> {
    try {
      const searchParams = new URLSearchParams({
        db: "pmc",
        term: `${pmcid}[pmcid]`,
        retmode: "json",
      });

      const searchResponse = await fetch(`${this.esearchUrl}?${searchParams}`);

      if (!searchResponse.ok) {
        return null;
      }

      const searchData: ESearchResult = await searchResponse.json();
      const ids = searchData.esearchresult.idlist;

      if (ids.length === 0) {
        return null;
      }

      const articles = await this.getArticleDetails([ids[0]]);

      if (articles.length === 0) {
        return null;
      }

      return this.mapToSearchResult(articles[0]);
    } catch (error) {
      console.error("Error fetching PMC article:", error);
      return null;
    }
  }
}

// Export singleton instance
export const pmcAdapter = new PMCAdapter();
