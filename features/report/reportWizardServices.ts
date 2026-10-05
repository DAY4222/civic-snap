import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';

import { GENERAL_CATEGORY } from '@/lib/categories';
import { addLocalDetailsToRewrittenBody, buildEmail } from '@/lib/email';
import {
  canRewriteEmailDraft,
  rewriteEmailDraft,
  type EmailRewriteResult,
} from '@/lib/emailRewriteClient';
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

export async function buildPreviewEmail(
  input: EmailInput,
  rewriteDraft: (
    input: EmailInput,
    options: { defaultEmailBody: string }
  ) => Promise<Pick<EmailRewriteResult, 'body'>> = rewriteEmailDraft,
  buildLocalEmail: (input: EmailInput) => ReturnType<typeof buildEmail> = buildEmail
) {
  const email = buildLocalEmail(input);
  if (rewriteDraft === rewriteEmailDraft && !canRewriteEmailDraft()) return email;

  try {
    const rewritten = await rewriteDraft(input, {
      defaultEmailBody: buildEmail(input, { includeContact: false, includeCoordinates: false })
        .body,
    });
    return { ...email, body: addLocalDetailsToRewrittenBody(rewritten.body, input) };
  } catch {
    return email;
  }
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
