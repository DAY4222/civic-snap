import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Field } from '@/components/CivicUI';
import { colors, radius, spacing } from '@/constants/ui';
import { successHaptic } from '@/lib/haptics';
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
    successHaptic();
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
      {report.photoUri ? <Image source={{ uri: report.photoUri }} contentFit="cover" transition={150} style={styles.photo} /> : null}
      <Card style={styles.card}>
        <Text style={styles.title}>{report.category}</Text>
        <Text style={styles.subtitle}>{report.address || 'No address'}</Text>
        <View style={styles.statusPill}>
          <FontAwesome name="circle" size={8} color={colors.primary} />
          <Text style={styles.statusText}>{report.status}</Text>
        </View>
        {report.status === 'Draft' ? (
          <Button
            label="Resume draft"
            onPress={() => router.push({ pathname: '/', params: { resumeId: report.id } })}
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
                <Chip key={chip}>{chip}</Chip>
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
          value={caseNumber}
          onChangeText={setCaseNumber}
          placeholder="Example: SR-2026-000123"
        />
        <Button label="Save case number" onPress={saveCaseNumber} />
      </Card>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Email draft</Text>
        <Text style={styles.emailText}>Subject: {report.emailSubject}</Text>
        <Text style={styles.emailText}>{'\n'}{report.emailBody}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  photo: {
    backgroundColor: colors.border,
    borderRadius: radius.card,
    height: 240,
    width: '100%',
  },
  card: {
    gap: spacing.sm,
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
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
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
