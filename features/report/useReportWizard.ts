import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { type Region } from '@/components/CivicMap';
import { buildEmail } from '@/lib/email';
import {
  appendSuggestedDescription,
  getSuggestedIssueCandidates,
} from '@/lib/issueSuggestions';
import { loadPhotoAnalysisEnabled } from '@/lib/photoAnalysisSettings';
import { persistReportPhoto } from '@/lib/photos';
import { EMPTY_PROFILE, loadProfile } from '@/lib/profile';
import {
  createDraftReport,
  getReport,
  updateDraftReport,
  updateReportEmail,
  updateReportStatus,
} from '@/lib/reports';
import { PhotoIssueCandidate } from '@/lib/types';
import { analyzePhotoLabels, canAnalyzePhotoLabels } from '@/lib/vision';

import {
  GENERAL_CATEGORY,
  CategoryReturnStep,
  ReportWizardStep,
  createInitialReportWizardState,
  filterIssueCategories,
  getWizardCategory,
  profilesEqual,
  reportWizardReducer,
} from './reportWizardState';

const BLOCK_LEVEL_DELTA = 0.0012;
const RACCOON_FRAME_INTERVAL_MS = 67;

export const RACCOON_SWEEPER_FRAMES = [
  require('../../assets/images/raccoon-sweeper-frames/frame-00.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-01.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-02.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-03.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-04.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-05.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-06.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-07.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-08.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-09.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-10.png'),
  require('../../assets/images/raccoon-sweeper-frames/frame-11.png'),
] as const;

export function useReportWizard(resumeId?: string) {
  const [state, dispatch] = useReducer(
    reportWizardReducer,
    undefined,
    createInitialReportWizardState
  );
  const [raccoonFrameIndex, setRaccoonFrameIndex] = useState(0);
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { category, manualCategory, photoIssueCategory } = useMemo(
    () => getWizardCategory(state),
    [state.selectedCategoryId, state.selectedPhotoIssueTopic]
  );
  const photoLabelsEnabled = canAnalyzePhotoLabels() && state.photoAnalysisUserEnabled;
  const currentIssueTitle =
    manualCategory?.title ?? state.selectedPhotoIssueTopic?.title ?? GENERAL_CATEGORY.title;
  const photoIssueSuggestions = useMemo(
    () => getSuggestedIssueCandidates(state.photoVisionResult),
    [state.photoVisionResult]
  );
  const filteredIssueCategories = useMemo(
    () => filterIssueCategories(state.issueSearchQuery),
    [state.issueSearchQuery]
  );
  const descriptionPlaceholder =
    manualCategory || photoIssueCategory
      ? `Describe the ${category.subjectLabel}, exact location, and what crews should know.`
      : 'Example: pothole in the curb lane near the crosswalk';
  const email = useMemo(
    () =>
      buildEmail({
        category,
        description: state.description,
        answers: state.answers,
        address: state.address,
        locationNote: state.locationNote,
        latitude: state.latitude,
        longitude: state.longitude,
        photoUri: state.photoUri,
        photoIssueTopic: state.selectedPhotoIssueTopic,
        profile: state.profile,
      }),
    [
      category,
      state.address,
      state.answers,
      state.description,
      state.latitude,
      state.locationNote,
      state.longitude,
      state.photoUri,
      state.profile,
      state.selectedPhotoIssueTopic,
    ]
  );
  const pinRegion = useMemo<Region | null>(() => {
    if (state.latitude == null || state.longitude == null) return null;

    return {
      latitude: state.latitude,
      longitude: state.longitude,
      latitudeDelta: BLOCK_LEVEL_DELTA,
      longitudeDelta: BLOCK_LEVEL_DELTA,
    };
  }, [state.latitude, state.longitude]);
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
              category: current.category,
              description: current.state.description,
              answers: current.state.answers,
              address: current.state.address,
              locationNote: current.state.locationNote,
              latitude: current.state.latitude,
              longitude: current.state.longitude,
              photoUri: current.state.photoUri,
              photoIssueTopic: current.state.selectedPhotoIssueTopic,
              profile: currentProfile,
            });
            const updatedEmail = buildEmail({
              category: current.category,
              description: current.state.description,
              answers: current.state.answers,
              address: current.state.address,
              locationNote: current.state.locationNote,
              latitude: current.state.latitude,
              longitude: current.state.longitude,
              photoUri: current.state.photoUri,
              photoIssueTopic: current.state.selectedPhotoIssueTopic,
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
    return () => {
      if (reverseGeocodeTimeout.current) {
        clearTimeout(reverseGeocodeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!resumeId || resumeId === state.resumedReportId) return;

    getReport(resumeId).then((report) => {
      if (report) dispatch({ type: 'resumeReport', report });
    });
  }, [resumeId, state.resumedReportId]);

  const analyzeCurrentPhoto = useCallback(async () => {
    if (!state.photoUri) return;

    if (state.photoVisionResult && state.photoVisionPhotoUri === state.photoUri) {
      dispatch({
        type: 'setPhotoVisionResult',
        photoUri: state.photoUri,
        result: state.photoVisionResult,
      });
      return;
    }

    dispatch({ type: 'setPhotoVisionLoading' });
    try {
      const result = await analyzePhotoLabels(state.photoUri);
      dispatch({ type: 'setPhotoVisionResult', photoUri: state.photoUri, result });
    } catch (error) {
      dispatch({ type: 'setPhotoVisionError', error });
    }
  }, [state.photoUri, state.photoVisionPhotoUri, state.photoVisionResult]);

  useEffect(() => {
    if (state.step !== 'details' || !state.photoUri || !photoLabelsEnabled) return;
    if (state.photoVisionStatus !== 'idle' || state.photoVisionPhotoUri === state.photoUri) return;

    void analyzeCurrentPhoto();
  }, [
    analyzeCurrentPhoto,
    photoLabelsEnabled,
    state.photoUri,
    state.photoVisionPhotoUri,
    state.photoVisionStatus,
    state.step,
  ]);

  async function storePhoto(uri: string) {
    dispatch({ type: 'setBusy', busy: true });
    try {
      const persisted = await persistReportPhoto(uri);
      dispatch({ type: 'photoStored', photoUri: persisted });
    } catch {
      Alert.alert('Photo not saved', 'The report can continue without a saved photo.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'You can still create a report without a photo.');
      dispatch({ type: 'setStep', step: 'location' });
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
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location skipped', 'Enter the address manually to continue.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      dispatch({
        type: 'setPinLocation',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const place = places[0];
      if (place) {
        dispatch({ type: 'setResolvedAddress', address: formatAddress(place) });
      }
    } catch {
      Alert.alert('Location unavailable', 'Enter the address manually to continue.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  function updatePinFromMap(region: Region) {
    dispatch({ type: 'setPinLocation', latitude: region.latitude, longitude: region.longitude });

    if (reverseGeocodeTimeout.current) {
      clearTimeout(reverseGeocodeTimeout.current);
    }

    reverseGeocodeTimeout.current = setTimeout(() => {
      void reverseGeocodePin(region.latitude, region.longitude);
    }, 450);
  }

  async function reverseGeocodePin(nextLatitude: number, nextLongitude: number) {
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: nextLatitude,
        longitude: nextLongitude,
      });
      const place = places[0];
      if (place) {
        dispatch({ type: 'setResolvedAddress', address: formatAddress(place) });
      }
    } catch {
      // Keep the user's current editable address if reverse geocoding fails.
    }
  }

  async function previewEmail() {
    if (!state.description.trim()) {
      Alert.alert('Add a short description', 'One sentence is enough for the MVP.');
      return;
    }

    if (!state.address.trim()) {
      Alert.alert('Add a location', 'Enter an address or nearest landmark.');
      return;
    }

    dispatch({ type: 'setBusy', busy: true });
    try {
      const nextEmail = buildEmail({
        category,
        description: state.description,
        answers: state.answers,
        address: state.address,
        locationNote: state.locationNote,
        latitude: state.latitude,
        longitude: state.longitude,
        photoUri: state.photoUri,
        photoIssueTopic: state.selectedPhotoIssueTopic,
        profile: state.profile,
      });

      const draftInput = {
        categoryId: category.id === GENERAL_CATEGORY.id ? null : category.id,
        category: category.title,
        description: state.description,
        answers: state.answers,
        address: state.address,
        latitude: state.latitude,
        longitude: state.longitude,
        photoUri: state.photoUri,
        photoVisionResult: state.photoVisionResult,
        photoIssueTopic: state.selectedPhotoIssueTopic,
        emailSubject: nextEmail.subject,
        emailBody: nextEmail.body,
      };

      const id = state.savedReportId ?? (await createDraftReport(draftInput));
      if (state.savedReportId) {
        await updateDraftReport(state.savedReportId, draftInput);
      }
      dispatch({
        type: 'previewReady',
        emailBody: nextEmail.body,
        emailSubject: nextEmail.subject,
        savedReportId: id,
      });
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  async function openMail() {
    if (!state.savedReportId) return;

    await updateReportEmail(state.savedReportId, state.emailSubject, state.emailBody);
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      dispatch({ type: 'setStep', step: 'fallback' });
      return;
    }

    try {
      await MailComposer.composeAsync({
        recipients: [email.recipient],
        subject: state.emailSubject,
        body: state.emailBody,
        attachments: state.photoUri ? [state.photoUri] : [],
      });
      await updateReportStatus(state.savedReportId, 'Mail opened');
      dispatch({ type: 'resetReport', savedBannerId: state.savedReportId });
    } catch {
      dispatch({ type: 'setStep', step: 'fallback' });
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
    if (state.selectedCategoryId) {
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
      value: appendSuggestedDescription(state.description, suggestion),
    });
  }

  return {
    actions: {
      analyzeCurrentPhoto,
      backFromLocation,
      chooseCategory: (categoryId: string | null) =>
        dispatch({ type: 'chooseCategory', categoryId }),
      choosePhoto,
      copyEmail,
      dismissContactPrompt: () => dispatch({ type: 'dismissContactPrompt' }),
      insertSuggestedDescription,
      openCategory,
      openMail,
      openMailto,
      previewEmail,
      reportWithoutPhoto: () => dispatch({ type: 'setStep', step: 'location' }),
      setAddress: (address: string) => dispatch({ type: 'setAddress', address }),
      setAnswer: (questionId: string, value: string) =>
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
    currentIssueTitle,
    descriptionPlaceholder,
    email,
    filteredIssueCategories,
    manualCategory,
    photoIssueSuggestions,
    photoLabelsEnabled,
    pinRegion,
    raccoonFrameIndex,
    state,
  };
}

function formatAddress(place: Location.LocationGeocodedAddress) {
  return [place.name, place.street, place.city, place.region].filter(Boolean).join(', ');
}
