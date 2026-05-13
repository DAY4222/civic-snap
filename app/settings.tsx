import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EMPTY_PROFILE, loadProfile, saveProfile } from '@/lib/profile';
import { Profile } from '@/lib/types';

export default function SettingsScreen() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);

  useEffect(() => {
    loadProfile().then(setProfile).catch(() => setProfile(EMPTY_PROFILE));
  }, []);

  async function save() {
    await saveProfile(profile);
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>
        Optional contact info included in 311 email drafts you choose to send. Stored on this device.
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Photo analysis</Text>
        <Text style={styles.noticeText}>
          When photo labels are enabled, tapping Analyze photo sends a resized copy of the photo to Civic Snap's AI service for label suggestions. Server logs may retain analysis results for 30 days, but photos are not stored there.
        </Text>
      </View>
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
  notice: {
    backgroundColor: '#e9f5f9',
    borderRadius: 14,
    gap: 6,
    padding: 14,
  },
  noticeTitle: {
    color: '#1d1d1f',
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    color: '#2f3a40',
    fontSize: 14,
    lineHeight: 20,
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
});
