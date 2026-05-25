import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { Card, colors } from '@/components/ui';
import { useReportsOnFocus } from '@/lib/useReportsOnFocus';
import { Report } from '@/lib/types';

export default function HistoryScreen() {
  const { error, reports } = useReportsOnFocus();

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
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`${item.status === 'Draft' ? 'Resume draft' : 'Open report'}: ${item.category}`}
          accessibilityRole="button"
          onPress={() => openReport(item)}>
          <Card style={styles.card}>
            {item.photoUri ? (
              <Image source={{ uri: item.thumbnailUri ?? item.photoUri }} style={styles.thumbnail} />
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
            <FontAwesome name="chevron-right" size={14} color="#8e8e93" />
          </Card>
        </Pressable>
      )}
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
