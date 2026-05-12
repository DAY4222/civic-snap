import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

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
          <FontAwesome name="inbox" size={28} color="#8e8e93" />
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
            <Image source={{ uri: item.photoUri }} style={styles.thumbnail} />
          ) : (
            <View style={styles.iconBox}>
              <FontAwesome name="file-text-o" size={20} color="#0a7ea4" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.category}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{item.address || 'No address'}</Text>
            <Text style={styles.status}>{item.status === 'Draft' ? 'Resume draft' : item.status}</Text>
          </View>
          <FontAwesome name="chevron-right" size={14} color="#8e8e93" />
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
    backgroundColor: '#f5f5f7',
    flexGrow: 1,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    color: '#1d1d1f',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#636366',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: '#1d1d1f',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  thumbnail: {
    backgroundColor: '#d1d1d6',
    borderRadius: 10,
    height: 58,
    width: 58,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: '#e9f5f9',
    borderRadius: 10,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  cardTitle: {
    color: '#1d1d1f',
    fontSize: 16,
    fontWeight: '800',
  },
  status: {
    color: '#0a7ea4',
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
    color: '#1d1d1f',
    fontSize: 18,
    fontWeight: '800',
  },
});
