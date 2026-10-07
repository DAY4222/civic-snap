import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert } from 'react-native';

import { savePhotoAnalysisEnabled } from '@/lib/aiSettings';
import { getSuggestedIssueCandidates } from '@/lib/issueSuggestions';
import { analyzePhotoLabels, canAnalyzePhotoLabels } from '@/lib/vision';

import { isPhotoVisionFailure, shouldStartPhotoAnalysis } from './reportWizardState';
import type { WizardStore } from './wizardTypes';

/** Background photo suggestions: starts when a photo is stored and the user has opted in. */
export function usePhotoAnalysis({ state, dispatch }: WizardStore) {
  const { draft } = state;
  const abortController = useRef<AbortController | null>(null);
  const available = canAnalyzePhotoLabels();
  const enabled = available && state.photoAnalysisChoice === 'on';
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

  // When the check fails while the user waits on the suggest step, go straight to the search.
  const previousStatus = useRef(state.photoVisionStatus);
  useEffect(() => {
    const wasLoading = previousStatus.current === 'loading';
    previousStatus.current = state.photoVisionStatus;
    if (state.step === 'suggest' && wasLoading && isPhotoVisionFailure(state.photoVisionStatus)) {
      dispatch({ type: 'openCategory', returnStep: 'location' });
    }
  }, [dispatch, state.photoVisionStatus, state.step]);

  /** "Turn on photo suggestions": saved for future reports, and starts on this photo. */
  async function enable() {
    if (!available) return;

    try {
      await savePhotoAnalysisEnabled(true);
      dispatch({ type: 'setPhotoAnalysisChoice', choice: 'on' });
    } catch {
      Alert.alert('Photo suggestions not turned on', 'Try again from Settings.');
    }
  }

  /** "Not now": remembered, so later reports go straight to the search. */
  function decline() {
    dispatch({ type: 'setPhotoAnalysisChoice', choice: 'off' });
    dispatch({ type: 'openCategory', returnStep: 'location' });
    savePhotoAnalysisEnabled(false).catch(() => undefined);
  }

  return { analyzeCurrentPhoto, available, decline, enable, enabled, suggestions };
}
