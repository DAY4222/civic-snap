import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { type Region } from '@/components/CivicMap';
import { GENERAL_CATEGORY } from '@/lib/categories';
import { buildEmail } from '@/lib/email';
import {
  appendSuggestedDescription,
  getSuggestedIssueCandidates,
} from '@/lib/issueSuggestions';
import { loadPhotoAnalysisEnabled, savePhotoAnalysisEnabled } from '@/lib/photoAnalysisSettings';
import { EMPTY_PROFILE, loadProfile } from '@/lib/profile';
import { deleteReportPhotos } from '@/lib/photos';
import { getDraftCategory, isDraftEmpty } from '@/lib/reportDraft';
import { getReport } from '@/lib/reports';
import { PhotoIssueCandidate, ReportAnswerValue } from '@/lib/types';
import { analyzePhotoLabels, canAnalyzePhotoLabels } from '@/lib/vision';

import {
  CategoryReturnStep,
  ReportWizardStep,
  canContinueFromLocation,
  canPreviewReport,
  createInitialReportWizardState,
  filterIssueCategories,
  profilesEqual,
  reportWizardReducer,
  shouldStartPhotoAnalysis,
} from './reportWizardState';
import {
  buildPreviewEmail,
  getCurrentLocationReportData,
  openSavedReportMail,
  persistWizardPhoto,
  reverseGeocodeReportAddress,
} from './reportWizardServices';
import { useDraftPersistence } from './useDraftPersistence';
import { RACCOON_SWEEPER_FRAMES } from './raccoonFrames';

const BLOCK_LEVEL_DELTA = 0.0012;
const RACCOON_FRAME_INTERVAL_MS = 67;

export function useReportWizard(resumeId?: string) {
  const [state, dispatch] = useReducer(
    reportWizardReducer,
    undefined,
    createInitialReportWizardState
  );
  const [raccoonFrameIndex, setRaccoonFrameIndex] = useState(0);
  const addressEditVersion = useRef(0);
  const photoAnalysisAbortController = useRef<AbortController | null>(null);
  const reverseGeocodeRequestId = useRef(0);
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { draft } = state;
  const category = useMemo(
    () => getDraftCategory(draft),
    [draft.categoryId, draft.photoIssueTopic]
  );
  const hasIssue = category.id !== GENERAL_CATEGORY.id;
  const photoAnalysisAvailable = canAnalyzePhotoLabels();
  const photoLabelsEnabled = photoAnalysisAvailable && state.photoAnalysisUserEnabled;
  const photoIssueSuggestions = useMemo(
    () => getSuggestedIssueCandidates(draft.photoVisionResult),
    [draft.photoVisionResult]
  );
  const filteredIssueCategories = useMemo(
    () => filterIssueCategories(state.issueSearchQuery),
    [state.issueSearchQuery]
  );
  const canContinueLocation = canContinueFromLocation(draft);
  const canPreviewEmail = canPreviewReport(draft);
  const descriptionPlaceholder = hasIssue
    ? `Describe the ${category.subjectLabel}, exact location, and what crews should know.`
    : 'Example: pothole in the curb lane near the crosswalk';
  const email = useMemo(
    () => buildEmail({ ...draft, category, profile: state.profile }),
    [category, draft, state.profile]
  );
  const pinRegion = useMemo<Region | null>(() => {
    if (draft.latitude == null || draft.longitude == null) return null;

    return {
      latitude: draft.latitude,
      longitude: draft.longitude,
      latitudeDelta: BLOCK_LEVEL_DELTA,
      longitudeDelta: BLOCK_LEVEL_DELTA,
    };
  }, [draft.latitude, draft.longitude]);
  const emailToSave = useMemo(
    () =>
      state.emailBody ? { subject: state.emailSubject, body: state.emailBody } : email,
    [email, state.emailBody, state.emailSubject]
  );
  const persistence = useDraftPersistence({
    category,
    draft,
    email: emailToSave,
    enabled: true,
    onCreated: (reportId) => dispatch({ type: 'draftCreated', reportId }),
    savedReportId: state.savedReportId,
  });
  const draftSnapshot = useRef({ category, state });
  draftSnapshot.current = { category, state };

  useFocusEffect(
    useCallback(() => {
      let active = true;

      loadProfile()
        .then((nextProfile) => {
          if (!active) return;

          const current = draftSnapshot.current;
          const currentProfile = current.state.profile;
          if (profilesEqual(currentProfile, nextProfile)) {
            dispatch({ type: 'profileLoaded', profile: nextProfile });
            return;
          }

          let nextEmailBody: string | undefined;
          let nextEmailSubject: string | undefined;
          if (current.state.step === 'preview') {
            const currentEmail = buildEmail({
              ...current.state.draft,
              category: current.category,
              profile: currentProfile,
            });
            const updatedEmail = buildEmail({
              ...current.state.draft,
              category: current.category,
              profile: nextProfile,
            });

            nextEmailSubject =
              current.state.emailSubject === currentEmail.subject
                ? updatedEmail.subject
                : current.state.emailSubject;
            nextEmailBody =
              current.state.emailBody === currentEmail.body
                ? updatedEmail.body
                : current.state.emailBody;
          }

          dispatch({
            type: 'profileLoaded',
            emailBody: nextEmailBody,
            emailSubject: nextEmailSubject,
            profile: nextProfile,
          });
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

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    if (state.step !== 'start') return;

    const frameTimer = setInterval(() => {
      setRaccoonFrameIndex((currentFrame) => (currentFrame + 1) % RACCOON_SWEEPER_FRAMES.length);
    }, RACCOON_FRAME_INTERVAL_MS);

    return () => clearInterval(frameTimer);
  }, [state.step]);

  useEffect(() => {
    if (!state.savedBannerId) return;

    const savedBannerTimer = setTimeout(() => {
      dispatch({ type: 'dismissSavedBanner' });
    }, 5000);

    return () => clearTimeout(savedBannerTimer);
  }, [state.savedBannerId]);

  useEffect(() => {
    return () => {
      if (reverseGeocodeTimeout.current) {
        clearTimeout(reverseGeocodeTimeout.current);
      }
      photoAnalysisAbortController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!resumeId) return;

    // resumeId is a one-shot command: load the draft, then clear the param so a later
    // reset (Return to start, successful handoff) doesn't reload the same report.
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
  }, [resumeId]);

  const analyzeCurrentPhoto = useCallback(async () => {
    const photoUri = draft.photoUri;
    if (!photoUri) return;

    if (draft.photoVisionResult && state.photoVisionPhotoUri === photoUri) {
      return;
    }

    photoAnalysisAbortController.current?.abort();
    const controller = new AbortController();
    photoAnalysisAbortController.current = controller;

    dispatch({ type: 'setPhotoVisionLoading', photoUri });
    try {
      const result = await analyzePhotoLabels(photoUri, { signal: controller.signal });
      if (controller.signal.aborted) return;
      dispatch({ type: 'setPhotoVisionResult', photoUri, result });
    } catch (error) {
      if (controller.signal.aborted) return;
      dispatch({ type: 'setPhotoVisionError', photoUri, error });
    } finally {
      if (photoAnalysisAbortController.current === controller) {
        photoAnalysisAbortController.current = null;
      }
    }
  }, [draft.photoUri, draft.photoVisionResult, state.photoVisionPhotoUri]);

  useEffect(() => {
    if (!shouldStartPhotoAnalysis(state, photoLabelsEnabled)) return;

    void analyzeCurrentPhoto();
  }, [
    analyzeCurrentPhoto,
    photoLabelsEnabled,
    draft.photoUri,
    state.photoVisionPhotoUri,
    state.photoVisionStatus,
  ]);

  async function enablePhotoAnalysisForCurrentReport() {
    if (!photoAnalysisAvailable) return;

    try {
      await savePhotoAnalysisEnabled(true);
      dispatch({ type: 'setPhotoAnalysisUserEnabled', enabled: true });
    } catch {
      Alert.alert('Photo analysis not enabled', 'Try again from Settings.');
    }
  }

  async function storePhoto(uri: string) {
    // A retaken photo that no saved draft points to can go now; saved ones are cleaned up by
    // the startup sweep once the draft has been re-saved with the new photo.
    const replacedPhotos = state.savedReportId ? [] : [draft.photoUri, draft.thumbnailUri];
    dispatch({ type: 'setBusy', busy: true });
    try {
      const persisted = await persistWizardPhoto(uri);
      dispatch({
        type: 'photoStored',
        photoUri: persisted.photoUri,
        thumbnailUri: persisted.thumbnailUri,
      });
      void deleteReportPhotos(replacedPhotos);
    } catch {
      Alert.alert('Photo not saved', 'The report can continue without a saved photo.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'You can still create a report without a photo.', [
        { text: 'Continue without photo', onPress: () => dispatch({ type: 'setStep', step: 'location' }) },
        { text: 'Open Settings', onPress: openAppSettings },
      ]);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
      mediaTypes: ['images'],
    });

    if (!result.canceled) {
      await storePhoto(result.assets[0].uri);
      dispatch({ type: 'setStep', step: 'location' });
    }
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      allowsEditing: false,
      mediaTypes: ['images'],
    });

    if (!result.canceled) {
      await storePhoto(result.assets[0].uri);
      dispatch({ type: 'setStep', step: 'location' });
    }
  }

  async function useCurrentLocation() {
    dispatch({ type: 'setBusy', busy: true });
    const requestId = ++reverseGeocodeRequestId.current;
    const startingAddressEditVersion = addressEditVersion.current;
    try {
      const result = await getCurrentLocationReportData();
      if (result.status === 'denied') {
        Alert.alert('Location skipped', 'Enter the address manually to continue.', [
          { text: 'Enter manually', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]);
        return;
      }

      dispatch({
        type: 'setPinLocation',
        latitude: result.latitude,
        longitude: result.longitude,
      });

      if (
        result.address &&
        requestId === reverseGeocodeRequestId.current &&
        startingAddressEditVersion === addressEditVersion.current
      ) {
        dispatch({ type: 'setResolvedAddress', address: result.address });
      }
    } catch {
      Alert.alert('Location unavailable', 'Enter the address manually to continue.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  function updatePinFromMap(region: Region) {
    dispatch({ type: 'setPinLocation', latitude: region.latitude, longitude: region.longitude });
    const requestId = ++reverseGeocodeRequestId.current;
    const startingAddressEditVersion = addressEditVersion.current;

    if (reverseGeocodeTimeout.current) {
      clearTimeout(reverseGeocodeTimeout.current);
    }

    reverseGeocodeTimeout.current = setTimeout(() => {
      void reverseGeocodePin(
        region.latitude,
        region.longitude,
        requestId,
        startingAddressEditVersion
      );
    }, 450);
  }

  async function reverseGeocodePin(
    nextLatitude: number,
    nextLongitude: number,
    requestId: number,
    startingAddressEditVersion: number
  ) {
    const address = await reverseGeocodeReportAddress(nextLatitude, nextLongitude);
    if (
      address &&
      requestId === reverseGeocodeRequestId.current &&
      startingAddressEditVersion === addressEditVersion.current
    ) {
      dispatch({ type: 'setResolvedAddress', address });
    }
  }

  async function previewEmail() {
    if (!canContinueFromLocation(draft)) {
      Alert.alert('Add a location', 'Enter an address or nearest landmark.');
      return;
    }

    if (!draft.description.trim()) {
      Alert.alert('Add a short description', 'One sentence is enough for the MVP.');
      return;
    }

    dispatch({ type: 'setBusy', busy: true });
    try {
      const reportId = await persistence.flush();
      if (!reportId) throw new Error('Draft was not saved.');

      const nextEmail = await buildPreviewEmail({ ...draft, category, profile: state.profile });
      dispatch({
        type: 'previewReady',
        emailBody: nextEmail.body,
        emailSubject: nextEmail.subject,
        savedReportId: reportId,
      });
    } catch {
      Alert.alert('Draft not saved', 'Try again. Your current report is still on this screen.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  async function openMail() {
    if (!state.savedReportId) return;

    dispatch({ type: 'setBusy', busy: true });
    try {
      const result = await openSavedReportMail({
        emailBody: state.emailBody,
        emailRecipient: email.recipient,
        emailSubject: state.emailSubject,
        photoUri: draft.photoUri,
        reportId: state.savedReportId,
      });
      if (result === 'fallback') {
        dispatch({ type: 'setStep', step: 'fallback' });
        return;
      }

      persistence.detach();
      dispatch({ type: 'resetReport', savedBannerId: state.savedReportId });
    } catch {
      dispatch({ type: 'setStep', step: 'fallback' });
      Alert.alert('Mail not opened', 'Use the fallback options to copy the draft or open a mailto link.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  async function copyEmail() {
    await Clipboard.setStringAsync(`${state.emailSubject}\n\n${state.emailBody}`);
    Alert.alert('Copied', 'Email subject and body copied.');
  }

  function openMailto() {
    const url = `mailto:${email.recipient}?subject=${encodeURIComponent(
      state.emailSubject
    )}&body=${encodeURIComponent(state.emailBody)}`;
    Linking.openURL(url);
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

  function togglePhotoIssueTopic(topic: PhotoIssueCandidate) {
    dispatch({ type: 'togglePhotoIssueTopic', topic });
  }

  function insertSuggestedDescription(suggestion: string) {
    dispatch({
      type: 'appendDescription',
      value: appendSuggestedDescription(draft.description, suggestion),
    });
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

  return {
    actions: {
      analyzeCurrentPhoto,
      backFromLocation,
      chooseCategory: (categoryId: string | null) =>
        dispatch({ type: 'chooseCategory', categoryId }),
      choosePhoto,
      confirmExitToStart,
      copyEmail,
      dismissContactPrompt: () => dispatch({ type: 'dismissContactPrompt' }),
      enablePhotoAnalysisForCurrentReport,
      insertSuggestedDescription,
      openCategory,
      openMail,
      openMailto,
      previewEmail,
      reportWithoutPhoto: () => dispatch({ type: 'setStep', step: 'location' }),
      setAddress: (address: string) => {
        addressEditVersion.current += 1;
        dispatch({ type: 'setAddress', address });
      },
      setAnswer: (questionId: string, value: ReportAnswerValue) =>
        dispatch({ type: 'setAnswer', questionId, value }),
      setDescription: (description: string) => dispatch({ type: 'setDescription', description }),
      setEmailBody: (emailBody: string) => dispatch({ type: 'setEmailBody', emailBody }),
      setEmailSubject: (emailSubject: string) =>
        dispatch({ type: 'setEmailSubject', emailSubject }),
      setIssueSearchQuery: (issueSearchQuery: string) =>
        dispatch({ type: 'setIssueSearchQuery', issueSearchQuery }),
      setLocationNote: (locationNote: string) => dispatch({ type: 'setLocationNote', locationNote }),
      setStep: (step: ReportWizardStep) => dispatch({ type: 'setStep', step }),
      takePhoto,
      togglePhotoIssueTopic,
      updatePinFromMap,
      useCurrentLocation,
      backFromCategory: () => dispatch({ type: 'backFromCategory' }),
    },
    category,
    canContinueLocation,
    canPreviewEmail,
    descriptionPlaceholder,
    email,
    filteredIssueCategories,
    hasIssue,
    photoAnalysisAvailable,
    photoIssueSuggestions,
    photoLabelsEnabled,
    pinRegion,
    raccoonFrameIndex,
    state,
  };
}

function openAppSettings() {
  Linking.openSettings().catch(() => undefined);
}
