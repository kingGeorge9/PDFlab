/**
 * Search Relevance Scoring & Filtering
 * ─────────────────────────────────────────────────────────────────────
 * Post-search relevance filter that:
 *   1. Hard-rejects results where no query keyword appears in the title
 *   2. Scores each result against the user's query
 *   3. Rejects results below a strict threshold
 *   4. Sorts surviving results by descending relevance
 *
 * Scoring dimensions:
 *   • Title word overlap   (75 % — dominant signal)
 *   • Exact phrase match   (15 %)
 *   • Author match bonus   ( 5 %)
 *   • Year / recency       ( 5 %)
 *
 * All comparisons are case-insensitive, punctuation-stripped, and
 * stop-word-aware. Designed for 96-100 % keyword-match accuracy.
 * ─────────────────────────────────────────────────────────────────────
 */

import type { SearchResult } from "@/src/types/library.types";

// ── Config ───────────────────────────────────────────────────────────

/** Minimum relevance score (0-1) to keep a result. */
const MIN_RELEVANCE = 0.4;

/**
 * If the user's query has this many content words or fewer, EVERY
 * content word must appear in the title (exact or partial).
 * For longer queries only `MIN_KEYWORD_RATIO` of words need to match.
 */
const STRICT_WORD_LIMIT = 4;

/** For queries longer than STRICT_WORD_LIMIT, at least this fraction
 *  of content words must appear in the title to survive. */
const MIN_KEYWORD_RATIO = 0.5;

/** Common English stop words to ignore when tokenizing. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "its",
  "as",
  "was",
  "that",
  "this",
  "are",
  "be",
  "has",
  "had",
  "have",
  "not",
  "no",
  "do",
  "does",
  "did",
  "will",
  "can",
  "could",
  "would",
  "should",
  "may",
  "might",
  "about",
  "into",
  "over",
  "after",
  "before",
  "between",
  "through",
  "during",
  "under",
  "how",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "each",
  "every",
  "all",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "than",
  "too",
  "very",
  "just",
  "because",
  "so",
  "if",
  "then",
  "there",
  "here",
  "up",
  "out",
  "off",
  "down",
  "only",
  "own",
  "same",
  "also",
  "been",
  "being",
  "were",
  "while",
  "their",
  "them",
  "they",
  "these",
  "those",
]);

// ── Helpers ──────────────────────────────────────────────────────────

/** Normalize text: lowercase, strip punctuation, collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize into meaningful words (no stop words, no 1-char tokens). */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Check whether a query token matches any title token.
 * Returns 1 for exact match, 0.5 for partial (substring), 0 for miss.
 */
function tokenMatchScore(queryToken: string, titleTokens: string[]): number {
  for (const tw of titleTokens) {
    if (tw === queryToken) return 1;
  }
  // Partial match: one contains the other, minimum 3-char overlap
  if (queryToken.length >= 3) {
    for (const tw of titleTokens) {
      if (tw.includes(queryToken) || queryToken.includes(tw)) {
        return 0.5;
      }
    }
  }
  return 0;
}

// ── Scoring ──────────────────────────────────────────────────────────

interface ScoredResult {
  result: SearchResult;
  score: number;
}

/**
 * Score a single result against the query.
 * Returns a value between 0 and 1.
 */
function scoreResult(query: string, result: SearchResult): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 1; // empty query → keep everything

  const titleTokens = tokenize(result.title);
  const normalizedTitle = normalize(result.title);
  const normalizedQuery = normalize(query);

  // ── Hard gate: keyword presence in title ───────────────────────
  // Count how many query keywords appear (exact or partial) in title
  let keywordsPresent = 0;
  for (const qt of queryTokens) {
    if (tokenMatchScore(qt, titleTokens) > 0) keywordsPresent++;
  }

  if (queryTokens.length <= STRICT_WORD_LIMIT) {
    // Short queries: ALL content words must appear in title
    if (keywordsPresent < queryTokens.length) return 0;
  } else {
    // Longer queries: at least MIN_KEYWORD_RATIO must match
    if (keywordsPresent / queryTokens.length < MIN_KEYWORD_RATIO) return 0;
  }

  // ── 1. Title word overlap (75 % weight) ────────────────────────
  let matchScore = 0;
  for (const qt of queryTokens) {
    matchScore += tokenMatchScore(qt, titleTokens);
  }
  const overlapScore = matchScore / queryTokens.length;

  // ── 2. Exact phrase match bonus (15 %) ─────────────────────────
  const phraseBonus = normalizedTitle.includes(normalizedQuery) ? 1 : 0;

  // ── 3. Author match bonus (5 %) ───────────────────────────────
  let authorBonus = 0;
  if (result.authors && result.authors.length > 0) {
    const authorText = normalize(result.authors.join(" "));
    for (const qt of queryTokens) {
      if (authorText.includes(qt)) {
        authorBonus = 1;
        break;
      }
    }
  }

  // ── 4. Recency tiebreaker (5 %) ───────────────────────────────
  let recencyScore = 0.5;
  if (result.year) {
    const year = parseInt(result.year, 10);
    if (!isNaN(year)) {
      const currentYear = new Date().getFullYear();
      const age = currentYear - year;
      if (age <= 2) recencyScore = 1;
      else if (age <= 10) recencyScore = 0.7;
      else if (age <= 50) recencyScore = 0.4;
      else recencyScore = 0.2;
    }
  }

  // ── Weighted composite ─────────────────────────────────────────
  return (
    overlapScore * 0.75 +
    phraseBonus * 0.15 +
    authorBonus * 0.05 +
    recencyScore * 0.05
  );
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Filter and rank search results by relevance to the query.
 *
 * - Hard-rejects results with insufficient keyword presence in title
 * - Removes results scoring below `MIN_RELEVANCE`
 * - Sorts remaining by descending score
 * - Returns only the SearchResult objects (score is internal)
 */
export function filterByRelevance(
  query: string,
  results: SearchResult[],
): SearchResult[] {
  const scored: ScoredResult[] = results.map((result) => ({
    result,
    score: scoreResult(query, result),
  }));

  return scored
    .filter((sr) => sr.score >= MIN_RELEVANCE)
    .sort((a, b) => b.score - a.score)
    .map((sr) => sr.result);
}
