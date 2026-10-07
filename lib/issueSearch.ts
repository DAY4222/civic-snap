import synonymsFile from '@/data/search-synonyms.json';

import { ISSUE_CATEGORIES } from './categories';
import { CITY, type NotHandledRedirect } from './city';
import type { IssueCategory } from './types';

/** How much a matching word counts, by where it was found. */
const WEIGHTS = { title: 3, synonym: 2, path: 1, question: 0.5 } as const;
/** A curated phrase equal to the whole query is the strongest signal of what the user means. */
const EXACT_SYNONYM_BONUS = 3;
const EXACT_TITLE_BONUS = 3;
/** Matching the start of a word ("pot" → "pothole") counts a little less than the whole word. */
const PREFIX_QUALITY = 0.75;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'by', 'for', 'from', 'i', 'in', 'is', 'it', 'its', 'me', 'my',
  'near', 'of', 'on', 'our', 'that', 'the', 'there', 'this', 'to', 'was', 'we', 'were', 'with',
]);

export type IssueSearchResult = {
  categories: IssueCategory[];
  /** Things 311 does not handle, with where to report them instead. */
  redirects: NotHandledRedirect[];
};

type IndexedIssue = {
  category: IssueCategory;
  normalizedTitle: string;
  pathWords: string[];
  questionWords: string[];
  synonymPhrases: string[];
  synonymWords: string[];
  titleWords: string[];
};

const SYNONYMS = synonymsFile as unknown as Record<string, string[] | string>;

/** Lowercase, no accents or punctuation, single spaces. */
export function normalizeSearchText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toWords(text: string) {
  const normalized = normalizeSearchText(text);
  return normalized ? normalized.split(' ') : [];
}

/** Plural-insensitive: "potholes" and "pothole" compare equal; "glass" and "bus" are left alone. */
function stem(word: string) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

export function getIssueSynonyms(issueId: string): string[] {
  const entry = SYNONYMS[issueId];
  return Array.isArray(entry) ? entry : [];
}

function indexIssue(category: IssueCategory): IndexedIssue {
  const synonyms = getIssueSynonyms(category.id);
  return {
    category,
    normalizedTitle: normalizeSearchText(category.title),
    pathWords: unique(category.categoryPath.flatMap(toWords).map(stem)),
    questionWords: unique(category.questions.flatMap((question) => toWords(question.label)).map(stem)),
    synonymPhrases: synonyms.map(normalizeSearchText),
    synonymWords: unique(synonyms.flatMap(toWords).map(stem)),
    titleWords: unique(toWords(category.title).map(stem)),
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

/** 1 for the whole word, less for the start of one, 0 for no match. */
function matchQuality(queryWord: string, fieldWords: string[]) {
  let best = 0;
  for (const word of fieldWords) {
    if (word === queryWord) return 1;
    if (queryWord.length >= 2 && word.startsWith(queryWord)) best = PREFIX_QUALITY;
  }
  return best;
}

let cachedIndex: { catalog: IssueCategory[]; issues: IndexedIssue[] } | null = null;

function getIndex(catalog: IssueCategory[]) {
  if (cachedIndex?.catalog !== catalog) {
    cachedIndex = { catalog, issues: catalog.map(indexIssue) };
  }
  return cachedIndex.issues;
}

/**
 * Ranks issues for what the user typed. Issues matching more of the query's words come first,
 * then higher scores (title words count most, then curated everyday words, then the category
 * path, then checklist questions), then the title alphabetically.
 */
export function searchIssues(query: string, catalog: IssueCategory[] = ISSUE_CATEGORIES): IssueSearchResult {
  const normalizedQuery = normalizeSearchText(query);
  const queryWords = unique(toWords(query).filter((word) => !STOPWORDS.has(word)).map(stem));
  const redirects = findNotHandledRedirects(query);
  if (queryWords.length === 0) return { categories: [], redirects };

  const ranked = getIndex(catalog)
    .map((issue) => {
      let matched = 0;
      let score = 0;
      for (const word of queryWords) {
        const best = Math.max(
          WEIGHTS.title * matchQuality(word, issue.titleWords),
          WEIGHTS.synonym * matchQuality(word, issue.synonymWords),
          WEIGHTS.path * matchQuality(word, issue.pathWords),
          WEIGHTS.question * matchQuality(word, issue.questionWords)
        );
        if (best > 0) {
          matched += 1;
          score += best;
        }
      }
      if (issue.synonymPhrases.includes(normalizedQuery)) score += EXACT_SYNONYM_BONUS;
      if (issue.normalizedTitle === normalizedQuery) score += EXACT_TITLE_BONUS;
      return { category: issue.category, matched, score };
    })
    .filter((result) => result.matched > 0)
    .sort(
      (a, b) =>
        b.matched - a.matched ||
        b.score - a.score ||
        a.category.title.localeCompare(b.category.title)
    );

  return { categories: ranked.map((result) => result.category), redirects };
}

/**
 * Redirects whose phrase appears in the query, or (from seven letters on) starts with it, so
 * "streetl" already points to the right place while "street" does not.
 */
export function findNotHandledRedirects(query: string, redirects = CITY.notHandled) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return redirects.filter((redirect) =>
    redirect.match.some((phrase) => {
      const normalizedPhrase = normalizeSearchText(phrase);
      return (
        normalizedQuery.includes(normalizedPhrase) ||
        (normalizedQuery.length >= 7 && normalizedPhrase.startsWith(normalizedQuery))
      );
    })
  );
}
