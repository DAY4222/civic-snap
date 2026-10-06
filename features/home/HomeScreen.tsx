import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Notice, Screen, colors } from '@/components/ui';
import { pickReportPhoto } from '@/features/report/photoPicker';
import { RaccoonSprite } from '@/features/report/RaccoonSprite';

/** The Report tab: start a report with a photo, or without one. */
export function HomeScreen() {
  const [busy, setBusy] = useState(false);

  async function startWithPhoto(source: 'camera' | 'library') {
    if (busy) return;

    setBusy(true);
    try {
      const photo = await pickReportPhoto(source);
      if (photo) router.push({ pathname: '/report/new', params: { photo: photo.uri } });
    } finally {
      setBusy(false);
    }
  }

  function startWithoutPhoto() {
    router.push({ pathname: '/report/new', params: { start: 'manual' } });
  }

  return (
    <Screen contentContainerStyle={styles.stack}>
      <View>
        <Text style={styles.eyebrow}>Civic Snap</Text>
        <RaccoonSprite style={styles.raccoon} />
        <Text style={styles.title}>Snap. Pin. Send to 311.</Text>
        <Text style={styles.subtitle}>Create a strong report in a few focused steps.</Text>
      </View>
      <Notice text="For emergencies or immediate danger, use emergency services instead of this app." />
      <Button
        disabled={busy}
        icon={<FontAwesome name="camera" size={22} color="#fff" />}
        onPress={() => startWithPhoto('camera')}
        title="Take photo"
      />
      <View style={styles.buttonRow}>
        <Button
          disabled={busy}
          onPress={startWithoutPhoto}
          style={styles.rowButton}
          title="Report without photo"
          variant="secondary"
        />
        <Button
          disabled={busy}
          onPress={() => startWithPhoto('library')}
          style={styles.rowButton}
          title="Choose photo"
          variant="secondary"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  raccoon: {
    aspectRatio: 1,
    marginTop: 12,
    maxWidth: 92,
    minWidth: 64,
    width: '20%',
  },
  rowButton: {
    flex: 1,
  },
  stack: {
    gap: 16,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 10,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: 8,
  },
});
