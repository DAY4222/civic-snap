export type EmailRewriteRequest = {
  contactDetails?: string;
  defaultEmail?: string;
  guidedAnswers?: string[];
  installId?: string;
  issueDescription?: string;
  issueLabel?: string;
  location?: string;
  photoEvidence?: string;
  promptVersion?: string;
};

export type RewriteLimitConfig = {
  maxRewritesGlobalPerDay: number;
  maxRewritesPerInstallPerDay: number;
};

export const DEFAULT_REWRITE_LIMIT_CONFIG: RewriteLimitConfig = {
  maxRewritesGlobalPerDay: 300,
  maxRewritesPerInstallPerDay: 50,
};

export const MAX_DEFAULT_EMAIL_CHARS = 6_000;
export const MAX_FIELD_CHARS = 2_000;
export const MAX_GUIDED_ANSWERS = 40;
export const MAX_GUIDED_ANSWER_CHARS = 1_000;
export const MAX_REWRITTEN_BODY_CHARS = 3_000;

export type RewriteRunCountFilterInput = {
  endOfDay: Date;
  installIdHash?: string;
  model: string;
  promptVersion: string;
  provider: string;
  startOfDay: Date;
};

export type RewriteRunLogInput = {
  clientPromptVersion: string;
  defaultEmailChars: number;
  errorCode?: string;
  errorMessage?: string;
  guidedAnswerCount: number;
  inputChars: number;
  installIdHash: string;
  latencyMs: number;
  model: string;
  outputChars: number;
  promptVersion: string;
  provider: string;
  status: 'ok' | 'error';
};

export function readRewriteLimitConfigFromEnv(getEnv: (name: string) => string | undefined) {
  const maxRewritesPerInstallPerDay = parsePositiveIntegerEnvValue(
    getEnv('MAX_EMAIL_REWRITES_PER_INSTALL_PER_DAY'),
    DEFAULT_REWRITE_LIMIT_CONFIG.maxRewritesPerInstallPerDay
  );
  const maxRewritesGlobalPerDay = parsePositiveIntegerEnvValue(
    getEnv('MAX_EMAIL_REWRITES_GLOBAL_PER_DAY'),
    DEFAULT_REWRITE_LIMIT_CONFIG.maxRewritesGlobalPerDay
  );

  if (maxRewritesPerInstallPerDay == null || maxRewritesGlobalPerDay == null) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    config: {
      maxRewritesGlobalPerDay,
      maxRewritesPerInstallPerDay,
    },
  };
}

export function parsePositiveIntegerEnvValue(raw: string | undefined, fallback: number) {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;

  return value;
}

export function validateEmailRewriteRequest(body: EmailRewriteRequest) {
  const installId = stringValue(body.installId).trim();
  const defaultEmail = truncateText(stringValue(body.defaultEmail).trim(), MAX_DEFAULT_EMAIL_CHARS);

  if (!installId) return { ok: false as const, error: 'missing_install_id' };
  if (!defaultEmail) return { ok: false as const, error: 'missing_default_email' };

  const guidedAnswers = Array.isArray(body.guidedAnswers)
    ? body.guidedAnswers
        .map((answer) => truncateText(stringValue(answer).trim(), MAX_GUIDED_ANSWER_CHARS))
        .filter(Boolean)
        .slice(0, MAX_GUIDED_ANSWERS)
    : [];

  const valid = {
    ok: true as const,
    clientPromptVersion: truncateText(stringValue(body.promptVersion).trim(), 120) || 'unknown',
    contactDetails: truncateText(stringValue(body.contactDetails).trim(), MAX_FIELD_CHARS),
    defaultEmail,
    defaultEmailChars: defaultEmail.length,
    guidedAnswerCount: guidedAnswers.length,
    guidedAnswers,
    inputChars: 0,
    installId,
    issueDescription: truncateText(stringValue(body.issueDescription).trim(), MAX_FIELD_CHARS),
    issueLabel: truncateText(stringValue(body.issueLabel).trim(), 240),
    location: truncateText(stringValue(body.location).trim(), MAX_FIELD_CHARS),
    photoEvidence: truncateText(stringValue(body.photoEvidence).trim(), MAX_FIELD_CHARS),
  };

  return {
    ...valid,
    inputChars: countInputChars(valid),
  };
}

export type ValidEmailRewriteRequest = Extract<
  ReturnType<typeof validateEmailRewriteRequest>,
  { ok: true }
>;

export function buildGeminiEmailRewritePrompt(input: ValidEmailRewriteRequest) {
  return [
    'You improve email drafts for Toronto 311 service requests.',
    '',
    'Input fields may be blank:',
    '- defaultEmail: the app-generated draft email',
    '- issueLabel: the selected 311 issue/category',
    "- issueDescription: the user's description",
    '- location: address, intersection, landmark, GPS, or location note',
    '- guidedAnswers: answered 311 checklist/intake questions',
    '- photoEvidence: user-selected photo evidence summary, if any',
    '- contactDetails: name, email, phone, or preferred contact method',
    '',
    'Rewrite defaultEmail into a clear, concise, polite email body to 311 Toronto.',
    '',
    'Rules:',
    '- Return JSON only with this shape: {"body":"final email body"}',
    '- The body must contain only the final email body. No subject, markdown, bullets, or analysis.',
    '- Use plain-text section labels with blank lines, such as "Issue:", "Location:", "Details:", "Request:", and optional "Contact:".',
    '- Keep each section concise and scannable, ideally 120-180 words total.',
    '- Preserve factual details from the inputs. Do not invent dates, durations, hazards, eligibility answers, attachments, case numbers, or contact details.',
    '- If timing is not provided, omit timing instead of saying it is unknown.',
    '- State the issue and exact location early.',
    '- Include relevant guided answers naturally, especially eligibility, size/severity, access, or exact-location details.',
    '- Mention impacts only when they are provided or directly stated by the user.',
    '- Ask for the appropriate city action, such as inspection, repair, removal, clearing, or follow-up. If unclear, request inspection and follow-up.',
    '- If contact details are provided, include them in the Contact section before a brief thank-you. If no contact details are provided, end with "Thank you."',
    '- Keep the tone professional, courteous, and assertive.',
    '',
    `input: ${JSON.stringify({
      contactDetails: input.contactDetails,
      defaultEmail: input.defaultEmail,
      guidedAnswers: input.guidedAnswers,
      issueDescription: input.issueDescription,
      issueLabel: input.issueLabel,
      location: input.location,
      photoEvidence: input.photoEvidence,
    })}`,
  ].join('\n');
}

export function normalizeGeminiEmailRewriteResult(body: unknown) {
  const item = asRecord(body);
  const rawBody = typeof item?.body === 'string' ? item.body : '';
  const rewrittenBody = truncateText(normalizeEmailBody(rawBody), MAX_REWRITTEN_BODY_CHARS);
  return rewrittenBody ? { body: rewrittenBody, outputChars: rewrittenBody.length } : null;
}

export function buildRewriteRunCountFilters(input: RewriteRunCountFilterInput) {
  return {
    createdAtEnd: input.endOfDay.toISOString(),
    createdAtStart: input.startOfDay.toISOString(),
    installIdHash: input.installIdHash ?? null,
    model: input.model,
    promptVersion: input.promptVersion,
    provider: input.provider,
  };
}

export function buildRewriteRunLogRow(input: RewriteRunLogInput) {
  return {
    client_prompt_version: input.clientPromptVersion,
    default_email_chars: input.defaultEmailChars,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    guided_answer_count: input.guidedAnswerCount,
    input_chars: input.inputChars,
    install_id_hash: input.installIdHash,
    latency_ms: input.latencyMs,
    model: input.model,
    output_chars: input.outputChars,
    prompt_version: input.promptVersion,
    provider: input.provider,
    status: input.status,
  };
}

export function parseJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

export function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function countInputChars(input: {
  contactDetails: string;
  defaultEmail: string;
  guidedAnswers: string[];
  issueDescription: string;
  issueLabel: string;
  location: string;
  photoEvidence: string;
}) {
  return [
    input.contactDetails,
    input.defaultEmail,
    ...input.guidedAnswers,
    input.issueDescription,
    input.issueLabel,
    input.location,
    input.photoEvidence,
  ].reduce((total, value) => total + value.length, 0);
}

function normalizeEmailBody(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
