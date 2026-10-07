import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import MapView, { type Region } from '@/components/CivicMap';
import { colors, radius } from '@/components/ui';
import { CITY } from '@/lib/city';

import type { PinSource } from './reportWizardState';

const SOURCE_LABELS: Partial<Record<PinSource, { icon: 'camera' | 'location-arrow'; text: string }>> = {
  device: { icon: 'location-arrow', text: 'Your location' },
  photo: { icon: 'camera', text: 'From photo' },
};

type PinMapProps = {
  locating: boolean;
  onLocate: () => void;
  onPinMoved: (region: Region) => void;
  pinRegion: Region | null;
  pinSource: PinSource | null;
};

/**
 * A map with a fixed pin in the middle: the user moves the map under it. Pins from the photo
 * or the phone move the map; only the user's own moves report back, because Apple Maps does
 * not say whether a region change was a gesture.
 */
export function PinMap({ locating, onLocate, onPinMoved, pinRegion, pinSource }: PinMapProps) {
  const mapRef = useRef<MapView>(null);
  const touched = useRef(false);
  const label = pinSource ? SOURCE_LABELS[pinSource] : undefined;

  useEffect(() => {
    if (!pinRegion || pinSource === 'map') return;
    touched.current = false;
    mapRef.current?.animateToRegion(pinRegion, 350);
    // Keyed on the coordinates: only a new position from outside the map should move it.
  }, [pinRegion?.latitude, pinRegion?.longitude, pinSource]);

  return (
    <View style={styles.card}>
      <View
        onTouchStart={() => {
          touched.current = true;
        }}>
        <MapView
          accessibilityLabel="Map. Move it to put the pin on the spot."
          initialRegion={pinRegion ?? CITY.defaultRegion}
          onRegionChangeComplete={(region) => {
            if (touched.current) onPinMoved(region);
          }}
          ref={mapRef}
          showsPointsOfInterest={false}
          style={styles.map}
        />
        <View pointerEvents="none" style={styles.centerPin}>
          <FontAwesome
            color={colors.danger}
            name="map-marker"
            size={38}
            style={pinRegion ? null : styles.unsetPin}
          />
        </View>
        {label ? (
          <View pointerEvents="none" style={styles.chip}>
            <FontAwesome color={colors.primary} name={label.icon} size={12} />
            <Text style={styles.chipText}>{label.text}</Text>
          </View>
        ) : null}
        {locating && !pinRegion ? (
          <View pointerEvents="none" style={styles.locatingOverlay}>
            <ActivityIndicator />
            <Text style={styles.chipText}>Finding your location…</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel="Use my current location"
          accessibilityRole="button"
          disabled={locating}
          hitSlop={6}
          onPress={onLocate}
          style={({ pressed }) => [styles.locateButton, pressed && styles.pressed]}>
          {locating ? (
            <ActivityIndicator size="small" />
          ) : (
            <FontAwesome color={colors.primary} name="location-arrow" size={18} />
          )}
        </Pressable>
      </View>
      <Text style={styles.help}>
        {pinRegion
          ? 'Move the map to adjust. The pin marks the spot in your report.'
          : 'Move the map to put the pin on the spot, or type the address below.'}
      </Text>
    </View>
  );
}

const MAP_HEIGHT = 260;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  centerPin: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -24,
    // The marker's tip, not its middle, sits on the centre of the map.
    marginTop: -43,
    position: 'absolute',
    top: MAP_HEIGHT / 2,
    width: 48,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    top: 10,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  help: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
  },
  locateButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    bottom: 10,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    width: 40,
  },
  locatingOverlay: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    top: 10,
  },
  map: {
    height: MAP_HEIGHT,
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  unsetPin: {
    opacity: 0.45,
  },
});
