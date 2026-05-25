import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Field } from '@/components/CivicUI';
import { colors, spacing } from '@/constants/ui';
import { successHaptic } from '@/lib/haptics';
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
    successHaptic();
    router.back();
  }

  async function updatePhotoAnalysisEnabled(enabled: boolean) {
    setPhotoAnalysisEnabled(enabled);
    await savePhotoAnalysisEnabled(enabled);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
      <Button label="Save profile" onPress={save} />
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
      <Button label="Done" onPress={() => router.back()} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.xl,
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
    gap: spacing.sm,
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
    gap: spacing.md,
  },
});
