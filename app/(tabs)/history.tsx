import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Button, colors, radius } from '@/components/ui';
import { formatRelativeTime } from '@/lib/relativeTime';
import {
  getReportTimeLabel,
  getStatusChip,
  groupReportsForHistory,
  type StatusChip,
} from '@/lib/reportTracking';
import { deleteReport } from '@/lib/reports';
import { useReportsOnFocus } from '@/lib/useReportsOnFocus';
import { Report } from '@/lib/types';

export default function HistoryScreen() {
  const { error, reports } = useReportsOnFocus();
  const [deletedIds, setDeletedIds] = useState(() => new Set<string>());

  const sections = useMemo(
    () => groupReportsForHistory(reports.filter((report) => !deletedIds.has(report.id))),
    [deletedIds, reports]
  );

  function openReport(report: Report) {
    if (report.status === 'draft') {
      router.push({ pathname: '/report/new', params: { resumeId: report.id } });
      return;
    }

    router.push({ pathname: '/report/[id]', params: { id: report.id } });
  }

  /** Asks first; resolves true once the report is gone. */
  function confirmDelete(report: Report) {
    const isDraft = report.status === 'draft';
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        isDraft ? 'Delete draft?' : 'Delete report?',
        isDraft
          ? 'This removes the draft and its photo from this device.'
          : "This removes the report and its photo from this device. It doesn't cancel anything with 311.",
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteReport(report.id)
                .then(() => {
                  setDeletedIds((current) => new Set(current).add(report.id));
                  resolve(true);
                })
                .catch(() => {
                  Alert.alert('Not deleted', 'Try again.');
                  resolve(false);
                });
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Your reports</Text>
          <Text style={styles.subtitle}>Saved on this phone. Swipe left on a report to delete it.</Text>
          {error ? <Text style={styles.errorText}>History could not be loaded.</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <FontAwesome name="inbox" size={28} color="#8e8e93" />
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.subtitle}>Reports you start appear here, even unfinished ones.</Text>
          <Button
            onPress={() => router.push('/')}
            style={styles.emptyButton}
            textStyle={styles.emptyButtonText}
            title="Start a report"
            variant="secondary"
          />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <HistoryRow onDelete={() => confirmDelete(item)} onOpen={() => openReport(item)} report={item} />
      )}
      stickySectionHeadersEnabled={false}
    />
  );
}

function HistoryRow({
  onDelete,
  onOpen,
  report,
}: {
  onDelete: () => Promise<boolean>;
  onOpen: () => void;
  report: Report;
}) {
  const swipeable = useRef<SwipeableMethods>(null);
  const chip = getStatusChip(report);
  const title = report.category || 'General 311 report';
  const time = getReportTimeLabel(report, formatRelativeTime);
  const thumbnail = report.thumbnailUri ?? report.photoUri;

  async function deleteFromSwipe() {
    const deleted = await onDelete();
    if (!deleted) swipeable.current?.close();
  }

  return (
    <ReanimatedSwipeable
      friction={2}
      overshootRight={false}
      ref={swipeable}
      renderRightActions={() => (
        <Pressable
          accessibilityLabel={`Delete ${title}`}
          accessibilityRole="button"
          onPress={deleteFromSwipe}
          style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}>
          <FontAwesome name="trash-o" size={20} color="#fff" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </Pressable>
      )}
      rightThreshold={40}>
      <Pressable
        accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
        accessibilityHint={report.status === 'draft' ? 'Opens the draft' : 'Opens the report'}
        accessibilityLabel={`${title}, ${chip.label}, ${time}`}
        accessibilityRole="button"
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') void onDelete();
        }}
        onPress={onOpen}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
        ) : (
          <View style={styles.iconBox}>
            <FontAwesome name="file-text-o" size={20} color={colors.primary} />
          </View>
        )}
        <View style={styles.rowBody}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {report.address || 'No address'}
          </Text>
          <View style={styles.metaRow}>
            <Chip chip={chip} />
            <Text style={styles.time}>{time}</Text>
          </View>
        </View>
        <FontAwesome name="chevron-right" size={14} color="#8e8e93" />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const CHIP_COLORS: Record<StatusChip['tone'], { background: string; text: string }> = {
  neutral: { background: '#ececf0', text: colors.mutedStrong },
  primary: { background: colors.infoBackground, text: colors.primaryDark },
  success: { background: '#e3f4e8', text: '#1e6b35' },
  warning: { background: colors.warningBackground, text: '#7a4b00' },
};

function Chip({ chip }: { chip: StatusChip }) {
  const tone = CHIP_COLORS[chip.tone];
  return (
    <View style={[styles.chip, { backgroundColor: tone.background }]}>
      <Text numberOfLines={1} style={[styles.chipText, { color: tone.text }]}>
        {chip.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    maxWidth: 170,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: 12,
    padding: 20,
    paddingBottom: 48,
  },
  deleteAction: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
    gap: 4,
    justifyContent: 'center',
    marginLeft: 8,
    width: 88,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 80,
  },
  emptyButton: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  emptyButtonText: {
    fontSize: 15,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.infoBackground,
    borderRadius: 10,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  pressed: {
    opacity: 0.72,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  thumbnail: {
    backgroundColor: colors.border,
    borderRadius: 10,
    height: 58,
    width: 58,
  },
  time: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
});
