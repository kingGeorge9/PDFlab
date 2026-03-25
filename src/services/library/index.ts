/**
 * Library Services - Barrel Export
 * Research & Study Library download system
 */

// Types
export * from "@/src/types/library.types";

// Source Adapters
export { arxivAdapter } from "./arxivAdapter";
export { coreAdapter } from "./coreAdapter";
export { courtListenerAdapter } from "./courtListenerAdapter";
export { gutenbergAdapter } from "./gutenbergAdapter";
export { openLibraryAdapter } from "./openLibraryAdapter";
export { pmcAdapter } from "./pmcAdapter";
export { zenodoAdapter } from "./zenodoAdapter";

// URL Failure Cache
export {
    clearFailureCache,
    filterFailedResults,
    hasRecentFailureSync,
    recordFailure,
    warmFailureCache
} from "./urlFailureCache";
export type { FailureReason } from "./urlFailureCache";

// Download Management
export { downloadManager } from "./downloadManager";
export { downloadsStore } from "./downloadsStore";

// Option Classification
export { classifyOptions, hasDirectDownload } from "./classifyOption";
export type { ClassifiedOption, OptionKind } from "./classifyOption";

// Relevance Filtering
export { filterByRelevance } from "./relevanceFilter";
