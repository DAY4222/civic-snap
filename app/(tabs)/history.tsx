import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { colors, hairline, radius, spacing } from '@/constants/ui';
import { listReports } from '@/lib/reports';
import { Report } from '@/lib/types';

export default function HistoryScreen() {
  const [reports, setReports] = useState<Report[]>([]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      listReports().then((rows) => {
        if (mounted) setReports(rows);
      });
      return () => {
        mounted = false;
      };
    }, [])
  );

  const sections = useMemo(() => {
    const drafts = reports.filter((report) => report.status === 'Draft');
    const opened = reports.filter((report) => report.status !== 'Draft');
    return [
      { title: 'Drafts', data: drafts },
      { title: 'Tracking', data: opened },
    ].filter((section) => section.data.length > 0);
  }, [reports]);

  function openReport(report: Report) {
    if (report.status === 'Draft') {
      router.push({ pathname: '/', params: { resumeId: report.id } });
      return;
    }

    router.push({ pathname: '/report/[id]', params: { id: report.id } });
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
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <FontAwesome name="inbox" size={28} color={colors.muted} />
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.subtitle}>Create a report from the Report tab.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => openReport(item)}>
          {item.photoUri ? (
            <Image source={{ uri: item.photoUri }} contentFit="cover" transition={150} style={styles.thumbnail} />
          ) : (
            <View style={styles.iconBox}>
              <FontAwesome name="file-text-o" size={20} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.category}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{item.address || 'No address'}</Text>
            <Text style={styles.status}>{item.status === 'Draft' ? 'Resume draft' : item.status}</Text>
          </View>
          <FontAwesome name="chevron-right" size={14} color={colors.muted} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: hairline,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  thumbnail: {
    backgroundColor: colors.border,
    borderRadius: radius.card,
    height: 58,
    width: 58,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
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
    gap: spacing.sm,
    paddingTop: 80,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
});
