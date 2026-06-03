import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MapView, { Marker } from '@/components/CivicMap';
import { Button, colors } from '@/components/ui';
import { useReportsOnFocus } from '@/lib/useReportsOnFocus';

export default function MapScreen() {
  const { error, reports } = useReportsOnFocus();

  const pinnedReports = reports.filter(
    (report) => report.latitude != null && report.longitude != null
  );
  const firstPin = pinnedReports[0];
  const region = useMemo(
    () => ({
      latitude: firstPin?.latitude ?? 43.6535,
      longitude: firstPin?.longitude ?? -79.3841,
      latitudeDelta: 0.025,
      longitudeDelta: 0.025,
    }),
    [firstPin]
  );

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        {pinnedReports.map((report) => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.latitude!, longitude: report.longitude! }}
            title={report.category}
            description={report.address}
            onCalloutPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}
          />
        ))}
      </MapView>
      <View style={styles.panel}>
        <Text style={styles.title}>Private map</Text>
        {error ? (
          <Text style={styles.subtitle}>Report pins could not be loaded.</Text>
        ) : pinnedReports.length === 0 ? (
          <>
            <Text style={styles.subtitle}>
              Reports appear here when they have saved GPS coordinates.
            </Text>
            <Button
              onPress={() => router.push('/')}
              style={styles.panelButton}
              textStyle={styles.panelButtonText}
              title="Start report"
              variant="secondary"
            />
          </>
        ) : (
          <Text style={styles.subtitle}>
            Showing {pinnedReports.length} report pin{pinnedReports.length === 1 ? '' : 's'} with GPS coordinates.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  map: {
    flex: 1,
  },
  panel: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  panelButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  panelButtonText: {
    fontSize: 15,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
});
