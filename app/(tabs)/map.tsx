import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MapView, { Marker } from '@/components/CivicMap';
import { Button, colors } from '@/components/ui';
import { CITY, isWithinBounds } from '@/lib/city';
import { getReportStage, getStatusChip, type ReportStage } from '@/lib/reportTracking';
import type { Report } from '@/lib/types';
import { useReportsOnFocus } from '@/lib/useReportsOnFocus';

/** Marker colours by where the report stands; the legend below the map uses the same ones. */
const STAGE_COLORS: Record<ReportStage, string> = {
  draft: '#8e8e93',
  sent: colors.primary,
  case: '#2e8b57',
};

/**
 * Sent reports and saved cases draw above drafts, so a draft at the same spot can't hide them.
 * Apple Maps ignores zIndex for default markers but draws later ones on top, so the markers are
 * also rendered in this order.
 */
const STAGE_Z_INDEX: Record<ReportStage, number> = { draft: 1, sent: 2, case: 3 };

const LEGEND: { stage: ReportStage; label: string }[] = [
  { stage: 'draft', label: 'Draft' },
  { stage: 'sent', label: 'Sent' },
  { stage: 'case', label: 'Case saved' },
];

const FIT_PADDING = { top: 80, right: 60, bottom: 80, left: 60 };

export default function MapScreen() {
  const { error, reports } = useReportsOnFocus();
  const mapRef = useRef<MapView>(null);
  const mapReady = useRef(false);

  const pinnedReports = useMemo(
    () =>
      reports
        .filter(
          (report): report is Report & { latitude: number; longitude: number } =>
            report.latitude != null && report.longitude != null
        )
        .sort(
          (a, b) => STAGE_Z_INDEX[getReportStage(a)] - STAGE_Z_INDEX[getReportStage(b)]
        ),
    [reports]
  );

  // A pin far away (a trip, an old test) would zoom the view out to the whole continent, so
  // the view fits the pins in the city when there are any. The others are still on the map.
  const inCity = useMemo(
    () =>
      pinnedReports.filter((report) =>
        isWithinBounds(report.latitude, report.longitude, CITY.bounds)
      ),
    [pinnedReports]
  );
  const fitTargets = inCity.length > 0 ? inCity : pinnedReports;
  const outsideCount = pinnedReports.length - inCity.length;

  /** Shows the pins; one pin is shown at street level rather than zoomed all the way in. */
  const fitPins = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady.current || fitTargets.length === 0) return;

    if (fitTargets.length === 1) {
      const [only] = fitTargets;
      map.animateToRegion(
        { latitude: only.latitude, longitude: only.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        0
      );
      return;
    }

    map.fitToCoordinates(
      fitTargets.map((report) => ({ latitude: report.latitude, longitude: report.longitude })),
      { animated: false, edgePadding: FIT_PADDING }
    );
  }, [fitTargets]);

  // Refit when the pins change (e.g. a report was added or deleted elsewhere).
  useEffect(() => {
    fitPins();
  }, [fitPins]);

  return (
    <View style={styles.container}>
      <MapView
        initialRegion={CITY.defaultRegion}
        onMapReady={() => {
          mapReady.current = true;
          fitPins();
        }}
        ref={mapRef}
        showsPointsOfInterest={false}
        style={styles.map}>
        {pinnedReports.map((report) => (
          <Marker
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            description={[getStatusChip(report).label, report.address].filter(Boolean).join(' · ')}
            key={report.id}
            onCalloutPress={() => openReport(report)}
            pinColor={STAGE_COLORS[getReportStage(report)]}
            title={report.category || 'General 311 report'}
            zIndex={STAGE_Z_INDEX[getReportStage(report)]}
          />
        ))}
      </MapView>
      <View style={styles.panel}>
        <Text style={styles.title}>Your reports on the map</Text>
        {error ? (
          <Text style={styles.subtitle}>Report pins could not be loaded.</Text>
        ) : pinnedReports.length === 0 ? (
          <>
            <Text style={styles.subtitle}>Reports with a pinned location appear here.</Text>
            <Button
              onPress={() => router.push('/')}
              style={styles.panelButton}
              textStyle={styles.panelButtonText}
              title="Start a report"
              variant="secondary"
            />
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {pinnedReports.length} report{pinnedReports.length === 1 ? '' : 's'} with a pin
              {outsideCount > 0 && inCity.length > 0
                ? ` (${outsideCount} outside ${CITY.name}, off this view)`
                : ''}
              . Tap a pin, then its label, to open it.
            </Text>
            <View accessible accessibilityLabel="Pin colours: grey draft, blue sent, green case saved" style={styles.legend}>
              {LEGEND.map((item) => (
                <View key={item.stage} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: STAGE_COLORS[item.stage] }]} />
                  <Text style={styles.legendText}>{item.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function openReport(report: Report) {
  if (report.status === 'draft') {
    router.push({ pathname: '/report/new', params: { resumeId: report.id } });
  } else {
    router.push({ pathname: '/report/[id]', params: { id: report.id } });
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  legendDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendText: {
    color: colors.mutedStrong,
    fontSize: 13,
    fontWeight: '600',
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
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
});
