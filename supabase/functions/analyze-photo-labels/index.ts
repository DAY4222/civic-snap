import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { callGemini } from '../_shared/gemini.ts';
import { sha256 } from '../_shared/hash.ts';
import { isSignedInUserRequired, resolveCallerIdentity } from '../_shared/identity.ts';
import { finishRun, reserveRun } from '../_shared/runs.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { describeError } from '../_shared/text.ts';
import {
  MAX_EVIDENCE_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_ISSUE_CANDIDATES,
  MAX_LABELS,
  MIN_CONFIDENCE,
  MAX_REASON_CHARS,
  buildAnalysisRunReservationRow,
  buildAnalysisRunResultRow,
  normalizeGeminiResult,
  readLimitConfigFromEnv,
  validateRequest,
  type AllowedLabel,
  type AnalysisRequest,
  type EdgeIssueCatalogItem,
} from './logic.ts';
import { EDGE_ISSUE_CATALOG, EDGE_PHOTO_LABELS } from './issueCatalog.ts';
import { ISSUE_CATALOG_VERSION } from './versions.ts';

const RUNS_TABLE = 'ai_photo_analysis_runs';
const MODEL = 'gemini-3.1-flash-lite';
const PROVIDER = 'gemini';
const PROMPT_VERSION = 'photo-issue-candidates-v2';
const GEMINI_TIMEOUT_MS = 20_000;
const LIMIT_CONFIG = readLimitConfigFromEnv((name) => Deno.env.get(name));
const REQUIRE_SIGNED_IN_USER = isSignedInUserRequired((name) => Deno.env.get(name));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const startedAt = Date.now();
  const analyzedAt = new Date(startedAt).toISOString();
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!apiKey || !supabaseUrl || !serviceRoleKey || !LIMIT_CONFIG.ok) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  let body: AnalysisRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const validation = validateRequest(
    body,
    LIMIT_CONFIG.config,
    EDGE_ISSUE_CATALOG,
    EDGE_PHOTO_LABELS
  );
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  // A signed-in (anonymous) user counts as one caller however the app was reinstalled.
  const caller = resolveCallerIdentity(request.headers.get('Authorization'), validation.installId);
  if (REQUIRE_SIGNED_IN_USER && caller.kind !== 'user') {
    return jsonResponse({ error: 'sign_in_required' }, 401);
  }

  const supabase = createServiceClient(supabaseUrl, serviceRoleKey);
  const reservation = await reserveRun(supabase, RUNS_TABLE, {
    installIdHash: await sha256(caller.key),
    limits: {
      global: LIMIT_CONFIG.config.maxAnalysesGlobalPerDay,
      perInstall: LIMIT_CONFIG.config.maxAnalysesPerInstallPerDay,
    },
    now: new Date(startedAt),
    row: buildAnalysisRunReservationRow({
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      provider: PROVIDER,
      request: validation,
    }),
  });
  if (!reservation.ok) {
    return jsonResponse({ error: reservation.error }, reservation.status);
  }

  let geminiBody: unknown;
  try {
    geminiBody = await callGemini({
      apiKey,
      model: MODEL,
      parts: [
        {
          inline_data: {
            data: validation.imageBase64,
            mime_type: validation.mimeType,
          },
        },
        {
          text: buildPrompt(validation.allowedLabels),
        },
      ],
      generationConfig: {
        media_resolution: 'MEDIA_RESOLUTION_HIGH',
        response_mime_type: 'application/json',
        temperature: 0.1,
      },
      timeoutMs: GEMINI_TIMEOUT_MS,
    });
  } catch (error) {
    await finishRun(supabase, RUNS_TABLE, reservation.runId, buildAnalysisRunResultRow({
      errorCode: 'gemini_request_failed',
      errorMessage: describeError(error),
      issueCandidates: [],
      latencyMs: Date.now() - startedAt,
      status: 'error',
      suggestedLabels: [],
    }));
    return jsonResponse({ error: 'gemini_request_failed' }, 502);
  }

  const safeResult = normalizeGeminiResult(
    geminiBody,
    validation.allowedLabels,
    EDGE_ISSUE_CATALOG
  );
  const latencyMs = Date.now() - startedAt;
  const responseBody = {
    suggestedLabels: safeResult.suggestedLabels,
    issueCandidates: safeResult.issueCandidates,
    provider: PROVIDER,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    taxonomyVersion: validation.taxonomyVersion,
    issueCatalogVersion: ISSUE_CATALOG_VERSION,
    analyzedAt,
    latencyMs,
    image: {
      bytes: validation.imageBytes,
      height: validation.imageHeight,
      mimeType: validation.mimeType,
      width: validation.imageWidth,
    },
  };

  await finishRun(supabase, RUNS_TABLE, reservation.runId, buildAnalysisRunResultRow({
    issueCandidates: safeResult.issueCandidates,
    latencyMs,
    status: 'ok',
    suggestedLabels: safeResult.suggestedLabels,
  }));

  return jsonResponse(responseBody);
});

function buildPrompt(allowedLabels: AllowedLabel[]) {
  // Read through the general item type: in the as-const catalog, optional fields such as
  // photoHint exist on only some issues, which strict type-checking rejects.
  const issueCatalog: readonly EdgeIssueCatalogItem[] = EDGE_ISSUE_CATALOG;
  const promptIssues = issueCatalog.filter(
    (issue) => issue.discoverability !== 'not-discoverable'
  ).map((issue) => ({
    id: issue.id,
    title: issue.title,
    discoverability: issue.discoverability,
    visualCueLabelIds: issue.visualCueLabelIds,
    requiredAnyLabelIds: issue.requiredAnyLabelIds,
    requiredAllLabelIds: issue.requiredAllLabelIds ?? [],
    photoHint: issue.photoHint,
    suppressionGroup: issue.suppressionGroup,
    forceConfidenceTier: issue.forceConfidenceTier,
  }));

  return [
    'You are analyzing a 311 civic issue photo.',
    'Return JSON only. Do not include markdown, comments, or extra keys.',
    'Analyze only visible image evidence. Do not infer from address, GPS, location notes, season, schedule, jurisdiction, or history.',
    'If evidence is ambiguous, omit the label or issue instead of guessing.',
    'Choose suggestedLabels only from allowedLabels. Use label ids exactly as provided.',
    `Only include suggestedLabels with confidence >= ${MIN_CONFIDENCE}; confidence means visible certainty, not issue severity. Return at most ${MAX_LABELS} suggestedLabels.`,
    'Prioritize specific condition labels over generic scene labels. Use generic context labels only when they directly support an issue candidate.',
    'For visible potholes, crumbling asphalt, exposed gravel, broken pavement, uneven pavement, or road-edge collapse, include whichever matching allowed label is present: road-pothole and/or road-surface-damage.',
    'If road-pothole or road-surface-damage is included, include the road-pothole-road-damage issue candidate.',
    'Include a tight normalized boundingBox when the visible evidence is localizable; omit boundingBox for whole-image or non-localizable labels. x, y, width, height must be numbers from 0 to 1.',
    `Keep evidence under ${MAX_EVIDENCE_CHARS} characters per label.`,
    `Return at most ${MAX_ISSUE_CANDIDATES} issueCandidates. Choose issueId only from issueCatalog.`,
    'Use issueCatalog fields: visualCueLabelIds are supporting cues; every requiredAllLabelIds value must be in suggestedLabels, and if requiredAnyLabelIds is non-empty at least one requiredAnyLabelIds value must be in suggestedLabels.',
    'Use photoHint only to disambiguate visible evidence. It is not permission to infer non-visible context.',
    'When multiple supported issues share a suppressionGroup, include only the strongest and most specific one.',
    'Every issueCandidate.supportingLabelIds value must refer to an id in suggestedLabels.',
    'Suggest only photo issues, or limited-context issues when visible labels support them and the reason names the missing context.',
    'Prefer the most specific supported issue. Do not include multiple candidates for the same visible problem.',
    'Missed pickup issues can be possible only because photos cannot prove schedule or timing.',
    'Do not suggest bin exchange size, additional bin, or wrong delivery unless visible evidence supports that exact issue.',
    'Each reason should explain visible evidence. Each suggestedDescription should be a neutral insertable sentence with no address, date, or certainty about timing.',
    `Keep each reason under ${MAX_REASON_CHARS} characters and each suggestedDescription under ${MAX_DESCRIPTION_CHARS} characters.`,
    'If no visible allowed labels are supported, return {"suggestedLabels":[],"issueCandidates":[]}.',
    'Expected shape: {"suggestedLabels":[{"id":"string","confidence":0.7,"evidence":"string","boundingBox":{"x":0,"y":0,"width":0.1,"height":0.1}}],"issueCandidates":[{"issueId":"string","confidence":0.7,"supportingLabelIds":["string"],"reason":"short sentence","suggestedDescription":"short insertable sentence"}]}',
    `allowedLabels: ${JSON.stringify(allowedLabels)}`,
    `issueCatalog: ${JSON.stringify(promptIssues)}`,
  ].join('\n');
}
