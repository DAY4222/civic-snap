import { formatAddress, gpsFromExif } from '../address';

describe('formatAddress', () => {
  it('uses the full street address iOS puts in name, and drops the province', () => {
    expect(
      formatAddress({
        name: '439 Queen St W',
        street: 'Queen St W',
        streetNumber: '439',
        city: 'Toronto',
        region: 'ON',
      })
    ).toBe('439 Queen St W, Toronto');
  });

  it('keeps a landmark name in front of the street address', () => {
    expect(
      formatAddress({
        name: 'CN Tower',
        street: 'Front St W',
        streetNumber: '290',
        city: 'Toronto',
        region: 'ON',
      })
    ).toBe('CN Tower, 290 Front St W, Toronto');
  });

  it('builds the street line when name is only the number (Android)', () => {
    expect(
      formatAddress({ name: '439', street: 'Queen St W', streetNumber: '439', city: 'Toronto' })
    ).toBe('439 Queen St W, Toronto');
  });

  it('handles a street without a number, and missing parts', () => {
    expect(formatAddress({ name: 'Queen St W', street: 'Queen St W', city: 'Toronto' })).toBe(
      'Queen St W, Toronto'
    );
    expect(formatAddress({ street: 'Queen St W', streetNumber: '439', region: 'ON' })).toBe(
      '439 Queen St W, ON'
    );
    expect(formatAddress({})).toBe('');
  });
});

describe('gpsFromExif', () => {
  it('reads iOS values with hemisphere refs', () => {
    expect(
      gpsFromExif({
        GPSLatitude: 43.6487,
        GPSLatitudeRef: 'N',
        GPSLongitude: 79.3956,
        GPSLongitudeRef: 'W',
      })
    ).toEqual({ latitude: 43.6487, longitude: -79.3956 });
  });

  it('reads Android signed values without flipping them twice', () => {
    expect(
      gpsFromExif({ GPSLatitude: 43.6487, GPSLongitude: -79.3956, GPSLongitudeRef: 'W' })
    ).toEqual({ latitude: 43.6487, longitude: -79.3956 });
    expect(gpsFromExif({ GPSLatitude: '-33.86', GPSLongitude: '151.21' })).toEqual({
      latitude: -33.86,
      longitude: 151.21,
    });
  });

  it('ignores missing, invalid and zero positions', () => {
    expect(gpsFromExif(undefined)).toBeNull();
    expect(gpsFromExif({ GPSLatitude: 43.6 })).toBeNull();
    expect(gpsFromExif({ GPSLatitude: 'north', GPSLongitude: 79 })).toBeNull();
    expect(gpsFromExif({ GPSLatitude: 120, GPSLongitude: 79 })).toBeNull();
    expect(gpsFromExif({ GPSLatitude: 0, GPSLongitude: 0 })).toBeNull();
  });
});
