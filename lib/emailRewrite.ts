import { formatAnswer } from './answers';
import type { EmailInput } from './types';

export const EMAIL_REWRITE_PROMPT_VERSION = 'toronto-311-email-rewrite-v2';

export type EmailRewritePromptPayload = {
  default_email: string;
  issue_label: string;
  issue_description: string;
  location: string;
  guided_answers: string[];
  photo_evidence: string;
  contact_details: string;
};

export function buildEmailRewritePromptPayload(
  input: EmailInput,
  defaultEmailBody: string
): EmailRewritePromptPayload {
  return {
    default_email: defaultEmailBody,
    issue_label: input.category.title,
    issue_description: input.description.trim(),
    location: buildLocationSummary(input),
    guided_answers: buildGuidedAnswers(input),
    photo_evidence: buildPhotoEvidence(input),
    // Name, email, phone and exact GPS never go to the model; the app adds them back afterwards.
    contact_details: '',
  };
}

function buildGuidedAnswers(input: EmailInput) {
  return input.category.questions
    .map((question) => {
      const value = formatAnswer(input.answers[question.id]);
      return value ? `${question.label}: ${value}` : null;
    })
    .filter((answer): answer is string => answer != null);
}

function buildLocationSummary(input: EmailInput) {
  return [
    input.address.trim(),
    input.locationNote.trim() ? `Location note: ${input.locationNote.trim()}` : null,
  ]
    .filter((line): line is string => line != null && line.length > 0)
    .join('\n');
}

function buildPhotoEvidence(input: EmailInput) {
  const topic = input.photoIssueTopic;
  if (!topic) return input.photoUri ? 'Photo attached.' : '';

  return [
    topic.title,
    topic.evidenceChips.length ? `Evidence: ${topic.evidenceChips.join(', ')}` : null,
    topic.reason.trim(),
    input.photoUri ? 'Photo attached.' : null,
  ]
    .filter((line): line is string => line != null && line.length > 0)
    .join(' ');
}
