/**
 * Core types for the PDF Research & Study Library download system
 */

// export type LibrarySource = "gutenberg" | "openlibrary" | "pmc";
export type LibrarySource =
  | "gutenberg"
  | "openlibrary"
  | "arxiv"
  | "core"
  | "zenodo"
  | "courtlistener"
  | "pmc"
  | "doaj"
  | "europepmc";
export type FileType = "pdf" | "epub";

export interface DownloadOption {
  type: FileType;
  url: string;
  size?: number; // in bytes, if available
}

export interface SearchResult {
  id: string;
  source: LibrarySource;
  title: string;
  authors?: string[];
  year?: string;
  downloadOptions: DownloadOption[];
  sourceUrl?: string; // optional "view on site" link
  coverUrl?: string; // optional cover image
}

export interface DownloadItem {
  id: string; // unique (source + sourceId)
  source: LibrarySource;
  sourceId: string; // e.g. Gutenberg book id, OL key, PMC id
  title: string;
  authors?: string[];
  fileType: FileType;
  originalUrl: string; // remote download URL
  localUri: string; // FileSystem.documentDirectory path
  fileSize?: number; // in bytes
  createdAt: number;
  coverUrl?: string;
}

export interface DownloadProgress {
  id: string;
  progress: number; // 0-1
  totalBytes: number;
  downloadedBytes: number;
}
