import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getReport, updateCaseNumber } from '@/lib/reports';
import { Report } from '@/lib/types';

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [caseNumber, setCaseNumber] = useState('');

  useEffect(() => {
    if (!id) return;
    getReport(id).then((row) => {
      setReport(row);
      setCaseNumber(row?.caseNumber ?? '');
    });
  }, [id]);

  async function saveCaseNumber() {
    if (!id) return;
    await updateCaseNumber(id, caseNumber.trim());
    const refreshed = await getReport(id);
    setReport(refreshed);
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>Report not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {report.photoUri ? <Image source={{ uri: report.photoUri }} style={styles.photo} /> : null}
      <View style={styles.card}>
        <Text style={styles.title}>{report.category}</Text>
        <Text style={styles.subtitle}>{report.address || 'No address'}</Text>
        <View style={styles.statusPill}>
          <FontAwesome name="circle" size={8} color="#0a7ea4" />
          <Text style={styles.statusText}>{report.status}</Text>
        </View>
        {report.status === 'Draft' ? (
          <Pressable
            style={styles.resumeButton}
            onPress={() => router.push({ pathname: '/', params: { resumeId: report.id } })}>
            <Text style={styles.resumeButtonText}>Resume draft</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Case number</Text>
        <Text style={styles.subtitle}>Add the 311 case number if one is returned by email.</Text>
        <TextInput
          value={caseNumber}
          onChangeText={setCaseNumber}
          placeholder="Example: SR-2026-000123"
          style={styles.input}
        />
        <Pressable style={styles.button} onPress={saveCaseNumber}>
          <Text style={styles.buttonText}>Save case number</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Email draft</Text>
        <Text style={styles.emailText}>Subject: {report.emailSubject}</Text>
        <Text style={styles.emailText}>{'\n'}{report.emailBody}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f7',
    flexGrow: 1,
    gap: 16,
    padding: 20,
    paddingBottom: 48,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  photo: {
    backgroundColor: '#d1d1d6',
    borderRadius: 16,
    height: 240,
    width: '100%',
  },
  card: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 16,
  },
  title: {
    color: '#1d1d1f',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#636366',
    fontSize: 15,
    lineHeight: 22,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#e9f5f9',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    color: '#0a7ea4',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#1d1d1f',
    fontSize: 17,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#d1d1d6',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#1d1d1f',
    fontSize: 16,
    padding: 14,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
  },
  resumeButton: {
    alignItems: 'center',
    backgroundColor: '#1d1d1f',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 50,
  },
  resumeButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  emailText: {
    color: '#1d1d1f',
    fontFamily: 'SpaceMono',
    fontSize: 12,
    lineHeight: 18,
  },
});
