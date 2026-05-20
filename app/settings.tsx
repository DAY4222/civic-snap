import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

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
      <Pressable style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Save profile</Text>
      </Pressable>
      <View style={styles.card}>
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
      </View>
      <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
        <Text style={styles.secondaryButtonText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f7',
    flexGrow: 1,
    gap: 16,
    padding: 20,
  },
  title: {
    color: '#1d1d1f',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#636366',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 14,
  },
  sectionTitle: {
    color: '#1d1d1f',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
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
  button: {
    alignItems: 'center',
    backgroundColor: '#0a7ea4',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 54,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 54,
  },
  secondaryButtonText: {
    color: '#1d1d1f',
    fontSize: 17,
    fontWeight: '800',
  },
});
