import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, radius } from '@/components/ui';
import type { PhotoIssueCandidate } from '@/lib/types';

import { StepHeader } from './ReportWizardStepViews';
import type { PhotoVisionStatus, SuggestStepMode } from './reportWizardState';
import { styles as wizardStyles } from './reportWizardStyles';
import { confidenceTierText, photoSuggestionFallbackText } from './suggestionCopy';

/** How long the photo check runs before the user is offered to continue without it. */
const CONTINUE_WITHOUT_WAITING_MS = 6000;

type SuggestStepProps = {
  mode: SuggestStepMode;
  onBack: () => void;
  onChooseLater: () => void;
  onChooseTopic: (topic: PhotoIssueCandidate) => void;
  onDecline: () => void;
  onEnable: () => Promise<void> | void;
  onExit: () => void;
  onRetry: () => void;
  onSearch: () => void;
  photoUri: string | null;
  selectedTopic: PhotoIssueCandidate | null;
  status: PhotoVisionStatus;
  topics: PhotoIssueCandidate[];
};

/** The first step after a photo: what the photo shows, as a suggested 311 issue type. */
export function SuggestStep(props: SuggestStepProps) {
  const { mode, onBack, onExit, photoUri } = props;

  return (
    <View style={wizardStyles.stack}>
      <StepHeader title="What's the issue?" onBack={onBack} onExit={onExit} />
      {photoUri ? (
        <Image accessibilityIgnoresInvertColors source={{ uri: photoUri }} style={styles.photo} />
      ) : null}
      {mode === 'opt-in' ? <OptIn {...props} /> : null}
      {mode === 'loading' ? <Checking {...props} /> : null}
      {mode === 'ready' ? <Suggestions {...props} /> : null}
      {mode === 'failed' ? <Failed {...props} /> : null}
    </View>
  );
}

function OptIn({ onDecline, onEnable }: SuggestStepProps) {
  const [enabling, setEnabling] = useState(false);

  async function enable() {
    setEnabling(true);
    try {
      await onEnable();
    } finally {
      setEnabling(false);
    }
  }

  return (
    <Card style={styles.card}>
      <Text style={wizardStyles.cardTitle}>Get a suggestion from your photo</Text>
      <Text style={wizardStyles.muted}>
        Civic Snap can send a resized copy of this photo to AI to suggest the 311 issue type. Your
        saved photo stays on this device.
      </Text>
      <Button loading={enabling} onPress={enable} title="Turn on photo suggestions" />
      <Button
        accessibilityHint="Choose the issue type yourself. You can turn suggestions on later in Settings."
        onPress={onDecline}
        title="Not now"
        variant="secondary"
      />
    </Card>
  );
}

function Checking({ onChooseLater, onSearch }: SuggestStepProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), CONTINUE_WITHOUT_WAITING_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.checkingRow}>
          <ActivityIndicator />
          <Text accessibilityLiveRegion="polite" style={wizardStyles.cardTitle}>
            Checking the photo…
          </Text>
        </View>
        <View style={[styles.skeletonLine, styles.skeletonWide]} />
        <View style={[styles.skeletonLine, styles.skeletonNarrow]} />
        <View style={styles.skeletonChips}>
          <View style={styles.skeletonChip} />
          <View style={styles.skeletonChip} />
        </View>
      </Card>
      {slow ? (
        <>
          <Text style={wizardStyles.muted}>
            This is taking a while. Suggestions will appear on the Details step when they are ready.
          </Text>
          <Button onPress={onChooseLater} title="Continue without waiting" />
        </>
      ) : null}
      <Button onPress={onSearch} title="Skip, I'll choose" variant="secondary" />
    </>
  );
}

function Suggestions({
  onChooseLater,
  onChooseTopic,
  onSearch,
  selectedTopic,
  topics,
}: SuggestStepProps) {
  const [best, ...others] = topics;
  if (!best) return null;

  return (
    <>
      <Card selected style={styles.card}>
        <Text style={wizardStyles.eyebrow}>Looks like</Text>
        <Text accessibilityRole="header" style={styles.bestTitle}>
          {best.title}
        </Text>
        <Text style={wizardStyles.matchText}>{confidenceTierText(best.confidenceTier)}</Text>
        {best.evidenceChips.length > 0 ? (
          <View style={wizardStyles.chipRow}>
            {best.evidenceChips.map((chip) => (
              <Text key={chip} style={wizardStyles.evidenceChip}>
                {chip}
              </Text>
            ))}
          </View>
        ) : null}
        {best.reason ? <Text style={wizardStyles.evidenceText}>{best.reason}</Text> : null}
        <Button
          accessibilityLabel={`That's it: ${best.title}`}
          onPress={() => onChooseTopic(best)}
          title="That's it"
        />
      </Card>

      {others.length > 0 ? (
        <View style={styles.others}>
          <Text style={wizardStyles.sectionTitle}>Or maybe</Text>
          {others.map((topic) => {
            const selected = selectedTopic?.issueId === topic.issueId;
            return (
              <Pressable
                accessibilityHint={topic.reason}
                accessibilityLabel={`${topic.title}, ${confidenceTierText(topic.confidenceTier)}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={topic.issueId}
                onPress={() => onChooseTopic(topic)}
                style={({ pressed }) => [
                  styles.otherRow,
                  selected && styles.otherRowSelected,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.otherText}>
                  <Text style={wizardStyles.topicTitle}>{topic.title}</Text>
                  <Text style={wizardStyles.matchText}>
                    {confidenceTierText(topic.confidenceTier)}
                  </Text>
                </View>
                <FontAwesome color={colors.muted} name="chevron-right" size={14} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Button onPress={onSearch} title="Something else" variant="secondary" />
      <ChooseLaterLink onPress={onChooseLater} />
    </>
  );
}

function Failed({ onChooseLater, onRetry, onSearch, status }: SuggestStepProps) {
  const canRetry = status === 'error' || status === 'offline';

  return (
    <>
      <Card style={styles.card}>
        <Text style={wizardStyles.cardTitle}>No suggestion this time</Text>
        <Text style={wizardStyles.muted}>{photoSuggestionFallbackText(status)}</Text>
        {canRetry ? <Button onPress={onRetry} title="Try again" variant="secondary" /> : null}
      </Card>
      <Button onPress={onSearch} title="Search issue types" />
      <ChooseLaterLink onPress={onChooseLater} />
    </>
  );
}

function ChooseLaterLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityHint="Continues to the location. You can pick the issue type on the Details step."
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.link}>
      <Text style={wizardStyles.inlineActionText}>Choose later</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bestTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  card: {
    gap: 12,
  },
  checkingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  otherRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  otherRowSelected: {
    borderColor: colors.primary,
  },
  otherText: {
    flex: 1,
    gap: 2,
  },
  others: {
    gap: 8,
  },
  photo: {
    backgroundColor: colors.border,
    borderRadius: radius.xl,
    height: 180,
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  skeletonChip: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    height: 28,
    width: 110,
  },
  skeletonChips: {
    flexDirection: 'row',
    gap: 8,
  },
  skeletonLine: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    height: 18,
  },
  skeletonNarrow: {
    width: '45%',
  },
  skeletonWide: {
    width: '80%',
  },
});
