import type { EmailSource } from '@/lib/types';

export type EmailContent = { subject: string; body: string };

/**
 * Which email the preview shows. The generated email is always rebuilt from the report, so
 * only text the user typed or accepted from AI is kept here.
 */
export type EmailDraftState = {
  source: EmailSource;
  /** The user's edited email or the accepted AI version; null while the generated one shows. */
  override: EmailContent | null;
  /** Key of the generated email the override was written against; null when unknown. */
  basedOn: string | null;
  /** An AI version that arrived after the user had edited the email, waiting for a choice. */
  pendingAi: EmailContent | null;
  /** What Undo restores after an AI version replaced the email. */
  beforeAi: Pick<EmailDraftState, 'source' | 'override' | 'basedOn'> | null;
};

export const INITIAL_EMAIL_DRAFT: EmailDraftState = {
  source: 'generated',
  override: null,
  basedOn: null,
  pendingAi: null,
  beforeAi: null,
};

export function emailKey(email: EmailContent) {
  return `${email.subject}\n\n${email.body}`;
}

export function getDisplayedEmail(email: EmailDraftState, generated: EmailContent): EmailContent {
  return email.source === 'generated' || !email.override ? generated : email.override;
}

/** True when the report changed after the user's or AI's email was written. */
export function isEmailOutOfDate(email: EmailDraftState, generated: EmailContent) {
  return (
    email.source !== 'generated' && email.basedOn != null && email.basedOn !== emailKey(generated)
  );
}

export function editEmail(content: EmailContent, generated: EmailContent): EmailDraftState {
  return {
    source: 'user',
    override: content,
    basedOn: emailKey(generated),
    pendingAi: null,
    beforeAi: null,
  };
}

/** Applies an AI version, unless the user has edited the email: then it waits for their choice. */
export function receiveAiEmail(
  email: EmailDraftState,
  content: EmailContent,
  generated: EmailContent
): EmailDraftState {
  if (email.source === 'user') return { ...email, pendingAi: content };

  return applyAiEmail(email, content, generated);
}

export function acceptPendingAiEmail(
  email: EmailDraftState,
  generated: EmailContent
): EmailDraftState {
  return email.pendingAi ? applyAiEmail(email, email.pendingAi, generated) : email;
}

export function dismissPendingAiEmail(email: EmailDraftState): EmailDraftState {
  return { ...email, pendingAi: null };
}

export function undoAiEmail(email: EmailDraftState): EmailDraftState {
  if (email.source !== 'ai') return email;

  return { ...INITIAL_EMAIL_DRAFT, ...email.beforeAi, pendingAi: null, beforeAi: null };
}

/** A saved draft's email: kept as written unless it was the generated one. */
export function emailDraftFromSaved(source: EmailSource, saved: EmailContent): EmailDraftState {
  return source === 'generated'
    ? INITIAL_EMAIL_DRAFT
    : { ...INITIAL_EMAIL_DRAFT, source, override: saved };
}

function applyAiEmail(
  email: EmailDraftState,
  content: EmailContent,
  generated: EmailContent
): EmailDraftState {
  return {
    source: 'ai',
    override: content,
    basedOn: emailKey(generated),
    pendingAi: null,
    beforeAi: { source: email.source, override: email.override, basedOn: email.basedOn },
  };
}
