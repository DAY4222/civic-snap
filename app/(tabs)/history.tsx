import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { Card, colors } from '@/components/ui';
import { deleteReport } from '@/lib/reports';
import { useReportsOnFocus } from '@/lib/useReportsOnFocus';
import { Report } from '@/lib/types';

export default function HistoryScreen() {
  const { error, reports } = useReportsOnFocus();
  const [deletedDraftIds, setDeletedDraftIds] = useState(() => new Set<string>());
  const [deletingDraftIds, setDeletingDraftIds] = useState(() => new Set<string>());

  const sections = useMemo(() => {
    const visibleReports = reports.filter((report) => !deletedDraftIds.has(report.id));
    const drafts = visibleReports.filter((report) => report.status === 'Draft');
    const opened = visibleReports.filter((report) => report.status !== 'Draft');
    return [
      { title: 'Drafts', data: drafts },
      { title: 'Tracking', data: opened },
    ].filter((section) => section.data.length > 0);
  }, [deletedDraftIds, reports]);

  function openReport(report: Report) {
    if (report.status === 'Draft') {
      router.push({ pathname: '/', params: { resumeId: report.id } });
      return;
    }

    router.push({ pathname: '/report/[id]', params: { id: report.id } });
  }

  function confirmDeleteDraft(report: Report) {
    if (deletingDraftIds.has(report.id)) return;

    Alert.alert('Delete draft?', 'This removes the draft and saved photo from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeDraft(report.id);
        },
      },
    ]);
  }

  async function removeDraft(id: string) {
    setDeletingDraftIds((current) => new Set(current).add(id));

    try {
      await deleteReport(id);
      setDeletedDraftIds((current) => new Set(current).add(id));
    } catch {
      Alert.alert('Draft not deleted', 'Try again from History.');
    } finally {
      setDeletingDraftIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Private history</Text>
          <Text style={styles.subtitle}>Drafts can be resumed. Sent handoffs stay available for tracking.</Text>
          {error ? <Text style={styles.errorText}>History could not be loaded.</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <FontAwesome name="inbox" size={28} color="#8e8e93" />
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.subtitle}>Create a report from the Report tab.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
        const isDraft = item.status === 'Draft';
        const deleting = deletingDraftIds.has(item.id);

        return (
          <Card style={styles.card}>
            <Pressable
              accessibilityLabel={`${isDraft ? 'Resume draft' : 'Open report'}: ${item.category}`}
              accessibilityRole="button"
              onPress={() => openReport(item)}
              style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}>
              {item.photoUri ? (
                <Image source={{ uri: item.thumbnailUri ?? item.photoUri }} style={styles.thumbnail} />
              ) : (
                <View style={styles.iconBox}>
                  <FontAwesome name="file-text-o" size={20} color={colors.primary} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.category}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{item.address || 'No address'}</Text>
                <Text style={styles.status}>{isDraft ? 'Resume draft' : item.status}</Text>
              </View>
              {isDraft ? null : <FontAwesome name="chevron-right" size={14} color="#8e8e93" />}
            </Pressable>
            {isDraft ? (
              <Pressable
                accessibilityLabel={`Delete draft: ${item.category}`}
                accessibilityRole="button"
                disabled={deleting}
                hitSlop={8}
                onPress={() => confirmDeleteDraft(item)}
                style={({ pressed }) => [
                  styles.deleteDraftButton,
                  pressed && !deleting && styles.pressed,
                  deleting && styles.disabled,
                ]}>
                <FontAwesome name="times" size={16} color={colors.danger} />
              </Pressable>
            ) : null}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 20,
    paddingBottom: 48,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  card: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  reportButton: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  pressed: {
    opacity: 0.72,
  },
  cardBody: {
    flex: 1,
  },
  deleteDraftButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  disabled: {
    opacity: 0.45,
  },
  thumbnail: {
    backgroundColor: colors.border,
    borderRadius: 10,
    height: 58,
    width: 58,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.infoBackground,
    borderRadius: 10,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  status: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 80,
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
});
