import { getDeviceItem, setDeviceItem } from './deviceStore';

const PHOTO_ANALYSIS_ENABLED_KEY = 'civic-snap-photo-analysis-enabled';
const EMAIL_POLISH_ENABLED_KEY = 'civic-snap-email-polish-enabled';

export async function loadPhotoAnalysisEnabled() {
  const raw = await getDeviceItem(PHOTO_ANALYSIS_ENABLED_KEY);
  return raw === 'true';
}

export async function savePhotoAnalysisEnabled(enabled: boolean) {
  await setDeviceItem(PHOTO_ANALYSIS_ENABLED_KEY, enabled ? 'true' : 'false');
}

/** Whether the user agreed to send report text (never contact details) for AI email polish. */
export async function loadEmailPolishEnabled() {
  const raw = await getDeviceItem(EMAIL_POLISH_ENABLED_KEY);
  return raw === 'true';
}

export async function saveEmailPolishEnabled(enabled: boolean) {
  await setDeviceItem(EMAIL_POLISH_ENABLED_KEY, enabled ? 'true' : 'false');
}
