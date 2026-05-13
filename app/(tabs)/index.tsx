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
  Animated,
  Easing,
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
import { ISSUE_CATEGORIES, getCategory, getCategoryByTitle } from '@/lib/categories';
import { buildEmail } from '@/lib/email';
import { persistReportPhoto } from '@/lib/photos';
import { EMPTY_PROFILE, loadProfile } from '@/lib/profile';
import {
  createDraftReport,
  getReport,
  updateDraftReport,
  updateReportEmail,
  updateReportStatus,
} from '@/lib/reports';
import { PhotoVisionResult, Profile } from '@/lib/types';
import { PhotoVisionError, analyzePhotoLabels, canAnalyzePhotoLabels } from '@/lib/vision';

type Step = 'start' | 'category' | 'location' | 'details' | 'preview' | 'fallback';
type CategoryReturnStep = 'location' | 'details';

const BLOCK_LEVEL_DELTA = 0.0012;
const RACCOON_SWEEPER = require('../../assets/images/raccoon-sweeper.png');
const GENERAL_CATEGORY = {
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
  const [busy, setBusy] = useState(false);
  const [photoVisionResult, setPhotoVisionResult] = useState<PhotoVisionResult | null>(null);
  const [photoVisionPhotoUri, setPhotoVisionPhotoUri] = useState<string | null>(null);
  const [photoVisionStatus, setPhotoVisionStatus] = useState<
    'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'rate-limited' | 'payload-too-large'
  >('idle');
  const sweepProgress = useRef(new Animated.Value(0)).current;
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoLabelsEnabled = canAnalyzePhotoLabels();

  const category = useMemo(
    () => (selectedCategoryId ? getCategory(selectedCategoryId) : GENERAL_CATEGORY),
    [selectedCategoryId]
  );
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
        profile,
      }),
    [address, answers, category, description, latitude, locationNote, longitude, photoUri, profile]
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
  const raccoonSweepStyle = {
    transform: [
      {
        translateX: sweepProgress.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [0, 4, 0],
        }),
      },
      {
        rotate: sweepProgress.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: ['-2deg', '3deg', '-2deg'],
        }),
      },
    ],
  };
  const leafSweepStyle = {
    opacity: sweepProgress.interpolate({
      inputRange: [0, 0.2, 0.45, 0.6, 1],
      outputRange: [1, 1, 0, 0, 1],
    }),
    transform: [
      {
        translateX: sweepProgress.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [0, 18, 0],
        }),
      },
      {
        translateY: sweepProgress.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [0, -2, 0],
        }),
      },
      {
        scale: sweepProgress.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [1, 0.72, 1],
        }),
      },
    ],
  };

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

            if (step === 'preview') {
              const currentEmail = buildEmail({
                category,
                description,
                answers,
                address,
                locationNote,
                latitude,
                longitude,
                photoUri,
                profile: currentProfile,
              });
              const nextEmail = buildEmail({
                category,
                description,
                answers,
                address,
                locationNote,
                latitude,
                longitude,
                photoUri,
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

      return () => {
        active = false;
      };
    }, [address, answers, category, description, latitude, locationNote, longitude, photoUri, step])
  );

  useEffect(() => {
    const sweepAnimation = Animated.loop(
      Animated.timing(sweepProgress, {
        duration: 2600,
        easing: Easing.inOut(Easing.sin),
        toValue: 1,
        useNativeDriver: true,
      })
    );

    sweepAnimation.start();

    return () => sweepAnimation.stop();
  }, [sweepProgress]);

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

      const resumedCategory = getCategoryByTitle(report.category);
      setResumedReportId(resumeId);
      setSavedReportId(report.id);
      setSelectedCategoryId(report.category === GENERAL_CATEGORY.title ? null : resumedCategory.id);
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
      setEmailSubject(report.emailSubject);
      setEmailBody(report.emailBody);
      setSavedBannerId(null);
      setStep('details');
    });
  }, [resumeId, resumedReportId]);

  function resetReport() {
    setStep('start');
    setCategoryReturnStep('location');
    setSelectedCategoryId(null);
    setPhotoUri(null);
    setAddress('');
    setLocationNote('');
    setLatitude(null);
    setLongitude(null);
    setDescription('');
    setAnswers({});
    setSavedReportId(null);
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
        profile,
      });

      const draftInput = {
        category: category.title,
        description,
        answers,
        address,
        latitude,
        longitude,
        photoUri,
        photoVisionResult,
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
    setStep('category');
  }

  function chooseCategory(categoryId: string | null) {
    setSelectedCategoryId(categoryId);
    setAnswers({});
    setStep(categoryReturnStep);
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
              <Animated.Image
                resizeMode="contain"
                source={RACCOON_SWEEPER}
                style={[styles.raccoonSprite, raccoonSweepStyle]}
              />
              <Animated.View style={[styles.raccoonLeaves, leafSweepStyle]}>
                <View style={[styles.raccoonLeaf, styles.raccoonLeafOrange]} />
                <View style={[styles.raccoonLeaf, styles.raccoonLeafGold]} />
                <View style={[styles.raccoonLeaf, styles.raccoonLeafRed]} />
              </Animated.View>
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
          <Notice
            tone="warning"
            text="MVP note: photos are stored locally and are not anonymized yet."
          />
        </View>
      ) : null}

      {step === 'category' ? (
        <View style={styles.stack}>
          <Header title="Choose issue" onBack={backFromCategory} />
          <Pressable
            style={[styles.card, selectedCategoryId == null && styles.selectedCard]}
            onPress={() => chooseCategory(null)}>
            <Text style={styles.cardTitle}>Skip issue type</Text>
            <Text style={styles.muted}>Continue with a general 311 report.</Text>
          </Pressable>
          {ISSUE_CATEGORIES.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.card, item.id === selectedCategoryId && styles.selectedCard]}
              onPress={() => chooseCategory(item.id)}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.muted}>Use guided questions for this report type.</Text>
            </Pressable>
          ))}
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
          <Text style={styles.categoryTitle}>
            {selectedCategoryId ? category.title : 'General 311 report'}
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => openCategory('details')}>
            <Text style={styles.secondaryButtonText}>
              {selectedCategoryId ? 'Change issue type' : 'Choose issue type'}
            </Text>
          </Pressable>
          {photoLabelsEnabled && photoUri ? (
            <PhotoLabelsPanel
              result={photoVisionResult}
              status={photoVisionStatus}
              onAnalyze={analyzeCurrentPhoto}
            />
          ) : null}
          <Field
            label="Short description"
            value={description}
            onChangeText={setDescription}
            placeholder="Example: pothole in the curb lane near the crosswalk"
            multiline
          />
          {selectedCategoryId ? (
            <>
              <Text style={styles.sectionTitle}>Guided questions</Text>
              {category.questions.map((question) => (
                <Field
                  key={question.id}
                  label={question.label}
                  value={answers[question.id] ?? ''}
                  onChangeText={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                  placeholder={question.placeholder}
                />
              ))}
              <Text style={styles.sectionTitle}>Useful observations</Text>
              {category.observations.map((observation) => (
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
          {!profile.name.trim() || !profile.phone.trim() ? (
            <View style={styles.warningCard}>
              <Text style={styles.cardTitle}>Add contact info?</Text>
              <Text style={styles.muted}>311 may use it to follow up. You can still send this report without it.</Text>
              <Link href="/settings" asChild>
                <Pressable style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Edit profile</Text>
                </Pressable>
              </Link>
            </View>
          ) : null}
          <View style={styles.emailBox}>
            <Text style={styles.label}>To</Text>
            <Text style={styles.emailTo}>{email.recipient}</Text>
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
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isDone = index < currentIndex;

        return (
          <View key={step.key} style={styles.progressItem}>
            <View
              style={[
                styles.progressDot,
                (isActive || isDone) && styles.progressDotActive,
              ]}>
              <Text style={[styles.progressNumber, (isActive || isDone) && styles.progressNumberActive]}>
                {index + 1}
              </Text>
            </View>
            <Text style={[styles.progressLabel, isActive && styles.progressLabelActive]}>
              {step.label}
            </Text>
          </View>
        );
      })}
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

function PhotoLabelsPanel({
  result,
  status,
  onAnalyze,
}: {
  result: PhotoVisionResult | null;
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'rate-limited' | 'payload-too-large';
  onAnalyze: () => void;
}) {
  const labels = result?.suggestedLabels ?? [];

  return (
    <View style={styles.photoLabelsCard}>
      <View style={styles.photoLabelsHeader}>
        <Text style={styles.sectionTitle}>Photo labels</Text>
        {status === 'loading' ? <ActivityIndicator /> : null}
      </View>
      {labels.length > 0 ? (
        <View style={styles.labelChipRow}>
          {labels.map((label) => (
            <Pressable
              key={label.id}
              style={styles.labelChip}
              onPress={() => showPhotoLabelDetails(label)}>
              <Text style={styles.labelChipText}>{label.label}</Text>
              <Text style={styles.labelChipScore}>{Math.round(label.confidence * 100)}%</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {status === 'empty' ? <Text style={styles.muted}>No photo labels found.</Text> : null}
      {status === 'error' ? <Text style={styles.muted}>Photo labels unavailable. Continue normally.</Text> : null}
      {status === 'rate-limited' ? (
        <Text style={styles.muted}>Photo label limit reached for today. Continue normally.</Text>
      ) : null}
      {status === 'payload-too-large' ? (
        <Text style={styles.muted}>Photo labels unavailable for this image. Continue normally.</Text>
      ) : null}
      {labels.length === 0 ? (
        <Pressable
          style={styles.secondaryButton}
          onPress={onAnalyze}
          disabled={status === 'loading'}>
          <Text style={styles.secondaryButtonText}>Analyze photo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function showPhotoLabelDetails(label: PhotoVisionResult['suggestedLabels'][number]) {
  Alert.alert(
    label.label,
    `${Math.round(label.confidence * 100)}% confidence\n\n${label.evidence}`
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    padding: 12,
  },
  progressItem: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
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
    fontSize: 12,
    fontWeight: '700',
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
    position: 'relative',
    width: '20%',
  },
  raccoonSprite: {
    height: '100%',
    width: '100%',
  },
  raccoonLeaves: {
    alignItems: 'flex-end',
    bottom: 4,
    flexDirection: 'row',
    gap: 3,
    left: '58%',
    pointerEvents: 'none',
    position: 'absolute',
  },
  raccoonLeaf: {
    borderRadius: 5,
    height: 5,
    transform: [{ rotate: '-18deg' }],
    width: 8,
  },
  raccoonLeafGold: {
    backgroundColor: '#e0a129',
  },
  raccoonLeafOrange: {
    backgroundColor: '#d56b2d',
  },
  raccoonLeafRed: {
    backgroundColor: '#a9432f',
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
  photoLabelsCard: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 14,
  },
  photoLabelsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  labelChip: {
    alignItems: 'center',
    backgroundColor: '#e9f5f9',
    borderColor: '#b8dce8',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  labelChipText: {
    color: '#1d1d1f',
    fontSize: 14,
    fontWeight: '800',
  },
  labelChipScore: {
    color: '#0a7ea4',
    fontSize: 12,
    fontWeight: '800',
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
  emailTo: {
    color: '#1d1d1f',
    fontSize: 16,
    fontWeight: '700',
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
