import { formatAnswer } from './answers';
import { CITY } from './city';
import type { EmailInput, Profile } from './types';

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

  const coordinateLines = includeCoordinates
    ? formatCoordinateLines(input) ?? ['GPS: not available']
    : [];

  const body = [
    CITY.greeting,
    '',
    'Issue:',
    input.category.title,
    input.photoIssueTopic?.evidenceChips?.length
      ? `Photo evidence: ${input.photoIssueTopic.evidenceChips.join(', ')}`
      : null,
    '',
    'Location:',
    input.address || 'Address not provided',
    input.locationNote ? `Location note: ${input.locationNote}` : null,
    ...coordinateLines,
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
    recipient: CITY.recipient,
    subject,
    body,
  };
}

/**
 * The AI rewrite never sees contact details or exact GPS, so add them back to the rewritten
 * body locally, before the closing thank-you when there is one.
 */
export function addLocalDetailsToRewrittenBody(body: string, input: EmailInput) {
  const coordinateLines = formatCoordinateLines(input);
  const contactLines = formatContactLines(input.profile);
  const blocks = [
    coordinateLines?.join('\n') ?? null,
    contactLines.length ? ['Contact:', ...contactLines].join('\n') : null,
  ].filter((block): block is string => block != null);
  if (blocks.length === 0) return body;

  const localDetails = blocks.join('\n\n');
  const ownLine = body.match(/\n+(thank you[^\n]*)\s*$/i);
  if (ownLine?.index != null) {
    return `${body.slice(0, ownLine.index)}\n\n${localDetails}\n\n${ownLine[1]}`;
  }

  // "...for public use. Thank you." on one line: move the thank-you below the local details.
  const sameLine = body.match(/([.!?])[ \t]+(thank you[^\n]*)\s*$/i);
  if (sameLine?.index != null) {
    return `${body.slice(0, sameLine.index + 1)}\n\n${localDetails}\n\n${sameLine[2]}`;
  }

  return `${body.trimEnd()}\n\n${localDetails}`;
}

/** GPS plus a map link, so 311 staff can open the exact spot from any desktop. */
function formatCoordinateLines(input: Pick<EmailInput, 'latitude' | 'longitude'>) {
  if (input.latitude == null || input.longitude == null) return null;

  const latitude = input.latitude.toFixed(6);
  const longitude = input.longitude.toFixed(6);
  return [`GPS: ${latitude}, ${longitude}`, `Map: https://maps.google.com/?q=${latitude},${longitude}`];
}

function formatContactLines(profile: Profile) {
  return [
    profile.name.trim() ? `Name: ${profile.name.trim()}` : null,
    profile.email.trim() ? `Email: ${profile.email.trim()}` : null,
    profile.phone.trim() ? `Phone: ${profile.phone.trim()}` : null,
  ].filter((line): line is string => line != null);
}
