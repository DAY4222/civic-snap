import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { getDeviceItem, setDeviceItem } from './deviceStore';
import { normalizePhotoVisionResponse } from './photoAnalysisContract';
import { PHOTO_LABELS, PHOTO_LABEL_TAXONOMY_VERSION } from './photoLabels';

const INSTALL_ID_KEY = 'civic-snap-install-id';
const MAX_ANALYSIS_SIDE = 1024;
const MAX_IMAGE_BASE64_BYTES = 2_000_000;
const PHOTO_LABELS_ENABLED = process.env.EXPO_PUBLIC_PHOTO_LABELS_ENABLED === 'true';
const ANALYZE_PHOTO_URL = process.env.EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export class PhotoVisionError extends Error {
  constructor(
    message: string,
    readonly code: 'disabled' | 'payload-too-large' | 'network' | 'rate-limited' | 'server'
  ) {
    super(message);
  }
}

export function canAnalyzePhotoLabels() {
  return PHOTO_LABELS_ENABLED && ANALYZE_PHOTO_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export async function analyzePhotoLabels(photoUri: string) {
  if (!canAnalyzePhotoLabels()) {
    throw new PhotoVisionError('Photo labels are not configured.', 'disabled');
  }

  const installId = await getInstallId();
  const analysisImage = await createAnalysisImage(photoUri);
  if (!analysisImage.base64) {
    throw new PhotoVisionError('Photo analysis image was not created.', 'server');
  }

  const imageBytes = getBase64ByteSize(analysisImage.base64);
  if (imageBytes > MAX_IMAGE_BASE64_BYTES) {
    throw new PhotoVisionError('Photo analysis image is too large.', 'payload-too-large');
  }

  let response: Response;
  try {
    response = await fetch(ANALYZE_PHOTO_URL, {
      method: 'POST',
      headers: getAnalyzePhotoHeaders(),
      body: JSON.stringify({
        installId,
        imageBase64: analysisImage.base64,
        image: {
          bytes: imageBytes,
          height: analysisImage.height,
          width: analysisImage.width,
        },
        mimeType: 'image/jpeg',
        allowedLabels: PHOTO_LABELS,
        taxonomyVersion: PHOTO_LABEL_TAXONOMY_VERSION,
      }),
    });
  } catch {
    throw new PhotoVisionError('Photo labels are unavailable.', 'network');
  }

  if (response.status === 429) {
    throw new PhotoVisionError('Photo label limit reached for today.', 'rate-limited');
  }

  if (!response.ok) {
    throw new PhotoVisionError('Photo labels are unavailable.', 'server');
  }

  const result = await response.json();
  return normalizePhotoVisionResponse(result, {
    bytes: imageBytes,
    height: analysisImage.height,
    mimeType: 'image/jpeg',
    width: analysisImage.width,
  });
}

function getAnalyzePhotoHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
}

async function createAnalysisImage(photoUri: string) {
  const size = await getImageSize(photoUri).catch(() => null);
  const resize =
    size && size.height > size.width
      ? { height: Math.min(size.height, MAX_ANALYSIS_SIDE) }
      : { width: size ? Math.min(size.width, MAX_ANALYSIS_SIDE) : MAX_ANALYSIS_SIDE };

  return manipulateAsync(
    photoUri,
    [{ resize }],
    { base64: true, compress: 0.72, format: SaveFormat.JPEG }
  );
}

async function getImageSize(uri: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ height, width }),
      reject
    );
  });
}

async function getInstallId() {
  const existing = await getDeviceItem(INSTALL_ID_KEY);
  if (existing) return existing;

  const installId = `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
  await setDeviceItem(INSTALL_ID_KEY, installId);
  return installId;
}

function getBase64ByteSize(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
