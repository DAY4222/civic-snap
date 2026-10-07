import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, colors, radius } from '@/components/ui';
import { RaccoonSprite } from '@/features/report/RaccoonSprite';
import { useAppState } from '@/lib/appState';
import { CITY } from '@/lib/city';

const STEPS: { icon: 'camera' | 'envelope-o' | 'paper-plane-o'; text: string }[] = [
  { icon: 'camera', text: 'Take a photo of the problem and pin where it is.' },
  { icon: 'envelope-o', text: `Civic Snap writes the ${CITY.name} 311 email for you.` },
  { icon: 'paper-plane-o', text: 'You check it and send it from your own email app.' },
];

/** First launch: what the app does and what stays private, then straight to reporting. */
export default function OnboardingScreen() {
  const app = useAppState();
  const [busy, setBusy] = useState(false);

  async function getStarted() {
    if (busy) return;
    setBusy(true);
    try {
      // The root stack opens the app once onboarding is marked complete.
      await app.completeOnboarding();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <RaccoonSprite style={styles.raccoon} />
          <Text accessibilityRole="header" style={styles.title}>
            Civic Snap
          </Text>
          <Text style={styles.subtitle}>Report a city problem in about a minute.</Text>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step.icon} style={styles.step}>
              <View style={styles.stepIcon}>
                <FontAwesome color={colors.primary} name={step.icon} size={20} />
              </View>
              <Text style={styles.stepText}>
                <Text style={styles.stepNumber}>{index + 1}. </Text>
                {step.text}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.privacy}>
          <FontAwesome color={colors.mutedStrong} name="lock" size={16} />
          <Text style={styles.privacyText}>
            Your reports stay on this phone. AI help is optional and always asks first.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button loading={busy} onPress={getStarted} title="Get started" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: 28,
    justifyContent: 'center',
    padding: 24,
  },
  footer: {
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
  },
  privacy: {
    alignItems: 'flex-start',
    backgroundColor: colors.infoBackground,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  privacyText: {
    color: colors.mutedStrong,
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  raccoon: {
    aspectRatio: 1,
    width: 112,
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  step: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  stepIcon: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepNumber: {
    color: colors.primary,
    fontWeight: '800',
  },
  stepText: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    lineHeight: 23,
  },
  steps: {
    gap: 16,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
});
