import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Field, Screen, colors } from '@/components/ui';
import { loadPhotoAnalysisEnabled, savePhotoAnalysisEnabled } from '@/lib/photoAnalysisSettings';
import { EMPTY_PROFILE, loadProfile, saveProfile } from '@/lib/profile';
import { Profile } from '@/lib/types';
import { canAnalyzePhotoLabels } from '@/lib/vision';

export default function SettingsScreen() {
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
    await saveProfile(profile);
    router.back();
  }

  async function updatePhotoAnalysisEnabled(enabled: boolean) {
    setPhotoAnalysisEnabled(enabled);
    await savePhotoAnalysisEnabled(enabled);
  }

  return (
    <Screen contentContainerStyle={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>
        Optional contact info included in 311 email drafts you choose to send. Stored on this device.
      </Text>
      <Field
        label="Name"
        value={profile.name}
        onChangeText={(name) => setProfile((current) => ({ ...current, name }))}
      />
      <Field
        label="Email"
        value={profile.email}
        onChangeText={(email) => setProfile((current) => ({ ...current, email }))}
      />
      <Field
        label="Phone"
        value={profile.phone}
        onChangeText={(phone) => setProfile((current) => ({ ...current, phone }))}
      />
      <Button onPress={save} title="Save profile" />
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
            disabled={!photoAnalysisAvailable}
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
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
});
