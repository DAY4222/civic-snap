import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Alert } from 'react-native';

import { loadEmailPolishEnabled, loadPhotoAnalysisEnabled } from '@/lib/aiSettings';
import { GENERAL_CATEGORY } from '@/lib/categories';
import { appendSuggestedDescription } from '@/lib/issueSuggestions';
import { EMPTY_PROFILE, loadProfile } from '@/lib/profile';
import { getDraftCategory, isDraftEmpty } from '@/lib/reportDraft';
import { getReport } from '@/lib/reports';
import { PhotoIssueCandidate, ReportAnswerValue } from '@/lib/types';

import {
  CategoryReturnStep,
  ReportWizardStep,
  canContinueFromLocation,
  canPreviewReport,
  createInitialReportWizardState,
  filterIssueCategories,
  reportWizardReducer,
} from './reportWizardState';
import { useDraftPersistence } from './useDraftPersistence';
import { useEmailDraft } from './useEmailDraft';
import { useHandoff } from './useHandoff';
import { useLocationPin } from './useLocationPin';
import { usePhotoAnalysis } from './usePhotoAnalysis';
import { usePhotoCapture } from './usePhotoCapture';
import type { WizardStore } from './wizardTypes';

/** Composes the report wizard: one reducer for state, one hook per group of side effects. */
export function useReportWizard(resumeId?: string) {
  const [state, dispatch] = useReducer(
    reportWizardReducer,
    undefined,
    createInitialReportWizardState
  );
  const store = { state, dispatch };
  const { draft } = state;
  const category = useMemo(
    () => getDraftCategory(draft),
    [draft.categoryId, draft.photoIssueTopic]
  );
  const hasIssue = category.id !== GENERAL_CATEGORY.id;

  const capture = usePhotoCapture(store);
  const analysis = usePhotoAnalysis(store);
  const location = useLocationPin(store);
  const emailDraft = useEmailDraft(store, category);
  const persistence = useDraftPersistence({
    category,
    draft,
    email: emailDraft.email,
    enabled: true,
    onCreated: (reportId) => dispatch({ type: 'draftCreated', reportId }),
    savedReportId: state.savedReportId,
  });
  const handoff = useHandoff(store, emailDraft.email, persistence);

  const filteredIssueCategories = useMemo(
    () => filterIssueCategories(state.issueSearchQuery),
    [state.issueSearchQuery]
  );

  useWizardSettings(dispatch);
  useResumeDraft(resumeId, dispatch);

  async function startWithPhoto(capturePhoto: () => Promise<boolean>) {
    if (await capturePhoto()) dispatch({ type: 'setStep', step: 'location' });
  }

  async function previewEmail() {
    if (!canContinueFromLocation(draft)) {
      Alert.alert('Add a location', 'Enter an address or nearest landmark.');
      return;
    }
    if (!draft.description.trim()) {
      Alert.alert('Add a short description', 'One sentence is enough.');
      return;
    }

    dispatch({ type: 'setBusy', busy: true });
    try {
      const reportId = await persistence.flush();
      if (!reportId) throw new Error('Draft was not saved.');
      dispatch({ type: 'previewReady', savedReportId: reportId });
    } catch {
      Alert.alert('Draft not saved', 'Try again. Your current report is still on this screen.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  function openCategory(returnStep: CategoryReturnStep) {
    dispatch({ type: 'openCategory', returnStep });
  }

  function backFromLocation() {
    // A manually chosen issue started in search, so Back returns there.
    if (draft.categoryId && !draft.photoIssueTopic) {
      openCategory('location');
      return;
    }
    dispatch({ type: 'setStep', step: 'start' });
  }

  function returnToStart() {
    void persistence.flush().finally(() => {
      persistence.detach();
      dispatch({ type: 'resetReport' });
    });
  }

  function confirmExitToStart() {
    if (isDraftEmpty(draft)) {
      returnToStart();
      return;
    }

    Alert.alert('Return to start?', 'Your draft is saved in History, so you can finish it later.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Return to start', onPress: returnToStart },
    ]);
  }

  function viewLastHandoff() {
    const reportId = state.lastHandoff?.reportId;
    if (!reportId) return;

    dispatch({ type: 'resetReport' });
    router.push({ pathname: '/report/[id]', params: { id: reportId } });
  }

  return {
    actions: {
      ...emailDraft.actions,
      ...handoff.actions,
      analyzeCurrentPhoto: analysis.analyzeCurrentPhoto,
      backFromCategory: () => dispatch({ type: 'backFromCategory' }),
      backFromLocation,
      chooseCategory: (categoryId: string | null) => dispatch({ type: 'chooseCategory', categoryId }),
      choosePhoto: () => startWithPhoto(capture.choosePhoto),
      confirmExitToStart,
      dismissContactPrompt: () => dispatch({ type: 'dismissContactPrompt' }),
      enablePhotoAnalysisForCurrentReport: analysis.enableForThisReport,
      insertSuggestedDescription: (suggestion: string) =>
        dispatch({
          type: 'appendDescription',
          value: appendSuggestedDescription(draft.description, suggestion),
        }),
      openCategory,
      previewEmail,
      reportWithoutPhoto: () => dispatch({ type: 'setStep', step: 'location' }),
      setAddress: location.setAddress,
      setAnswer: (questionId: string, value: ReportAnswerValue) =>
        dispatch({ type: 'setAnswer', questionId, value }),
      setDescription: (description: string) => dispatch({ type: 'setDescription', description }),
      setIssueSearchQuery: (issueSearchQuery: string) =>
        dispatch({ type: 'setIssueSearchQuery', issueSearchQuery }),
      setLocationNote: (locationNote: string) => dispatch({ type: 'setLocationNote', locationNote }),
      setStep: (step: ReportWizardStep) => dispatch({ type: 'setStep', step }),
      startNewReport: () => dispatch({ type: 'resetReport' }),
      takePhoto: () => startWithPhoto(capture.takePhoto),
      togglePhotoIssueTopic: (topic: PhotoIssueCandidate) =>
        dispatch({ type: 'togglePhotoIssueTopic', topic }),
      updatePinFromMap: location.updatePinFromMap,
      useCurrentLocation: location.useCurrentLocation,
      viewLastHandoff,
    },
    category,
    canContinueLocation: canContinueFromLocation(draft),
    canPreviewEmail: canPreviewReport(draft),
    descriptionPlaceholder: hasIssue
      ? `Describe the ${category.subjectLabel}, exact location, and what crews should know.`
      : 'Example: pothole in the curb lane near the crosswalk',
    email: emailDraft.email,
    emailOutOfDate: emailDraft.emailOutOfDate,
    emailPolishAvailable: emailDraft.polishAvailable,
    filteredIssueCategories,
    hasIssue,
    mailComposerAvailable: handoff.mailComposerAvailable,
    photoAnalysisAvailable: analysis.available,
    photoIssueSuggestions: analysis.suggestions,
    photoLabelsEnabled: analysis.enabled,
    pinRegion: location.pinRegion,
    state,
  };
}

/** Profile and AI settings, reloaded whenever the wizard regains focus (e.g. after Settings). */
function useWizardSettings(dispatch: WizardStore['dispatch']) {
  useFocusEffect(
    useCallback(() => {
      let active = true;

      loadProfile()
        .then((profile) => {
          if (active) dispatch({ type: 'profileLoaded', profile });
        })
        .catch(() => {
          if (active) dispatch({ type: 'profileLoaded', profile: EMPTY_PROFILE });
        });
      loadPhotoAnalysisEnabled()
        .then((enabled) => {
          if (active) dispatch({ type: 'setPhotoAnalysisUserEnabled', enabled });
        })
        .catch(() => {
          if (active) dispatch({ type: 'setPhotoAnalysisUserEnabled', enabled: false });
        });
      loadEmailPolishEnabled()
        .then((enabled) => {
          if (active) dispatch({ type: 'setEmailPolishEnabled', enabled });
        })
        .catch(() => undefined);

      return () => {
        active = false;
      };
    }, [dispatch])
  );
}

/**
 * resumeId is a one-shot command: load the draft, then clear the param so a later reset
 * (Return to start, successful handoff) doesn't reload the same report.
 */
function useResumeDraft(resumeId: string | undefined, dispatch: WizardStore['dispatch']) {
  useEffect(() => {
    if (!resumeId) return;

    let active = true;
    getReport(resumeId)
      .then((report) => {
        if (active && report?.status === 'draft') dispatch({ type: 'resumeReport', report });
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) router.setParams({ resumeId: undefined });
      });

    return () => {
      active = false;
    };
  }, [dispatch, resumeId]);
}
