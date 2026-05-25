import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, Screen, colors } from '@/components/ui';
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
    <Screen contentContainerStyle={styles.container}>
      {report.photoUri ? <Image source={{ uri: report.photoUri }} style={styles.photo} /> : null}
      <Card style={styles.card}>
        <Text style={styles.title}>{report.category}</Text>
        <Text style={styles.subtitle}>{report.address || 'No address'}</Text>
        <View style={styles.statusPill}>
          <FontAwesome name="circle" size={8} color={colors.primary} />
          <Text style={styles.statusText}>{report.status}</Text>
        </View>
        {report.status === 'Draft' ? (
          <Button
            onPress={() => router.push({ pathname: '/', params: { resumeId: report.id } })}
            title="Resume draft"
            variant="dark"
          />
        ) : null}
      </Card>
      {report.photoIssueTopic ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Selected photo evidence</Text>
          <Text style={styles.subtitle}>{report.photoIssueTopic.title}</Text>
          <Text style={styles.matchText}>{confidenceTierText(report.photoIssueTopic.confidenceTier)}</Text>
          {report.photoIssueTopic.evidenceChips.length > 0 ? (
            <View style={styles.chipRow}>
              {report.photoIssueTopic.evidenceChips.map((chip) => (
                <Text key={chip} style={styles.evidenceChip}>{chip}</Text>
              ))}
            </View>
          ) : null}
          {report.photoIssueTopic.reason ? (
            <Text style={styles.subtitle}>{report.photoIssueTopic.reason}</Text>
          ) : null}
        </Card>
      ) : null}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Case number</Text>
        <Text style={styles.subtitle}>Add the 311 case number if one is returned by email.</Text>
        <Field
          label="Case number"
          onChangeText={setCaseNumber}
          placeholder="Example: SR-2026-000123"
          value={caseNumber}
        />
        <Button onPress={saveCaseNumber} title="Save case number" />
      </Card>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Email draft</Text>
        <Text style={styles.emailText}>Subject: {report.emailSubject}</Text>
        <Text style={styles.emailText}>{'\n'}{report.emailBody}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  photo: {
    backgroundColor: colors.border,
    borderRadius: 16,
    height: 240,
    width: '100%',
  },
  card: {
    gap: 10,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.infoBackground,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  matchText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  evidenceChip: {
    backgroundColor: colors.infoBackground,
    borderRadius: 999,
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  emailText: {
    color: colors.text,
    fontFamily: 'SpaceMono',
    fontSize: 12,
    lineHeight: 18,
  },
});

function confidenceTierText(tier: string) {
  if (tier === 'strong') return 'Strong match';
  if (tier === 'likely') return 'Likely match';
  return 'Possible match';
}
