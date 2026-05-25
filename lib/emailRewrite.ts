import type { DraftReportInput } from './types';

export const EMAIL_REWRITE_PROMPT_VERSION = 'toronto-311-email-rewrite-v1';

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
  input: DraftReportInput,
  defaultEmailBody: string
): EmailRewritePromptPayload {
  return {
    default_email: defaultEmailBody,
    issue_label: input.category.title,
    issue_description: input.description.trim(),
    location: buildLocationSummary(input),
    guided_answers: buildGuidedAnswers(input),
    photo_evidence: buildPhotoEvidence(input),
    contact_details: buildContactDetails(input),
  };
}

function buildGuidedAnswers(input: DraftReportInput) {
  return input.category.questions
    .map((question) => {
      const value = input.answers[question.id]?.trim();
      return value ? `${question.label}: ${value}` : null;
    })
    .filter((answer): answer is string => answer != null);
}

function buildLocationSummary(input: DraftReportInput) {
  return [
    input.address.trim(),
    input.locationNote.trim() ? `Location note: ${input.locationNote.trim()}` : null,
    input.latitude != null && input.longitude != null
      ? `GPS: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`
      : null,
  ]
    .filter((line): line is string => line != null && line.length > 0)
    .join('\n');
}

function buildPhotoEvidence(input: DraftReportInput) {
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

function buildContactDetails(input: DraftReportInput) {
  return [
    input.profile.name.trim() ? `Name: ${input.profile.name.trim()}` : null,
    input.profile.email.trim() ? `Email: ${input.profile.email.trim()}` : null,
    input.profile.phone.trim() ? `Phone: ${input.profile.phone.trim()}` : null,
  ]
    .filter((line): line is string => line != null)
    .join('\n');
}
