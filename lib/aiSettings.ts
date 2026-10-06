import { getDeviceItem, setDeviceItem } from './deviceStore';

const PHOTO_ANALYSIS_ENABLED_KEY = 'civic-snap-photo-analysis-enabled';
const EMAIL_POLISH_ENABLED_KEY = 'civic-snap-email-polish-enabled';

/** Photo suggestions: turned on, turned off (Settings or "Not now"), or never asked. */
export type PhotoAnalysisChoice = 'on' | 'off' | 'unset';

export async function loadPhotoAnalysisChoice(): Promise<PhotoAnalysisChoice> {
  const raw = await getDeviceItem(PHOTO_ANALYSIS_ENABLED_KEY);
  if (raw === 'true') return 'on';
  if (raw === 'false') return 'off';
  return 'unset';
}

export async function loadPhotoAnalysisEnabled() {
  return (await loadPhotoAnalysisChoice()) === 'on';
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
