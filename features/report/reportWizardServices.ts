import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';

import { buildEmail } from '@/lib/email';
import { persistReportPhoto } from '@/lib/photos';
import {
  createDraftReport,
  updateDraftReport,
  updateReportEmail,
  updateReportStatus,
} from '@/lib/reports';
import type { IssueCategory } from '@/lib/types';

import { GENERAL_CATEGORY, type ReportWizardState } from './reportWizardState';

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

export async function saveReportDraft({
  category,
  savedReportId,
  state,
}: {
  category: IssueCategory;
  savedReportId: string | null;
  state: ReportWizardState;
}) {
  const email = buildEmail({
    category,
    description: state.description,
    answers: state.answers,
    address: state.address,
    locationNote: state.locationNote,
    latitude: state.latitude,
    longitude: state.longitude,
    photoUri: state.photoUri,
    photoIssueTopic: state.selectedPhotoIssueTopic,
    profile: state.profile,
  });

  const draftInput = {
    categoryId: category.id === GENERAL_CATEGORY.id ? null : category.id,
    category: category.title,
    description: state.description,
    answers: state.answers,
    address: state.address,
    latitude: state.latitude,
    longitude: state.longitude,
    photoUri: state.photoUri,
    thumbnailUri: state.thumbnailUri,
    photoVisionResult: state.photoVisionResult,
    photoIssueTopic: state.selectedPhotoIssueTopic,
    emailSubject: email.subject,
    emailBody: email.body,
  };

  const id = savedReportId ?? (await createDraftReport(draftInput));
  if (savedReportId) {
    await updateDraftReport(savedReportId, draftInput);
  }

  return { email, id };
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
  await updateReportStatus(reportId, 'Mail opened');
  return 'opened' as const;
}

function formatAddress(place: Location.LocationGeocodedAddress) {
  return [place.name, place.street, place.city, place.region].filter(Boolean).join(', ');
}
