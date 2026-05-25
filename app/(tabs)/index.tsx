import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { type ReactElement, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, Card, Chip, Field as CivicField, Notice as CivicNotice } from '@/components/CivicUI';
import MapView, { type Region } from '@/components/CivicMap';
import { colors, hairline, radius, spacing, typography } from '@/constants/ui';
import { ISSUE_CATEGORIES, getCategory } from '@/lib/categories';
import { buildEmail } from '@/lib/email';
import { selectionHaptic, successHaptic } from '@/lib/haptics';
import {
  appendSuggestedDescription,
  getSuggestedAnswerOptions,
  getSuggestedIssueCandidates,
  toggleMultiAnswer,
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
import {
  CategoryQuestion,
  IssueCategory,
  PhotoIssueCandidate,
  PhotoVisionResult,
  Profile,
} from '@/lib/types';
import { PhotoVisionError, analyzePhotoLabels, canAnalyzePhotoLabels } from '@/lib/vision';

type Step = 'start' | 'category' | 'location' | 'details' | 'preview' | 'fallback';
type CategoryReturnStep = 'location' | 'details';
type PhotoVisionStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'rate-limited' | 'payload-too-large';

const BLOCK_LEVEL_DELTA = 0.0012;
const RACCOON_FRAME_INTERVAL_MS = 67;
const RACCOON_SWEEPER_FRAMES = [
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
const GENERAL_CATEGORY: IssueCategory = {
  id: 'general',
  title: 'General 311 report',
  subjectLabel: 'local issue',
  categoryPath: [],
  description: '',
  discoverability: 'not-discoverable',
  visualCueLabelIds: [],
  requiredAnyLabelIds: [],
  observations: [],
  questions: [],
  emailGuidanceChecklist: [],
};

export default function ReportScreen() {
  const { resumeId } = useLocalSearchParams<{ resumeId?: string }>();
  const [step, setStep] = useState<Step>('start');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPhotoIssueTopic, setSelectedPhotoIssueTopic] =
    useState<PhotoIssueCandidate | null>(null);
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [savedBannerId, setSavedBannerId] = useState<string | null>(null);
  const [resumedReportId, setResumedReportId] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [dismissedContactPrompt, setDismissedContactPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoVisionResult, setPhotoVisionResult] = useState<PhotoVisionResult | null>(null);
  const [photoVisionPhotoUri, setPhotoVisionPhotoUri] = useState<string | null>(null);
  const [photoVisionStatus, setPhotoVisionStatus] = useState<PhotoVisionStatus>('idle');
  const [photoAnalysisUserEnabled, setPhotoAnalysisUserEnabled] = useState(false);
  const [raccoonFrameIndex, setRaccoonFrameIndex] = useState(0);
  const categorySheetRef = useRef<BottomSheetModal>(null);
  const categoryReturnStepRef = useRef<CategoryReturnStep>('location');
  const scrollViewRef = useRef<ScrollView>(null);
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoLabelsEnabled = canAnalyzePhotoLabels() && photoAnalysisUserEnabled;
  const categorySnapPoints = useMemo(() => ['72%', '92%'], []);
  const renderCategoryBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    []
  );

  const manualCategory = useMemo(
    () => (selectedCategoryId ? getCategory(selectedCategoryId) : null),
    [selectedCategoryId]
  );
  const photoIssueCategory = useMemo<IssueCategory | null>(
    () => (selectedPhotoIssueTopic ? getCategory(selectedPhotoIssueTopic.issueId) : null),
    [selectedPhotoIssueTopic]
  );
  const category = manualCategory ?? photoIssueCategory ?? GENERAL_CATEGORY;
  const currentIssueTitle = manualCategory?.title ?? selectedPhotoIssueTopic?.title ?? GENERAL_CATEGORY.title;
  const photoIssueSuggestions = useMemo(
    () => getSuggestedIssueCandidates(photoVisionResult),
    [photoVisionResult]
  );
  const draftSnapshot = useRef({
    address,
    answers,
    category,
    description,
    latitude,
    locationNote,
    longitude,
    photoUri,
    selectedPhotoIssueTopic,
    step,
  });
  draftSnapshot.current = {
    address,
    answers,
    category,
    description,
    latitude,
    locationNote,
    longitude,
    photoUri,
    selectedPhotoIssueTopic,
    step,
  };
  const filteredIssueCategories = useMemo(() => {
    const query = issueSearchQuery.trim().toLowerCase();
    if (!query) return ISSUE_CATEGORIES;

    return ISSUE_CATEGORIES.filter((item) =>
      [item.title, item.subjectLabel, ...item.questions.map((question) => question.label)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [issueSearchQuery]);
  const descriptionPlaceholder =
    manualCategory || photoIssueCategory
      ? `Describe the ${category.subjectLabel}, exact location, and what crews should know.`
      : 'Example: pothole in the curb lane near the crosswalk';
  const email = useMemo(
    () =>
      buildEmail({
        category,
        description,
        answers,
        address,
        locationNote,
        latitude,
        longitude,
        photoUri,
        photoIssueTopic: selectedPhotoIssueTopic,
        profile,
      }),
    [
      address,
      answers,
      category,
      description,
      latitude,
      locationNote,
      longitude,
      photoUri,
      profile,
      selectedPhotoIssueTopic,
    ]
  );
  const pinRegion = useMemo<Region | null>(() => {
    if (latitude == null || longitude == null) return null;

    return {
      latitude,
      longitude,
      latitudeDelta: BLOCK_LEVEL_DELTA,
      longitudeDelta: BLOCK_LEVEL_DELTA,
    };
  }, [latitude, longitude]);
  useFocusEffect(
    useCallback(() => {
      let active = true;

      loadProfile()
        .then((nextProfile) => {
          if (!active) return;

          setProfile((currentProfile) => {
            if (profilesEqual(currentProfile, nextProfile)) {
              return currentProfile;
            }

            const currentDraft = draftSnapshot.current;
            if (currentDraft.step === 'preview') {
              const currentEmail = buildEmail({
                category: currentDraft.category,
                description: currentDraft.description,
                answers: currentDraft.answers,
                address: currentDraft.address,
                locationNote: currentDraft.locationNote,
                latitude: currentDraft.latitude,
                longitude: currentDraft.longitude,
                photoUri: currentDraft.photoUri,
                photoIssueTopic: currentDraft.selectedPhotoIssueTopic,
                profile: currentProfile,
              });
              const nextEmail = buildEmail({
                category: currentDraft.category,
                description: currentDraft.description,
                answers: currentDraft.answers,
                address: currentDraft.address,
                locationNote: currentDraft.locationNote,
                latitude: currentDraft.latitude,
                longitude: currentDraft.longitude,
                photoUri: currentDraft.photoUri,
                photoIssueTopic: currentDraft.selectedPhotoIssueTopic,
                profile: nextProfile,
              });

              setEmailSubject((currentSubject) =>
                currentSubject === currentEmail.subject ? nextEmail.subject : currentSubject
              );
              setEmailBody((currentBody) =>
                currentBody === currentEmail.body ? nextEmail.body : currentBody
              );
            }

            return nextProfile;
          });
        })
        .catch(() => {
          if (active) setProfile(EMPTY_PROFILE);
        });

      loadPhotoAnalysisEnabled()
        .then((enabled) => {
          if (active) setPhotoAnalysisUserEnabled(enabled);
        })
        .catch(() => {
          if (active) setPhotoAnalysisUserEnabled(false);
        });

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    if (step !== 'start') return;

    const frameTimer = setInterval(() => {
      setRaccoonFrameIndex((currentFrame) => (currentFrame + 1) % RACCOON_SWEEPER_FRAMES.length);
    }, RACCOON_FRAME_INTERVAL_MS);

    return () => clearInterval(frameTimer);
  }, [step]);

  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    return () => {
      if (reverseGeocodeTimeout.current) {
        clearTimeout(reverseGeocodeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!resumeId || resumeId === resumedReportId) return;

    getReport(resumeId).then((report) => {
      if (!report) return;

      setResumedReportId(resumeId);
      setSavedReportId(report.id);
      setSelectedCategoryId(report.photoIssueTopic ? null : report.categoryId);
      setPhotoUri(report.photoUri);
      setAddress(report.address);
      setLocationNote('');
      setLatitude(report.latitude);
      setLongitude(report.longitude);
      setDescription(report.description);
      setAnswers(report.answers);
      setPhotoVisionResult(report.photoVisionResult);
      setPhotoVisionPhotoUri(report.photoVisionResult ? report.photoUri : null);
      setPhotoVisionStatus(getPhotoVisionStatus(report.photoVisionResult));
      setSelectedPhotoIssueTopic(report.photoIssueTopic);
      setEmailSubject(report.emailSubject);
      setEmailBody(report.emailBody);
      setSavedBannerId(null);
      setStep('details');
    });
  }, [resumeId, resumedReportId]);

  useEffect(() => {
    if (step !== 'details' || !photoUri || !photoLabelsEnabled) return;
    if (photoVisionStatus !== 'idle' || photoVisionPhotoUri === photoUri) return;

    analyzeCurrentPhoto();
  }, [photoLabelsEnabled, photoUri, photoVisionPhotoUri, photoVisionStatus, step]);

  function resetReport() {
    setStep('start');
    categoryReturnStepRef.current = 'location';
    setSelectedCategoryId(null);
    setSelectedPhotoIssueTopic(null);
    setIssueSearchQuery('');
    setPhotoUri(null);
    setAddress('');
    setLocationNote('');
    setLatitude(null);
    setLongitude(null);
    setDescription('');
    setAnswers({});
    setSavedReportId(null);
    setDismissedContactPrompt(false);
    setEmailSubject('');
    setEmailBody('');
    setPhotoVisionResult(null);
    setPhotoVisionPhotoUri(null);
    setPhotoVisionStatus('idle');
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'You can still create a report without a photo.');
      setStep('location');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
      mediaTypes: ['images'],
    });

    if (!result.canceled) {
      await storePhoto(result.assets[0].uri);
      setStep('location');
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
      setStep('location');
    }
  }

  async function storePhoto(uri: string) {
    setBusy(true);
    try {
      const persisted = await persistReportPhoto(uri);
      setPhotoUri(persisted);
      setSelectedPhotoIssueTopic(null);
      setPhotoVisionResult(null);
      setPhotoVisionPhotoUri(null);
      setPhotoVisionStatus('idle');
      successHaptic();
    } catch {
      Alert.alert('Photo not saved', 'The report can continue without a saved photo.');
    } finally {
      setBusy(false);
    }
  }

  async function useCurrentLocation() {
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location skipped', 'Enter the address manually to continue.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);

      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const place = places[0];
      if (place) {
        setAddress(formatAddress(place));
      }
      successHaptic();
    } catch {
      Alert.alert('Location unavailable', 'Enter the address manually to continue.');
    } finally {
      setBusy(false);
    }
  }

  function updatePinFromMap(region: Region) {
    setLatitude(region.latitude);
    setLongitude(region.longitude);

    if (reverseGeocodeTimeout.current) {
      clearTimeout(reverseGeocodeTimeout.current);
    }

    reverseGeocodeTimeout.current = setTimeout(() => {
      reverseGeocodePin(region.latitude, region.longitude);
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
        setAddress(formatAddress(place));
      }
    } catch {
      // Keep the user's current editable address if reverse geocoding fails.
    }
  }

  async function previewEmail() {
    if (!description.trim()) {
      Alert.alert('Add a short description', 'One sentence is enough for the MVP.');
      return;
    }

    if (!address.trim()) {
      Alert.alert('Add a location', 'Enter an address or nearest landmark.');
      return;
    }

    setBusy(true);
    try {
      const nextEmail = buildEmail({
        category,
        description,
        answers,
        address,
        locationNote,
        latitude,
        longitude,
        photoUri,
        photoIssueTopic: selectedPhotoIssueTopic,
        profile,
      });

      const draftInput = {
        categoryId: category.id === GENERAL_CATEGORY.id ? null : category.id,
        category: category.title,
        description,
        answers,
        address,
        latitude,
        longitude,
        photoUri,
        photoVisionResult,
        photoIssueTopic: selectedPhotoIssueTopic,
        emailSubject: nextEmail.subject,
        emailBody: nextEmail.body,
      };

      const id = savedReportId ?? (await createDraftReport(draftInput));
      if (savedReportId) {
        await updateDraftReport(savedReportId, draftInput);
      }
      setSavedReportId(id);
      setEmailSubject(nextEmail.subject);
      setEmailBody(nextEmail.body);
      setDismissedContactPrompt(false);
      setStep('preview');
      successHaptic();
    } finally {
      setBusy(false);
    }
  }

  async function openMail() {
    if (!savedReportId) return;

    await updateReportEmail(savedReportId, emailSubject, emailBody);
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      setStep('fallback');
      return;
    }

    try {
      await MailComposer.composeAsync({
        recipients: [email.recipient],
        subject: emailSubject,
        body: emailBody,
        attachments: photoUri ? [photoUri] : [],
      });
      await updateReportStatus(savedReportId, 'Mail opened');
      const id = savedReportId;
      resetReport();
      setSavedBannerId(id);
    } catch {
      setStep('fallback');
    }
  }

  async function copyEmail() {
    await Clipboard.setStringAsync(`${emailSubject}\n\n${emailBody}`);
    Alert.alert('Copied', 'Email subject and body copied.');
  }

  function openMailto() {
    const url = `mailto:${email.recipient}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(
      emailBody
    )}`;
    Linking.openURL(url);
  }

  function openCategory(returnStep: CategoryReturnStep) {
    categoryReturnStepRef.current = returnStep;
    setIssueSearchQuery('');
    categorySheetRef.current?.present();
  }

  function chooseCategory(categoryId: string | null) {
    const nextStep = categoryReturnStepRef.current;
    setSelectedCategoryId(categoryId);
    setSelectedPhotoIssueTopic(null);
    setAnswers({});
    setIssueSearchQuery('');
    categorySheetRef.current?.dismiss();
    setStep(nextStep);
    selectionHaptic();
  }

  function togglePhotoIssueTopic(topic: PhotoIssueCandidate) {
    setSelectedCategoryId(null);
    setAnswers({});
    setSelectedPhotoIssueTopic((current) => (current?.issueId === topic.issueId ? null : topic));
    selectionHaptic();
  }

  async function analyzeCurrentPhoto() {
    if (!photoUri) return;

    if (photoVisionResult && photoVisionPhotoUri === photoUri) {
      setPhotoVisionStatus(getPhotoVisionStatus(photoVisionResult));
      return;
    }

    setPhotoVisionStatus('loading');
    try {
      const result = await analyzePhotoLabels(photoUri);
      setPhotoVisionResult(result);
      setPhotoVisionPhotoUri(photoUri);
      setPhotoVisionStatus(getPhotoVisionStatus(result));
    } catch (error) {
      setPhotoVisionStatus(getPhotoVisionErrorStatus(error));
    }
  }

  function backFromLocation() {
    if (selectedCategoryId) {
      openCategory('location');
      return;
    }

    setStep('start');
  }

  return (
    <>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
      {savedBannerId ? (
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Report saved</Text>
            <Text style={styles.muted}>Mail was opened. Tracking is local.</Text>
          </View>
          <Pressable
            style={styles.bannerButton}
            onPress={() => router.push({ pathname: '/report/[id]', params: { id: savedBannerId } })}>
            <Text style={styles.bannerButtonText}>View</Text>
          </Pressable>
        </View>
      ) : null}
      {step !== 'start' ? <Progress currentStep={step} /> : null}

      {step === 'start' ? (
        <View style={styles.stack}>
          <View>
            <Text style={styles.eyebrow}>Civic Snap</Text>
            <View style={styles.raccoonStage}>
              <Image
                contentFit="contain"
                source={RACCOON_SWEEPER_FRAMES[raccoonFrameIndex]}
                style={styles.raccoonSprite}
              />
            </View>
            <Text style={styles.title}>Snap. Pin. Send to 311.</Text>
            <Text style={styles.subtitle}>
              Create a strong report in a few focused steps.
            </Text>
          </View>
          <Notice tone="plain" text="For emergencies or immediate danger, use emergency services instead of this app." />
          <Button
            disabled={busy}
            icon={<FontAwesome name="camera" size={22} color={colors.surface} />}
            label="Take photo"
            onPress={takePhoto}
          />
          <View style={styles.buttonRow}>
            <Button
              label="Report without photo"
              onPress={() => {
                selectionHaptic();
                setStep('location');
              }}
              style={styles.rowButton}
              variant="secondary"
            />
            <Button label="Choose photo" onPress={choosePhoto} style={styles.rowButton} variant="secondary" />
          </View>
          <Button label="Choose issue type" onPress={() => openCategory('location')} variant="secondary" />
        </View>
      ) : null}

      {step === 'location' ? (
        <View style={styles.stack}>
          <Header title="Confirm location" onBack={backFromLocation} />
          {photoUri ? <Image source={{ uri: photoUri }} contentFit="cover" transition={150} style={styles.photo} /> : null}
          <Button disabled={busy} label="Use current location" onPress={useCurrentLocation} variant="secondary" />
          <Field
            label="Address or nearest landmark"
            value={address}
            onChangeText={setAddress}
            placeholder="Example: outside library entrance"
          />
          {pinRegion ? (
            <View style={styles.pinCard}>
              <MapView
                style={styles.pinMap}
                region={pinRegion}
                onRegionChangeComplete={updatePinFromMap}
              />
              <View pointerEvents="none" style={styles.centerPin}>
                <FontAwesome name="map-marker" size={38} color={colors.danger} />
              </View>
              <Text style={styles.mapHelp}>Move the map under the pin. The view is zoomed to about one block.</Text>
            </View>
          ) : (
            <Notice
              tone="plain"
              text="Use current location to place an adjustable pin, or enter the address manually."
            />
          )}
          <Field
            label="Location note"
            value={locationNote}
            onChangeText={setLocationNote}
            placeholder="Example: south curb, beside the park entrance"
          />
          <Button
            label="Use this spot"
            onPress={() => {
              selectionHaptic();
              setStep('details');
            }}
          />
        </View>
      ) : null}

      {step === 'details' ? (
        <View style={styles.stack}>
          <Header title="Add details" onBack={() => setStep('location')} />
          <Text style={styles.categoryTitle}>{currentIssueTitle}</Text>
          {photoLabelsEnabled && photoUri ? (
            <SuggestedTopicsPanel
              manualCategory={manualCategory}
              onAnalyze={analyzeCurrentPhoto}
              labels={photoVisionResult?.suggestedLabels ?? []}
              onOpenIssueSearch={() => openCategory('details')}
              onToggleTopic={togglePhotoIssueTopic}
              selectedTopic={selectedPhotoIssueTopic}
              status={photoVisionStatus}
              topics={photoIssueSuggestions}
            />
          ) : (
            <ManualIssuePanel
              manualCategory={manualCategory}
              onOpenIssueSearch={() => openCategory('details')}
            />
          )}
          {selectedPhotoIssueTopic && photoUri ? (
            <EvidencePhoto
              photoUri={photoUri}
              result={photoVisionResult}
              selectedCandidate={selectedPhotoIssueTopic}
            />
          ) : null}
          {selectedPhotoIssueTopic?.suggestedDescription ? (
            <Pressable
              style={styles.suggestedSentence}
              onPress={() =>
                setDescription((current) =>
                  appendSuggestedDescription(current, selectedPhotoIssueTopic.suggestedDescription)
                )
              }>
              <Text style={styles.promptTitle}>Suggested sentence</Text>
              <Text style={styles.evidenceText}>{selectedPhotoIssueTopic.suggestedDescription}</Text>
              <Text style={styles.inlineActionText}>Insert sentence</Text>
            </Pressable>
          ) : null}
          <Field
            label="Short description"
            value={description}
            onChangeText={setDescription}
            placeholder={descriptionPlaceholder}
            multiline
          />
          {category.id !== GENERAL_CATEGORY.id ? (
            <>
              {category.questions.length > 0 ? <Text style={styles.sectionTitle}>Checklist</Text> : null}
              {category.questions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={answers[question.id] ?? ''}
                  onChangeText={(value) =>
                    setAnswers((current) => ({ ...current, [question.id]: value }))
                  }
                  selectedCandidate={selectedPhotoIssueTopic}
                />
              ))}
              <Text style={styles.sectionTitle}>Useful observations</Text>
              {category.observations.map((observation) => (
                <View key={observation} style={styles.observationRow}>
                  <FontAwesome name="check-circle" size={16} color={colors.primary} />
                  <Text style={styles.observationText}>{observation}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Button disabled={busy} label="Preview email" onPress={previewEmail} />
        </View>
      ) : null}

      {step === 'preview' ? (
        <View style={styles.stack}>
          <Header title="Email preview" onBack={() => setStep('details')} />
          <Notice
            tone="plain"
            text="This draft is saved locally as Draft. You still send it from your own email."
          />
          {(!profile.name.trim() || !profile.phone.trim()) && !dismissedContactPrompt ? (
            <View style={styles.warningCard}>
              <View style={styles.warningCardHeader}>
                <Text style={[styles.cardTitle, styles.warningCardTitle]}>Add contact info?</Text>
                <Pressable
                  accessibilityLabel="Dismiss contact info prompt"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setDismissedContactPrompt(true)}
                  style={styles.dismissButton}>
                  <FontAwesome name="times" size={16} color={colors.text} />
                </Pressable>
              </View>
              <Text style={styles.muted}>311 may use it to follow up. You can still send this report without it.</Text>
              <Link href="/settings" asChild>
                <Pressable style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Edit profile</Text>
                </Pressable>
              </Link>
            </View>
          ) : null}
          <View style={styles.emailBox}>
            <View style={styles.emailToRow}>
              <Text style={styles.emailToLabel}>To:</Text>
              <Text numberOfLines={1} style={styles.emailTo}>{email.recipient}</Text>
            </View>
            <Field
              label="Subject"
              value={emailSubject}
              onChangeText={setEmailSubject}
            />
            <Field
              label="Body"
              value={emailBody}
              onChangeText={setEmailBody}
              multiline
            />
          </View>
          <Text style={styles.muted}>{photoUri ? 'Photo will be attached.' : 'No photo attached.'}</Text>
          <Button label="Open Mail" onPress={openMail} />
        </View>
      ) : null}

      {step === 'fallback' ? (
        <View style={styles.stack}>
          <Header title="Mail unavailable" onBack={() => setStep('preview')} />
          <Notice
            tone="warning"
            text="The iOS mail composer is unavailable. Copy the draft, then attach the photo manually if needed."
          />
          <Button label="Copy email text" onPress={copyEmail} variant="secondary" />
          <Button label="Open mailto link" onPress={openMailto} variant="secondary" />
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator />
        </View>
      ) : null}
      </ScrollView>
      <IssuePickerSheet
        ref={categorySheetRef}
        backdropComponent={renderCategoryBackdrop}
        categories={filteredIssueCategories}
        onChooseCategory={chooseCategory}
        onSearchChange={setIssueSearchQuery}
        searchQuery={issueSearchQuery}
        selectedCategoryId={selectedCategoryId}
        snapPoints={categorySnapPoints}
      />
    </>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={onBack} hitSlop={10}>
        <FontAwesome name="chevron-left" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 18 }} />
    </View>
  );
}

const IssuePickerSheet = forwardRef<
  BottomSheetModal,
  {
    backdropComponent: (props: BottomSheetBackdropProps) => ReactElement;
    categories: IssueCategory[];
    onChooseCategory: (categoryId: string | null) => void;
    onSearchChange: (value: string) => void;
    searchQuery: string;
    selectedCategoryId: string | null;
    snapPoints: string[];
  }
>(function IssuePickerSheet(
  {
    backdropComponent,
    categories,
    onChooseCategory,
    onSearchChange,
    searchQuery,
    selectedCategoryId,
    snapPoints,
  },
  ref
) {
  return (
    <BottomSheetModal
      ref={ref}
      backdropComponent={backdropComponent}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      snapPoints={snapPoints}>
      <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle}>Choose issue type</Text>
        <Text style={styles.muted}>Search Toronto 311 topics or keep this as a general report.</Text>
        <Field
          label="Search"
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Example: pothole, graffiti, sidewalk"
        />
        <Pressable onPress={() => onChooseCategory(null)}>
          <Card selected={selectedCategoryId == null} style={styles.sheetCard}>
            <Text style={styles.cardTitle}>General 311 report</Text>
            <Text style={styles.muted}>Continue with a general 311 report.</Text>
          </Card>
        </Pressable>
        {categories.map((item) => (
          <Pressable key={item.id} onPress={() => onChooseCategory(item.id)}>
            <Card selected={item.id === selectedCategoryId} style={styles.sheetCard}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.muted}>{categorySourceMatchText(item)}</Text>
            </Card>
          </Pressable>
        ))}
        {categories.length === 0 ? (
          <Text style={styles.muted}>No issue types found. Try a different search term.</Text>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

function categorySourceMatchText(category: IssueCategory) {
  if (category.sourceMatchStatus === 'unmatched') {
    return 'No exact Toronto 311 source match; review before sending.';
  }

  if (category.sourceMatchStatus === 'ambiguous') {
    return 'Multiple exact Toronto 311 source matches; review before sending.';
  }

  return 'Use these prompts to shape your description.';
}

function Progress({ currentStep }: { currentStep: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'category', label: 'Issue' },
    { key: 'location', label: 'Pin' },
    { key: 'details', label: 'Details' },
    { key: 'preview', label: 'Email' },
  ];
  const currentIndex = Math.max(
    steps.findIndex((step) => step.key === (currentStep === 'fallback' ? 'preview' : currentStep)),
    0
  );

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressDotsRow}>
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          const isDone = index < currentIndex;

          return (
            <View key={step.key} style={styles.progressDotItem}>
              {index > 0 ? (
                <View
                  style={[
                    styles.progressConnector,
                    styles.progressConnectorLeft,
                    index <= currentIndex && styles.progressConnectorActive,
                  ]}
                />
              ) : null}
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.progressConnector,
                    styles.progressConnectorRight,
                    index < currentIndex && styles.progressConnectorActive,
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.progressDot,
                  (isActive || isDone) && styles.progressDotActive,
                ]}>
                <Text style={[styles.progressNumber, (isActive || isDone) && styles.progressNumberActive]}>
                  {index + 1}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.progressLabelRow}>
        {steps.map((step, index) => {
          const isActive = index === currentIndex;

          return (
            <Text
              key={step.key}
              style={[styles.progressLabel, isActive && styles.progressLabelActive]}>
              {step.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <CivicField
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline={multiline}
    />
  );
}

function QuestionField({
  onChangeText,
  question,
  selectedCandidate,
  value,
}: {
  onChangeText: (value: string) => void;
  question: CategoryQuestion;
  selectedCandidate: PhotoIssueCandidate | null;
  value: string;
}) {
  const suggestions = getSuggestedAnswerOptions(question, selectedCandidate);
  const selectedValues = value
    .split(', ')
    .map((item) => item.trim())
    .filter(Boolean);

  if (question.options.length > 0) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{question.label}</Text>
        <View style={styles.optionWrap}>
          {question.options.map((option) => {
            const selected =
              question.answerType === 'multipicklist'
                ? selectedValues.includes(option.label)
                : value === option.label;
            const suggested = suggestions.some((suggestion) => suggestion.value === option.value);

            return (
              <Pressable
                key={option.value}
                style={[
                  styles.optionChip,
                  selected && styles.optionChipSelected,
                  suggested && !selected && styles.optionChipSuggested,
                ]}
                onPress={() =>
                  onChangeText(
                    question.answerType === 'multipicklist'
                      ? toggleMultiAnswer(value, option)
                      : option.label
                  )
                }>
                <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {suggestions.length > 0 ? (
          <Text style={styles.suggestionText}>
            Suggested by photo: {suggestions.map((option) => option.label).join(', ')}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Field
      label={question.label}
      value={value}
      onChangeText={onChangeText}
      placeholder={question.placeholder}
      multiline={question.answerType === 'text'}
    />
  );
}

function Notice({ text, tone }: { text: string; tone: 'plain' | 'warning' }) {
  return <CivicNotice text={text} tone={tone} />;
}

function EvidencePhoto({
  photoUri,
  result,
  selectedCandidate,
}: {
  photoUri: string;
  result: PhotoVisionResult | null;
  selectedCandidate: PhotoIssueCandidate;
}) {
  const aspectRatio =
    result?.image.width && result.image.height ? result.image.width / result.image.height : 4 / 3;

  return (
    <View style={[styles.evidencePhotoFrame, { aspectRatio }]}>
      <Image source={{ uri: photoUri }} contentFit="fill" transition={150} style={styles.evidencePhoto} />
      {selectedCandidate.boundingBoxes.map((box) => (
        <View
          key={`${box.labelId}-${box.boundingBox.x}-${box.boundingBox.y}`}
          style={[
            styles.evidenceBox,
            {
              height: `${box.boundingBox.height * 100}%`,
              left: `${box.boundingBox.x * 100}%`,
              top: `${box.boundingBox.y * 100}%`,
              width: `${box.boundingBox.width * 100}%`,
            },
          ]}>
          <Text style={styles.evidenceBoxLabel}>{box.label}</Text>
        </View>
      ))}
    </View>
  );
}

function SuggestedTopicsPanel({
  labels,
  manualCategory,
  onAnalyze,
  onOpenIssueSearch,
  onToggleTopic,
  selectedTopic,
  status,
  topics,
}: {
  labels: PhotoVisionResult['suggestedLabels'];
  manualCategory: IssueCategory | null;
  onAnalyze: () => void;
  onOpenIssueSearch: () => void;
  onToggleTopic: (topic: PhotoIssueCandidate) => void;
  selectedTopic: PhotoIssueCandidate | null;
  status: PhotoVisionStatus;
  topics: PhotoIssueCandidate[];
}) {
  const showQuietFallback =
    status === 'empty' ||
    status === 'error' ||
    status === 'rate-limited' ||
    status === 'payload-too-large' ||
    (status === 'ready' && topics.length === 0);

  return (
    <View style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Suggested issues</Text>
          <Text style={styles.muted}>Pick one if it matches, or search all issue types.</Text>
        </View>
        {status === 'loading' ? <ActivityIndicator /> : null}
      </View>
      {topics.map((topic) => {
        const selected = selectedTopic?.issueId === topic.issueId;

        return (
          <Pressable
            key={topic.issueId}
            style={[styles.topicCard, selected && styles.topicCardSelected]}
            onPress={() => onToggleTopic(topic)}>
            <View style={styles.topicRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Text style={styles.matchText}>{confidenceTierText(topic.confidenceTier)}</Text>
              </View>
              <FontAwesome
                name={selected ? 'check-circle' : 'circle-o'}
                size={20}
                color={selected ? colors.primary : colors.muted}
              />
            </View>
            <View style={styles.chipRow}>
              {topic.evidenceChips.map((chip) => (
                <Chip key={chip}>{chip}</Chip>
              ))}
            </View>
            <Text style={styles.evidenceText}>{topic.reason}</Text>
          </Pressable>
        );
      })}
      {labels.length > 0 ? (
        <View style={styles.promptGroup}>
          <Text style={styles.promptTitle}>Detected evidence</Text>
          <View style={styles.chipRow}>
            {labels.map((label) => (
              <Chip key={label.id}>
                {label.label} {Math.round(label.confidence * 100)}%
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      {status === 'loading' ? (
        <Text style={styles.muted}>Looking for likely 311 topics. You can keep writing.</Text>
      ) : null}
      {showQuietFallback ? (
        <View style={styles.quietFallback}>
          <Text style={[styles.muted, styles.quietFallbackText]}>
            No suggested topics available. You can still choose an issue type.
          </Text>
          <Pressable
            hitSlop={8}
            onPress={onAnalyze}
            style={styles.retryButton}>
            <Text style={styles.inlineActionText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable style={styles.inlineButton} onPress={onOpenIssueSearch}>
        <FontAwesome name="search" size={15} color={colors.text} />
        <Text style={styles.inlineButtonText}>Search all issue types</Text>
      </Pressable>
    </View>
  );
}

function ManualIssuePanel({
  manualCategory,
  onOpenIssueSearch,
}: {
  manualCategory: IssueCategory | null;
  onOpenIssueSearch: () => void;
}) {
  return (
    <View style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Issue type</Text>
          <Text style={styles.muted}>
            {manualCategory ? manualCategory.title : 'Choose a topic, or keep this as a general report.'}
          </Text>
        </View>
      </View>
      <Pressable style={styles.inlineButton} onPress={onOpenIssueSearch}>
        <FontAwesome name="search" size={15} color={colors.text} />
        <Text style={styles.inlineButtonText}>Search all issue types</Text>
      </Pressable>
    </View>
  );
}

function PromptGroup({ title, prompts }: { title: string; prompts: string[] }) {
  if (prompts.length === 0) return null;

  return (
    <View style={styles.promptGroup}>
      <Text style={styles.promptTitle}>{title}</Text>
      {prompts.map((prompt) => (
        <View key={prompt} style={styles.promptRow}>
          <FontAwesome name="lightbulb-o" size={15} color={colors.primary} />
          <Text style={styles.promptText}>{prompt}</Text>
        </View>
      ))}
    </View>
  );
}

function getPhotoVisionStatus(result: PhotoVisionResult | null) {
  if (!result) return 'idle';
  return result.suggestedLabels.length > 0 ? 'ready' : 'empty';
}

function getPhotoVisionErrorStatus(error: unknown) {
  if (error instanceof PhotoVisionError) {
    if (error.code === 'rate-limited') return 'rate-limited';
    if (error.code === 'payload-too-large') return 'payload-too-large';
  }

  return 'error';
}

function confidenceTierText(tier: PhotoIssueCandidate['confidenceTier']) {
  if (tier === 'strong') return 'Strong match';
  if (tier === 'likely') return 'Likely match';
  return 'Possible match';
}

function formatAddress(place: Location.LocationGeocodedAddress) {
  return [place.name, place.street, place.city, place.region].filter(Boolean).join(', ');
}

function profilesEqual(left: Profile, right: Profile) {
  return left.name === right.name && left.email === right.email && left.phone === right.phone;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  stack: {
    gap: spacing.lg,
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: hairline,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  progressDotsRow: {
    flexDirection: 'row',
  },
  progressDotItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  progressConnector: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 3,
    position: 'absolute',
    top: 12,
  },
  progressConnectorLeft: {
    left: 0,
    right: '50%',
  },
  progressConnectorRight: {
    left: '50%',
    right: 0,
  },
  progressConnectorActive: {
    backgroundColor: colors.primary,
  },
  progressLabelRow: {
    flexDirection: 'row',
  },
  progressDot: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressNumber: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: '800',
  },
  progressNumberActive: {
    color: colors.surface,
  },
  progressLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressLabelActive: {
    color: colors.text,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  raccoonStage: {
    aspectRatio: 1,
    marginTop: 12,
    maxWidth: 92,
    minWidth: 64,
    overflow: 'visible',
    position: 'relative',
    width: '20%',
  },
  raccoonSprite: {
    height: '100%',
    width: '100%',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: 8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.subtitle,
    lineHeight: 24,
    marginTop: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowButton: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  photo: {
    backgroundColor: colors.border,
    borderRadius: radius.card,
    height: 220,
    width: '100%',
  },
  pinCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  pinMap: {
    height: 260,
    width: '100%',
  },
  centerPin: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -24,
    marginTop: -34,
    position: 'absolute',
    top: 130,
    width: 48,
  },
  mapHelp: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.muted,
    fontSize: typography.label,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  categoryTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: '800',
  },
  observationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  observationText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
  },
  warningCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    gap: spacing.sm,
    padding: spacing.md,
  },
  warningCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  warningCardTitle: {
    flex: 1,
    marginBottom: 0,
  },
  dismissButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    marginRight: -4,
    marginTop: -4,
    width: 28,
  },
  smallButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.text,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  smallButtonText: {
    color: colors.surface,
    fontWeight: '800',
  },
  emailBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: hairline,
    gap: spacing.md,
    padding: spacing.md,
  },
  emailToRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  emailToLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  emailTo: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  suggestionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: hairline,
    gap: spacing.md,
    padding: spacing.md,
  },
  suggestionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  topicCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: hairline,
    gap: spacing.sm,
    padding: spacing.md,
  },
  topicCardSelected: {
    borderColor: colors.primary,
  },
  topicRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  topicTitle: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: '800',
  },
  matchText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  topicExpanded: {
    gap: 10,
  },
  evidenceText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  evidencePhotoFrame: {
    backgroundColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  evidencePhoto: {
    height: '100%',
    width: '100%',
  },
  evidenceBox: {
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 2,
    position: 'absolute',
  },
  evidenceBoxLabel: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 5,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  suggestedSentence: {
    backgroundColor: colors.background,
    borderColor: colors.primarySoft,
    borderRadius: radius.card,
    borderWidth: hairline,
    gap: spacing.sm,
    padding: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  optionChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipSuggested: {
    borderColor: colors.primary,
  },
  optionChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  optionChipTextSelected: {
    color: colors.surface,
  },
  suggestionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  promptGroup: {
    gap: 8,
  },
  promptTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  promptRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  promptText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  quietFallback: {
    alignItems: 'flex-start',
    gap: 8,
  },
  quietFallbackText: {
    flexShrink: 1,
    width: '100%',
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderColor: colors.primarySoft,
    borderRadius: radius.pill,
    borderWidth: hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  inlineActionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  inlineButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: hairline,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inlineButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  banner: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    padding: 14,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: '800',
  },
  bannerButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerButtonText: {
    color: colors.surface,
    fontWeight: '800',
  },
  sheetBackground: {
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    backgroundColor: colors.border,
    width: 44,
  },
  sheetContent: {
    gap: spacing.md,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  sheetCard: {
    gap: spacing.xs,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
