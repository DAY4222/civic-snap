import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import MapView, { type Region } from '@/components/CivicMap';
import { ISSUE_CATEGORIES, getCategory } from '@/lib/categories';
import { buildEmail } from '@/lib/email';
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
import { IssueCategory, PhotoIssueTopicSelection, PhotoVisionResult, Profile } from '@/lib/types';
import { PhotoVisionError, analyzePhotoLabels, canAnalyzePhotoLabels } from '@/lib/vision';
import { getSuggestedIssueTopics } from '@/lib/suggestedTopics';

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
  observations: [],
  questions: [],
};

export default function ReportScreen() {
  const { resumeId } = useLocalSearchParams<{ resumeId?: string }>();
  const [step, setStep] = useState<Step>('start');
  const [categoryReturnStep, setCategoryReturnStep] = useState<CategoryReturnStep>('location');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPhotoIssueTopic, setSelectedPhotoIssueTopic] =
    useState<PhotoIssueTopicSelection | null>(null);
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
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoLabelsEnabled = canAnalyzePhotoLabels() && photoAnalysisUserEnabled;

  const manualCategory = useMemo(
    () => (selectedCategoryId ? getCategory(selectedCategoryId) : null),
    [selectedCategoryId]
  );
  const photoIssueCategory = useMemo<IssueCategory | null>(
    () =>
      selectedPhotoIssueTopic
        ? {
            id: selectedPhotoIssueTopic.id,
            title: selectedPhotoIssueTopic.subjectTitle,
            subjectLabel: selectedPhotoIssueTopic.subjectLabel,
            observations: [],
            questions: [],
          }
        : null,
    [selectedPhotoIssueTopic]
  );
  const category = manualCategory ?? photoIssueCategory ?? GENERAL_CATEGORY;
  const currentIssueTitle = manualCategory?.title ?? selectedPhotoIssueTopic?.title ?? GENERAL_CATEGORY.title;
  const photoIssueSuggestions = useMemo(
    () => getSuggestedIssueTopics(photoVisionResult),
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
    selectedPhotoIssueTopic?.descriptionPlaceholder ??
    (manualCategory
      ? `Describe the ${manualCategory.subjectLabel}, exact location, and what crews should know.`
      : 'Example: pothole in the curb lane near the crosswalk');
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
      setSelectedCategoryId(report.categoryId);
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
    setCategoryReturnStep('location');
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
        categoryId: selectedCategoryId,
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
    setCategoryReturnStep(returnStep);
    setIssueSearchQuery('');
    setStep('category');
  }

  function chooseCategory(categoryId: string | null) {
    setSelectedCategoryId(categoryId);
    setSelectedPhotoIssueTopic(null);
    setAnswers({});
    setIssueSearchQuery('');
    setStep(categoryReturnStep);
  }

  function togglePhotoIssueTopic(topic: PhotoIssueTopicSelection) {
    setSelectedCategoryId(null);
    setAnswers({});
    setSelectedPhotoIssueTopic((current) => (current?.id === topic.id ? null : topic));
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

  function backFromCategory() {
    setStep(categoryReturnStep === 'details' ? 'details' : 'start');
  }

  function backFromLocation() {
    if (selectedCategoryId) {
      openCategory('location');
      return;
    }

    setStep('start');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
                resizeMode="contain"
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
          <Pressable style={styles.primaryButton} onPress={takePhoto} disabled={busy}>
            <FontAwesome name="camera" size={22} color="#fff" />
            <Text style={styles.primaryButtonText}>Take photo</Text>
          </Pressable>
          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={() => setStep('location')}>
              <Text style={styles.secondaryButtonText}>Report without photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={choosePhoto}>
              <Text style={styles.secondaryButtonText}>Choose photo</Text>
            </Pressable>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => openCategory('location')}>
            <Text style={styles.secondaryButtonText}>Choose issue type</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'category' ? (
        <View style={styles.stack}>
          <Header title="Search issue types" onBack={backFromCategory} />
          <Field
            label="Search"
            value={issueSearchQuery}
            onChangeText={setIssueSearchQuery}
            placeholder="Example: pothole, graffiti, sidewalk"
          />
          <Pressable
            style={[styles.card, selectedCategoryId == null && styles.selectedCard]}
            onPress={() => chooseCategory(null)}>
            <Text style={styles.cardTitle}>General 311 report</Text>
            <Text style={styles.muted}>Continue with a general 311 report.</Text>
          </Pressable>
          {filteredIssueCategories.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.card, item.id === selectedCategoryId && styles.selectedCard]}
              onPress={() => chooseCategory(item.id)}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.muted}>Use these prompts to shape your description.</Text>
            </Pressable>
          ))}
          {filteredIssueCategories.length === 0 ? (
            <Text style={styles.muted}>No issue types found. Try a different search term.</Text>
          ) : null}
        </View>
      ) : null}

      {step === 'location' ? (
        <View style={styles.stack}>
          <Header title="Confirm location" onBack={backFromLocation} />
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}
          <Pressable style={styles.secondaryButton} onPress={useCurrentLocation} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Use current location</Text>
          </Pressable>
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
                <FontAwesome name="map-marker" size={38} color="#d43f2f" />
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
          <Pressable style={styles.primaryButton} onPress={() => setStep('details')}>
            <Text style={styles.primaryButtonText}>Use this spot</Text>
          </Pressable>
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
          <Field
            label="Short description"
            value={description}
            onChangeText={setDescription}
            placeholder={descriptionPlaceholder}
            multiline
          />
          {manualCategory ? (
            <>
              <Text style={styles.sectionTitle}>Guided questions</Text>
              {manualCategory.questions.map((question) => (
                <Field
                  key={question.id}
                  label={question.label}
                  value={answers[question.id] ?? ''}
                  onChangeText={(value) =>
                    setAnswers((current) => ({ ...current, [question.id]: value }))
                  }
                  placeholder={question.placeholder}
                />
              ))}
              <Text style={styles.sectionTitle}>Useful observations</Text>
              {manualCategory.observations.map((observation) => (
                <View key={observation} style={styles.observationRow}>
                  <FontAwesome name="check-circle" size={16} color="#0a7ea4" />
                  <Text style={styles.observationText}>{observation}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={previewEmail} disabled={busy}>
            <Text style={styles.primaryButtonText}>Preview email</Text>
          </Pressable>
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
                  <FontAwesome name="times" size={16} color="#3a3a3c" />
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
          <Pressable style={styles.primaryButton} onPress={openMail}>
            <Text style={styles.primaryButtonText}>Open Mail</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'fallback' ? (
        <View style={styles.stack}>
          <Header title="Mail unavailable" onBack={() => setStep('preview')} />
          <Notice
            tone="warning"
            text="The iOS mail composer is unavailable. Copy the draft, then attach the photo manually if needed."
          />
          <Pressable style={styles.secondaryButton} onPress={copyEmail}>
            <Text style={styles.secondaryButtonText}>Copy email text</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={openMailto}>
            <Text style={styles.secondaryButtonText}>Open mailto link</Text>
          </Pressable>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={onBack} hitSlop={10}>
        <FontAwesome name="chevron-left" size={18} color="#1d1d1f" />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 18 }} />
    </View>
  );
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
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function Notice({ text, tone }: { text: string; tone: 'plain' | 'warning' }) {
  return (
    <View style={[styles.notice, tone === 'warning' && styles.warningNotice]}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function SuggestedTopicsPanel({
  manualCategory,
  onAnalyze,
  onOpenIssueSearch,
  onToggleTopic,
  selectedTopic,
  status,
  topics,
}: {
  manualCategory: IssueCategory | null;
  onAnalyze: () => void;
  onOpenIssueSearch: () => void;
  onToggleTopic: (topic: PhotoIssueTopicSelection) => void;
  selectedTopic: PhotoIssueTopicSelection | null;
  status: PhotoVisionStatus;
  topics: PhotoIssueTopicSelection[];
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
          <Text style={styles.sectionTitle}>Suggested topics</Text>
          <Text style={styles.muted}>Pick one if it matches, or search all issue types.</Text>
        </View>
        {status === 'loading' ? <ActivityIndicator /> : null}
      </View>
      {topics.map((topic) => {
        const selected = selectedTopic?.id === topic.id;

        return (
          <Pressable
            key={topic.id}
            style={[styles.topicCard, selected && styles.topicCardSelected]}
            onPress={() => onToggleTopic(topic)}>
            <View style={styles.topicRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Text style={styles.matchText}>{Math.round(topic.confidence * 100)}% match</Text>
              </View>
              <FontAwesome
                name={selected ? 'check-circle' : 'circle-o'}
                size={20}
                color={selected ? '#0a7ea4' : '#8e8e93'}
              />
            </View>
            {selected ? (
              <View style={styles.topicExpanded}>
                {topic.evidence ? <Text style={styles.evidenceText}>{topic.evidence}</Text> : null}
                <PromptGroup title="Try to mention" prompts={topic.questions} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
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
        <FontAwesome name="search" size={15} color="#1d1d1f" />
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
        <FontAwesome name="search" size={15} color="#1d1d1f" />
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
          <FontAwesome name="lightbulb-o" size={15} color="#0a7ea4" />
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

function formatAddress(place: Location.LocationGeocodedAddress) {
  return [place.name, place.street, place.city, place.region].filter(Boolean).join(', ');
}

function profilesEqual(left: Profile, right: Profile) {
  return left.name === right.name && left.email === right.email && left.phone === right.phone;
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 48,
    backgroundColor: '#f5f5f7',
    flexGrow: 1,
  },
  stack: {
    gap: 16,
  },
  progressCard: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginBottom: 16,
    padding: 12,
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
    backgroundColor: '#e5e5ea',
    borderRadius: 999,
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
    backgroundColor: '#0a7ea4',
  },
  progressLabelRow: {
    flexDirection: 'row',
  },
  progressDot: {
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  progressDotActive: {
    backgroundColor: '#0a7ea4',
  },
  progressNumber: {
    color: '#636366',
    fontSize: 12,
    fontWeight: '800',
  },
  progressNumberActive: {
    color: '#fff',
  },
  progressLabel: {
    color: '#636366',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressLabelActive: {
    color: '#1d1d1f',
  },
  eyebrow: {
    color: '#0a7ea4',
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
    color: '#1d1d1f',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: 8,
  },
  subtitle: {
    color: '#636366',
    fontSize: 17,
    lineHeight: 24,
    marginTop: 10,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#1d1d1f',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  selectedCard: {
    borderColor: '#0a7ea4',
  },
  cardTitle: {
    color: '#1d1d1f',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  muted: {
    color: '#636366',
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    backgroundColor: '#e9f5f9',
    borderRadius: 14,
    padding: 14,
  },
  warningNotice: {
    backgroundColor: '#fff4df',
  },
  noticeText: {
    color: '#2f3a40',
    fontSize: 14,
    lineHeight: 20,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#1d1d1f',
    fontSize: 18,
    fontWeight: '800',
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#d1d1d6',
  },
  pinCard: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
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
    color: '#636366',
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
  },
  field: {
    gap: 7,
  },
  label: {
    color: '#636366',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#1d1d1f',
    fontSize: 16,
    padding: 14,
  },
  multiline: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  categoryTitle: {
    color: '#1d1d1f',
    fontSize: 22,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#1d1d1f',
    fontSize: 16,
    fontWeight: '800',
  },
  observationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  observationText: {
    color: '#3a3a3c',
    flex: 1,
    fontSize: 15,
  },
  warningCard: {
    backgroundColor: '#fff4df',
    borderRadius: 14,
    padding: 14,
    gap: 10,
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
    backgroundColor: '#1d1d1f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smallButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  emailBox: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 14,
  },
  emailToRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  emailToLabel: {
    color: '#636366',
    fontSize: 14,
    fontWeight: '800',
  },
  emailTo: {
    color: '#1d1d1f',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  suggestionCard: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 14,
  },
  suggestionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  topicCard: {
    backgroundColor: '#f9fbfc',
    borderColor: '#d1d1d6',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 12,
  },
  topicCardSelected: {
    borderColor: '#0a7ea4',
  },
  topicRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  topicTitle: {
    color: '#1d1d1f',
    fontSize: 16,
    fontWeight: '800',
  },
  matchText: {
    color: '#0a7ea4',
    fontSize: 13,
    fontWeight: '800',
  },
  topicExpanded: {
    gap: 10,
  },
  evidenceText: {
    color: '#3a3a3c',
    fontSize: 14,
    lineHeight: 20,
  },
  promptGroup: {
    gap: 8,
  },
  promptTitle: {
    color: '#1d1d1f',
    fontSize: 14,
    fontWeight: '800',
  },
  promptRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  promptText: {
    color: '#3a3a3c',
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
    borderColor: '#b8dce8',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineActionText: {
    color: '#0a7ea4',
    fontSize: 14,
    fontWeight: '800',
  },
  inlineButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#d1d1d6',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inlineButtonText: {
    color: '#1d1d1f',
    fontSize: 14,
    fontWeight: '800',
  },
  banner: {
    alignItems: 'center',
    backgroundColor: '#e9f5f9',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    padding: 14,
  },
  bannerTitle: {
    color: '#1d1d1f',
    fontSize: 16,
    fontWeight: '800',
  },
  bannerButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
