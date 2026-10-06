import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { BackendError, postJson } from './backend/client';
import { backendConfig, isPhotoAnalysisConfigured } from './backend/config';
import { getInstallId } from './installId';
import { buildPhotoAnalysisRequest, normalizePhotoVisionResponse } from './photoAnalysisContract';

const MAX_ANALYSIS_SIDE = 1024;
const MAX_IMAGE_BASE64_BYTES = 2_000_000;
const DEFAULT_ANALYSIS_TIMEOUT_MS = 20_000;

type AnalyzePhotoLabelsOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function canAnalyzePhotoLabels() {
  return isPhotoAnalysisConfigured();
}

export async function analyzePhotoLabels(photoUri: string, options: AnalyzePhotoLabelsOptions = {}) {
  if (!canAnalyzePhotoLabels()) {
    throw new BackendError('Photo labels are not configured.', 'disabled');
  }

  const installId = await getInstallId();
  const analysisImage = await createAnalysisImage(photoUri);
  if (options.signal?.aborted) {
    throw new BackendError('Photo labels were cancelled.', 'cancelled');
  }

  if (!analysisImage.base64) {
    throw new BackendError('Photo analysis image was not created.', 'server');
  }

  const imageBytes = getBase64ByteSize(analysisImage.base64);
  if (imageBytes > MAX_IMAGE_BASE64_BYTES) {
    throw new BackendError('Photo analysis image is too large.', 'payload-too-large');
  }

  const result = await postJson(
    backendConfig.analyzePhotoUrl,
    buildPhotoAnalysisRequest({
      installId,
      imageBase64: analysisImage.base64,
      image: {
        bytes: imageBytes,
        height: analysisImage.height,
        width: analysisImage.width,
      },
      mimeType: 'image/jpeg',
    }),
    {
      anonKey: backendConfig.anonKey,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT_MS,
    }
  );

  return normalizePhotoVisionResponse(result, {
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

function getBase64ByteSize(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
