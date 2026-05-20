import { getDeviceItem, setDeviceItem } from './deviceStore';

const PHOTO_ANALYSIS_ENABLED_KEY = 'civic-snap-photo-analysis-enabled';

export async function loadPhotoAnalysisEnabled() {
  const raw = await getDeviceItem(PHOTO_ANALYSIS_ENABLED_KEY);
  return raw === 'true';
}

export async function savePhotoAnalysisEnabled(enabled: boolean) {
  await setDeviceItem(PHOTO_ANALYSIS_ENABLED_KEY, enabled ? 'true' : 'false');
}
