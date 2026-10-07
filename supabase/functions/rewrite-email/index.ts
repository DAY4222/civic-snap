// Pinned: an unpinned @2 import picks up new releases whose types break the type check.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

import {
  buildGeminiEmailRewritePrompt,
  buildRewriteRunCountFilters,
  buildRewriteRunLogRow,
  normalizeGeminiEmailRewriteResult,
  parseJsonText,
  readRewriteLimitConfigFromEnv,
  truncateText,
  validateEmailRewriteRequest,
  type RewriteLimitConfig,
  type RewriteRunLogInput,
  type ValidEmailRewriteRequest,
} from './logic.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

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
  const rewrittenAt = new Date().toISOString();
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
  const installIdHash = await sha256(validation.installId);
  const rateLimit = await checkRateLimit(supabase, installIdHash, LIMIT_CONFIG.config);
  if (!rateLimit.ok) {
    return jsonResponse({ error: rateLimit.error }, rateLimit.status);
  }

  let geminiBody: unknown;
  try {
    geminiBody = await callGemini(apiKey, validation);
  } catch (error) {
    await logRewriteRun(supabase, {
      clientPromptVersion: validation.clientPromptVersion,
      defaultEmailChars: validation.defaultEmailChars,
      errorCode: 'gemini_request_failed',
      errorMessage: truncateText(error instanceof Error ? error.message : String(error), 240),
      guidedAnswerCount: validation.guidedAnswerCount,
      inputChars: validation.inputChars,
      installIdHash,
      latencyMs: Date.now() - startedAt,
      outputChars: 0,
      status: 'error',
    });
    return jsonResponse({ error: 'gemini_request_failed' }, 502);
  }

  const safeResult = normalizeGeminiEmailRewriteResult(geminiBody);
  if (!safeResult) {
    await logRewriteRun(supabase, {
      clientPromptVersion: validation.clientPromptVersion,
      defaultEmailChars: validation.defaultEmailChars,
      errorCode: 'invalid_model_response',
      errorMessage: 'Gemini returned an empty or invalid body.',
      guidedAnswerCount: validation.guidedAnswerCount,
      inputChars: validation.inputChars,
      installIdHash,
      latencyMs: Date.now() - startedAt,
      outputChars: 0,
      status: 'error',
    });
    return jsonResponse({ error: 'invalid_model_response' }, 502);
  }

  const latencyMs = Date.now() - startedAt;
  await logRewriteRun(supabase, {
    clientPromptVersion: validation.clientPromptVersion,
    defaultEmailChars: validation.defaultEmailChars,
    guidedAnswerCount: validation.guidedAnswerCount,
    inputChars: validation.inputChars,
    installIdHash,
    latencyMs,
    outputChars: safeResult.outputChars,
    status: 'ok',
  });

  return jsonResponse({
    body: safeResult.body,
    provider: PROVIDER,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    rewrittenAt,
    latencyMs,
  });
});

async function checkRateLimit(
  supabase: ServiceClient,
  installIdHash: string,
  limits: RewriteLimitConfig
) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const globalCount = await countRuns(supabase, startOfDay, endOfDay);
  if (!globalCount.ok) return globalCount;
  if (globalCount.count >= limits.maxRewritesGlobalPerDay) {
    return { ok: false as const, error: 'global_daily_limit_reached', status: 429 };
  }

  const installCount = await countRuns(supabase, startOfDay, endOfDay, installIdHash);
  if (!installCount.ok) return installCount;
  if (installCount.count >= limits.maxRewritesPerInstallPerDay) {
    return { ok: false as const, error: 'install_daily_limit_reached', status: 429 };
  }

  return { ok: true as const };
}

async function countRuns(
  supabase: ServiceClient,
  startOfDay: Date,
  endOfDay: Date,
  installIdHash?: string
) {
  const filters = buildRewriteRunCountFilters({
    endOfDay,
    installIdHash,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    provider: PROVIDER,
    startOfDay,
  });
  let query = supabase
    .from('ai_email_rewrite_runs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', filters.createdAtStart)
    .lt('created_at', filters.createdAtEnd)
    .eq('provider', filters.provider)
    .eq('model', filters.model)
    .eq('prompt_version', filters.promptVersion);

  if (filters.installIdHash) {
    query = query.eq('install_id_hash', filters.installIdHash);
  }

  const { count, error } = await query;
  if (error) {
    return { ok: false as const, error: 'rate_limit_unavailable', status: 503 };
  }

  return { ok: true as const, count: count ?? 0 };
}

/** Gemini answers 500 or 503 when the model is briefly overloaded; one quick retry usually works. */
const RETRYABLE_GEMINI_STATUSES = new Set([500, 503]);
const GEMINI_RETRY_DELAY_MS = 800;

async function sendWithOverloadRetry(send: () => Promise<Response>) {
  const response = await send();
  if (!RETRYABLE_GEMINI_STATUSES.has(response.status)) return response;

  await response.body?.cancel();
  await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
  return send();
}

async function callGemini(apiKey: string, request: ValidEmailRewriteRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await sendWithOverloadRetry(() =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Keep the key out of the URL: fetch errors can include the URL, and error
          // messages are written to the runs table.
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildGeminiEmailRewritePrompt(request),
                },
              ],
            },
          ],
          generation_config: {
            response_mime_type: 'application/json',
            temperature: 0.2,
          },
        }),
      })
    );

    if (!response.ok) {
      throw new Error(`Gemini returned ${response.status}`);
    }

    const geminiResponse = await response.json();
    const text = geminiResponse?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text)
      .filter(Boolean)
      .join('\n');

    return parseJsonText(text ?? '');
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Gemini request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function logRewriteRun(
  supabase: ServiceClient,
  input: Omit<RewriteRunLogInput, 'model' | 'promptVersion' | 'provider'>
) {
  const { error } = await supabase.from('ai_email_rewrite_runs').insert(buildRewriteRunLogRow({
    ...input,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    provider: PROVIDER,
  }));

  if (error) {
    console.error('Failed to log email rewrite run', error);
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}

/** The runs tables have row level security and no policies, so they need the service-role key. */
function createServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey);
}

// The type of the client this function actually creates. `ReturnType<typeof createClient>` is
// the generic signature's type, which newer supabase-js typings don't accept here.
type ServiceClient = ReturnType<typeof createServiceClient>;
