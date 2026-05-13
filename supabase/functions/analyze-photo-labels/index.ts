import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AllowedLabel = {
  id: string;
  label: string;
  description?: string;
};

type AnalysisRequest = {
  installId?: string;
  imageBase64?: string;
  image?: {
    bytes?: number;
    height?: number;
    width?: number;
  };
  mimeType?: string;
  allowedLabels?: AllowedLabel[];
  taxonomyVersion?: string;
};

type GeminiLabel = {
  id?: string;
  label?: string;
  confidence?: number;
  evidence?: string;
  boundingBox?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
};

type GeminiObservation = {
  name?: string;
  confidence?: number;
  evidence?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const MODEL = 'gemini-2.5-flash-lite';
const PROVIDER = 'gemini';
const PROMPT_VERSION = 'photo-labels-v1';
const MIN_CONFIDENCE = 0.7;
const MAX_LABELS = 5;
const MAX_UNKNOWN_OBSERVATIONS = 5;
const MAX_EVIDENCE_CHARS = 240;
const MAX_UNKNOWN_EVIDENCE_CHARS = 120;
const MAX_ALLOWED_LABELS = 40;
const MAX_IMAGE_BASE64_BYTES = Number(Deno.env.get('MAX_IMAGE_BASE64_BYTES') ?? 2_000_000);
const MAX_ANALYSES_PER_INSTALL_PER_DAY = Number(
  Deno.env.get('MAX_ANALYSES_PER_INSTALL_PER_DAY') ?? 50
);
const MAX_ANALYSES_GLOBAL_PER_DAY = Number(Deno.env.get('MAX_ANALYSES_GLOBAL_PER_DAY') ?? 300);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const startedAt = Date.now();
  const analyzedAt = new Date().toISOString();
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  let body: AnalysisRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const validation = validateRequest(body);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const installIdHash = await sha256(validation.installId);
  const rateLimit = await checkRateLimit(supabase, installIdHash);
  if (!rateLimit.ok) {
    return jsonResponse({ error: rateLimit.error }, rateLimit.status);
  }

  let geminiBody: unknown;
  try {
    geminiBody = await callGemini(apiKey, validation);
  } catch (error) {
    await logAnalysisRun(supabase, {
      analyzedAt,
      errorCode: 'gemini_request_failed',
      errorMessage: truncateText(String(error), 240),
      installIdHash,
      latencyMs: Date.now() - startedAt,
      request: validation,
      status: 'error',
      suggestedLabels: [],
      unknownObservations: [],
    });
    return jsonResponse({ error: 'gemini_request_failed' }, 502);
  }

  const safeResult = normalizeGeminiResult(geminiBody, validation.allowedLabels);
  const latencyMs = Date.now() - startedAt;
  const responseBody = {
    suggestedLabels: safeResult.suggestedLabels,
    provider: PROVIDER,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    taxonomyVersion: validation.taxonomyVersion,
    analyzedAt,
    latencyMs,
    image: {
      bytes: validation.imageBytes,
      height: validation.imageHeight,
      mimeType: validation.mimeType,
      width: validation.imageWidth,
    },
  };

  await logAnalysisRun(supabase, {
    analyzedAt,
    installIdHash,
    latencyMs,
    request: validation,
    status: 'ok',
    suggestedLabels: safeResult.suggestedLabels,
    unknownObservations: safeResult.unknownObservations,
  });

  return jsonResponse(responseBody);
});

function validateRequest(body: AnalysisRequest) {
  const installId = typeof body.installId === 'string' ? body.installId.trim() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
  const taxonomyVersion =
    typeof body.taxonomyVersion === 'string' ? body.taxonomyVersion.trim() : '';

  if (!installId) return { ok: false as const, error: 'missing_install_id' };
  if (!imageBase64) return { ok: false as const, error: 'missing_image' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return { ok: false as const, error: 'unsupported_mime_type' };
  }

  const imageBytes = getBase64ByteSize(imageBase64);
  if (imageBytes > MAX_IMAGE_BASE64_BYTES) {
    return { ok: false as const, error: 'image_too_large' };
  }

  const allowedLabels = Array.isArray(body.allowedLabels)
    ? body.allowedLabels
        .filter((label) => typeof label.id === 'string' && typeof label.label === 'string')
        .slice(0, MAX_ALLOWED_LABELS)
    : [];

  if (allowedLabels.length === 0) {
    return { ok: false as const, error: 'missing_allowed_labels' };
  }

  return {
    ok: true as const,
    allowedLabels,
    imageBase64,
    imageBytes,
    imageHeight: Number(body.image?.height) || null,
    imageWidth: Number(body.image?.width) || null,
    installId,
    mimeType,
    taxonomyVersion: taxonomyVersion || 'unknown',
  };
}

async function checkRateLimit(supabase: ReturnType<typeof createClient>, installIdHash: string) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const globalCount = await countRuns(supabase, startOfDay, endOfDay);
  if (!globalCount.ok) return globalCount;
  if (globalCount.count >= MAX_ANALYSES_GLOBAL_PER_DAY) {
    return { ok: false as const, error: 'global_daily_limit_reached', status: 429 };
  }

  const installCount = await countRuns(supabase, startOfDay, endOfDay, installIdHash);
  if (!installCount.ok) return installCount;
  if (installCount.count >= MAX_ANALYSES_PER_INSTALL_PER_DAY) {
    return { ok: false as const, error: 'install_daily_limit_reached', status: 429 };
  }

  return { ok: true as const };
}

async function countRuns(
  supabase: ReturnType<typeof createClient>,
  startOfDay: Date,
  endOfDay: Date,
  installIdHash?: string
) {
  let query = supabase
    .from('ai_photo_analysis_runs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay.toISOString())
    .lt('created_at', endOfDay.toISOString());

  if (installIdHash) {
    query = query.eq('install_id_hash', installIdHash);
  }

  const { count, error } = await query;
  if (error) {
    return { ok: false as const, error: 'rate_limit_unavailable', status: 503 };
  }

  return { ok: true as const, count: count ?? 0 };
}

async function callGemini(apiKey: string, request: ReturnType<typeof validateRequest> & { ok: true }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  data: request.imageBase64,
                  mime_type: request.mimeType,
                },
              },
              {
                text: buildPrompt(request.allowedLabels),
              },
            ],
          },
        ],
        generation_config: {
          response_mime_type: 'application/json',
          temperature: 0.1,
        },
      }),
    }
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
}

function buildPrompt(allowedLabels: AllowedLabel[]) {
  return [
    'You are analyzing a 311 civic issue photo.',
    'Return JSON only. Do not include markdown.',
    'Choose suggestedLabels only from the allowedLabels list.',
    `Only include labels with confidence >= ${MIN_CONFIDENCE}. Return at most ${MAX_LABELS} suggestedLabels.`,
    'Include a normalized boundingBox if the object is visible. x, y, width, height must be numbers from 0 to 1.',
    `Keep evidence under ${MAX_EVIDENCE_CHARS} characters per label.`,
    `Return at most ${MAX_UNKNOWN_OBSERVATIONS} unknownObservations for relevant civic objects outside allowedLabels.`,
    `Keep unknown observation evidence under ${MAX_UNKNOWN_EVIDENCE_CHARS} characters each.`,
    'Expected shape: {"suggestedLabels":[{"id":"string","confidence":0.7,"evidence":"string","boundingBox":{"x":0,"y":0,"width":0.1,"height":0.1}}],"unknownObservations":[{"name":"string","confidence":0.7,"evidence":"string"}]}',
    `allowedLabels: ${JSON.stringify(allowedLabels)}`,
  ].join('\n');
}

function normalizeGeminiResult(body: unknown, allowedLabels: AllowedLabel[]) {
  const allowedById = new Map(allowedLabels.map((label) => [label.id, label]));
  const suggestedLabels = Array.isArray((body as { suggestedLabels?: unknown }).suggestedLabels)
    ? ((body as { suggestedLabels: GeminiLabel[] }).suggestedLabels ?? [])
        .map((label) => normalizeLabel(label, allowedById))
        .filter(Boolean)
        .filter((label) => label.confidence >= MIN_CONFIDENCE)
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, MAX_LABELS)
    : [];

  const unknownObservations = Array.isArray(
    (body as { unknownObservations?: unknown }).unknownObservations
  )
    ? ((body as { unknownObservations: GeminiObservation[] }).unknownObservations ?? [])
        .map(normalizeUnknownObservation)
        .filter(Boolean)
        .slice(0, MAX_UNKNOWN_OBSERVATIONS)
    : [];

  return { suggestedLabels, unknownObservations };
}

function normalizeLabel(label: GeminiLabel, allowedById: Map<string, AllowedLabel>) {
  const id = typeof label.id === 'string' ? label.id : '';
  const allowedLabel = allowedById.get(id);
  if (!allowedLabel) return null;

  return {
    id,
    label: allowedLabel.label,
    confidence: clamp(Number(label.confidence) || 0, 0, 1),
    evidence: truncateText(typeof label.evidence === 'string' ? label.evidence : '', MAX_EVIDENCE_CHARS),
    boundingBox: normalizeBoundingBox(label.boundingBox),
  };
}

function normalizeUnknownObservation(observation: GeminiObservation) {
  const name = typeof observation.name === 'string' ? truncateText(observation.name, 80) : '';
  if (!name) return null;

  return {
    name,
    confidence: clamp(Number(observation.confidence) || 0, 0, 1),
    evidence: truncateText(
      typeof observation.evidence === 'string' ? observation.evidence : '',
      MAX_UNKNOWN_EVIDENCE_CHARS
    ),
  };
}

function normalizeBoundingBox(box: GeminiLabel['boundingBox']) {
  if (!box) return undefined;

  const x = clamp(Number(box.x) || 0, 0, 1);
  const y = clamp(Number(box.y) || 0, 0, 1);
  const width = clamp(Number(box.width) || 0, 0, 1 - x);
  const height = clamp(Number(box.height) || 0, 0, 1 - y);

  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

async function logAnalysisRun(
  supabase: ReturnType<typeof createClient>,
  input: {
    analyzedAt: string;
    errorCode?: string;
    errorMessage?: string;
    installIdHash: string;
    latencyMs: number;
    request: ReturnType<typeof validateRequest> & { ok: true };
    status: 'ok' | 'error';
    suggestedLabels: unknown[];
    unknownObservations: unknown[];
  }
) {
  const { error } = await supabase.from('ai_photo_analysis_runs').insert({
    created_at: input.analyzedAt,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    image_bytes: input.request.imageBytes,
    image_height: input.request.imageHeight,
    image_mime_type: input.request.mimeType,
    image_width: input.request.imageWidth,
    install_id_hash: input.installIdHash,
    latency_ms: input.latencyMs,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    provider: PROVIDER,
    status: input.status,
    suggested_labels: input.suggestedLabels,
    taxonomy_version: input.request.taxonomyVersion,
    unknown_observations: input.unknownObservations,
  });

  if (error) {
    console.error('Failed to log photo analysis run', error);
  }
}

function parseJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getBase64ByteSize(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function truncateText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
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
