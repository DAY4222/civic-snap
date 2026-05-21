#!/usr/bin/env node

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CATEGORY_SOURCE_FILE = path.join(ROOT, 'lib/categories.ts');
const OUTPUT_JSON = path.join(ROOT, 'data/toronto-311-target-issues.json');
const OUTPUT_RAW_JSON = path.join(ROOT, 'data/toronto-311-target-issues.raw.json');
const OUTPUT_MARKDOWN = path.join(ROOT, 'docs/toronto-311-target-issues.md');

const CATEGORIES_URL = 'https://to311kb-web0.ecrm.inter.prod-toronto.ca/Categories';
const ARTICLE_URL = 'https://to311kb-web0.ecrm.inter.prod-toronto.ca/Article/';
const REQUEST_METADATA_URL = 'https://to311kb-web0.ecrm.inter.prod-toronto.ca/api/RequestMetadata/';
const SEARCH_URL = 'https://find.toronto.ca/rest/v2/api/search';
const OPEN_DATA_PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=311-service-requests-customer-initiated';
const SERVICE_REQUEST_PAGE =
  'https://www.toronto.ca/home/311-toronto-at-your-service/create-a-service-request/';
const RECAPTCHA_SITE_KEY = '6LeN_XIUAAAAAEd8X21vFtkJ3_c7uA0xpUGcrGpe';

const MATCH_CONFIDENCE = {
  problemTypeNameExact: 1,
  browseNameExact: 0.98,
  childProblemTypeNameExact: 0.95,
  searchTitleExact: 0.9,
  refinementProblemTypeNameExact: 0.92,
  refinementOptionLabelExact: 0.86,
  openDataServiceRequestTypeExact: 0.78,
};

const QUESTION_SECTIONS = ['eligibilityQuestions', 'intakeQuestions', 'refinementQuestions'];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const targetNames = readTargetNames();
  if (targetNames.length > 100) {
    throw new Error(`Expected at most 100 target rows, found ${targetNames.length}.`);
  }

  console.log(`Scraping ${targetNames.length} Toronto 311 target issues.`);

  const generatedAt = new Date().toISOString();
  const categoryTreeResponse = await fetchJson(CATEGORIES_URL);
  const rawCategoryTree = categoryTreeResponse.data ?? categoryTreeResponse;
  const categoryEntries = flattenCategoryTree(rawCategoryTree);
  const openDataServiceTypes = await fetchOpenDataServiceTypes();

  const searchResultsByTarget = {};
  for (const [index, targetName] of targetNames.entries()) {
    console.log(`Search ${index + 1}/${targetNames.length}: ${targetName}`);
    searchResultsByTarget[targetName] = await searchTarget(targetName);
    await sleep(75);
  }

  const preliminaryMatches = targetNames.map((targetName, index) =>
    matchTarget(index + 1, targetName, categoryEntries, searchResultsByTarget[targetName])
  );

  const preliminaryProblemTypeIds = unique(
    preliminaryMatches
      .filter((match) => match.matchStatus === 'matched' && match.match?.problemTypeId)
      .map((match) => match.match.problemTypeId)
  );

  const preliminaryMetadataByProblemTypeId = await fetchRequestMetadata(preliminaryProblemTypeIds);
  const refinementEntries = flattenRefinementProblemTypes(
    preliminaryMetadataByProblemTypeId,
    categoryEntries
  );
  const refinementMatches = preliminaryMatches.map((match) =>
    match.matchStatus === 'matched'
      ? match
      : matchRefinementTarget(match.rank, match.targetIssueName, refinementEntries) ?? match
  );
  const matches = refinementMatches.map((match) =>
    match.matchStatus === 'matched'
      ? match
      : matchOpenDataServiceType(match, openDataServiceTypes.serviceTypesByName) ?? match
  );

  const matchedProblemTypeIds = unique(
    matches
      .filter((match) => match.matchStatus === 'matched' && match.match?.problemTypeId)
      .map((match) => match.match.problemTypeId)
  );
  const missingProblemTypeIds = matchedProblemTypeIds.filter(
    (problemTypeId) => !preliminaryMetadataByProblemTypeId[problemTypeId]
  );
  const branchMetadataByProblemTypeId = await fetchRequestMetadata(missingProblemTypeIds);
  const metadataByProblemTypeId = {
    ...preliminaryMetadataByProblemTypeId,
    ...branchMetadataByProblemTypeId,
  };
  const articleIds = collectArticleIds(matches, metadataByProblemTypeId);
  const articleResponsesByArticleId = {};

  for (const [index, articleId] of articleIds.entries()) {
    console.log(`Article ${index + 1}/${articleIds.length}: ${articleId}`);
    articleResponsesByArticleId[articleId] = await fetchArticle(articleId);
    await sleep(75);
  }

  const targets = matches.map((match) =>
    buildTargetOutput(match, metadataByProblemTypeId, articleResponsesByArticleId)
  );

  const canonical = {
    schemaVersion: 1,
    generatedAt,
    targetCount: targets.length,
    requestedLimit: 100,
    acceptedReadableTargetCount: targetNames.length,
    sourceUrls: {
      categories: CATEGORIES_URL,
      search: SEARCH_URL,
      openData: OPEN_DATA_PACKAGE_URL,
      requestMetadata: REQUEST_METADATA_URL,
      articles: ARTICLE_URL,
      serviceRequestPage: SERVICE_REQUEST_PAGE,
    },
    assumptions: [
      'The 97 readable target rows from the supplied screenshot are accepted as the working target set.',
      'Targets are matched in supplied order and output remains target-centric even when multiple targets share a problemTypeId.',
      'Near or fuzzy candidates are kept as review candidates and are not accepted as matches.',
      'RequestMetadata calls are fetched only for matched target problemTypeIds.',
      'Exact open-data service request type matches are used only when no public category/form metadata match is available.',
    ],
    summary: summarizeTargets(targets),
    targets,
  };

  const raw = {
    generatedAt,
    targetNames,
    rawCategoryTree,
    flattenedCategoryEntries: categoryEntries,
    openDataServiceTypes,
    refinementEntries,
    searchResultsByTarget,
    matches,
    requestMetadataByProblemTypeId: metadataByProblemTypeId,
    articleResponsesByArticleId,
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_MARKDOWN), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(canonical, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_RAW_JSON, `${JSON.stringify(raw, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_MARKDOWN, buildMarkdown(canonical));

  console.log(`Wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_RAW_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_MARKDOWN)}`);
}

function readTargetNames() {
  if (fs.existsSync(OUTPUT_JSON)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
    if (Array.isArray(existing.targets) && existing.targets.length > 0) {
      return existing.targets.map((target) => target.targetIssueName);
    }
  }

  const source = fs.readFileSync(CATEGORY_SOURCE_FILE, 'utf8');
  const listMatch = source.match(
    /export const TORONTO_311_TARGET_ISSUE_TITLES = \[([\s\S]*?)\] as const;/
  );

  if (!listMatch) {
    throw new Error('Could not find TORONTO_311_TARGET_ISSUE_TITLES in lib/categories.ts.');
  }

  return [...listMatch[1].matchAll(/'((?:\\'|[^'])+)'/g)].map((match) =>
    match[1].replace(/\\'/g, "'")
  );
}

async function searchTarget(targetName) {
  const queries = searchQueriesForTarget(targetName);
  const queryResults = [];
  const mergedResults = new Map();

  for (const query of queries) {
    const result = await searchQuery(query);
    queryResults.push({ query, ...result });

    for (const item of Array.isArray(result.result) ? result.result : result.result ? [result.result] : []) {
      const key = item.id ?? item.title;
      if (!mergedResults.has(key)) mergedResults.set(key, item);
    }

    await sleep(50);
  }

  return {
    queries: queryResults,
    result: [...mergedResults.values()],
  };
}

async function searchQuery(query) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('filter', '');
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('cname', '311categories');
  url.searchParams.set('pagesize', '100');
  url.searchParams.set('default', 'AND');

  try {
    return await fetchJson(url.toString(), { retries: 2 });
  } catch (error) {
    return {
      error: error.message,
      result: [],
    };
  }
}

function searchQueriesForTarget(targetName) {
  return unique([
    targetName,
    targetName.replace(/[/-]/g, ' '),
    targetName.split(/\s+-\s+|\s*\/\s*/)[0],
  ])
    .map((query) => query.trim().replace(/\s+/g, ' '))
    .filter((query) => query.length > 0);
}

function flattenCategoryTree(nodes, pathParts = [], inheritedProblemType = null) {
  const entries = [];

  for (const node of nodes ?? []) {
    const label = node.name || node.problemTypeName || '';
    const nextPath = label ? [...pathParts, label] : pathParts;

    let currentProblemType = inheritedProblemType;

    if (node.problemTypeId) {
      currentProblemType = {
        entryType: 'problemType',
        displayName: node.name || node.problemTypeName,
        problemTypeName: node.problemTypeName,
        problemTypeId: node.problemTypeId,
        problemTypeKeywords: node.problemTypeKeywords ?? '',
        description: plainText(node.description ?? ''),
        learnMoreArticle: node.learnMoreArticle ?? null,
        path: nextPath,
      };

      entries.push(currentProblemType);

      for (const child of node.childProblemTypes ?? []) {
        entries.push({
          ...currentProblemType,
          entryType: 'childProblemType',
          displayName: child.name,
          childProblemTypeName: child.name,
          path: [...nextPath, child.name],
        });
      }
    } else if (inheritedProblemType && node.childProblemTypes) {
      for (const child of node.childProblemTypes) {
        entries.push({
          ...inheritedProblemType,
          entryType: 'childProblemType',
          displayName: child.name,
          childProblemTypeName: child.name,
          path: [...nextPath, child.name],
        });
      }
    }

    if (node.childCategories) {
      entries.push(...flattenCategoryTree(node.childCategories, nextPath, currentProblemType));
    }
  }

  return entries;
}

function matchTarget(rank, targetName, categoryEntries, searchResult) {
  const targetKey = normalize(targetName);
  const stages = [
    {
      matchType: 'problemTypeNameExact',
      sourceField: 'problemTypeName',
      candidates: categoryEntries.filter((entry) => normalize(entry.problemTypeName) === targetKey),
    },
    {
      matchType: 'browseNameExact',
      sourceField: 'name',
      candidates: categoryEntries.filter(
        (entry) => entry.entryType === 'problemType' && normalize(entry.displayName) === targetKey
      ),
    },
    {
      matchType: 'childProblemTypeNameExact',
      sourceField: 'childProblemTypes[].name',
      candidates: categoryEntries.filter(
        (entry) =>
          entry.entryType === 'childProblemType' && normalize(entry.childProblemTypeName) === targetKey
      ),
    },
  ];

  for (const stage of stages) {
    const grouped = groupCategoryCandidates(stage.candidates);
    if (grouped.length === 1) {
      return matchedTarget(rank, targetName, stage, grouped[0]);
    }

    if (grouped.length > 1) {
      return reviewTarget(rank, targetName, 'ambiguous', stage.matchType, grouped);
    }
  }

  const searchExactCandidates = normalizeSearchResults(searchResult).filter(
    (result) => normalize(result.title) === targetKey
  );
  const groupedSearch = groupSearchCandidates(searchExactCandidates);

  if (groupedSearch.length === 1) {
    return matchedSearchTarget(rank, targetName, groupedSearch[0]);
  }

  if (groupedSearch.length > 1) {
    return reviewTarget(rank, targetName, 'ambiguous', 'searchTitleExact', groupedSearch);
  }

  return {
    rank,
    targetIssueName: targetName,
    matchStatus: 'unmatched',
    match: null,
    review: {
      reason: 'No exact problemTypeName, browse name, child problem type name, or search title match.',
      candidates: normalizeSearchResults(searchResult).slice(0, 5),
    },
  };
}

function matchedTarget(rank, targetName, stage, groupedCandidate) {
  const primaryPath = pickPrimaryPath(groupedCandidate.paths, targetName);
  const alternateCategoryPaths = groupedCandidate.paths.filter(
    (pathParts) => pathParts.join('\u0000') !== primaryPath.join('\u0000')
  );

  return {
    rank,
    targetIssueName: targetName,
    matchStatus: 'matched',
    match: {
      type: stage.matchType,
      sourceField: stage.sourceField,
      confidence: MATCH_CONFIDENCE[stage.matchType],
      problemTypeId: groupedCandidate.problemTypeId,
      problemTypeName: groupedCandidate.problemTypeName,
      displayName: primaryPath.at(-1) ?? groupedCandidate.displayName,
      childProblemTypeName: groupedCandidate.childProblemTypeName ?? null,
      categoryPath: primaryPath,
      alternateCategoryPaths,
      matchedCityCategory: primaryPath[0] ?? null,
      matchedCitySubcategory: primaryPath.slice(1, -1).join(' > ') || null,
      reportDescription: groupedCandidate.description || null,
      problemTypeKeywords: groupedCandidate.problemTypeKeywords || null,
      learnMoreArticle: groupedCandidate.learnMoreArticle ?? null,
    },
    review: null,
  };
}

function matchedSearchTarget(rank, targetName, groupedCandidate) {
  return {
    rank,
    targetIssueName: targetName,
    matchStatus: 'matched',
    match: {
      type: 'searchTitleExact',
      sourceField: 'search.title',
      confidence: MATCH_CONFIDENCE.searchTitleExact,
      problemTypeId: groupedCandidate.problemTypeId,
      problemTypeName: groupedCandidate.title,
      displayName: groupedCandidate.title,
      childProblemTypeName: null,
      categoryPath: [],
      alternateCategoryPaths: [],
      matchedCityCategory: null,
      matchedCitySubcategory: null,
      reportDescription: groupedCandidate.description || null,
      problemTypeKeywords: groupedCandidate.keywords || null,
      learnMoreArticle: null,
    },
    review: null,
  };
}

function matchRefinementTarget(rank, targetName, refinementEntries) {
  const targetKey = normalize(targetName);
  const stages = [
    {
      matchType: 'refinementProblemTypeNameExact',
      sourceField: 'RequestMetadata.picklistOptions[].refinementProblemTypeName',
      candidates: refinementEntries.filter((entry) => normalize(entry.problemTypeName) === targetKey),
    },
    {
      matchType: 'refinementOptionLabelExact',
      sourceField: 'RequestMetadata.picklistOptions[].label',
      candidates: refinementEntries.filter((entry) => normalize(entry.optionLabel) === targetKey),
    },
  ];

  for (const stage of stages) {
    const grouped = groupRefinementCandidates(stage.candidates);
    if (grouped.length === 1) {
      return matchedRefinementTarget(rank, targetName, stage, grouped[0]);
    }

    if (grouped.length > 1) {
      return reviewTarget(rank, targetName, 'ambiguous', stage.matchType, grouped);
    }
  }

  return null;
}

function matchedRefinementTarget(rank, targetName, stage, groupedCandidate) {
  const primaryPath = pickPrimaryPath(groupedCandidate.paths, targetName);
  const alternateCategoryPaths = groupedCandidate.paths.filter(
    (pathParts) => pathParts.join('\u0000') !== primaryPath.join('\u0000')
  );

  return {
    rank,
    targetIssueName: targetName,
    matchStatus: 'matched',
    match: {
      type: stage.matchType,
      sourceField: stage.sourceField,
      confidence: MATCH_CONFIDENCE[stage.matchType],
      problemTypeId: groupedCandidate.problemTypeId,
      problemTypeName: groupedCandidate.problemTypeName,
      displayName: primaryPath.at(-1) ?? groupedCandidate.problemTypeName,
      childProblemTypeName: null,
      categoryPath: primaryPath,
      alternateCategoryPaths,
      matchedCityCategory: primaryPath[0] ?? null,
      matchedCitySubcategory: primaryPath.slice(1, -1).join(' > ') || null,
      reportDescription: groupedCandidate.description || null,
      problemTypeKeywords: null,
      learnMoreArticle: null,
      refinement: {
        parentProblemTypeId: groupedCandidate.parentProblemTypeId,
        parentProblemTypeName: groupedCandidate.parentProblemTypeName,
        optionLabel: groupedCandidate.optionLabel,
        sourceQuestionText: groupedCandidate.sourceQuestionText,
      },
    },
    review: null,
  };
}

function matchOpenDataServiceType(existingMatch, serviceTypesByName) {
  const serviceType = serviceTypesByName[normalize(existingMatch.targetIssueName)];
  if (!serviceType) return null;

  return {
    rank: existingMatch.rank,
    targetIssueName: existingMatch.targetIssueName,
    matchStatus: 'matched',
    match: {
      type: 'openDataServiceRequestTypeExact',
      sourceField: 'openData.Service Request Type',
      confidence: MATCH_CONFIDENCE.openDataServiceRequestTypeExact,
      problemTypeId: null,
      problemTypeName: serviceType.serviceRequestType,
      displayName: serviceType.serviceRequestType,
      childProblemTypeName: null,
      categoryPath: [],
      alternateCategoryPaths: [],
      matchedCityCategory: serviceType.divisions[0]?.division ?? null,
      matchedCitySubcategory: serviceType.divisions[0]?.section ?? null,
      reportDescription: null,
      problemTypeKeywords: null,
      learnMoreArticle: null,
      openData: serviceType,
    },
    review: null,
  };
}

function reviewTarget(rank, targetName, matchStatus, matchType, candidates) {
  return {
    rank,
    targetIssueName: targetName,
    matchStatus,
    match: null,
    review: {
      reason: `Multiple candidates found for ${matchType}.`,
      candidates,
    },
  };
}

function groupCategoryCandidates(candidates) {
  const groups = new Map();

  for (const candidate of candidates) {
    const key = candidate.problemTypeId;
    const group = groups.get(key) ?? {
      problemTypeId: candidate.problemTypeId,
      problemTypeName: candidate.problemTypeName,
      displayName: candidate.displayName,
      childProblemTypeName: candidate.childProblemTypeName ?? null,
      problemTypeKeywords: candidate.problemTypeKeywords ?? '',
      description: candidate.description ?? '',
      learnMoreArticle: candidate.learnMoreArticle ?? null,
      paths: [],
      displayNames: [],
      childProblemTypeNames: [],
    };

    group.paths.push(candidate.path);
    group.displayNames.push(candidate.displayName);
    if (candidate.childProblemTypeName) {
      group.childProblemTypeNames.push(candidate.childProblemTypeName);
    }

    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    paths: dedupePaths(group.paths),
    displayNames: unique(group.displayNames),
    childProblemTypeNames: unique(group.childProblemTypeNames),
  }));
}

function groupSearchCandidates(candidates) {
  const groups = new Map();

  for (const candidate of candidates) {
    const key = candidate.problemTypeId;
    if (!groups.has(key)) groups.set(key, candidate);
  }

  return [...groups.values()];
}

function groupRefinementCandidates(candidates) {
  const groups = new Map();

  for (const candidate of candidates) {
    const key = candidate.problemTypeId;
    const group = groups.get(key) ?? {
      problemTypeId: candidate.problemTypeId,
      problemTypeName: candidate.problemTypeName,
      description: candidate.description ?? '',
      parentProblemTypeId: candidate.parentProblemTypeId,
      parentProblemTypeName: candidate.parentProblemTypeName,
      optionLabel: candidate.optionLabel ?? '',
      sourceQuestionText: candidate.sourceQuestionText ?? null,
      paths: [],
    };

    group.paths.push(candidate.path);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    paths: dedupePaths(group.paths),
  }));
}

function pickPrimaryPath(paths, targetName) {
  const targetKey = normalize(targetName);
  return (
    paths.find((pathParts) => normalize(pathParts.at(-1)) === targetKey) ??
    paths.find((pathParts) => pathParts.some((part) => normalize(part) === targetKey)) ??
    paths[0] ??
    []
  );
}

async function fetchRequestMetadata(problemTypeIds) {
  if (problemTypeIds.length === 0) return {};

  const chrome = await createChromeSession();
  const results = {};

  try {
    await chrome.navigate(SERVICE_REQUEST_PAGE);
    await chrome.waitForGrecaptcha();

    for (const [index, problemTypeId] of problemTypeIds.entries()) {
      console.log(`Metadata ${index + 1}/${problemTypeIds.length}: ${problemTypeId}`);
      results[problemTypeId] = await chrome.fetchRequestMetadata(problemTypeId);
      await sleep(600);
    }
  } finally {
    await chrome.close();
  }

  return results;
}

function flattenRefinementProblemTypes(metadataByProblemTypeId, categoryEntries) {
  const categoryByProblemTypeId = new Map();

  for (const entry of categoryEntries) {
    if (entry.entryType === 'problemType' && !categoryByProblemTypeId.has(entry.problemTypeId)) {
      categoryByProblemTypeId.set(entry.problemTypeId, entry);
    }
  }

  const entries = [];

  for (const [parentProblemTypeId, metadataRecord] of Object.entries(metadataByProblemTypeId)) {
    const metadata = metadataRecord?.json?.data;
    if (!metadata) continue;

    const parentEntry = categoryByProblemTypeId.get(parentProblemTypeId);
    const parentPath = parentEntry?.path ?? [metadata.problemTypeName].filter(Boolean);
    const parentProblemTypeName =
      metadata.problemTypeName ?? parentEntry?.problemTypeName ?? parentEntry?.displayName ?? null;

    for (const option of collectRefinementOptions(metadata)) {
      const problemTypeName = plainText(option.refinementProblemTypeName || option.label || '');
      const problemTypeId = option.refinementProblemTypeId;
      if (!problemTypeId || !problemTypeName) continue;

      entries.push({
        parentProblemTypeId,
        parentProblemTypeName,
        problemTypeId,
        problemTypeName,
        optionLabel: plainText(option.label || ''),
        sourceQuestionText: plainText(option.sourceQuestionText || ''),
        description: plainText(option.refinementProblemTypeDescription || ''),
        path: [...parentPath, problemTypeName],
      });
    }
  }

  return entries;
}

function collectRefinementOptions(value, sourceQuestionText = null, found = []) {
  if (!value || typeof value !== 'object') return found;

  if (value.refinementProblemTypeId) {
    found.push({
      ...value,
      sourceQuestionText,
    });
  }

  const nextQuestionText = plainText(value.questionText || sourceQuestionText || '');

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      child.forEach((item) => collectRefinementOptions(item, nextQuestionText, found));
    } else {
      collectRefinementOptions(child, nextQuestionText, found);
    }
  }

  return found;
}

async function createChromeSession() {
  const chromePath = findChromePath();
  const port = 9300 + Math.floor(Math.random() * 500);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toronto-311-chrome-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1200,900',
    'about:blank',
  ];

  if (process.env.TORONTO_311_HEADLESS === '1') {
    args.splice(3, 0, '--headless=new');
  }

  const processHandle = spawn(chromePath, args, { stdio: 'ignore' });
  const target = await waitForChromeTarget(port);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let messageId = 1;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;

    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function send(method, params = {}, timeoutMs = 45000) {
    const id = messageId++;
    ws.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome DevTools timeout: ${method}`));
      }, timeoutMs);

      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });",
  });

  return {
    async navigate(url) {
      await send('Page.navigate', { url });
      await sleep(8000);
    },
    async waitForGrecaptcha() {
      const result = await send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `new Promise((resolve, reject) => {
          const started = Date.now();
          const wait = () => {
            if (window.grecaptcha) return resolve(true);
            if (Date.now() - started > 30000) return reject(new Error('grecaptcha missing'));
            setTimeout(wait, 250);
          };
          wait();
        })`,
      });

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text ?? 'Unable to load grecaptcha.');
      }
    },
    async fetchRequestMetadata(problemTypeId) {
      const result = await send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async () => {
          const token = await new Promise((resolve, reject) =>
            grecaptcha.ready(() =>
              grecaptcha.execute('${RECAPTCHA_SITE_KEY}').then(resolve, reject)
            )
          );
          const response = await fetch('${REQUEST_METADATA_URL}${problemTypeId}', {
            method: 'POST',
            headers: { 'x-cot-recaptcha-response': token }
          });
          const body = await response.text();
          return {
            fetchedAt: new Date().toISOString(),
            problemTypeId: '${problemTypeId}',
            status: response.status,
            contentType: response.headers.get('content-type'),
            tokenLength: token.length,
            body
          };
        })()`,
      });

      if (result.exceptionDetails) {
        return {
          fetchedAt: new Date().toISOString(),
          problemTypeId,
          status: 0,
          error: result.exceptionDetails.text ?? 'Chrome evaluation failed.',
        };
      }

      const payload = result.result.value;
      let json = null;
      try {
        json = payload.body ? JSON.parse(payload.body) : null;
      } catch (error) {
        payload.parseError = error.message;
      }

      return {
        fetchedAt: payload.fetchedAt,
        problemTypeId,
        status: payload.status,
        contentType: payload.contentType,
        tokenLength: payload.tokenLength,
        json,
        body: payload.body,
      };
    },
    async close() {
      try {
        ws.close();
      } catch {}
      processHandle.kill('SIGTERM');
      await sleep(1000);
      try {
        fs.rmSync(userDataDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 250,
        });
      } catch (error) {
        console.warn(`Could not remove temporary Chrome profile ${userDataDir}: ${error.message}`);
      }
    },
  };
}

function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

  const chromePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!chromePath) {
    throw new Error('Could not find Chrome. Set CHROME_PATH to a Chromium-based browser.');
  }

  return chromePath;
}

async function waitForChromeTarget(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const start = Date.now();

  while (Date.now() - start < 10000) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) break;
    } catch {}
    await sleep(200);
  }

  const newTargetUrl = `http://127.0.0.1:${port}/json/new?about:blank`;
  const response = await fetch(newTargetUrl, { method: 'PUT' });
  if (!response.ok) {
    throw new Error(`Unable to create Chrome DevTools target: ${response.status}`);
  }

  return response.json();
}

async function fetchOpenDataServiceTypes() {
  const fetchedAt = new Date().toISOString();

  try {
    const packageResponse = await fetchJson(OPEN_DATA_PACKAGE_URL, { retries: 2 });
    const resources = packageResponse.result?.resources ?? [];
    const resource = resources
      .filter((item) => /^311 Service Requests \d{4}$/.test(item.name ?? '') && item.url)
      .sort((a, b) => Number(b.name.match(/\d{4}/)?.[0] ?? 0) - Number(a.name.match(/\d{4}/)?.[0] ?? 0))[0];

    if (!resource) {
      throw new Error('No annual 311 Service Requests ZIP resource found.');
    }

    const response = await fetch(resource.url, {
      headers: {
        accept: 'application/zip',
        'user-agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`${resource.url} returned ${response.status}`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toronto-311-opendata-'));
    const zipPath = path.join(tempDir, 'service-requests.zip');

    try {
      fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
      const csv = execFileSync('unzip', ['-p', zipPath], {
        encoding: 'utf8',
        maxBuffer: 120 * 1024 * 1024,
      });

      return {
        fetchedAt,
        packageUrl: OPEN_DATA_PACKAGE_URL,
        resourceName: resource.name,
        resourceUrl: resource.url,
        serviceTypesByName: parseOpenDataServiceTypes(csv, resource),
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return {
      fetchedAt,
      packageUrl: OPEN_DATA_PACKAGE_URL,
      error: error.message,
      serviceTypesByName: {},
    };
  }
}

function parseOpenDataServiceTypes(csv, resource) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return {};

  const headers = parseCsvLine(lines[0]);
  const serviceTypeIndex = headers.indexOf('Service Request Type');
  const divisionIndex = headers.indexOf('Division');
  const sectionIndex = headers.indexOf('Section');

  if (serviceTypeIndex === -1) {
    throw new Error('Open data CSV missing Service Request Type column.');
  }

  const grouped = new Map();

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const serviceRequestType = plainText(row[serviceTypeIndex] ?? '');
    if (!serviceRequestType) continue;

    const key = normalize(serviceRequestType);
    const group = grouped.get(key) ?? {
      serviceRequestType,
      observedCount: 0,
      resourceName: resource.name,
      resourceUrl: resource.url,
      divisions: [],
    };

    const division = plainText(row[divisionIndex] ?? '');
    const section = plainText(row[sectionIndex] ?? '');
    const divisionKey = [division, section].join('\u0000');
    let divisionGroup = group.divisions.find((item) => item.key === divisionKey);

    if (!divisionGroup) {
      divisionGroup = { key: divisionKey, division, section, observedCount: 0 };
      group.divisions.push(divisionGroup);
    }

    group.observedCount += 1;
    divisionGroup.observedCount += 1;
    grouped.set(key, group);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([key, value]) => [
      key,
      {
        ...value,
        divisions: value.divisions
          .map(({ key: _key, ...division }) => division)
          .sort((a, b) => b.observedCount - a.observedCount),
      },
    ])
  );
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

async function fetchArticle(articleId) {
  try {
    const json = await fetchJson(`${ARTICLE_URL}${articleId}`);
    return {
      status: 200,
      json,
    };
  } catch (error) {
    return {
      status: 0,
      error: error.message,
    };
  }
}

function collectArticleIds(matches, metadataByProblemTypeId) {
  const ids = [];

  for (const match of matches) {
    if (match.match?.learnMoreArticle?.articleId) ids.push(match.match.learnMoreArticle.articleId);

    const metadata = metadataByProblemTypeId[match.match?.problemTypeId]?.json?.data;
    for (const article of collectArticleObjects(metadata)) {
      if (article.articleId) ids.push(article.articleId);
    }
  }

  return unique(ids);
}

function collectArticleObjects(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (value.articleId || value.title) {
    if (value.articleId) found.push(value);
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => collectArticleObjects(item, found));
    else collectArticleObjects(child, found);
  }

  return found;
}

function buildTargetOutput(match, metadataByProblemTypeId, articleResponsesByArticleId) {
  const metadataRecord = match.match?.problemTypeId
    ? metadataByProblemTypeId[match.match.problemTypeId]
    : null;
  const metadata = metadataRecord?.json?.data ?? null;
  const formQuestions = extractFormQuestions(metadata);
  const branchReferences = extractBranchReferences(metadata, match.match?.problemTypeId);
  const articleIds = unique([
    match.match?.learnMoreArticle?.articleId,
    ...collectArticleObjects(metadata).map((article) => article.articleId),
  ].filter(Boolean));
  const articleSummaries = articleIds.map((articleId) =>
    summarizeArticle(articleId, articleResponsesByArticleId[articleId])
  );

  return {
    rank: match.rank,
    targetIssueName: match.targetIssueName,
    targetListDescription: match.match?.reportDescription ?? null,
    matchStatus: match.matchStatus,
    match: match.match,
    review: match.review,
    metadataStatus: metadataRecord
      ? metadataRecord.status === 200
        ? 'fetched'
        : 'error'
      : 'not_fetched',
    metadataError:
      metadataRecord && metadataRecord.status !== 200
        ? metadataRecord.json?.message ?? metadataRecord.error ?? `HTTP ${metadataRecord.status}`
        : null,
    reportDescription: metadata?.description ? plainText(metadata.description) : match.match?.reportDescription ?? null,
    formQuestions,
    articleSummaries,
    emailGuidanceChecklist: buildEmailGuidance(formQuestions),
    branchReferences,
  };
}

function extractFormQuestions(metadata) {
  if (!metadata) return [];

  const questions = [];
  for (const sectionName of QUESTION_SECTIONS) {
    for (const question of metadata[sectionName] ?? []) {
      questions.push(...normalizeQuestion(sectionName, question));
    }
  }

  return dedupeQuestions(questions).slice(0, 50);
}

function normalizeQuestion(sectionName, question, parentQuestionId = null) {
  if (!question || typeof question !== 'object') return [];

  const normalized = [];
  const questionText = plainText(question.questionText || question.fieldLabel || question.label || '');

  if (questionText) {
    normalized.push({
      sectionName,
      questionId: question.questionId || question.fieldName || null,
      questionText,
      answerType: question.answerType || question.fieldType || null,
      isRequired: Boolean(question.isRequired ?? question.required),
      parentQuestionId,
      options: (question.picklistOptions ?? []).map((option) => ({
        label: plainText(option.label || option.text || option.value || ''),
        value: option.value ?? null,
        isEligibleResponse: option.isEligibleResponse ?? null,
      })),
    });
  }

  for (const option of question.picklistOptions ?? []) {
    for (const childQuestion of option.questions ?? []) {
      normalized.push(
        ...normalizeQuestion(sectionName, childQuestion, question.questionId || question.fieldName || null)
      );
    }
  }

  return normalized;
}

function buildEmailGuidance(formQuestions) {
  return dedupeQuestions(formQuestions)
    .filter((question) => question.questionText)
    .slice(0, 5)
    .map((question) => {
      const required = question.isRequired ? 'Required' : 'Optional';
      return `${required}: ${question.questionText}`;
    });
}

function dedupeQuestions(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = [question.sectionName, normalize(question.questionText)].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractBranchReferences(metadata, currentProblemTypeId) {
  const refs = [];
  collectBranchReferences(metadata, refs);

  return refs
    .filter((ref) => ref.problemTypeId && ref.problemTypeId !== currentProblemTypeId)
    .filter((ref, index, all) => all.findIndex((item) => item.problemTypeId === ref.problemTypeId) === index);
}

function collectBranchReferences(value, refs) {
  if (!value || typeof value !== 'object') return;

  if (value.problemTypeId && (value.problemTypeName || value.name || value.label)) {
    refs.push({
      problemTypeId: value.problemTypeId,
      name: value.problemTypeName || value.name || value.label || null,
    });
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => collectBranchReferences(item, refs));
    else collectBranchReferences(child, refs);
  }
}

function summarizeArticle(articleId, articleRecord) {
  if (!articleRecord) {
    return { articleId, status: 'missing', title: null, summary: null };
  }

  if (articleRecord.status !== 200) {
    return {
      articleId,
      status: 'error',
      title: null,
      summary: articleRecord.error ?? null,
    };
  }

  const data = articleRecord.json?.data ?? articleRecord.json;
  return {
    articleId,
    status: 'fetched',
    title: data.title ?? null,
    articleNumber: data.articleNumber ?? null,
    lastModifiedDate: data.lastModifiedDate ?? null,
    summary: firstSentences(plainText(data.articleContent ?? data.description ?? ''), 2),
  };
}

function summarizeTargets(targets) {
  return {
    matched: targets.filter((target) => target.matchStatus === 'matched').length,
    unmatched: targets.filter((target) => target.matchStatus === 'unmatched').length,
    ambiguous: targets.filter((target) => target.matchStatus === 'ambiguous').length,
    metadataFetched: targets.filter((target) => target.metadataStatus === 'fetched').length,
    metadataErrors: targets.filter((target) => target.metadataStatus === 'error').length,
  };
}

function buildMarkdown(canonical) {
  const lines = [
    '# Toronto 311 Target Issues',
    '',
    `Generated: ${canonical.generatedAt}`,
    '',
    `Target rows: ${canonical.targetCount}`,
    `Matched: ${canonical.summary.matched}`,
    `Unmatched: ${canonical.summary.unmatched}`,
    `Ambiguous: ${canonical.summary.ambiguous}`,
    `Metadata fetched: ${canonical.summary.metadataFetched}`,
    `Metadata errors: ${canonical.summary.metadataErrors}`,
    '',
    '## Notes',
    '',
    '- Output order follows the accepted screenshot target order.',
    '- Fuzzy candidates are review-only and are not accepted as matches.',
    '- Form metadata errors are preserved per target instead of replacing the target with another issue.',
    '',
    '## Targets',
    '',
  ];

  for (const target of canonical.targets) {
    lines.push(`### ${target.rank}. ${target.targetIssueName}`);
    lines.push('');
    lines.push(`- Match status: ${target.matchStatus}`);
    lines.push(`- Metadata status: ${target.metadataStatus}`);
    if (target.metadataError) lines.push(`- Metadata error: ${target.metadataError}`);

    if (target.match) {
      lines.push(`- Match type: ${target.match.type}`);
      if (target.match.problemTypeId) {
        lines.push(`- Problem type ID: ${target.match.problemTypeId}`);
      }
      lines.push(`- City title: ${target.match.problemTypeName}`);
      if (target.match.categoryPath.length) {
        lines.push(`- Category path: ${target.match.categoryPath.join(' > ')}`);
      }
      if (target.match.alternateCategoryPaths.length) {
        lines.push(`- Alternate paths: ${target.match.alternateCategoryPaths.length}`);
      }
      if (target.match.refinement) {
        lines.push(
          `- Refinement source: ${target.match.refinement.parentProblemTypeName} (${target.match.refinement.parentProblemTypeId})`
        );
      }
      if (target.match.openData) {
        lines.push(
          `- Open data evidence: ${target.match.openData.observedCount} requests in ${target.match.openData.resourceName}`
        );
      }
    }

    if (target.review) {
      lines.push(`- Review reason: ${target.review.reason}`);
      const candidates = target.review.candidates.slice(0, 3).map((candidate) =>
        candidate.problemTypeId
          ? `${candidate.problemTypeId} (${candidate.problemTypeName || candidate.title || 'untitled'})`
          : candidate.title || 'untitled'
      );
      if (candidates.length) lines.push(`- Review candidates: ${candidates.join('; ')}`);
    }

    if (target.reportDescription) {
      lines.push(`- Report description: ${target.reportDescription}`);
    }

    if (target.formQuestions.length) {
      lines.push('- Form questions:');
      for (const question of target.formQuestions.slice(0, 5)) {
        lines.push(`  - ${question.questionText}${question.isRequired ? ' (required)' : ''}`);
      }
    } else {
      lines.push('- Form questions: none captured');
    }

    if (target.articleSummaries.length) {
      lines.push('- Articles:');
      for (const article of target.articleSummaries.slice(0, 3)) {
        lines.push(`  - ${article.title || article.articleId}: ${article.summary || article.status}`);
      }
    }

    if (target.emailGuidanceChecklist.length) {
      lines.push('- Email guidance:');
      for (const item of target.emailGuidanceChecklist) {
        lines.push(`  - ${item}`);
      }
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function fetchJson(url, options = {}) {
  const retries = options.retries ?? 0;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0',
        },
      });
      const text = await response.text();

      if (!response.ok) {
        throw new Error(`${url} returned ${response.status}: ${text.slice(0, 200)}`);
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`${url} did not return JSON: ${text.slice(0, 200)}`);
      }
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }

  throw lastError;
}

function normalizeSearchResults(searchResult) {
  const results = Array.isArray(searchResult?.result)
    ? searchResult.result
    : searchResult?.result
      ? [searchResult.result]
      : [];

  return results.map((result) => ({
    problemTypeId: result.id,
    title: plainText(result.title ?? ''),
    description: plainText(result.description ?? ''),
    keywords: plainText(result.keywords ?? ''),
    score: result.score ?? result.maxScore ?? null,
  }));
}

function normalize(value) {
  return plainText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentences(text, count) {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (sentences?.length) return sentences.slice(0, count).join(' ').trim();
  return text.slice(0, 280).trim();
}

function dedupePaths(paths) {
  const seen = new Set();
  return paths.filter((pathParts) => {
    const key = pathParts.join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
