import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EMPTY_PROFILE, completeOnboarding, loadProfile, saveProfile } from '@/lib/profile';
import { Profile } from '@/lib/types';

const LOGO = require('../assets/images/icon.png');

export default function OnboardingScreen() {
  const [phase, setPhase] = useState<'brand' | 'profile'>('brand');
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const brandOpacity = useRef(new Animated.Value(1)).current;
  const profileOpacity = useRef(new Animated.Value(0)).current;
  const hasContactInfo = Boolean(profile.name.trim() || profile.phone.trim());

  useEffect(() => {
    loadProfile().then(setProfile).catch(() => setProfile(EMPTY_PROFILE));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(brandOpacity, {
        duration: 180,
        toValue: 0,
        useNativeDriver: true,
      }).start(() => {
        setPhase('profile');
        Animated.timing(profileOpacity, {
          duration: 220,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
    }, 650);

    return () => clearTimeout(timer);
  }, [brandOpacity, profileOpacity]);

  async function finish(shouldSaveProfile: boolean) {
    if (busy) return;

    setBusy(true);
    try {
      if (shouldSaveProfile) {
        await saveProfile({
          ...profile,
          name: profile.name.trim(),
          phone: profile.phone.trim(),
        });
      }

      await completeOnboarding();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'brand') {
    return (
      <View style={styles.brandContainer}>
        <Animated.View style={[styles.brandLockup, { opacity: brandOpacity }]}>
          <Image source={LOGO} resizeMode="contain" style={styles.logo} />
          <Text style={styles.brandTitle}>Civic Snap</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.profileCard, { opacity: profileOpacity }]}>
          <View>
            <Text style={styles.eyebrow}>Optional</Text>
            <Text style={styles.title}>Add contact info for 311 follow-up</Text>
            <Text style={styles.subtitle}>
              Civic Snap can include your name and phone number in the 311 email it prepares. You can skip this and add
              it later in Settings.
            </Text>
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Stored on this device. Included only in email drafts you choose to send.
            </Text>
          </View>

          <Field
            label="Name"
            value={profile.name}
            onChangeText={(name) => setProfile((current) => ({ ...current, name }))}
            textContentType="name"
          />
          <Field
            label="Phone"
            value={profile.phone}
            onChangeText={(phone) => setProfile((current) => ({ ...current, phone }))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />

          <Pressable style={styles.primaryButton} onPress={() => finish(hasContactInfo)} disabled={busy}>
            <Text style={styles.primaryButtonText}>{hasContactInfo ? 'Save and continue' : 'Continue to report'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => finish(false)} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Skip for now</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  textContentType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'phone-pad';
  textContentType?: 'name' | 'telephoneNumber';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={label === 'Name' ? 'words' : 'none'}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        style={styles.input}
        textContentType={textContentType}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  brandContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  brandLockup: {
    alignItems: 'center',
    gap: 18,
  },
  logo: {
    height: 96,
    width: 96,
  },
  brandTitle: {
    color: '#1d1d1f',
    fontSize: 28,
    fontWeight: '800',
  },
  container: {
    backgroundColor: '#f5f5f7',
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  profileCard: {
    gap: 16,
  },
  eyebrow: {
    color: '#0a7ea4',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#1d1d1f',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 35,
    marginTop: 8,
  },
  subtitle: {
    color: '#636366',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  notice: {
    backgroundColor: '#e9f5f9',
    borderRadius: 14,
    padding: 14,
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
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0a7ea4',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: '#1d1d1f',
    fontSize: 16,
    fontWeight: '800',
  },
});
