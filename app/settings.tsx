import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Field, Screen, colors } from '@/components/ui';
import { loadPhotoAnalysisEnabled, savePhotoAnalysisEnabled } from '@/lib/photoAnalysisSettings';
import { EMPTY_PROFILE, loadProfile, saveProfile } from '@/lib/profile';
import { Profile } from '@/lib/types';
import { canAnalyzePhotoLabels } from '@/lib/vision';

export default function SettingsScreen() {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [photoAnalysisEnabled, setPhotoAnalysisEnabled] = useState(false);
  const photoAnalysisAvailable = canAnalyzePhotoLabels();

  useEffect(() => {
    loadProfile().then(setProfile).catch(() => setProfile(EMPTY_PROFILE));
    loadPhotoAnalysisEnabled()
      .then(setPhotoAnalysisEnabled)
      .catch(() => setPhotoAnalysisEnabled(false));
  }, []);

  async function save() {
    if (busy) return;

    setBusy(true);
    setErrorMessage('');
    try {
      await saveProfile({
        ...profile,
        email: profile.email.trim(),
        name: profile.name.trim(),
        phone: profile.phone.trim(),
      });
      router.back();
    } catch {
      setErrorMessage('Profile was not saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function updatePhotoAnalysisEnabled(enabled: boolean) {
    setPhotoAnalysisEnabled(enabled);
    setErrorMessage('');
    try {
      await savePhotoAnalysisEnabled(enabled);
    } catch {
      setPhotoAnalysisEnabled(!enabled);
      setErrorMessage('Photo analysis setting was not saved. Try again.');
    }
  }

  return (
    <Screen contentContainerStyle={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>
        Optional contact info included in 311 email drafts you choose to send. Stored on this device.
      </Text>
      {Platform.OS === 'web' ? (
        <Text style={styles.warningText}>
          On web, this profile is stored in this browser's local storage. Use a private device for sensitive reports.
        </Text>
      ) : null}
      <Field
        autoCapitalize="words"
        label="Name"
        value={profile.name}
        onChangeText={(name) => setProfile((current) => ({ ...current, name }))}
        returnKeyType="next"
        textContentType="name"
      />
      <Field
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        label="Email"
        value={profile.email}
        onChangeText={(email) => setProfile((current) => ({ ...current, email }))}
        returnKeyType="next"
        textContentType="emailAddress"
      />
      <Field
        autoComplete="tel"
        keyboardType="phone-pad"
        label="Phone"
        value={profile.phone}
        onChangeText={(phone) => setProfile((current) => ({ ...current, phone }))}
        textContentType="telephoneNumber"
      />
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <Button disabled={busy} loading={busy} onPress={save} title="Save profile" />
      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Photo analysis</Text>
            <Text style={styles.subtitle}>
              When enabled, Civic Snap can send a resized photo copy to suggest report topics. Your saved report photo stays on this device.
            </Text>
          </View>
          <Switch
            value={photoAnalysisAvailable && photoAnalysisEnabled}
            onValueChange={updatePhotoAnalysisEnabled}
            disabled={!photoAnalysisAvailable || busy}
          />
        </View>
        {!photoAnalysisAvailable ? (
          <Text style={styles.subtitle}>Photo analysis is unavailable in this build.</Text>
        ) : null}
      </Card>
      <Button onPress={() => router.back()} title="Done" variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    gap: 10,
    padding: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  warningText: {
    color: colors.mutedStrong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
});
