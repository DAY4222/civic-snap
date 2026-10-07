/** The parts of a reverse-geocoded place the report uses (a subset of expo-location's result). */
export type GeocodedPlace = {
  city?: string | null;
  name?: string | null;
  region?: string | null;
  street?: string | null;
  streetNumber?: string | null;
};

/**
 * One readable line for the report: "439 Queen St W, Toronto".
 *
 * iOS puts the full street address in `name` ("439 Queen St W") and repeats the street in
 * `street`; Android puts the number in `name`. A landmark name ("CN Tower") is kept in front.
 * The province is left out when the city is known.
 */
export function formatAddress(place: GeocodedPlace) {
  const name = place.name?.trim() ?? '';
  const street = place.street?.trim() ?? '';
  const streetLine = [place.streetNumber?.trim(), street].filter(Boolean).join(' ');
  const parts: string[] = [];

  if (name && street && name.includes(street)) {
    parts.push(name);
  } else {
    if (name && !streetLine.includes(name)) parts.push(name);
    if (streetLine) parts.push(streetLine);
  }

  const city = place.city?.trim();
  const region = place.region?.trim();
  if (city) parts.push(city);
  else if (region) parts.push(region);

  return parts.join(', ');
}

export type Coordinates = { latitude: number; longitude: number };

/**
 * The GPS position stored in a photo, from expo-image-picker's `exif`. iOS gives unsigned values
 * with N/S and E/W refs; Android gives signed values.
 */
export function gpsFromExif(exif: Record<string, unknown> | null | undefined): Coordinates | null {
  if (!exif) return null;

  const latitude = toNumber(exif.GPSLatitude);
  const longitude = toNumber(exif.GPSLongitude);
  if (latitude == null || longitude == null) return null;

  const signedLatitude = applyRef(latitude, exif.GPSLatitudeRef, 'S');
  const signedLongitude = applyRef(longitude, exif.GPSLongitudeRef, 'W');
  if (Math.abs(signedLatitude) > 90 || Math.abs(signedLongitude) > 180) return null;
  // 0,0 is what some apps write when they have no fix.
  if (signedLatitude === 0 && signedLongitude === 0) return null;

  return { latitude: signedLatitude, longitude: signedLongitude };
}

function toNumber(value: unknown) {
  const number = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function applyRef(value: number, ref: unknown, negativeRef: 'S' | 'W') {
  if (typeof ref !== 'string' || !ref.trim()) return value;
  return ref.trim().toUpperCase().startsWith(negativeRef) ? -Math.abs(value) : Math.abs(value);
}
