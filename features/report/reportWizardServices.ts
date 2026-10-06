import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import { Platform, Share } from 'react-native';

import { GENERAL_CATEGORY } from '@/lib/categories';
import { addLocalDetailsToRewrittenBody, buildEmail } from '@/lib/email';
import { rewriteEmailDraft, type EmailRewriteResult } from '@/lib/emailRewriteClient';
import { persistReportPhoto } from '@/lib/photos';
import { buildShareMessage, describeShareTarget } from '@/lib/handoff';
import { markReportHandedOff, updateReportEmail, type CreateReportInput } from '@/lib/reports';
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

export type HandoffOutcome =
  | { kind: 'sent'; app: string | null }
  | { kind: 'handed-off'; app: string | null }
  | { kind: 'cancelled' }
  | { kind: 'unavailable' };

/** Whether Apple Mail (or the platform mail composer) is set up on this device. */
export async function isMailComposerAvailable() {
  // On web the composer only opens a mailto: link and can't attach the photo or report back,
  // so the web flow uses the fallback screen instead.
  if (Platform.OS === 'web') return false;

  try {
    return await MailComposer.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Hands the report to the user's email. Apple Mail opens prefilled with the photo attached when
 * it's set up; otherwise the share sheet lets them pick Gmail, Outlook and so on (the recipient
 * can't be prefilled there, so it is copied to the clipboard and named in the text). Web has
 * neither, so the caller shows the copy and mailto fallback.
 */
export async function handOffReport({
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
}): Promise<HandoffOutcome> {
  await updateReportEmail(reportId, emailSubject, emailBody);

  if (await isMailComposerAvailable()) {
    const result = await MailComposer.composeAsync({
      recipients: [emailRecipient],
      subject: emailSubject,
      body: emailBody,
      attachments: photoUri ? [photoUri] : [],
    });
    if (result.status === MailComposer.MailComposerStatus.CANCELLED) return { kind: 'cancelled' };

    const sent = result.status === MailComposer.MailComposerStatus.SENT;
    await markReportHandedOff(reportId, {
      status: sent ? 'sent' : 'handed_off',
      method: 'mail-composer',
      app: 'Mail',
    });
    return { kind: sent ? 'sent' : 'handed-off', app: 'Mail' };
  }

  if (Platform.OS === 'web') return { kind: 'unavailable' };

  await Clipboard.setStringAsync(emailRecipient);
  const result = await Share.share(
    {
      message: buildShareMessage({ recipient: emailRecipient, subject: emailSubject, body: emailBody }),
      title: emailSubject,
      url: photoUri ?? undefined,
    },
    { dialogTitle: 'Send your 311 report', subject: emailSubject }
  );
  if (result.action === Share.dismissedAction) return { kind: 'cancelled' };

  const app = describeShareTarget(result.activityType);
  await markReportHandedOff(reportId, { status: 'handed_off', method: 'share-sheet', app });
  return { kind: 'handed-off', app };
}

function formatAddress(place: Location.LocationGeocodedAddress) {
  return [place.name, place.street, place.city, place.region].filter(Boolean).join(', ');
}
