import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MapView, { Marker } from '@/components/CivicMap';
import { listReports } from '@/lib/reports';
import { Report } from '@/lib/types';

export default function MapScreen() {
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
        <Text style={styles.subtitle}>
          Showing {pinnedReports.length} report pin{pinnedReports.length === 1 ? '' : 's'} with GPS coordinates.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f7',
    flex: 1,
  },
  map: {
    flex: 1,
  },
  panel: {
    backgroundColor: '#fff',
    borderTopColor: '#d1d1d6',
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  title: {
    color: '#1d1d1f',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#636366',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
});
