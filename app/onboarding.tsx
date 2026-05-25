import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, Field, Notice } from '@/components/CivicUI';
import { colors, radius, spacing } from '@/constants/ui';
import { successHaptic } from '@/lib/haptics';
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
      successHaptic();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'brand') {
    return (
      <View style={styles.brandContainer}>
        <Animated.View style={[styles.brandLockup, { opacity: brandOpacity }]}>
          <Image source={LOGO} contentFit="contain" style={styles.logo} />
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

          <Notice text="Stored on this device. Included only in email drafts you choose to send." />

          <Field
            label="Name"
            value={profile.name}
            onChangeText={(name) => setProfile((current) => ({ ...current, name }))}
            autoCapitalize="words"
            textContentType="name"
          />
          <Field
            label="Phone"
            value={profile.phone}
            onChangeText={(phone) => setProfile((current) => ({ ...current, phone }))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />

          <Button
            disabled={busy}
            label={hasContactInfo ? 'Save and continue' : 'Continue to report'}
            onPress={() => finish(hasContactInfo)}
          />
          <Button disabled={busy} label="Skip for now" onPress={() => finish(false)} variant="quiet" />
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brandContainer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    flex: 1,
    justifyContent: 'center',
  },
  brandLockup: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  logo: {
    height: 96,
    width: 96,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  profileCard: {
    borderRadius: radius.card,
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 35,
    marginTop: 8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
});
