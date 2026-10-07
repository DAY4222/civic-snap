/**
 * Public client configuration for the Supabase Edge Functions. These EXPO_PUBLIC_ values are
 * not secrets (see README); the Gemini key and service-role key live only in function secrets.
 */
export type BackendConfig = {
  anonKey: string;
  analyzePhotoUrl: string;
  rewriteEmailUrl: string;
  photoLabelsEnabled: boolean;
  emailRewriteEnabled: boolean;
};

export const backendConfig: BackendConfig = {
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  analyzePhotoUrl: process.env.EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL ?? '',
  rewriteEmailUrl: process.env.EXPO_PUBLIC_SUPABASE_REWRITE_EMAIL_URL ?? '',
  photoLabelsEnabled: process.env.EXPO_PUBLIC_PHOTO_LABELS_ENABLED === 'true',
  emailRewriteEnabled: process.env.EXPO_PUBLIC_EMAIL_REWRITE_ENABLED === 'true',
};

export function isPhotoAnalysisConfigured(config: BackendConfig = backendConfig) {
  return config.photoLabelsEnabled && Boolean(config.analyzePhotoUrl && config.anonKey);
}

export function isEmailPolishConfigured(config: BackendConfig = backendConfig) {
  return config.emailRewriteEnabled && Boolean(config.rewriteEmailUrl && config.anonKey);
}
