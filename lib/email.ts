import { DraftReportInput } from './types';

const RECIPIENT = '311@toronto.ca';

export function buildEmail(input: DraftReportInput) {
  const subject = `311 service request: ${input.category.title}`;
  const profileLines = [
    input.profile.name.trim() ? `Name: ${input.profile.name.trim()}` : null,
    input.profile.email.trim() ? `Email: ${input.profile.email.trim()}` : null,
    input.profile.phone.trim() ? `Phone: ${input.profile.phone.trim()}` : null,
  ].filter((line): line is string => line != null);

  const answerLines = input.category.questions
    .map((question) => {
      const value = input.answers[question.id]?.trim();
      return value ? `- ${question.label}: ${value}` : null;
    })
    .filter(Boolean);

  const coordinateLine =
    input.latitude != null && input.longitude != null
      ? `GPS: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`
      : 'GPS: not available';

  const body = [
    'Hello 311 Toronto,',
    '',
    `I would like to report ${articleFor(input.category.subjectLabel)} ${input.category.subjectLabel}.`,
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
    profileLines.length ? 'Contact:' : null,
    ...profileLines,
    profileLines.length ? '' : null,
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

function articleFor(text: string) {
  return /^[aeiou]/i.test(text) ? 'an' : 'a';
}
