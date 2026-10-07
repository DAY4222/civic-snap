import { BackendError, postJson, type FetchImpl } from './backend/client';
import { backendConfig, isEmailPolishConfigured, type BackendConfig } from './backend/config';
import {
  EMAIL_REWRITE_PROMPT_VERSION,
  buildEmailRewritePromptPayload,
  type EmailRewritePromptPayload,
} from './emailRewrite';
import { buildEmail } from './email';
import { getInstallId } from './installId';
import type { EmailInput } from './types';

export const DEFAULT_REWRITE_TIMEOUT_MS = 25_000;

export type RewriteEmailDraftOptions = {
  config?: BackendConfig;
  defaultEmailBody?: string;
  fetchImpl?: FetchImpl;
  installId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type EmailRewriteResult = {
  body: string;
  provider: 'gemini';
  model: string;
  promptVersion: string;
  rewrittenAt: string;
  latencyMs: number;
};

export function canRewriteEmailDraft(config: BackendConfig = backendConfig) {
  return isEmailPolishConfigured(config);
}

export async function rewriteEmailDraft(input: EmailInput, options: RewriteEmailDraftOptions = {}) {
  const config = options.config ?? backendConfig;
  if (!canRewriteEmailDraft(config)) {
    throw new BackendError('Email rewriting is not configured.', 'disabled');
  }

  const installId = options.installId ?? (await getInstallId());
  const payload = buildEmailRewritePromptPayload(
    input,
    options.defaultEmailBody ??
      buildEmail(input, { includeContact: false, includeCoordinates: false }).body
  );

  const result = await postJson(
    config.rewriteEmailUrl,
    {
      installId,
      promptVersion: EMAIL_REWRITE_PROMPT_VERSION,
      ...toServerPayload(payload),
    },
    {
      anonKey: config.anonKey,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_REWRITE_TIMEOUT_MS,
    }
  );

  const rewrite = normalizeEmailRewriteResponse(result);
  if (!rewrite) {
    throw new BackendError('Email rewrite returned an invalid body.', 'invalid-response');
  }

  return rewrite;
}

export function normalizeEmailRewriteResponse(result: unknown): EmailRewriteResult | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;

  const body = result as Record<string, unknown>;
  const rewrittenBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!rewrittenBody) return null;

  return {
    body: rewrittenBody,
    provider: 'gemini',
    model: typeof body.model === 'string' ? body.model : '',
    promptVersion: typeof body.promptVersion === 'string' ? body.promptVersion : '',
    rewrittenAt: typeof body.rewrittenAt === 'string' ? body.rewrittenAt : '',
    latencyMs: Number(body.latencyMs) || 0,
  };
}

function toServerPayload(payload: EmailRewritePromptPayload) {
  return {
    contactDetails: payload.contact_details,
    defaultEmail: payload.default_email,
    guidedAnswers: payload.guided_answers,
    issueDescription: payload.issue_description,
    issueLabel: payload.issue_label,
    location: payload.location,
    photoEvidence: payload.photo_evidence,
  };
}
