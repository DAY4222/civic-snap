import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'react-native';

import { PHOTO_LABELS, PHOTO_LABEL_TAXONOMY_VERSION } from './photoLabels';
import { PhotoVisionLabel, PhotoVisionResult } from './types';

const INSTALL_ID_KEY = 'civic-snap-install-id';
const MAX_ANALYSIS_SIDE = 768;
const MAX_IMAGE_BASE64_BYTES = 2_000_000;
const PHOTO_LABELS_ENABLED = process.env.EXPO_PUBLIC_PHOTO_LABELS_ENABLED === 'true';
const ANALYZE_PHOTO_URL = process.env.EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL ?? '';

export class PhotoVisionError extends Error {
  constructor(
    message: string,
    readonly code: 'disabled' | 'payload-too-large' | 'network' | 'rate-limited' | 'server'
  ) {
    super(message);
  }
}

export function canAnalyzePhotoLabels() {
  return PHOTO_LABELS_ENABLED && ANALYZE_PHOTO_URL.length > 0;
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
      headers: {
        'Content-Type': 'application/json',
      },
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

  const result = (await response.json()) as PhotoVisionResult;
  return normalizePhotoVisionResult(result, {
    bytes: imageBytes,
    height: analysisImage.height,
    mimeType: 'image/jpeg',
    width: analysisImage.width,
  });
}

async function createAnalysisImage(photoUri: string) {
  const size = await getImageSize(photoUri).catch(() => null);
  const resize =
    size && size.height > size.width
      ? { height: MAX_ANALYSIS_SIDE }
      : { width: MAX_ANALYSIS_SIDE };

  return manipulateAsync(
    photoUri,
    [{ resize }],
    { base64: true, compress: 0.6, format: SaveFormat.JPEG }
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
  const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
  if (existing) return existing;

  const installId = `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
  await SecureStore.setItemAsync(INSTALL_ID_KEY, installId);
  return installId;
}

function getBase64ByteSize(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function normalizePhotoVisionResult(
  result: PhotoVisionResult,
  image: PhotoVisionResult['image']
) {
  const suggestedLabels = Array.isArray(result.suggestedLabels)
    ? result.suggestedLabels.map(normalizeLabel).filter(isPhotoVisionLabel)
    : [];

  return {
    suggestedLabels,
    provider: 'gemini',
    model: result.model,
    promptVersion: result.promptVersion,
    taxonomyVersion: result.taxonomyVersion,
    analyzedAt: result.analyzedAt,
    latencyMs: result.latencyMs,
    image,
  } satisfies PhotoVisionResult;
}

function normalizeLabel(label: PhotoVisionLabel): PhotoVisionLabel | null {
  if (!label || typeof label.id !== 'string' || typeof label.label !== 'string') {
    return null;
  }

  const normalized: PhotoVisionLabel = {
    id: label.id,
    label: label.label,
    confidence: Number(label.confidence) || 0,
    evidence: typeof label.evidence === 'string' ? label.evidence : '',
  };

  if (label.boundingBox) {
    normalized.boundingBox = label.boundingBox;
  }

  return normalized;
}

function isPhotoVisionLabel(label: PhotoVisionLabel | null): label is PhotoVisionLabel {
  return label != null;
}
