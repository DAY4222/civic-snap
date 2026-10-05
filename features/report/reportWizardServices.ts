import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';

import { GENERAL_CATEGORY } from '@/lib/categories';
import { addLocalDetailsToRewrittenBody, buildEmail } from '@/lib/email';
import { rewriteEmailDraft, type EmailRewriteResult } from '@/lib/emailRewriteClient';
import { persistReportPhoto } from '@/lib/photos';
import { updateReportEmail, updateReportStatus, type CreateReportInput } from '@/lib/reports';
import type { EmailInput, EmailSource, IssueCategory, ReportDraft } from '@/lib/types';

export async function persistWizardPhoto(uri: string) {
  return persistReportPhoto(uri);
}

export async function getCurrentLocationReportData() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { status: 'denied' as const };

  const position = await Location.getCurrentPositionAsync({});
  const address = await reverseGeocodeReportAddress(
    position.coords.latitude,
    position.coords.longitude
  );

  return {
    status: 'ready' as const,
    address,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export async function reverseGeocodeReportAddress(latitude: number, longitude: number) {
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const place = places[0];
    return place ? formatAddress(place) : null;
  } catch {
    return null;
  }
}

/** Polish time includes a cold start on the shared backend; the function itself gives up at 20 s. */
const EMAIL_POLISH_TIMEOUT_MS = 25_000;

type RewriteDraft = (
  input: EmailInput,
  options: { defaultEmailBody: string; signal?: AbortSignal; timeoutMs?: number }
) => Promise<Pick<EmailRewriteResult, 'body'>>;

/**
 * Asks the AI for a polished body. The model only sees a privacy-safe draft (no name, email,
 * phone or GPS); those are added back to its answer here, on the device.
 */
export async function requestPolishedEmail(
  input: EmailInput,
  { signal }: { signal?: AbortSignal } = {},
  rewriteDraft: RewriteDraft = rewriteEmailDraft
) {
  const generated = buildEmail(input);
  const rewritten = await rewriteDraft(input, {
    defaultEmailBody: buildEmail(input, { includeContact: false, includeCoordinates: false }).body,
    signal,
    timeoutMs: EMAIL_POLISH_TIMEOUT_MS,
  });

  return {
    subject: generated.subject,
    body: addLocalDetailsToRewrittenBody(rewritten.body, input),
  };
}

export function toCreateReportInput(
  draft: ReportDraft,
  category: IssueCategory,
  email: { subject: string; body: string; source: EmailSource }
): CreateReportInput {
  return {
    ...draft,
    categoryId: category.id === GENERAL_CATEGORY.id ? null : category.id,
    category: category.title,
    emailSubject: email.subject,
    emailBody: email.body,
    emailSource: email.source,
  };
}

export async function openSavedReportMail({
  emailBody,
  emailRecipient,
  emailSubject,
  photoUri,
  reportId,
}: {
  emailBody: string;
  emailRecipient: string;
  emailSubject: string;
  photoUri: string | null;
  reportId: string;
}) {
  await updateReportEmail(reportId, emailSubject, emailBody);
  const available = await MailComposer.isAvailableAsync();
  if (!available) return 'fallback' as const;

  await MailComposer.composeAsync({
    recipients: [emailRecipient],
    subject: emailSubject,
    body: emailBody,
    attachments: photoUri ? [photoUri] : [],
  });
  await updateReportStatus(reportId, 'handed_off');
  return 'opened' as const;
}

function formatAddress(place: Location.LocationGeocodedAddress) {
  return [place.name, place.street, place.city, place.region].filter(Boolean).join(', ');
}
