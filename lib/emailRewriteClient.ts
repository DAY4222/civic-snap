import {
  EMAIL_REWRITE_PROMPT_VERSION,
  buildEmailRewritePromptPayload,
  type EmailRewritePromptPayload,
} from './emailRewrite';
import { buildEmail } from './email';
import { getInstallId } from './installId';
import type { DraftReportInput } from './types';

export const DEFAULT_REWRITE_TIMEOUT_MS = 8_000;
const REWRITE_EMAIL_URL = process.env.EXPO_PUBLIC_SUPABASE_REWRITE_EMAIL_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type EmailRewriteConfig = {
  rewriteEmailUrl?: string;
  supabaseAnonKey?: string;
};

export type RewriteEmailDraftOptions = {
  config?: EmailRewriteConfig;
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

export class EmailRewriteError extends Error {
  constructor(
    message: string,
    readonly code: 'disabled' | 'network' | 'rate-limited' | 'server' | 'invalid-response'
  ) {
    super(message);
  }
}

export function canRewriteEmailDraft(config: EmailRewriteConfig = getEmailRewriteConfig()) {
  return Boolean(config.rewriteEmailUrl && config.supabaseAnonKey);
}

export async function rewriteEmailDraft(
  input: DraftReportInput,
  options: RewriteEmailDraftOptions = {}
) {
  const config = options.config ?? getEmailRewriteConfig();
  if (!canRewriteEmailDraft(config)) {
    throw new EmailRewriteError('Email rewriting is not configured.', 'disabled');
  }

  const installId = options.installId ?? (await getInstallId());
  const payload = buildEmailRewritePromptPayload(
    input,
    options.defaultEmailBody ?? buildEmail(input).body
  );
  const abortSignal = createTimeoutSignal(options.signal, options.timeoutMs ?? DEFAULT_REWRITE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(config.rewriteEmailUrl ?? '', {
      method: 'POST',
      headers: getRewriteEmailHeaders(config.supabaseAnonKey ?? ''),
      signal: abortSignal.signal,
      body: JSON.stringify({
        installId,
        promptVersion: EMAIL_REWRITE_PROMPT_VERSION,
        ...toServerPayload(payload),
      }),
    });
  } catch {
    if (abortSignal.didTimeout()) {
      throw new EmailRewriteError('Email rewrite took too long.', 'network');
    }
    throw new EmailRewriteError('Email rewrite is unavailable.', 'network');
  } finally {
    abortSignal.cleanup();
  }

  if (response.status === 429) {
    throw new EmailRewriteError('Email rewrite limit reached for today.', 'rate-limited');
  }

  if (!response.ok) {
    throw new EmailRewriteError('Email rewrite is unavailable.', 'server');
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new EmailRewriteError('Email rewrite returned invalid JSON.', 'invalid-response');
  }

  const rewrite = normalizeEmailRewriteResponse(result);
  if (!rewrite) {
    throw new EmailRewriteError('Email rewrite returned an invalid body.', 'invalid-response');
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

function getEmailRewriteConfig(): EmailRewriteConfig {
  return {
    rewriteEmailUrl: REWRITE_EMAIL_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  };
}

function getRewriteEmailHeaders(supabaseAnonKey: string) {
  return {
    Authorization: `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
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

function createTimeoutSignal(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();

  parentSignal?.addEventListener('abort', abort);
  if (parentSignal?.aborted) {
    controller.abort();
  }

  return {
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    },
    didTimeout: () => timedOut,
    signal: controller.signal,
  };
}
