import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type MapViewProps = {
  children?: ReactNode;
  initialRegion?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  region?: Region;
  style?: StyleProp<ViewStyle>;
};

type MarkerProps = {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  description?: string;
  onCalloutPress?: () => void;
  title?: string;
};

export function Marker(_props: MarkerProps) {
  return null;
}

export default function CivicMap({ initialRegion, region, style }: MapViewProps) {
  const visibleRegion = region ?? initialRegion;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>Map preview unavailable on web</Text>
      {visibleRegion ? (
        <Text style={styles.coordinates}>
          {visibleRegion.latitude.toFixed(5)}, {visibleRegion.longitude.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#e5e5ea',
    justifyContent: 'center',
  },
  coordinates: {
    color: '#636366',
    fontSize: 13,
    marginTop: 6,
  },
  title: {
    color: '#1d1d1f',
    fontSize: 15,
    fontWeight: '700',
  },
});
