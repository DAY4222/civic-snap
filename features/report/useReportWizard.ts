import { useFocusEffect } from '@react-navigation/native';
import { Href, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Alert, BackHandler } from 'react-native';

import { loadEmailPolishEnabled, loadPhotoAnalysisChoice } from '@/lib/aiSettings';
import { GENERAL_CATEGORY } from '@/lib/categories';
import { appendSuggestedDescription } from '@/lib/issueSuggestions';
import { EMPTY_PROFILE, loadProfile } from '@/lib/profile';
import { getDraftCategory, isDraftEmpty } from '@/lib/reportDraft';
import { getReport } from '@/lib/reports';
import { PhotoIssueCandidate, ReportAnswerValue } from '@/lib/types';

import {
  CategoryReturnStep,
  ReportWizardState,
  ReportWizardStep,
  canContinueFromLocation,
  canPreviewReport,
  createInitialReportWizardState,
  getPreviousStep,
  getSuggestStepMode,
  reportWizardReducer,
  searchIssueCategories,
} from './reportWizardState';
import { useDraftPersistence } from './useDraftPersistence';
import { useEmailDraft } from './useEmailDraft';
import { useHandoff } from './useHandoff';
import { useLocationPin } from './useLocationPin';
import { usePhotoAnalysis } from './usePhotoAnalysis';
import { usePhotoCapture } from './usePhotoCapture';
import type { ReportWizardParams, WizardStore } from './wizardTypes';

/** Composes the report wizard: one reducer for state, one hook per group of side effects. */
export function useReportWizard(params: ReportWizardParams) {
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

  const issueSearch = useMemo(
    () => searchIssueCategories(state.issueSearchQuery),
    [state.issueSearchQuery]
  );

  useWizardSettings(dispatch);
  useResumeDraft(params.resumeId, dispatch);

  // Details fills the checklist answers that follow from the location (and refreshes them
  // if the location changed since), without touching answers the user gave.
  useEffect(() => {
    if (state.step === 'details') dispatch({ type: 'applyChecklistDefaults' });
  }, [
    category.id,
    dispatch,
    draft.address,
    draft.latitude,
    draft.locationNote,
    draft.longitude,
    state.step,
  ]);
  // Waits for settings: whether to suggest from the photo depends on the user's choice.
  useWizardStart(params, state.photoAnalysisChoice !== null, async (photoUri) => {
    const suggest = analysis.available && state.photoAnalysisChoice !== 'off';
    if (photoUri && (await capture.storePhoto({ uri: photoUri }))) {
      dispatch({ type: 'startPhotoPath', suggest });
      const gps = photoGpsFromParams(params);
      // The photo knows where it was taken; the address is ready by the time Location opens.
      if (gps) location.placePin(gps.latitude, gps.longitude, 'photo');
      return;
    }
    dispatch({ type: 'openCategory', returnStep: 'location' });
  });

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

  /** Leaves the wizard, to `to` if given. The draft is already saved, so nothing is lost. */
  function exitWizard(to?: Href) {
    void persistence.flush().finally(() => {
      persistence.detach();
      if (to) router.dismissTo(to);
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    });
  }

  function goBack() {
    const previous = getPreviousStep(state);
    if (!previous) exitWizard();
    // Back into the search must come forward to Location again, not to an older return step.
    else if (previous === 'category') openCategory('location');
    else dispatch({ type: 'setStep', step: previous });
  }

  function confirmExit() {
    if (isDraftEmpty(draft) || state.step === 'done') {
      exitWizard();
      return;
    }

    Alert.alert('Leave this report?', 'Your draft is saved in History, so you can finish it later.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Leave', onPress: () => exitWizard() },
    ]);
  }

  useEffect(() => {
    // Android's back button steps back through the wizard instead of closing it.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  });

  function viewLastHandoff() {
    const reportId = state.lastHandoff?.reportId;
    if (!reportId) return;

    // Returns to the report's detail screen if the draft was resumed from there.
    exitWizard({ pathname: '/report/[id]', params: { id: reportId } });
  }

  return {
    actions: {
      ...emailDraft.actions,
      ...handoff.actions,
      analyzeCurrentPhoto: analysis.analyzeCurrentPhoto,
      chooseCategory: (categoryId: string | null) => dispatch({ type: 'chooseCategory', categoryId }),
      chooseSuggestedTopic: (topic: PhotoIssueCandidate) =>
        dispatch({ type: 'chooseSuggestedTopic', topic }),
      confirmExit,
      declinePhotoAnalysis: analysis.decline,
      goBack,
      dismissContactPrompt: () => dispatch({ type: 'dismissContactPrompt' }),
      enablePhotoAnalysis: analysis.enable,
      insertSuggestedDescription: (suggestion: string) =>
        dispatch({
          type: 'appendDescription',
          value: appendSuggestedDescription(draft.description, suggestion),
        }),
      openCategory,
      previewEmail,
      setAddress: location.setAddress,
      setAnswer: (questionId: string, value: ReportAnswerValue) =>
        dispatch({ type: 'setAnswer', questionId, value }),
      setDescription: (description: string) => dispatch({ type: 'setDescription', description }),
      setIssueSearchQuery: (issueSearchQuery: string) =>
        dispatch({ type: 'setIssueSearchQuery', issueSearchQuery }),
      setLocationNote: (locationNote: string) => dispatch({ type: 'setLocationNote', locationNote }),
      setStep: (step: ReportWizardStep) => dispatch({ type: 'setStep', step }),
      /** Leaves the issue for later; Details still offers suggestions and the search. */
      skipIssue: () => dispatch({ type: 'setStep', step: 'location' }),
      startNewReport: () => exitWizard('/'),
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
    hasIssue,
    issueSearch,
    locationStatus: location.locationStatus,
    mailComposerAvailable: handoff.mailComposerAvailable,
    outsideCity: location.outsideCity,
    photoAnalysisAvailable: analysis.available,
    photoIssueSuggestions: analysis.suggestions,
    photoLabelsEnabled: analysis.enabled,
    pinRegion: location.pinRegion,
    state,
    suggestMode: getSuggestStepMode(state),
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
      loadPhotoAnalysisChoice()
        .then((choice) => {
          if (active) dispatch({ type: 'setPhotoAnalysisChoice', choice });
        })
        .catch(() => {
          // Unreadable storage could not remember "Not now" either, so don't ask.
          if (active) dispatch({ type: 'setPhotoAnalysisChoice', choice: 'off' });
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

function photoGpsFromParams({ photoLat, photoLng }: ReportWizardParams) {
  const latitude = Number(photoLat);
  const longitude = Number(photoLng);
  if (!photoLat || !photoLng || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

/** Opens a saved draft for editing. A report that was already sent opens as a report instead. */
function useResumeDraft(resumeId: string | undefined, dispatch: WizardStore['dispatch']) {
  useEffect(() => {
    if (!resumeId) return;

    let active = true;
    getReport(resumeId)
      .then((report) => {
        if (!active) return;
        if (report?.status === 'draft') {
          dispatch({ type: 'resumeReport', report });
        } else if (report) {
          // Already handed off: show the report instead of an editor.
          router.replace({ pathname: '/report/[id]', params: { id: report.id } });
        } else {
          throw new Error('Draft not found');
        }
      })
      .catch(() => {
        if (!active) return;
        Alert.alert('Draft not found', 'It may have been deleted.');
        if (router.canGoBack()) router.back();
        else router.replace('/');
      });

    return () => {
      active = false;
    };
  }, [dispatch, resumeId]);
}

/**
 * Runs the wizard's opening move once, when `ready`: save the picked photo and show suggestions
 * (or the search), or start a photo-less report with the search.
 */
function useWizardStart(
  params: ReportWizardParams,
  ready: boolean,
  start: (photoUri: string | null) => void
) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !ready) return;
    started.current = true;
    if (!params.resumeId) start(params.photo ?? null);
  });
}
