/**
 * Everything specific to the city the app reports to. The issue catalog and the AI prompts
 * are still Toronto-specific; this keeps the rest in one place.
 */
export type Bounds = { north: number; south: number; east: number; west: number };

export type NotHandledRedirect = {
  /** Search words (lowercase) that should point here instead of to a 311 issue. */
  match: string[];
  title: string;
  body: string;
  url: string;
};

export type CityConfig = {
  name: string;
  recipient: string;
  greeting: string;
  /** Where maps open before there is a pin. */
  defaultRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  bounds: Bounds;
  /** Toronto Island, for the pothole checklist's "on Toronto Island?" question. */
  islandBounds: Bounds;
  notHandled: NotHandledRedirect[];
};

export const CITY: CityConfig = {
  name: 'Toronto',
  recipient: '311@toronto.ca',
  greeting: 'Hello 311 Toronto,',
  defaultRegion: {
    latitude: 43.6535,
    longitude: -79.3841,
    latitudeDelta: 0.025,
    longitudeDelta: 0.025,
  },
  bounds: { north: 43.8555, south: 43.581, east: -79.1152, west: -79.6393 },
  islandBounds: { north: 43.634, south: 43.605, east: -79.335, west: -79.4 },
  notHandled: [
    {
      match: ['streetlight', 'street light', 'street lamp', 'lamp post', 'light out', 'light pole'],
      title: 'Streetlights are fixed by Toronto Hydro',
      body: 'Report a broken or dark streetlight to Toronto Hydro. Traffic lights and lights in parks or on bike paths are still 311.',
      url: 'https://www.torontohydro.com/report-a-streetlight-out',
    },
  ],
};

export function isWithinBounds(latitude: number, longitude: number, bounds: Bounds) {
  return (
    latitude <= bounds.north &&
    latitude >= bounds.south &&
    longitude <= bounds.east &&
    longitude >= bounds.west
  );
}
