#!/usr/bin/env node

// Builds the app and Edge Function issue catalogs from the scraped Toronto 311 targets and the
// hand-maintained labels, issue rules and versions in data/issue-rules.json.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_JSON = path.join(ROOT, 'data/toronto-311-target-issues.json');
const RULES_JSON = path.join(ROOT, 'data/issue-rules.json');
const APP_CATALOG_TS = path.join(ROOT, 'lib/generated/issueCatalog.ts');
const APP_VERSIONS_TS = path.join(ROOT, 'lib/generated/versions.ts');
const CATEGORY_TITLE_IDS_TS = path.join(ROOT, 'lib/generated/categoryTitleIds.ts');
const EDGE_CATALOG_TS = path.join(ROOT, 'supabase/functions/analyze-photo-labels/issueCatalog.ts');
const EDGE_VERSIONS_TS = path.join(ROOT, 'supabase/functions/analyze-photo-labels/versions.ts');
const PHOTO_LABELS_JSON = path.join(ROOT, 'data/generated/photo-label-taxonomy.json');
const EDGE_CATALOG_JSON = path.join(ROOT, 'data/generated/edge-issue-catalog.json');

const DISCOVERABILITY = {
  PHOTO: 'photo',
  LIMITED: 'limited-context',
  NONE: 'not-discoverable',
};
const CONFIDENCE_TIERS = ['strong', 'likely', 'possible'];
const RULE_KEYS = [
  'discoverability',
  'requiredAnyLabelIds',
  'requiredAllLabelIds',
  'supportingLabelIds',
  'photoHint',
  'suppressionGroup',
  'forceConfidenceTier',
];

const DEFAULT_RULE = rule({
  discoverability: DISCOVERABILITY.NONE,
  requiredAnyLabelIds: [],
  supportingLabelIds: [],
});

/** An issue rule from data/issue-rules.json in catalog form. Visual cues include the required labels. */
function rule(input) {
  const requiredAllLabelIds = input.requiredAllLabelIds ?? [];
  const visualCueLabelIds = unique([
    ...input.requiredAnyLabelIds,
    ...requiredAllLabelIds,
    ...input.supportingLabelIds,
  ]);
  return {
    discoverability: input.discoverability,
    requiredAnyLabelIds: input.requiredAnyLabelIds,
    requiredAllLabelIds,
    visualCueLabelIds,
    forceConfidenceTier: input.forceConfidenceTier,
    photoHint: input.photoHint,
    suppressionGroup: input.suppressionGroup,
  };
}

function main() {
  const rules = JSON.parse(fs.readFileSync(RULES_JSON, 'utf8'));
  const source = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf8'));
  const targets = source.targets ?? [];
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('No targets found in data/toronto-311-target-issues.json.');
  }
  validateRules(rules, targets);

  const issueRules = new Map(
    Object.entries(rules.issueRules).map(([title, issueRule]) => [title, rule(issueRule)])
  );
  const appIssues = targets.map((target) => toAppIssue(target, issueRules));
  const edgeIssues = appIssues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    categoryPath: issue.categoryPath,
    shortDescription: issue.description,
    discoverability: issue.discoverability,
    visualCueLabelIds: issue.visualCueLabelIds,
    requiredAnyLabelIds: issue.requiredAnyLabelIds,
    requiredAllLabelIds: issue.requiredAllLabelIds,
    photoHint: issue.photoHint,
    suppressionGroup: issue.suppressionGroup,
    forceConfidenceTier: issue.forceConfidenceTier,
  }));

  writeTs(APP_CATALOG_TS, buildAppCatalogTs(appIssues, rules));
  writeTs(APP_VERSIONS_TS, buildAppVersionsTs(rules.versions));
  writeTs(CATEGORY_TITLE_IDS_TS, buildCategoryTitleIdsTs(appIssues));
  writeTs(EDGE_CATALOG_TS, buildEdgeCatalogTs(edgeIssues, rules));
  writeTs(EDGE_VERSIONS_TS, buildEdgeVersionsTs(rules.versions));
  writeJson(PHOTO_LABELS_JSON, {
    version: rules.versions.photoLabelTaxonomy,
    labels: rules.photoLabels,
  });
  writeJson(EDGE_CATALOG_JSON, {
    version: rules.versions.issueCatalog,
    issues: edgeIssues,
  });

  console.log(`Generated ${path.relative(ROOT, APP_CATALOG_TS)}`);
  console.log(`Generated ${path.relative(ROOT, APP_VERSIONS_TS)}`);
  console.log(`Generated ${path.relative(ROOT, CATEGORY_TITLE_IDS_TS)}`);
  console.log(`Generated ${path.relative(ROOT, EDGE_CATALOG_TS)}`);
  console.log(`Generated ${path.relative(ROOT, EDGE_VERSIONS_TS)}`);
  console.log(`Generated ${path.relative(ROOT, PHOTO_LABELS_JSON)}`);
  console.log(`Generated ${path.relative(ROOT, EDGE_CATALOG_JSON)}`);
}

/** Fails loudly on the typos that would otherwise silently drop a rule or a label. */
function validateRules(rules, targets) {
  const problems = [];
  const { issueCatalog, photoLabelTaxonomy, olderPhotoLabelTaxonomiesAccepted } = rules.versions ?? {};
  if (!issueCatalog || !photoLabelTaxonomy || !Array.isArray(olderPhotoLabelTaxonomiesAccepted)) {
    problems.push('versions needs issueCatalog, photoLabelTaxonomy and olderPhotoLabelTaxonomiesAccepted');
  }

  const labelIds = new Set();
  for (const label of rules.photoLabels) {
    if (labelIds.has(label.id)) problems.push(`photo label ${label.id} is listed twice`);
    labelIds.add(label.id);
  }

  const titles = new Set(targets.map((target) => target.targetIssueName));
  for (const [title, issueRule] of Object.entries(rules.issueRules)) {
    if (!titles.has(title)) problems.push(`"${title}" is not a target issue title`);
    for (const key of Object.keys(issueRule)) {
      if (!RULE_KEYS.includes(key)) problems.push(`"${title}" has an unknown key ${key}`);
    }
    if (!Object.values(DISCOVERABILITY).includes(issueRule.discoverability)) {
      problems.push(`"${title}" has an unknown discoverability ${issueRule.discoverability}`);
    }
    if (issueRule.forceConfidenceTier && !CONFIDENCE_TIERS.includes(issueRule.forceConfidenceTier)) {
      problems.push(`"${title}" has an unknown forceConfidenceTier ${issueRule.forceConfidenceTier}`);
    }

    const labelLists = [
      issueRule.requiredAnyLabelIds,
      issueRule.requiredAllLabelIds ?? [],
      issueRule.supportingLabelIds,
    ];
    if (!labelLists.every(Array.isArray)) {
      problems.push(`"${title}" needs requiredAnyLabelIds and supportingLabelIds lists`);
    } else {
      for (const labelId of labelLists.flat()) {
        if (!labelIds.has(labelId)) problems.push(`"${title}" uses unknown label ${labelId}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`${path.relative(ROOT, RULES_JSON)}:\n- ${problems.join('\n- ')}`);
  }
}

function toAppIssue(target, issueRules) {
  const title = target.targetIssueName;
  const ruleForIssue = issueRules.get(title) ?? DEFAULT_RULE;
  const categoryPath = target.match?.categoryPath?.length
    ? target.match.categoryPath
    : [title];
  const questions = (target.formQuestions ?? [])
    .map(normalizeQuestion)
    .filter(Boolean);

  return {
    id: slugify(title),
    title,
    subjectLabel: title.toLowerCase(),
    categoryPath,
    description: shortDescription(target.reportDescription || target.targetListDescription || ''),
    sourceMatchStatus: target.matchStatus === 'matched' ? 'matched' : target.matchStatus,
    discoverability: ruleForIssue.discoverability,
    visualCueLabelIds: ruleForIssue.visualCueLabelIds,
    requiredAnyLabelIds: ruleForIssue.requiredAnyLabelIds,
    requiredAllLabelIds: ruleForIssue.requiredAllLabelIds,
    photoHint: ruleForIssue.photoHint,
    suppressionGroup: ruleForIssue.suppressionGroup,
    forceConfidenceTier: ruleForIssue.forceConfidenceTier,
    observations: observationsFor(target, ruleForIssue),
    questions,
  };
}

function normalizeQuestion(question) {
  const answerType = normalizeAnswerType(question.answerType);
  if (!answerType) return null;

  return {
    id: question.questionId || slugify(question.questionText),
    label: question.questionText,
    placeholder: placeholderFor(answerType),
    answerType,
    isRequired: Boolean(question.isRequired),
    sectionName: question.sectionName || 'intakeQuestions',
    options: (question.options ?? []).map((option) => ({
      label: option.label,
      value: option.value || option.label,
      isEligibleResponse: option.isEligibleResponse ?? null,
      suggestedLabelIds: suggestedLabelIdsForOption(option.label),
    })),
  };
}

function normalizeAnswerType(answerType) {
  switch (answerType) {
    case 'Picklist':
      return 'picklist';
    case 'Radio':
      return 'radio';
    case 'Multipicklist':
      return 'multipicklist';
    case 'Freeform':
      return 'text';
    case 'Date':
      return 'date';
    case 'Time':
      return 'time';
    case 'Number':
      return 'number';
    default:
      return null;
  }
}

function placeholderFor(answerType) {
  switch (answerType) {
    case 'picklist':
    case 'radio':
      return 'Select one';
    case 'multipicklist':
      return 'Select all that apply';
    case 'date':
      return 'YYYY-MM-DD';
    case 'time':
      return 'Example: 8:30 AM';
    case 'number':
      return 'Enter a number';
    default:
      return 'Enter details';
  }
}

function suggestedLabelIdsForOption(label) {
  const text = label.toLowerCase();
  const suggestions = [];

  addIf(suggestions, text.includes('lid'), 'bin-lid-damaged');
  addIf(suggestions, text.includes('body') || text.includes('handle'), 'bin-body-or-handle-damaged');
  addIf(suggestions, text.includes('wheel'), 'bin-wheel-damaged');
  addIf(suggestions, text.includes('garbage'), 'garbage-bin', 'curbside-garbage');
  addIf(suggestions, text.includes('recycl'), 'recycling-bin', 'curbside-recycling');
  addIf(suggestions, text.includes('organic'), 'organic-bin', 'curbside-organics');
  addIf(suggestions, text.includes('yard waste'), 'yard-waste');
  addIf(suggestions, text.includes('oversized') || text.includes('electronic'), 'oversized-or-electronic-item');
  addIf(suggestions, text.includes('pothole'), 'road-pothole');
  addIf(suggestions, text.includes('road'), 'roadway', 'road-surface-damage');
  addIf(suggestions, text.includes('sidewalk'), 'sidewalk', 'damaged-concrete-sidewalk');
  addIf(suggestions, text.includes('concrete'), 'damaged-concrete-sidewalk');
  addIf(suggestions, text.includes('asphalt'), 'damaged-boulevard-asphalt', 'road-surface-damage');
  addIf(suggestions, text.includes('boulevard'), 'boulevard');
  addIf(suggestions, text.includes('laneway'), 'laneway');
  addIf(suggestions, text.includes('litter'), 'loose-litter');
  addIf(suggestions, text.includes('illegal dumping') || text.includes('dumping'), 'illegal-dumping');
  addIf(suggestions, text.includes('debris'), 'construction-debris', 'loose-litter');
  addIf(suggestions, text.includes('needle') || text.includes('syringe'), 'needles-or-syringes');
  addIf(suggestions, text.includes('human waste'), 'biohazard-human-waste');
  addIf(suggestions, text.includes('snow'), 'snow-covered-road', 'snow-covered-sidewalk');
  addIf(suggestions, text.includes('ice') || text.includes('icy') || text.includes('salting'), 'icy-sidewalk', 'icy-laneway');
  addIf(suggestions, text.includes('tree'), 'public-tree', 'private-tree');
  addIf(suggestions, text.includes('branch') || text.includes('limb'), 'fallen-tree-or-large-limb', 'hanging-or-broken-branch');
  addIf(suggestions, text.includes('sign'), 'traffic-sign', 'street-name-sign', 'regulatory-or-warning-sign');
  addIf(suggestions, text.includes('signal'), 'traffic-signal');
  addIf(suggestions, text.includes('catch basin'), 'catch-basin');
  addIf(suggestions, text.includes('water'), 'surface-watermain-break', 'water-service-box');
  addIf(suggestions, text.includes('dog'), 'stray-dog', 'dog-off-leash');
  addIf(suggestions, text.includes('wildlife'), 'injured-wildlife', 'dead-wildlife');
  addIf(suggestions, text.includes('private property'), 'private-property');

  return unique(suggestions);
}

function addIf(target, condition, ...labelIds) {
  if (condition) target.push(...labelIds);
}

function observationsFor(target, ruleForIssue) {
  if (ruleForIssue.discoverability === DISCOVERABILITY.NONE) {
    return [
      'This issue usually needs user-supplied context beyond what a photo can prove.',
      'Use the checklist to include the details Toronto 311 asks for.',
    ];
  }

  if (ruleForIssue.forceConfidenceTier === 'possible') {
    return [
      'Photo evidence can show the material, but pickup timing still needs user confirmation.',
      'Use the checklist to include schedule and set-out details.',
    ];
  }

  return [
    'Photo evidence can support this issue type.',
    'Use the checklist to include any jurisdiction, timing, or safety details.',
  ];
}

function buildAppCatalogTs(issues, rules) {
  return `${generatedHeader()}
import type { IssueCategory, PhotoLabelDefinition } from '../types';

export const ISSUE_CATALOG_VERSION = ${JSON.stringify(rules.versions.issueCatalog)};
export const PHOTO_LABEL_TAXONOMY_VERSION = ${JSON.stringify(rules.versions.photoLabelTaxonomy)};

export const PHOTO_LABELS: PhotoLabelDefinition[] = ${json(rules.photoLabels)};

const ISSUE_CATALOG_DATA: Omit<IssueCategory, 'emailGuidanceChecklist'>[] = ${json(issues)};

export const ISSUE_CATEGORIES: IssueCategory[] = ISSUE_CATALOG_DATA.map((issue) => ({
  ...issue,
  emailGuidanceChecklist: issue.questions,
}));
`;
}

function buildEdgeCatalogTs(issues, rules) {
  return `${generatedHeader()}
export const EDGE_ISSUE_CATALOG_VERSION = ${JSON.stringify(rules.versions.issueCatalog)};

export const EDGE_PHOTO_LABELS = ${json(rules.photoLabels)} as const;

export const EDGE_ISSUE_CATALOG = ${json(issues)} as const;

export type EdgeIssueCatalogItem = (typeof EDGE_ISSUE_CATALOG)[number];
`;
}

function buildAppVersionsTs(versions) {
  return `${generatedHeader()}
${versionConstants(versions)}`;
}

function buildEdgeVersionsTs(versions) {
  const supported = unique([versions.photoLabelTaxonomy, ...versions.olderPhotoLabelTaxonomiesAccepted]);
  return `${generatedHeader()}
${versionConstants(versions)}
/** The current taxonomy version, then older ones that app builds may still send. */
export const SUPPORTED_PHOTO_LABEL_TAXONOMY_VERSIONS: readonly string[] = ${json(supported)};
`;
}

function versionConstants(versions) {
  return `export const ISSUE_CATALOG_VERSION = ${JSON.stringify(versions.issueCatalog)};
export const PHOTO_LABEL_TAXONOMY_VERSION = ${JSON.stringify(versions.photoLabelTaxonomy)};
`;
}

function buildCategoryTitleIdsTs(issues) {
  const titleIds = Object.fromEntries(issues.map((issue) => [issue.title, issue.id]));
  return `${generatedHeader()}
export const CATEGORY_TITLE_IDS: Record<string, string> = ${json(titleIds)};
`;
}

function generatedHeader() {
  return `// Generated by scripts/generate-ai-issue-catalogs.cjs. Do not edit by hand.\n`;
}

function writeTs(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeJson(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(contents, null, 2)}\n`);
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function shortDescription(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

main();
