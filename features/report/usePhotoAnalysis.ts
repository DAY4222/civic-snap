import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert } from 'react-native';

import { savePhotoAnalysisEnabled } from '@/lib/aiSettings';
import { getSuggestedIssueCandidates } from '@/lib/issueSuggestions';
import { analyzePhotoLabels, canAnalyzePhotoLabels } from '@/lib/vision';

import { shouldStartPhotoAnalysis } from './reportWizardState';
import type { WizardStore } from './wizardTypes';

/** Background photo suggestions: starts when a photo is stored and the user has opted in. */
export function usePhotoAnalysis({ state, dispatch }: WizardStore) {
  const { draft } = state;
  const abortController = useRef<AbortController | null>(null);
  const available = canAnalyzePhotoLabels();
  const enabled = available && state.photoAnalysisUserEnabled;
  const suggestions = useMemo(
    () => getSuggestedIssueCandidates(draft.photoVisionResult),
    [draft.photoVisionResult]
  );

  const analyzeCurrentPhoto = useCallback(async () => {
    const photoUri = draft.photoUri;
    if (!photoUri) return;
    if (draft.photoVisionResult && state.photoVisionPhotoUri === photoUri) return;

    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;

    dispatch({ type: 'setPhotoVisionLoading', photoUri });
    try {
      const result = await analyzePhotoLabels(photoUri, { signal: controller.signal });
      if (controller.signal.aborted) return;
      dispatch({ type: 'setPhotoVisionResult', photoUri, result });
    } catch (error) {
      if (controller.signal.aborted) return;
      dispatch({ type: 'setPhotoVisionError', photoUri, error });
    } finally {
      if (abortController.current === controller) abortController.current = null;
    }
  }, [dispatch, draft.photoUri, draft.photoVisionResult, state.photoVisionPhotoUri]);

  useEffect(() => {
    if (!shouldStartPhotoAnalysis(state, enabled)) return;

    void analyzeCurrentPhoto();
  }, [analyzeCurrentPhoto, enabled, draft.photoUri, state.photoVisionPhotoUri, state.photoVisionStatus]);

  useEffect(() => () => abortController.current?.abort(), []);

  async function enableForThisReport() {
    if (!available) return;

    try {
      await savePhotoAnalysisEnabled(true);
      dispatch({ type: 'setPhotoAnalysisUserEnabled', enabled: true });
    } catch {
      Alert.alert('Photo suggestions not turned on', 'Try again from Settings.');
    }
  }

  return { analyzeCurrentPhoto, available, enableForThisReport, enabled, suggestions };
}
