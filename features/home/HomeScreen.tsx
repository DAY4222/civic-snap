import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, colors, radius } from '@/components/ui';
import { pickReportPhoto, type PhotoSource } from '@/features/report/photoPicker';
import { RaccoonSprite } from '@/features/report/RaccoonSprite';
import { formatRelativeTime } from '@/lib/relativeTime';
import { lowercaseRelative } from '@/lib/reportTracking';
import type { Report } from '@/lib/types';
import { useReportsOnFocus } from '@/lib/useReportsOnFocus';

/** The Report tab: pick up the last draft, or start a report with or without a photo. */
export function HomeScreen() {
  const [busy, setBusy] = useState(false);
  const { reports } = useReportsOnFocus();
  const latestDraft = useMemo(() => findLatestDraft(reports), [reports]);

  async function startWithPhoto(source: PhotoSource) {
    if (busy) return;

    setBusy(true);
    try {
      const photo = await pickReportPhoto(source);
      if (!photo) return;

      router.push({
        pathname: '/report/new',
        params: {
          photo: photo.uri,
          photoSource: photo.source,
          ...(photo.gps
            ? { photoLat: String(photo.gps.latitude), photoLng: String(photo.gps.longitude) }
            : {}),
        },
      });
    } finally {
      setBusy(false);
    }
  }

  function startWithoutPhoto() {
    router.push({ pathname: '/report/new', params: { start: 'manual' } });
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.top}>
        <View>
          <Text style={styles.eyebrow}>Civic Snap</Text>
          <RaccoonSprite style={styles.raccoon} />
          <Text accessibilityRole="header" style={styles.title}>
            Snap. Pin. Send to 311.
          </Text>
          <Text style={styles.subtitle}>Create a strong report in a few focused steps.</Text>
        </View>
        {latestDraft ? <ContinueDraftCard report={latestDraft} /> : null}
      </View>

      {/* At the bottom, within thumb reach. */}
      <View style={styles.actions}>
        <Button
          disabled={busy}
          icon={<FontAwesome name="camera" size={22} color="#fff" />}
          onPress={() => startWithPhoto('camera')}
          title="Take photo"
        />
        <Button
          disabled={busy}
          icon={<FontAwesome name="picture-o" size={20} color={colors.text} />}
          onPress={() => startWithPhoto('library')}
          title="Choose from library"
          variant="secondary"
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          hitSlop={8}
          onPress={startWithoutPhoto}
          style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}>
          <Text style={styles.textLinkText}>Report without a photo</Text>
        </Pressable>
        <Text style={styles.emergency}>Emergency or danger right now? Call 911.</Text>
      </View>
    </Screen>
  );
}

function ContinueDraftCard({ report }: { report: Report }) {
  const title = report.category || 'General 311 report';
  const edited = formatRelativeTime(report.updatedAt);
  const thumbnail = report.thumbnailUri ?? report.photoUri;

  return (
    <Pressable
      accessibilityHint="Opens the draft where you left off"
      accessibilityLabel={`Continue your draft: ${title}${edited ? `, edited ${edited}` : ''}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/report/new', params: { resumeId: report.id } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.draftCard}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.draftThumbnail} />
        ) : (
          <View style={[styles.draftThumbnail, styles.draftIcon]}>
            <FontAwesome name="file-text-o" size={20} color={colors.primary} />
          </View>
        )}
        <View style={styles.draftText}>
          <Text style={styles.draftEyebrow}>Continue your draft</Text>
          <Text numberOfLines={1} style={styles.draftTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.draftMeta}>
            {/* Time first: it always fits, and a long address truncates after it. */}
            {[edited && `Edited ${lowercaseRelative(edited)}`, report.address].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <FontAwesome name="chevron-right" size={14} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

function findLatestDraft(reports: Report[]) {
  return (
    reports
      .filter((report) => report.status === 'draft')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    paddingTop: 24,
  },
  draftCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  draftEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  draftIcon: {
    alignItems: 'center',
    backgroundColor: colors.infoBackground,
    justifyContent: 'center',
  },
  draftMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  draftText: {
    flex: 1,
    gap: 2,
  },
  draftThumbnail: {
    borderRadius: radius.md,
    height: 56,
    width: 56,
  },
  draftTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emergency: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.7,
  },
  raccoon: {
    aspectRatio: 1,
    marginTop: 12,
    maxWidth: 92,
    minWidth: 64,
    width: '20%',
  },
  screen: {
    justifyContent: 'space-between',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 10,
  },
  textLink: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  textLinkText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: 8,
  },
  top: {
    gap: 20,
  },
});
