import { formatAnswer } from './answers';
import type { EmailInput, Profile } from './types';

const RECIPIENT = '311@toronto.ca';

type BuildEmailOptions = {
  /** Contact details and exact GPS stay on the device when the draft is sent for AI rewriting. */
  includeContact?: boolean;
  includeCoordinates?: boolean;
};

export function buildEmail(
  input: EmailInput,
  { includeContact = true, includeCoordinates = true }: BuildEmailOptions = {}
) {
  const subject = `311 service request: ${input.category.title}`;
  const contactLines = includeContact ? formatContactLines(input.profile) : [];

  const answerLines = input.category.questions
    .map((question) => {
      const value = formatAnswer(input.answers[question.id]);
      return value ? `- ${question.label}: ${value}` : null;
    })
    .filter(Boolean);

  const coordinateLine = includeCoordinates
    ? formatCoordinateLine(input) ?? 'GPS: not available'
    : null;
  const categoryPath = input.category.categoryPath?.join(' > ') ?? '';

  const body = [
    'Hello 311 Toronto,',
    '',
    'Issue:',
    input.category.title,
    categoryPath ? `Category path: ${categoryPath}` : null,
    input.photoIssueTopic?.evidenceChips?.length
      ? `Photo evidence: ${input.photoIssueTopic.evidenceChips.join(', ')}`
      : null,
    '',
    'Location:',
    input.address || 'Address not provided',
    input.locationNote ? `Location note: ${input.locationNote}` : null,
    coordinateLine,
    '',
    'Description:',
    input.description.trim(),
    '',
    'Details:',
    ...answerLines,
    input.photoUri ? '- Photo attached' : '- No photo attached',
    '',
    contactLines.length ? 'Contact:' : null,
    ...contactLines,
    contactLines.length ? '' : null,
    'Thank you.',
  ]
    .filter((line): line is string => line != null)
    .join('\n');

  return {
    recipient: RECIPIENT,
    subject,
    body,
  };
}

/**
 * The AI rewrite never sees contact details or exact GPS, so add them back to the rewritten
 * body locally, before the closing thank-you when there is one.
 */
export function addLocalDetailsToRewrittenBody(body: string, input: EmailInput) {
  const coordinateLine = formatCoordinateLine(input);
  const contactLines = formatContactLines(input.profile);
  const blocks = [
    coordinateLine,
    contactLines.length ? ['Contact:', ...contactLines].join('\n') : null,
  ].filter((block): block is string => block != null);
  if (blocks.length === 0) return body;

  const localDetails = blocks.join('\n\n');
  const signOff = body.match(/\n+(thank you[^\n]*)\s*$/i);
  if (!signOff || signOff.index == null) return `${body.trimEnd()}\n\n${localDetails}`;

  return `${body.slice(0, signOff.index)}\n\n${localDetails}\n\n${signOff[1]}`;
}

function formatCoordinateLine(input: Pick<EmailInput, 'latitude' | 'longitude'>) {
  return input.latitude != null && input.longitude != null
    ? `GPS: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`
    : null;
}

function formatContactLines(profile: Profile) {
  return [
    profile.name.trim() ? `Name: ${profile.name.trim()}` : null,
    profile.email.trim() ? `Email: ${profile.email.trim()}` : null,
    profile.phone.trim() ? `Phone: ${profile.phone.trim()}` : null,
  ].filter((line): line is string => line != null);
}
