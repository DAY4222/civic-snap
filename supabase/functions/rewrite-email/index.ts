import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { callGemini } from '../_shared/gemini.ts';
import { sha256 } from '../_shared/hash.ts';
import { finishRun, reserveRun } from '../_shared/runs.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { describeError } from '../_shared/text.ts';
import {
  buildGeminiEmailRewritePrompt,
  buildRewriteRunReservationRow,
  buildRewriteRunResultRow,
  normalizeGeminiEmailRewriteResult,
  readRewriteLimitConfigFromEnv,
  validateEmailRewriteRequest,
} from './logic.ts';

const RUNS_TABLE = 'ai_email_rewrite_runs';
const MODEL = 'gemini-3.1-flash-lite';
const PROVIDER = 'gemini';
const PROMPT_VERSION = 'toronto-311-email-rewrite-v3';
const GEMINI_TIMEOUT_MS = 20_000;
const LIMIT_CONFIG = readRewriteLimitConfigFromEnv((name) => Deno.env.get(name));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const startedAt = Date.now();
  const rewrittenAt = new Date(startedAt).toISOString();
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!apiKey || !supabaseUrl || !serviceRoleKey || !LIMIT_CONFIG.ok) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const validation = validateEmailRewriteRequest(body);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const supabase = createServiceClient(supabaseUrl, serviceRoleKey);
  const reservation = await reserveRun(supabase, RUNS_TABLE, {
    installIdHash: await sha256(validation.installId),
    limits: {
      global: LIMIT_CONFIG.config.maxRewritesGlobalPerDay,
      perInstall: LIMIT_CONFIG.config.maxRewritesPerInstallPerDay,
    },
    now: new Date(startedAt),
    row: buildRewriteRunReservationRow({
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
          text: buildGeminiEmailRewritePrompt(validation),
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.2,
      },
      timeoutMs: GEMINI_TIMEOUT_MS,
    });
  } catch (error) {
    await finishRun(supabase, RUNS_TABLE, reservation.runId, buildRewriteRunResultRow({
      errorCode: 'gemini_request_failed',
      errorMessage: describeError(error),
      latencyMs: Date.now() - startedAt,
      outputChars: 0,
      status: 'error',
    }));
    return jsonResponse({ error: 'gemini_request_failed' }, 502);
  }

  const safeResult = normalizeGeminiEmailRewriteResult(geminiBody);
  if (!safeResult) {
    await finishRun(supabase, RUNS_TABLE, reservation.runId, buildRewriteRunResultRow({
      errorCode: 'invalid_model_response',
      errorMessage: 'Gemini returned an empty or invalid body.',
      latencyMs: Date.now() - startedAt,
      outputChars: 0,
      status: 'error',
    }));
    return jsonResponse({ error: 'invalid_model_response' }, 502);
  }

  const latencyMs = Date.now() - startedAt;
  await finishRun(supabase, RUNS_TABLE, reservation.runId, buildRewriteRunResultRow({
    latencyMs,
    outputChars: safeResult.outputChars,
    status: 'ok',
  }));

  return jsonResponse({
    body: safeResult.body,
    provider: PROVIDER,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    rewrittenAt,
    latencyMs,
  });
});
