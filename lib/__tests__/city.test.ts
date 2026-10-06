import { CITY, isWithinBounds } from '../city';

describe('city config', () => {
  it('knows downtown Toronto is in the city and the island is on the island', () => {
    expect(isWithinBounds(43.6487, -79.396, CITY.bounds)).toBe(true);
    expect(isWithinBounds(43.6487, -79.396, CITY.islandBounds)).toBe(false);
    expect(isWithinBounds(43.6205, -79.3787, CITY.islandBounds)).toBe(true);
  });

  it('treats a San Francisco pin as outside the city', () => {
    expect(isWithinBounds(37.7879, -122.4074, CITY.bounds)).toBe(false);
  });
});
